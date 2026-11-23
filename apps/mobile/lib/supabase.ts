// The one Supabase client. Reads only public env vars; the anon key is safe to
// ship because RLS is the security boundary. Never put the service-role key here.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@school/core/db-types';
import { Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

/** Null when the env vars are missing, so screens can show a real message instead of crashing. */
export const supabase: SupabaseClient<Database> | null = isSupabaseConfigured
  ? createClient<Database>(url!, anonKey!, {
      auth: {
        // Static web export renders without `window`; only touch storage in a browser/app.
        storage: Platform.OS === 'web' && typeof window === 'undefined' ? undefined : AsyncStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  : null;
