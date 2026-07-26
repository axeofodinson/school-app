-- ============================================================
--  016 — debug_logs (temporary diagnostic table)
--
--  Additive migration. SAFE on a live database (new table only, no changes to
--  existing tables) and idempotent (guarded with IF NOT EXISTS / DROP POLICY
--  IF EXISTS, safe to re-run). Run once in the Supabase SQL Editor after 015.
--
--  WHY THIS EXISTS
--  ---------------
--  Diagnosing the Realtime toast bug (rows silently filtered by RLS because
--  the socket connects without the session JWT) needs logging that survives
--  past the device's own console. debug_logs is a scratch table the client
--  writes to at each step of the Realtime auth/subscribe/payload/toast
--  pipeline (src/notifications/NotificationsProvider.js). Open to anon +
--  authenticated with no row scoping: it holds no student data of consequence
--  (event names and diagnostic strings only), and is meant to be dropped once
--  the bug is confirmed fixed — do not build on it as a permanent table.
-- ============================================================

create table if not exists public.debug_logs (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  event text not null,
  detail text,
  student_id text
);

alter table public.debug_logs enable row level security;

drop policy if exists "debug insert" on public.debug_logs;
create policy "debug insert" on public.debug_logs
  for insert to anon, authenticated with check (true);

drop policy if exists "debug select" on public.debug_logs;
create policy "debug select" on public.debug_logs
  for select to anon, authenticated using (true);
