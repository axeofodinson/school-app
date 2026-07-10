// Staff authentication (admin/teacher) over Supabase Auth email/password.
//
// This is the STAFF flow only. Students never sign in with email/password — they
// use a school-issued roll number + PIN (a separate flow, not built here).
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
