// Diagnostic logging into public.debug_logs (see db/016_debug_logs.sql) — a
// scratch table for tracing the Realtime auth/subscribe/payload/toast pipeline
// past the device's own console. Best-effort only: a failed write must never
// break the caller, so errors are surfaced with a warning, not thrown.
import { supabase } from './supabase';

export async function debugLog(event, detail, studentId) {
  const { error } = await supabase.from('debug_logs').insert({
    event,
    detail: typeof detail === 'string' ? detail : JSON.stringify(detail ?? null),
    student_id: studentId ?? null,
  });
  if (error) console.warn('debug log failed:', error.message);
}
