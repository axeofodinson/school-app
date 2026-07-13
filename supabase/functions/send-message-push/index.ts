// send-message-push — Supabase Edge Function
//
// Fires when a row is inserted into public.messages (wired via a Database
// Webhook, see ./README.md). It:
//   1. resolves the message's audience (school / class / student) to a set of
//      student ids,
//   2. pulls the LIVE Expo push tokens for those students (disabled_at is null),
//   3. sends the notification via the Expo Push API in batches of 100, and
//   4. reads back the tickets and soft-disables any token Expo reports as dead
//      (DeviceNotRegistered / InvalidCredentials / bad token) so we never push
//      to it again — and never retry it.
//
// Runs as service_role (SUPABASE_SERVICE_ROLE_KEY), so it bypasses RLS for the
// fan-out and the dead-token marking. That key must ONLY ever live here in the
// function's secrets, never in the app bundle.
//
// Delivery is best-effort: the message row is the durable record (students read
// it from the in-app inbox regardless), so a token/network failure here is
// logged, not fatal.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_BATCH_SIZE = 100; // Expo accepts up to 100 messages per request

type Scope = "school" | "class" | "student";

interface MessageRecord {
  id: string;
  scope: Scope;
  target_id: string | null;
  title: string;
  body: string;
}

// The Database Webhook posts { type, table, record, ... }. We also accept a bare
// message record (handy for manual re-sends / testing).
interface WebhookPayload {
  type?: string;
  table?: string;
  record?: MessageRecord;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    return json({ error: "server not configured" }, 500);
  }

  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }

  // Accept either the webhook envelope or a bare record.
  const message = payload.record ?? (payload as unknown as MessageRecord);
  if (!message?.id || !message?.scope || !message?.title) {
    return json({ error: "no message record in payload" }, 400);
  }
  // Only react to inserts when an envelope type is present.
  if (payload.type && payload.type !== "INSERT") {
    return json({ skipped: `ignoring ${payload.type}` });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // ---- 1. Resolve the audience → student ids ----
  let studentIds: string[] = [];
  try {
    studentIds = await resolveAudience(supabase, message);
  } catch (e) {
    console.error("audience resolution failed", e);
    return json({ error: "could not resolve audience" }, 500);
  }

  if (studentIds.length === 0) {
    return json({ message_id: message.id, recipients: 0, sent: 0 });
  }

  // ---- 2. Pull LIVE push tokens for those students ----
  const { data: tokenRows, error: tokenErr } = await supabase
    .from("push_tokens")
    .select("token")
    .in("student_id", studentIds)
    .is("disabled_at", null);

  if (tokenErr) {
    console.error("token fetch failed", tokenErr);
    return json({ error: "could not load push tokens" }, 500);
  }

  // De-dupe: the same device could match via multiple audience paths.
  const tokens = [...new Set((tokenRows ?? []).map((r) => r.token))].filter(
    (t) => typeof t === "string" && t.startsWith("ExponentPushToken"),
  );

  if (tokens.length === 0) {
    return json({
      message_id: message.id,
      recipients: studentIds.length,
      tokens: 0,
      sent: 0,
    });
  }

  // ---- 3. Send in batches; collect the tokens Expo flags as dead ----
  const deadTokens = new Set<string>();
  let sent = 0;

  for (let i = 0; i < tokens.length; i += EXPO_BATCH_SIZE) {
    const batch = tokens.slice(i, i + EXPO_BATCH_SIZE);
    const notifications = batch.map((to) => ({
      to,
      title: message.title,
      body: message.body,
      sound: "default",
      // Deep-links the tap to the in-app inbox and lets the client mark read.
      data: { messageId: message.id, scope: message.scope },
    }));

    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
        },
        body: JSON.stringify(notifications),
      });

      if (!res.ok) {
        console.error(`Expo push batch failed: ${res.status} ${await res.text()}`);
        continue; // best-effort: skip this batch, keep going
      }

      const body = await res.json();
      // Tickets come back positionally aligned with the batch we sent.
      const tickets = Array.isArray(body?.data) ? body.data : [];
      tickets.forEach((ticket: any, idx: number) => {
        if (ticket?.status === "ok") {
          sent += 1;
        } else if (ticket?.status === "error") {
          const errType = ticket?.details?.error;
          // These mean the token will NEVER work again — mark dead, don't retry.
          if (
            errType === "DeviceNotRegistered" ||
            errType === "InvalidCredentials" ||
            errType === "InvalidToken"
          ) {
            deadTokens.add(batch[idx]);
          } else {
            console.error(`Expo ticket error for token[${idx}]:`, ticket?.message);
          }
        }
      });
    } catch (e) {
      console.error("Expo push request threw", e);
      // Network error to Expo — leave these tokens alone (not proven dead).
    }
  }

  // ---- 4. Soft-disable dead tokens (never hard-delete) ----
  if (deadTokens.size > 0) {
    const { error: disableErr } = await supabase
      .from("push_tokens")
      .update({ disabled_at: new Date().toISOString() })
      .in("token", [...deadTokens]);
    if (disableErr) {
      console.error("failed to disable dead tokens", disableErr);
    }
  }

  return json({
    message_id: message.id,
    recipients: studentIds.length,
    tokens: tokens.length,
    sent,
    disabled: deadTokens.size,
  });
});

// Map a message's scope + target to the set of student ids it should reach.
//   school  → every student (identity-level; delivery still needs a live token)
//   class   → students with an ACTIVE enrollment in that class for the CURRENT
//             academic year
//   student → just that one student
async function resolveAudience(
  supabase: ReturnType<typeof createClient>,
  message: MessageRecord,
): Promise<string[]> {
  if (message.scope === "student") {
    return message.target_id ? [message.target_id] : [];
  }

  if (message.scope === "school") {
    const { data, error } = await supabase.from("students").select("id");
    if (error) throw error;
    return (data ?? []).map((r) => r.id);
  }

  // scope === 'class'
  if (!message.target_id) return [];

  const { data: year, error: yearErr } = await supabase
    .from("academic_years")
    .select("id")
    .eq("is_current", true)
    .maybeSingle();
  if (yearErr) throw yearErr;
  if (!year) return []; // no current year → no class audience

  const { data, error } = await supabase
    .from("enrollments")
    .select("student_id")
    .eq("class_id", message.target_id)
    .eq("year_id", year.id)
    .eq("status", "active");
  if (error) throw error;
  return [...new Set((data ?? []).map((r) => r.student_id))];
}
