// send-message-push — Supabase Edge Function
//
// Fired by a Database Webhook on INSERT into public.messages (see ./README.md).
// It:
//   1. takes ONLY the message id from the request, then reads the message from
//      the database (title, body, audience). The request body is never trusted:
//      anyone holding the public anon key could otherwise push any text to every
//      student;
//   2. claims the message once (messages.push_claimed_at, db/029): a replayed or
//      duplicated webhook sends nothing the second time;
//   3. resolves the audience (school / class / student) to student ids and their
//      live Expo tokens, sends in batches of 100, and soft-disables tokens Expo
//      reports as dead;
//   4. records the outcome in messages.push_result.
//
// Runs as service_role, which bypasses RLS. That key lives only in this
// function's secrets, never in the app. Delivery is best-effort: the message row
// is the record and the in-app inbox shows it either way.
//
// Works before db/029 is applied too (no claim, so no replay protection); the
// log says so. Run 029 first.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import {
  buildPush,
  chunk,
  EXPO_BATCH_SIZE,
  readTickets,
  usableTokens,
  type MessageRow,
} from './logic.ts';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return json({ error: 'server not configured' }, 500);
  }

  let payload: { type?: string; record?: { id?: string }; id?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'invalid JSON body' }, 400);
  }
  if (payload.type && payload.type !== 'INSERT')
    return json({ skipped: `ignoring ${payload.type}` });
  const id = payload.record?.id ?? payload.id;
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) {
    return json({ error: 'no message id in payload' }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // ---- 1 + 2. Read the real message and claim it ----
  const { data: row, error: readErr } = await supabase
    .from('messages')
    .select('id, scope, target_id, title, body')
    .eq('id', id)
    .maybeSingle();
  if (readErr) {
    console.error('message read failed', readErr);
    return json({ error: 'could not read message' }, 500);
  }
  if (!row) return json({ error: 'unknown message' }, 404);
  const message = row as MessageRow;

  const claim = await supabase
    .from('messages')
    .update({ push_claimed_at: new Date().toISOString() })
    .eq('id', id)
    .is('push_claimed_at', null)
    .select('id');
  if (claim.error) {
    // Column missing = db/029 not applied yet. Carry on unprotected.
    if (!columnMissing(claim.error)) {
      console.error('claim failed', claim.error);
      return json({ error: 'could not claim message' }, 500);
    }
    console.warn('push_claimed_at missing: run db/029 for replay protection');
  } else if ((claim.data ?? []).length === 0) {
    return json({ message_id: id, skipped: 'already sent' });
  }

  // ---- 3. Audience → live tokens ----
  let studentIds: string[];
  try {
    studentIds = await resolveAudience(supabase, message);
  } catch (e) {
    console.error('audience resolution failed', e);
    return json({ error: 'could not resolve audience' }, 500);
  }
  if (studentIds.length === 0)
    return await finish(supabase, id, { recipients: 0, tokens: 0, sent: 0 });

  const tokenRows: { token: string }[] = [];
  for (const ids of chunk(studentIds, 200)) {
    const { data, error } = await supabase
      .from('push_tokens')
      .select('token')
      .in('student_id', ids)
      .is('disabled_at', null);
    if (error) {
      console.error('token fetch failed', error);
      return json({ error: 'could not load push tokens' }, 500);
    }
    tokenRows.push(...(data ?? []));
  }
  const tokens = usableTokens(tokenRows);
  if (tokens.length === 0) {
    return await finish(supabase, id, { recipients: studentIds.length, tokens: 0, sent: 0 });
  }

  // ---- 4. Send in batches ----
  const dead = new Set<string>();
  let sent = 0;
  let failed = 0;
  for (const batch of chunk(buildPush(message, tokens), EXPO_BATCH_SIZE)) {
    const batchTokens = batch.map((m) => m.to);
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(batch),
      });
      if (!res.ok) {
        console.error(`Expo push batch failed: ${res.status} ${await res.text()}`);
        failed += batch.length;
        continue;
      }
      const body = await res.json();
      const r = readTickets(batchTokens, Array.isArray(body?.data) ? body.data : []);
      sent += r.sent;
      failed += r.failed;
      r.dead.forEach((t) => dead.add(t));
    } catch (e) {
      console.error('Expo push request threw', e);
      failed += batch.length; // not proven dead: leave the tokens alone
    }
  }

  if (dead.size > 0) {
    const { error } = await supabase
      .from('push_tokens')
      .update({ disabled_at: new Date().toISOString() })
      .in('token', [...dead]);
    if (error) console.error('failed to disable dead tokens', error);
  }

  return await finish(supabase, id, {
    recipients: studentIds.length,
    tokens: tokens.length,
    sent,
    failed,
    disabled: dead.size,
  });
});

// Postgres says 42703; PostgREST says PGRST204 when the column is in the
// update body but not in its schema cache (production before db/029).
const columnMissing = (e: { code?: string }) => e.code === '42703' || e.code === 'PGRST204';

async function finish(
  supabase: ReturnType<typeof createClient>,
  id: string,
  result: Record<string, number>,
): Promise<Response> {
  const { error } = await supabase.from('messages').update({ push_result: result }).eq('id', id);
  if (error && !columnMissing(error)) console.error('could not record push result', error);
  return json({ message_id: id, ...result });
}

// school → every student; class → ACTIVE enrollments in that class for the
// CURRENT academic year; student → that one student.
async function resolveAudience(
  supabase: ReturnType<typeof createClient>,
  message: MessageRow,
): Promise<string[]> {
  if (message.scope === 'student') return message.target_id ? [message.target_id] : [];

  if (message.scope === 'school') {
    const ids: string[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from('students')
        .select('id')
        .range(from, from + 999);
      if (error) throw error;
      ids.push(...(data ?? []).map((r) => r.id));
      if ((data ?? []).length < 1000) break;
    }
    return ids;
  }

  if (!message.target_id) return [];
  const { data: year, error: yearErr } = await supabase
    .from('academic_years')
    .select('id')
    .eq('is_current', true)
    .maybeSingle();
  if (yearErr) throw yearErr;
  if (!year) return [];
  const { data, error } = await supabase
    .from('enrollments')
    .select('student_id')
    .eq('class_id', message.target_id)
    .eq('year_id', year.id)
    .eq('status', 'active');
  if (error) throw error;
  return [...new Set((data ?? []).map((r) => r.student_id))];
}
