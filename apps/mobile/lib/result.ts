// Typed results for feature api.ts files: screens get data or one of three
// error kinds they can explain, never a raw PostgREST error.

export type ApiErrorKind = 'network' | 'forbidden' | 'notConfigured' | 'unknown';
export type Result<T> = { ok: true; data: T } | { ok: false; error: ApiErrorKind };

export interface PgError {
  message?: string;
  code?: string;
}

/** RLS refusals (42501 / "row-level security") read as "not your class", not "try again". */
export function classifyError(e: PgError | null | undefined): ApiErrorKind {
  if (!e) return 'unknown';
  const msg = (e.message ?? '').toLowerCase();
  if (
    e.code === '42501' ||
    msg.includes('row-level security') ||
    msg.includes('permission denied')
  ) {
    return 'forbidden';
  }
  if (/network request failed|failed to fetch|networkerror|timeout|econn|load failed/.test(msg)) {
    return 'network';
  }
  return 'unknown';
}

export const ok = <T>(data: T): Result<T> => ({ ok: true, data });
export const fail = <T = never>(e: PgError | null | undefined): Result<T> => ({
  ok: false,
  error: classifyError(e),
});
export const notConfigured: Result<never> = { ok: false, error: 'notConfigured' };
