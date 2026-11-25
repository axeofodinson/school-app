// The one Supabase client. Reads only public env vars; the anon key is safe to
// ship because RLS is the security boundary. Never put the service-role key here.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@school/core/db-types';

import { sessionStorage } from './storage';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

/** Null when the env vars are missing, so screens can show a real message instead of crashing. */
export const supabase: SupabaseClient<Database> | null = isSupabaseConfigured
  ? createClient<Database>(url!, anonKey!, {
      auth: {
        // SecureStore on Android, localStorage on web, memory only in shared-device
        // mode (lib/storage.ts). Reads wait until the device's mode is known.
        storage: sessionStorage,
        persistSession: true,
        autoRefreshToken: true,
        // Google sign-in (prompt 05) uses PKCE: the redirect carries a one-time
        // code that features/auth exchanges itself, on native and on web.
        flowType: 'pkce',
        detectSessionInUrl: false,
      },
    })
  : null;
