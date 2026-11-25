-- ============================================================
--  029 — Messaging inbox: read state, once-only push, no edits
--
--  DRAFT — NOT YET RUN
--
--  Additive and idempotent. Independent of 017/018/023/028: it only touches
--  public.messages (db/010) and adds one table, so it is safe on production
--  (without 018) and on dev (with 018). Run it in the SQL Editor, dev first.
--
--  WHAT THIS ADDS (prompt 15)
--  --------------------------
--  1. message_reads: which student has read which message, on the server, so
--     "unread" is the same on a phone and a Chromebook. One row per
--     (message, student), written once, never changed.
--  2. mark_messages_read(ids[]): the one write path for read state. SECURITY
--     INVOKER: a student can only mark messages RLS lets them read.
--  3. message_read_counts(ids[]): how many students have read each message, for
--     the sender's "Sent" list. SECURITY INVOKER: RLS limits it to messages the
--     caller may see reads for (staff: all; a teacher: their own).
--  4. messages.push_claimed_at / push_result: the Edge Function claims a
--     message exactly once and records what Expo said. Together with the
--     function now reading title/body/audience from this table (never from the
--     request), nobody holding the public anon key can push arbitrary text.
--  5. register_push_token / disable_push_token: a phone or Chromebook can be
--     shared, so one Expo token must be able to move from one student to the
--     next. A plain upsert can't (RLS hides the previous owner's row), so the
--     move goes through a definer function that only ever assigns the token to
--     the CALLER. Signing out disables the token, so nobody gets another
--     student's messages.
--  6. Messages become immutable from the app: no UPDATE or DELETE for client
--     roles (CLAUDE.md rule 3). The old app only inserts, so it is unaffected.
--  7. A teacher's one-student message needs that student's active, current-year
--     enrollment in a class they teach (db/010 accepted any past enrollment).
--
--  CHECK AFTERWARDS (read-only):
--    select to_regclass('public.message_reads');
--    select proname from pg_proc where proname in ('mark_messages_read',
--      'message_read_counts','register_push_token','disable_push_token');
--    select column_name from information_schema.columns
--     where table_name = 'messages' and column_name like 'push_%';
-- ============================================================


-- ============================================================
--  PART 1 — messages: push bookkeeping, immutable from the app
-- ============================================================
alter table public.messages
  add column if not exists push_claimed_at timestamptz,
  add column if not exists push_result     jsonb;

-- Every message is already in the past by the time this runs; mark them so the
-- Edge Function never "sends" an old message if someone replays it.
update public.messages set push_claimed_at = created_at where push_claimed_at is null;

revoke update, delete, truncate on public.messages from anon, authenticated;
-- The inbox/compose columns the app reads; push bookkeeping stays server-side.
revoke all on public.messages from anon;


-- Teachers send to one student only while that student is ACTIVELY enrolled,
-- this year, in a class the teacher teaches (db/010 accepted any enrollment
-- ever, so a former pupil could still be messaged). Same audience the
-- student's own read policy uses.
drop policy if exists p_messages_teacher_send on public.messages;
create policy p_messages_teacher_send on public.messages
  for insert with check (
    public.is_teacher()
    and sender_id = auth.uid()
    and (
      (scope = 'class' and public.teaches_class(target_id))
      or (scope = 'student' and exists (
            select 1
            from public.enrollments e
            join public.academic_years ay on ay.id = e.year_id
            where e.student_id = target_id
              and e.status = 'active'
              and ay.is_current
              and public.teaches_class(e.class_id)))
    )
  );


-- ============================================================
--  PART 2 — message_reads
-- ============================================================
create table if not exists public.message_reads (
  message_id uuid not null references public.messages(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  read_at    timestamptz not null default now(),
  primary key (message_id, student_id)
);
create index if not exists ix_message_reads_student on public.message_reads(student_id);

alter table public.message_reads enable row level security;

-- A student reads and writes only their own rows, and only for a message they
-- can actually read (the subquery runs under messages' own RLS).
drop policy if exists p_message_reads_student_read on public.message_reads;
create policy p_message_reads_student_read on public.message_reads
  for select using (student_id = public.my_student_id());

drop policy if exists p_message_reads_student_insert on public.message_reads;
create policy p_message_reads_student_insert on public.message_reads
  for insert with check (
    student_id = public.my_student_id()
    and exists (select 1 from public.messages m where m.id = message_reads.message_id)
  );

-- Staff see every read; a teacher sees reads of the messages they sent.
drop policy if exists p_message_reads_staff_read on public.message_reads;
create policy p_message_reads_staff_read on public.message_reads
  for select using (public.is_staff());

drop policy if exists p_message_reads_teacher_read on public.message_reads;
create policy p_message_reads_teacher_read on public.message_reads
  for select using (
    public.is_teacher()
    and exists (
      select 1 from public.messages m
      where m.id = message_reads.message_id and m.sender_id = auth.uid())
  );

revoke all on public.message_reads from anon;
revoke update, delete, truncate on public.message_reads from authenticated;
grant select, insert on public.message_reads to authenticated;


-- ============================================================
--  PART 3 — Functions
-- ============================================================
-- Mark messages read for the signed-in student. Ids the student can't read, or
-- that are already read, are ignored; returns how many were newly marked.
create or replace function public.mark_messages_read(p_ids uuid[])
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_sid uuid := public.my_student_id();
  v_n integer;
begin
  if v_sid is null then
    raise exception 'not_a_student' using errcode = '42501';
  end if;
  insert into public.message_reads (message_id, student_id)
  select m.id, v_sid
  from public.messages m
  where m.id = any (coalesce(p_ids, '{}'::uuid[]))
  on conflict do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end
$$;

-- Read counts for the sender's list: one row per message that has any reads.
create or replace function public.message_read_counts(p_ids uuid[])
returns table (message_id uuid, read_count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select r.message_id, count(*)
  from public.message_reads r
  where r.message_id = any (coalesce(p_ids, '{}'::uuid[]))
  group by r.message_id
$$;

revoke all on function public.mark_messages_read(uuid[]) from public, anon;
revoke all on function public.message_read_counts(uuid[]) from public, anon;
grant execute on function public.mark_messages_read(uuid[]) to authenticated;
grant execute on function public.message_read_counts(uuid[]) to authenticated;


-- Register (or take over, on a shared device) an Expo push token for the signed-in
-- student. Always assigned to the caller and re-enabled.
create or replace function public.register_push_token(p_token text, p_device_info jsonb default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sid uuid := public.my_student_id();
begin
  if v_sid is null then
    raise exception 'not_a_student' using errcode = '42501';
  end if;
  if p_token is null or p_token !~ '^Expo(nent)?PushToken\[.+\]$' then
    raise exception 'bad_token';
  end if;
  insert into public.push_tokens (student_id, token, device_info, disabled_at)
  values (v_sid, p_token, p_device_info, null)
  on conflict (token) do update
    set student_id = v_sid, device_info = excluded.device_info, disabled_at = null;
end
$$;

-- Switch push off for this install when its student signs out. Only the token's
-- current owner can; anything else is a no-op.
create or replace function public.disable_push_token(p_token text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.push_tokens
     set disabled_at = now()
   where token = p_token
     and student_id = public.my_student_id()
     and disabled_at is null
$$;

revoke all on function public.register_push_token(text, jsonb) from public, anon;
revoke all on function public.disable_push_token(text) from public, anon;
grant execute on function public.register_push_token(text, jsonb) to authenticated;
grant execute on function public.disable_push_token(text) to authenticated;
