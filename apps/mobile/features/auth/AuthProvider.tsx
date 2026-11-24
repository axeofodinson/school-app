// Sign-in state for the new app. Same backend design as the old app
// (src/auth/AuthProvider.js; db/004, db/008, db/009), rebuilt on packages/core:
//   * student: admission number + PIN -> student_login_email() -> signInWithPassword
//   * staff:   email + password
// Plus shared-device mode (LMS_AUDIT §3.4): the session is kept in memory only,
// 10 minutes idle signs out, and signing out wipes the user's storage namespace
// except their unsynced queue. Routing by role is a convenience; RLS is the
// security boundary (CLAUDE.md rule 4).
//
// Google sign-in (prompt 05, DECISIONS #23, #58): Preparation only. Native opens
// an auth session (Custom Tab) and finishes here; web redirects the page and
// app/auth-callback.tsx finishes with completeGoogleRedirect(). Either way the
// session is kept only for a prep-only account (packages/core auth/oauth.ts).
import type { Session } from '@supabase/supabase-js';
import {
  completeGoogleCallback,
  createIdleClock,
  destinationFor,
  googleSignIn as coreGoogleSignIn,
  tierOf,
  purgeOtherUsers,
  SHARED_IDLE_TIMEOUT_MS,
  staffSignIn as coreStaffSignIn,
  studentSignIn as coreStudentSignIn,
  userQueueStore,
  userStore,
  wipeUserNamespace,
  type AuthBackend,
  type AuthState,
  type AccessTier,
  type Destination,
  type GoogleSignInError,
  type IdleClock,
  type OAuthBackend,
  type ProfileSummary,
  type ScopedStore,
  type StaffSignInError,
  type StudentSignInError,
} from '@school/core';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState, Platform, StyleSheet, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

import { clearSessionCopies, deviceKV } from '../../lib/storage';
import { supabase } from '../../lib/supabase';
import { classifyError } from '../../lib/result';
import { isSharedMode, loadDeviceSettings, saveSharedMode } from './device-settings';

// '*' so the app works on a server with or without db/023 (access_tier,
// merged_into): a missing access_tier reads as 'school'. Profiles hold no
// secrets, and RLS only returns the caller's own row.
const PROFILE_COLUMNS = '*';
/** Must be in the Supabase project's Auth → URL Configuration → Redirect URLs. */
const NATIVE_REDIRECT = 'schoolapp://auth-callback';
const IDLE_CHECK_MS = 15_000;

export type SignOutReason = 'user' | 'idle' | 'switch';

interface Profile extends ProfileSummary {
  full_name: string | null;
}

interface AuthValue {
  destination: Destination;
  session: Session | null;
  profile: Profile | null;
  sharedMode: boolean;
  /** Why the last sign-out happened (the login screen explains an idle sign-out). */
  lastSignOut: SignOutReason | null;
  /** The signed-in user's private storage (null when signed out). */
  userStorage: ScopedStore | null;
  /** That user's unsynced queue (survives sign-out; for the sync queue, prompt 11/61). */
  queueStorage: ScopedStore | null;
  studentSignIn(admissionNo: string, pin: string): Promise<StudentSignInError | null>;
  staffSignIn(email: string, password: string): Promise<StaffSignInError | null>;
  /** Native: the whole round trip. Web: starts a redirect (null = leaving the page). */
  googleSignIn(): Promise<GoogleSignInError | null>;
  /** Web: finish a Google redirect on /auth-callback. */
  completeGoogleRedirect(url: string): Promise<GoogleSignInError | null>;
  /** The last Google sign-in failure, for the login screen (null = none). */
  oauthError: GoogleSignInError | null;
  clearOauthError(): void;
  tier: AccessTier;
  signOut(reason?: SignOutReason): Promise<void>;
  retryProfile(): void;
  setSharedMode(on: boolean): Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

const backend: AuthBackend = {
  async studentLoginEmail(code) {
    if (!supabase) return { data: null, error: { message: 'not configured' } };
    const { data, error } = await supabase.rpc('student_login_email', { p_student_code: code });
    return { data: typeof data === 'string' ? data : null, error };
  },
  async signInWithPassword(email, password) {
    if (!supabase) return { error: { message: 'not configured' } };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  },
};

function oauthRedirect(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.origin}/auth-callback`;
  }
  return NATIVE_REDIRECT;
}

/** Codes already exchanged (Android may also deliver the redirect as a deep link). */
const usedCodes = new Set<string>();

const oauthBackend: OAuthBackend = {
  async startOAuth() {
    if (!supabase) return { url: null, error: { message: 'not configured' } };
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: oauthRedirect(),
        skipBrowserRedirect: Platform.OS !== 'web',
        queryParams: { prompt: 'select_account' },
      },
    });
    return { url: data?.url ?? null, error };
  },
  ...(Platform.OS === 'web'
    ? {}
    : {
        async openAuthSession(url: string) {
          const r = await WebBrowser.openAuthSessionAsync(url, NATIVE_REDIRECT);
          return r.type === 'success'
            ? { type: 'success' as const, url: r.url }
            : { type: 'cancel' as const };
        },
      }),
  async exchangeCode(code) {
    if (!supabase) return { error: { message: 'not configured' } };
    if (usedCodes.has(code)) return { error: null };
    usedCodes.add(code);
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    return { error };
  },
  async loadTier() {
    if (!supabase) return null;
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return null;
    const { data, error } = await supabase
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .eq('id', u.user.id)
      .maybeSingle();
    if (error || !data) return null;
    return tierOf(data as { access_tier?: string | null });
  },
  async signOut() {
    await supabase?.auth.signOut({ scope: 'local' }).catch(() => undefined);
    await clearSessionCopies().catch(() => undefined);
  },
};

const PROFILE_CACHE = 'cache/profile';

/** The last profile this device loaded for `uid` (offline start), else 'error'. */
async function cachedProfile(uid: string): Promise<Profile | 'error'> {
  try {
    const raw = await userStore(deviceKV, uid).getItem(PROFILE_CACHE);
    const p = raw ? (JSON.parse(raw) as Profile) : null;
    return p && typeof p === 'object' ? p : 'error';
  } catch {
    return 'error';
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [initializing, setInitializing] = useState(supabase !== null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null | 'loading' | 'error'>('loading');
  const [sharedMode, setSharedModeState] = useState(false);
  const [lastSignOut, setLastSignOut] = useState<SignOutReason | null>(null);
  // While a Google sign-in is being checked, routing waits (no flash of a
  // school surface before a refused account is signed out again).
  const [oauthBusy, setOauthBusy] = useState(false);
  // Kept here, not on the login screen: that screen unmounts while routing waits.
  const [oauthError, setOauthError] = useState<GoogleSignInError | null>(null);
  const userId = session?.user.id ?? null;
  const loadSeq = useRef(0);
  const uidRef = useRef<string | null>(null);
  useEffect(() => {
    uidRef.current = userId;
  }, [userId]);

  const loadProfile = useCallback(async (uid: string) => {
    if (!supabase) return;
    const seq = ++loadSeq.current;
    setProfile('loading');
    // Start from this device's copy (instant with no internet), then refresh it.
    const cached = await cachedProfile(uid);
    if (seq !== loadSeq.current) return;
    if (cached !== 'error') setProfile(cached);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select(PROFILE_COLUMNS)
        .eq('id', uid)
        .maybeSingle();
      if (seq !== loadSeq.current) return; // a newer sign-in won
      if (!error) {
        const p = (data as Profile | null) ?? null;
        setProfile(p);
        // Remembered in the user's own namespace (wiped at sign-out) so a reopen
        // with no internet still reaches the student's saved work.
        if (p)
          userStore(deviceKV, uid)
            .setItem(PROFILE_CACHE, JSON.stringify(p))
            .catch(() => undefined);
        return;
      }
      setProfile(classifyError(error) === 'network' ? cached : 'error');
    } catch {
      if (seq === loadSeq.current) setProfile(cached);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    const client = supabase;
    loadDeviceSettings().then((shared) => alive && setSharedModeState(shared));
    if (!client) return;
    client.auth
      .getSession()
      .then(({ data }) => {
        if (!alive) return;
        setSession(data.session);
        if (data.session) loadProfile(data.session.user.id);
      })
      .catch(() => undefined)
      .finally(() => alive && setInitializing(false));

    const { data: sub } = client.auth.onAuthStateChange((event, s) => {
      if (event === 'INITIAL_SESSION') return; // handled by getSession
      setSession(s);
      if (s) {
        // Token refreshes keep the same user: no need to reload the profile.
        if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
          // Calling supabase inside this callback can deadlock the auth client.
          setTimeout(() => loadProfile(s.user.id), 0);
        }
      } else {
        // Signed out from anywhere (our signOut, a rejected refresh after db/009
        // revokes the login): the user's namespace goes too, queue excepted.
        const prev = uidRef.current;
        if (prev) wipeUserNamespace(deviceKV, prev).catch(() => undefined);
        loadSeq.current++;
        setProfile('loading');
      }
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  // Shared-device safety net: whoever signs in, any other user's leftovers
  // (a sign-out that never finished) are removed before screens read storage.
  useEffect(() => {
    if (userId && isSharedMode()) purgeOtherUsers(deviceKV, userId).catch(() => undefined);
  }, [userId]);

  const signOut = useCallback(
    async (reason: SignOutReason = 'user') => {
      const uid = userId;
      setLastSignOut(reason);
      // Local scope: removes this device's session first, never depends on the
      // network, and doesn't sign the student out of their own phone.
      await supabase?.auth.signOut({ scope: 'local' }).catch(() => undefined);
      await clearSessionCopies().catch(() => undefined);
      if (uid) await wipeUserNamespace(deviceKV, uid).catch(() => undefined);
      setSession(null);
      loadSeq.current++;
      setProfile('loading');
    },
    [userId],
  );

  // ---- Idle sign-out (shared devices only) ---------------------------------
  const clock = useRef<IdleClock | null>(null);
  const touch = useCallback(() => clock.current?.touch(Date.now()), []);
  const idleActive = sharedMode && userId !== null;

  useEffect(() => {
    if (!idleActive) return;
    clock.current = createIdleClock(SHARED_IDLE_TIMEOUT_MS, Date.now());
    const check = () => {
      if (clock.current?.isIdle(Date.now())) signOut('idle');
    };
    const timer = setInterval(check, IDLE_CHECK_MS);
    // Coming back to the app after the timeout signs out at once.
    const appSub = AppState.addEventListener('change', (s) => s === 'active' && check());
    const events = ['keydown', 'pointerdown', 'wheel', 'touchstart'] as const;
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      events.forEach((e) => document.addEventListener(e, touch, { passive: true, capture: true }));
    }
    return () => {
      clock.current = null;
      clearInterval(timer);
      appSub.remove();
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        events.forEach((e) => document.removeEventListener(e, touch, { capture: true }));
      }
    };
  }, [idleActive, signOut, touch]);

  const studentSignIn = useCallback(async (code: string, pin: string) => {
    const err = await coreStudentSignIn(backend, code, pin);
    if (!err) setLastSignOut(null);
    return err;
  }, []);

  const staffSignIn = useCallback(async (email: string, password: string) => {
    const err = await coreStaffSignIn(backend, email, password);
    if (!err) setLastSignOut(null);
    return err;
  }, []);

  // Routing holds only while the code is exchanged and the tier checked; the
  // login screen stays mounted while the Google page is open.
  const oauth = useMemo<OAuthBackend>(
    () => ({
      ...oauthBackend,
      exchangeCode: (code: string) => {
        setOauthBusy(true);
        return oauthBackend.exchangeCode(code);
      },
    }),
    [],
  );

  const finishOAuth = useCallback((err: GoogleSignInError | null) => {
    setOauthBusy(false);
    // Cancelling is not an error worth a message.
    setOauthError(err === 'cancelled' ? null : err);
    if (!err) setLastSignOut(null);
    return err;
  }, []);

  const googleSignIn = useCallback(async () => {
    setOauthError(null);
    let err: GoogleSignInError | null = 'unknown';
    try {
      err = await coreGoogleSignIn(oauth);
    } finally {
      finishOAuth(err);
    }
    return err;
  }, [oauth, finishOAuth]);

  const completeGoogleRedirect = useCallback(
    async (url: string) => {
      let err: GoogleSignInError | null = 'unknown';
      try {
        err = await completeGoogleCallback(oauth, url);
      } finally {
        finishOAuth(err);
      }
      return err;
    },
    [oauth, finishOAuth],
  );

  const retryProfile = useCallback(() => {
    if (userId) loadProfile(userId);
  }, [userId, loadProfile]);

  const setSharedMode = useCallback(async (on: boolean) => {
    await saveSharedMode(on);
    setSharedModeState(on);
  }, []);

  const value = useMemo<AuthValue>(() => {
    const state: AuthState =
      initializing || oauthBusy
        ? { kind: 'initializing' }
        : !session
          ? { kind: 'signedOut' }
          : { kind: 'signedIn', profile };
    return {
      destination: supabase ? destinationFor(state) : 'signedOut',
      session,
      profile: typeof profile === 'object' ? profile : null,
      sharedMode,
      lastSignOut,
      userStorage: userId ? userStore(deviceKV, userId) : null,
      queueStorage: userId ? userQueueStore(deviceKV, userId) : null,
      studentSignIn,
      staffSignIn,
      googleSignIn,
      completeGoogleRedirect,
      oauthError,
      clearOauthError: () => setOauthError(null),
      tier: tierOf(typeof profile === 'object' ? profile : null),
      signOut,
      retryProfile,
      setSharedMode,
    };
  }, [
    initializing,
    oauthBusy,
    oauthError,
    googleSignIn,
    completeGoogleRedirect,
    session,
    profile,
    sharedMode,
    lastSignOut,
    userId,
    studentSignIn,
    staffSignIn,
    signOut,
    retryProfile,
    setSharedMode,
  ]);

  return (
    <AuthContext.Provider value={value}>
      {/* Observes every touch (never claims it) so the idle clock sees activity on native. */}
      <View
        style={styles.fill}
        onStartShouldSetResponderCapture={() => {
          if (idleActive) touch();
          return false;
        }}
        onMoveShouldSetResponderCapture={() => {
          if (idleActive) touch();
          return false;
        }}
      >
        {children}
      </View>
    </AuthContext.Provider>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
