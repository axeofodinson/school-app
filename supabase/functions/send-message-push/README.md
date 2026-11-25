# send-message-push — Edge Function

Sends an Expo push notification to a message's audience whenever a row is
inserted into `public.messages` (added in `db/010_push_notifications_messaging.sql`).

**Since prompt 15 (db/029):** the function takes only the message **id** from the
request and reads the title, body and audience from `public.messages` itself, so a
caller holding the public anon key can't push arbitrary text. It claims each message
once (`messages.push_claimed_at`): a replayed webhook sends nothing. The outcome
(`recipients`, `tokens`, `sent`, `failed`, `disabled`) is stored in
`messages.push_result`. Run `db/029` before deploying this version (it still works
without it, minus the replay guard). Pure helpers are in `logic.ts`, unit-tested in
`packages/core/test/messagePush.test.ts`.

It resolves the audience (school / class / student → student ids), pulls the
**live** push tokens for those students (`push_tokens` where `disabled_at is
null`), sends via the [Expo Push API](https://docs.expo.dev/push-notifications/sending-notifications/)
in batches of 100, and **soft-disables any token Expo reports as dead**
(`DeviceNotRegistered` / `InvalidCredentials` / `InvalidToken`) so it is never
pushed to — or retried — again.

The message row is the durable record; push is best-effort on top. A student who
never gets the push still reads the message from the in-app inbox.

## Deploy

```bash
supabase functions deploy send-message-push
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected into every deployed
function automatically — no secrets to set for this one. The service-role key
bypasses RLS (needed for the audience fan-out and dead-token marking) and must
**never** appear anywhere in the app bundle.

## Wire it to message inserts (Database Webhook)

Dashboard → **Database → Webhooks → Create a new hook**:

- **Table:** `public.messages`
- **Events:** `Insert`
- **Type:** Supabase Edge Function → `send-message-push`
- **Method:** `POST`

The webhook posts `{ type: "INSERT", table: "messages", record: { …the new
message… } }`; the function reads `record`. (It also accepts `{ "id": "…" }`. A manual re-send only works for a message whose
`push_claimed_at` is null; clear it in the SQL Editor first if you really mean to
push again.)

## Notes

- **Audience** — `school`: every student. `class`: students with an **active**
  enrollment in that class for the **current** academic year. `student`: that one
  student. In every case a student only actually receives a push if they have a
  live token (registered from the student app with OS notifications allowed).
- **Idempotency of dead-token handling** — marking a token disabled is a plain
  `update … set disabled_at = now()`, safe to run repeatedly.
- **Android delivery** — this function only talks to the Expo Push API; for pushes
  to actually reach Android devices the build needs Firebase set up (see
  `docs/environment.md` → "Push notifications on Android").
- **Not handled here** — Expo *receipts* (fetched later by ticket id) can surface
  additional `DeviceNotRegistered` cases minutes after send. This function acts on
  the immediate tickets only; a periodic receipts sweep can be added later if dead
  tokens accumulate.
