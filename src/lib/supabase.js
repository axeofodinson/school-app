// Supabase client — the single entry point the app uses to reach the backend.
//
// Credentials come ONLY from environment variables (never hardcoded, never
// committed). In Expo, EXPO_PUBLIC_* vars are inlined into the bundle at build
// time. The anon key is safe to ship: Row-Level Security is the security
// boundary, not this key. The service_role key must never appear in the app.
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Fail loud in dev so a missing .env is obvious instead of silently 401-ing.
  console.warn(
    'Supabase env vars missing. Copy .env.example to .env and set ' +
      'EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
