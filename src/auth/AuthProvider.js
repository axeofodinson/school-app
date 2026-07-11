// Authentication over Supabase Auth. Two separate sign-in paths share the same
// underlying session, profile load, and role routing:
//
//   * STAFF (admin/teacher) — email + password (signIn).
//   * STUDENT — a school-issued identity: class + roll number + PIN
//     (studentSignIn). A child NEVER creates an email account. Under the hood a
//     student has a Supabase account with a synthesized, non-routable email and
//     the PIN as its password (see db/004_student_login.sql); studentSignIn
//     just maps the kid-friendly identity to that account and signs in, so all
//     the session plumbing below is reused unchanged.
//
// Routing by role is a convenience: the real security boundary is Row-Level
// Security in the database (db/setup.sql). A teacher who reaches a screen they
// shouldn't still cannot read rows RLS denies them.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

// Map a Supabase auth/query error to an i18n error key under `auth.errors`.
// Returns null when there is no error.
export function classifyAuthError(error) {
  if (!error) return null;
  const name = error.name || '';
  const status = error.status;
  const code = error.code || '';
  const msg = (error.message || '').toLowerCase();

  // No network / server unreachable — check this first so a dropped request
  // never gets reported as "wrong password".
  if (
    name === 'AuthRetryableFetchError' ||
    status === 0 ||
    /network request failed|failed to fetch|network|timeout|econn/.test(msg)
  ) {
    return 'network';
  }
  // Wrong email/password.
  if (
    code === 'invalid_credentials' ||
    /invalid login credentials|invalid credentials/.test(msg) ||
    status === 400
  ) {
    return 'invalidCredentials';
  }
  return 'unknown';
}

export function AuthProvider({ children }) {
  const [initializing, setInitializing] = useState(true);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  // idle | loading | loaded | error  — 'error' means we couldn't read the row
  // (typically no network), distinct from a loaded row with a 'pending' role.
  const [profileStatus, setProfileStatus] = useState('idle');

  const loadProfile = useCallback(async (userId) => {
    setProfileStatus('loading');
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('role, full_name')
        .eq('id', userId)
        .maybeSingle();
      if (error) {
        setProfileStatus('error');
        return;
      }
      setProfile(data ?? null);
      setProfileStatus('loaded');
    } catch (e) {
      setProfileStatus('error');
    }
  }, []);

  useEffect(() => {
    let active = true;

    // Restore any persisted session on launch.
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      const s = data.session;
      setSession(s);
      setInitializing(false);
      if (s?.user) loadProfile(s.user.id);
    });

    // React to sign-in / sign-out after launch.
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'INITIAL_SESSION') return; // already handled by getSession
      setSession(s);
      if (s?.user) {
        // Defer the profile read: calling supabase inside this callback
        // synchronously can deadlock the auth client.
        setTimeout(() => loadProfile(s.user.id), 0);
      } else {
        setProfile(null);
        setProfileStatus('idle');
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = useCallback(async (email, password) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      return classifyAuthError(error); // null on success
    } catch (e) {
      return classifyAuthError(e) ?? 'network';
    }
  }, []);

  // Student sign-in: class + roll number + PIN. Maps the school identity to the
  // student's synthesized Supabase account (via the student_login_email RPC),
  // then signs in with the PIN. Returns an i18n key under `auth.studentErrors`,
  // or null on success. classId is a uuid; rollNumber is an int; pin a string.
  const studentSignIn = useCallback(async (classId, rollNumber, pin) => {
    try {
      const { data: email, error: lookupError } = await supabase.rpc(
        'student_login_email',
        { p_class_id: classId, p_roll: rollNumber }
      );
      if (lookupError) {
        return classifyAuthError(lookupError) === 'network' ? 'network' : 'unknown';
      }
      // No active enrollment for that class + roll in the current year.
      if (!email) return 'notFound';

      const { error } = await supabase.auth.signInWithPassword({ email, password: pin });
      if (!error) return null;
      // A wrong PIN surfaces as invalid credentials — say "wrong PIN", not the
      // staff-flavoured "email or password".
      const key = classifyAuthError(error);
      if (key === 'invalidCredentials') return 'wrongPin';
      return key === 'network' ? 'network' : 'unknown';
    } catch (e) {
      return classifyAuthError(e) === 'network' ? 'network' : 'unknown';
    }
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const retryProfile = useCallback(() => {
    if (session?.user) loadProfile(session.user.id);
  }, [session, loadProfile]);

  const value = {
    initializing,
    session,
    profile,
    role: profile?.role ?? null,
    profileStatus,
    signIn,
    studentSignIn,
    signOut,
    retryProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
