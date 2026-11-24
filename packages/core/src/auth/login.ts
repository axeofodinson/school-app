// Sign-in logic shared by the app (pure; the Supabase calls are injected so this
// is unit-tested in Node). The backend design is unchanged from the old app
// (db/004, db/008, db/009):
//   student: student_login_email(admission no) -> synthesized email,
//            then signInWithPassword(email, PIN)
//   staff:   signInWithPassword(email, password)
// A withdrawn / struck-off student is banned at the auth layer by db/009, so
// sign-in fails with `user_banned`; we say so instead of "wrong PIN".

export type StudentSignInError =
  | 'missingCode'
  | 'missingPin'
  | 'badPin'
  | 'notFound'
  | 'wrongPin'
  | 'revoked'
  | 'rateLimited'
  | 'network'
  | 'unknown';

export type StaffSignInError =
  'missingFields' | 'invalidCredentials' | 'revoked' | 'rateLimited' | 'network' | 'unknown';

type ErrorClass = 'network' | 'invalidCredentials' | 'revoked' | 'rateLimited' | 'unknown';

interface ErrorLike {
  name?: unknown;
  status?: unknown;
  code?: unknown;
  message?: unknown;
}

/** Map a Supabase auth / PostgREST / fetch error to a coarse class (null = no error). */
export function classifyAuthError(error: unknown): ErrorClass | null {
  if (error === null || error === undefined) return null;
  const e = (typeof error === 'object' ? error : { message: String(error) }) as ErrorLike;
  const name = typeof e.name === 'string' ? e.name : '';
  const status = typeof e.status === 'number' ? e.status : undefined;
  const code = typeof e.code === 'string' ? e.code : '';
  const msg = typeof e.message === 'string' ? e.message.toLowerCase() : '';

  // Network first, so a dropped request is never reported as a wrong PIN.
  if (
    name === 'AuthRetryableFetchError' ||
    status === 0 ||
    /network request failed|failed to fetch|networkerror|load failed|timeout|econn/.test(msg)
  ) {
    return 'network';
  }
  // db/009 bans the auth user when the last active enrollment closes.
  if (code === 'user_banned' || /user is banned|banned/.test(msg)) return 'revoked';
  if (
    status === 429 ||
    code === 'over_request_rate_limit' ||
    code === 'over_email_send_rate_limit' ||
    /rate limit|too many requests/.test(msg)
  ) {
    return 'rateLimited';
  }
  if (
    code === 'invalid_credentials' ||
    /invalid login credentials|invalid credentials/.test(msg) ||
    status === 400
  ) {
    return 'invalidCredentials';
  }
  return 'unknown';
}

/** Urdu (U+06F0–06F9) and Arabic-Indic (U+0660–0669) digits -> 0–9, for kids on an Urdu keyboard. */
export function toAsciiDigits(s: string): string {
  return s.replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (d) => {
    const c = d.charCodeAt(0);
    return String(c >= 0x06f0 ? c - 0x06f0 : c - 0x0660);
  });
}

export const ADMISSION_NO_MAX = 32;

/**
 * Clean a typed or scanned admission number: digits to ASCII, invisible and
 * control characters removed, trimmed. Returns null if nothing usable is left or
 * it is too long. Case is kept (the RPC matches case-insensitively).
 */
export function normaliseAdmissionNo(raw: string): string | null {
  const cleaned = toAsciiDigits(raw)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '')
    .trim();
  if (!cleaned || cleaned.length > ADMISSION_NO_MAX) return null;
  return cleaned;
}

/** School-issued PINs: digits only, 4–8 long (the old app allowed up to 8). */
export const PIN_MIN = 4;
export const PIN_MAX = 8;

export function normalisePin(raw: string): string {
  return toAsciiDigits(raw).replace(/\D/g, '').slice(0, PIN_MAX);
}

export function isValidPin(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_MIN},${PIN_MAX}}$`).test(pin);
}

// ---- QR cards -----------------------------------------------------------------
// The card's QR holds the admission number ONLY, never the PIN (a QR with a PIN
// is a printed password; LMS_AUDIT §2 5.9). The prefix lets the scanner ignore
// unrelated QR codes (posters, Wi-Fi codes) instead of filling the field with junk.

export const QR_PREFIX = 'ASHS:';

export function encodeStudentQr(admissionNo: string): string {
  const code = normaliseAdmissionNo(admissionNo);
  if (!code) throw new Error('cannot encode an empty or over-long admission number');
  return QR_PREFIX + code;
}

/** Admission number from a scanned QR, or null if it isn't one of our cards. */
export function parseStudentQr(payload: string): string | null {
  const text = payload.trim();
  if (text.slice(0, QR_PREFIX.length).toUpperCase() !== QR_PREFIX) return null;
  return normaliseAdmissionNo(text.slice(QR_PREFIX.length));
}

// ---- Sign-in flows -------------------------------------------------------------

/** The two Supabase calls the flows need; the app passes thin wrappers. */
export interface AuthBackend {
  /** rpc('student_login_email', { p_student_code }) */
  studentLoginEmail(admissionNo: string): Promise<{ data: string | null; error: unknown }>;
  signInWithPassword(email: string, password: string): Promise<{ error: unknown }>;
}

async function guard<E extends string>(
  fn: () => Promise<E | null>,
  map: (c: ErrorClass) => E,
): Promise<E | null> {
  try {
    return await fn();
  } catch (e) {
    return map(classifyAuthError(e) ?? 'unknown');
  }
}

/** Returns null on success, else an error key under `auth.studentErrors`. */
export function studentSignIn(
  backend: AuthBackend,
  rawAdmissionNo: string,
  rawPin: string,
): Promise<StudentSignInError | null> {
  const toStudent = (c: ErrorClass): StudentSignInError =>
    c === 'invalidCredentials' ? 'wrongPin' : c;
  return guard(async () => {
    const code = normaliseAdmissionNo(rawAdmissionNo);
    if (!code) return 'missingCode';
    const pin = normalisePin(rawPin);
    if (!pin) return 'missingPin';
    if (!isValidPin(pin)) return 'badPin';

    const { data: email, error: lookupError } = await backend.studentLoginEmail(code);
    if (lookupError) {
      const c = classifyAuthError(lookupError);
      return c === 'network' || c === 'rateLimited' ? c : 'unknown';
    }
    if (!email) return 'notFound';

    const { error } = await backend.signInWithPassword(email, pin);
    const c = classifyAuthError(error);
    return c === null ? null : toStudent(c);
  }, toStudent);
}

/** Returns null on success, else an error key under `auth.errors`. */
export function staffSignIn(
  backend: AuthBackend,
  rawEmail: string,
  password: string,
): Promise<StaffSignInError | null> {
  return guard(
    async () => {
      const email = rawEmail.trim();
      if (!email || !password) return 'missingFields';
      const { error } = await backend.signInWithPassword(email, password);
      return classifyAuthError(error);
    },
    (c) => c,
  );
}

// ---- Where a signed-in user goes ------------------------------------------------

export type Destination =
  | 'loading'
  | 'signedOut'
  | 'student'
  | 'teacher'
  | 'admin'
  | 'pending'
  | 'profileError'
  /** Prompt 05: Google sign-in, Preparation only (DECISIONS #23). Not built yet. */
  | 'prep';

export interface ProfileSummary {
  role: string | null;
  student_id: string | null;
  /** Prompt 05 adds profiles.access_tier ('school' | 'prep'); absent until then. */
  access_tier?: string | null;
}

export type AuthState =
  | { kind: 'initializing' }
  | { kind: 'signedOut' }
  | { kind: 'signedIn'; profile: 'loading' | 'error' | ProfileSummary | null };

/**
 * Route by role. A convenience only: RLS is the security boundary (CLAUDE.md
 * rule 4); a wrong destination still cannot read rows RLS denies.
 */
export function destinationFor(state: AuthState): Destination {
  if (state.kind === 'initializing') return 'loading';
  if (state.kind === 'signedOut') return 'signedOut';
  const p = state.profile;
  if (p === 'loading') return 'loading';
  if (p === 'error') return 'profileError';
  if (!p) return 'pending'; // no profile row yet (trigger lag): wait for an admin
  if (p.access_tier === 'prep') return 'prep';
  switch (p.role) {
    case 'student':
      // A student role must be linked to a students row (db/004), else nothing works.
      return p.student_id ? 'student' : 'pending';
    case 'teacher':
      return 'teacher';
    case 'admin':
    case 'developer':
      return 'admin';
    default:
      // 'pending', 'parent' (deferred, DECISIONS #25) and anything unknown.
      return 'pending';
  }
}
