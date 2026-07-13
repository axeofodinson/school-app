-- ============================================================
--  012 — Realtime on public.messages
--
--  Additive migration. SAFE on a live database (no table/row changes at all —
--  publication membership only) and idempotent (safe to re-run). Run once in
--  the Supabase SQL Editor after 011.
--
--  WHY
--  ---
--  The app now shows an in-app toast the moment a message arrives while it is
--  open. Push covers devices with OS permission granted; this Realtime stream
--  covers the rest of the "app is open" case (permission denied, simulator,
--  Expo Go) by letting the client subscribe to INSERTs on public.messages.
--
--  SECURITY
--  --------
--  Nothing new to lock down: Supabase Realtime enforces the table's existing
--  RLS per subscriber, so a student's subscription only ever receives the
--  rows the inbox policies (db/010) already let them SELECT — school-wide,
--  their class (current year, active enrollment), or them personally. RLS
--  remains the boundary; the app-side filter is convenience only.
-- ============================================================

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end
$$;
