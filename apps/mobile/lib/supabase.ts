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

/**
 * Calls into db/023 (a draft migration that needs 017, so it isn't in the
 * generated db-types yet). Untyped on purpose and kept to this one helper:
 * regenerate packages/core/src/db-types.ts once Hassan runs 017 + 023, then
 * switch the callers to `supabase.rpc` and delete this.
 */
export async function rpcPending<T>(
  fn: 'find_prep_accounts' | 'link_prep_account',
  args: Record<string, unknown>,
): Promise<{ data: T | null; error: { message: string; code?: string } | null }> {
  if (!supabase) return { data: null, error: { message: 'not configured' } };
  const client = supabase as unknown as {
    rpc(
      f: string,
      a: Record<string, unknown>,
    ): PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
  };
  const { data, error } = await client.rpc(fn, args);
  return { data: (data as T | null) ?? null, error };
}
