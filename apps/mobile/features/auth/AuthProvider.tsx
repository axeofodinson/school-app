// Sign-in state for the new app. Same backend design as the old app
// (src/auth/AuthProvider.js; db/004, db/008, db/009), rebuilt on packages/core:
//   * student: admission number + PIN -> student_login_email() -> signInWithPassword
//   * staff:   email + password
// Plus shared-device mode (LMS_AUDIT §3.4): the session is kept in memory only,
// 10 minutes idle signs out, and signing out wipes the user's storage namespace
// except their unsynced queue. Routing by role is a convenience; RLS is the
// security boundary (CLAUDE.md rule 4).
//
// Extension point for prompt 05 (Google sign-in, prep-only tier, DECISIONS #23):
// add a `googleSignIn()` here next to studentSignIn/staffSignIn, select
// `access_tier` in PROFILE_COLUMNS once db adds it, and give the 'prep'
// destination its own route group in app/_layout.tsx. destinationFor() already
// returns 'prep' for access_tier = 'prep'.
import type { Session } from '@supabase/supabase-js';
import {
  createIdleClock,
  destinationFor,
  purgeOtherUsers,
  SHARED_IDLE_TIMEOUT_MS,
  staffSignIn as coreStaffSignIn,
  studentSignIn as coreStudentSignIn,
  userQueueStore,
  userStore,
  wipeUserNamespace,
  type AuthBackend,
  type AuthState,
  type Destination,
  type IdleClock,
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

import { clearSessionCopies, deviceKV } from '../../lib/storage';
import { supabase } from '../../lib/supabase';
import { isSharedMode, loadDeviceSettings, saveSharedMode } from './device-settings';

const PROFILE_COLUMNS = 'role, full_name, student_id';
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [initializing, setInitializing] = useState(supabase !== null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null | 'loading' | 'error'>('loading');
  const [sharedMode, setSharedModeState] = useState(false);
  const [lastSignOut, setLastSignOut] = useState<SignOutReason | null>(null);
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
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select(PROFILE_COLUMNS)
        .eq('id', uid)
        .maybeSingle();
      if (seq !== loadSeq.current) return; // a newer sign-in won
      setProfile(error ? 'error' : (data ?? null));
    } catch {
      if (seq === loadSeq.current) setProfile('error');
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

  const retryProfile = useCallback(() => {
    if (userId) loadProfile(userId);
  }, [userId, loadProfile]);

  const setSharedMode = useCallback(async (on: boolean) => {
    await saveSharedMode(on);
    setSharedModeState(on);
  }, []);

  const value = useMemo<AuthValue>(() => {
    const state: AuthState = initializing
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
      signOut,
      retryProfile,
      setSharedMode,
    };
  }, [
    initializing,
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
