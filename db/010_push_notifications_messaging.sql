-- ============================================================
--  010 — Push notifications + in-app messaging
--
--  Additive migration. SAFE to run on a live database (no table/row drops,
--  no data loss) and idempotent (safe to re-run). Run once in the Supabase
--  SQL Editor after 009.
--
--  WHAT THIS ADDS
--  --------------
--    * push_tokens — one row per device the student app has registered for
--      push. Keyed on the immutable student id (CLAUDE.md rule 2: identity
--      lives on the student, not the enrollment). A token that Expo reports as
--      dead (DeviceNotRegistered / InvalidToken) is soft-disabled, never
--      hard-deleted (rule 3), so we keep a history of devices and stop pushing
--      to a dead token without losing the record.
--    * messages — a broadcast from staff/teachers to an audience: the whole
--      school, one class, or one student. The message is the durable record;
--      push is best-effort delivery on top. A student who missed the push (OS
--      permission denied, offline, app closed) still reads it from the in-app
--      inbox because the row is here and RLS lets them see it.
--
--  Delivery (Expo Push) is done by the send-message-push Edge Function, wired
--  to an INSERT webhook on public.messages. This migration only defines the
--  data + who may read/write it; RLS is the security boundary, as always.
-- ============================================================


-- ============================================================
--  PART 1 — Helper: the signed-in user's student id (if any)
-- ============================================================
-- A student login's profile carries student_id (db/004 / 008). Resolving it
-- here, SECURITY DEFINER, lets RLS policies scope rows to "my" student without
-- each policy re-joining profiles (and without needing read access to other
-- profiles). Returns null for staff/teacher/pending accounts.
create or replace function public.my_student_id()
returns uuid
language sql stable security definer set search_path = public as $$
  select student_id from public.profiles where id = auth.uid()
$$;


-- ============================================================
--  PART 2 — push_tokens
-- ============================================================
-- token is unique: Expo returns one token per app install, and re-registering
-- the same install must UPDATE (refresh device_info / re-enable) rather than
-- pile up duplicates — so the client upserts on token. disabled_at is the
-- soft-delete: null = live, set = Expo told us this token is dead. The partial
-- index keeps the "live tokens for these students" fan-out (the Edge Function's
-- hot path) fast as dead tokens accumulate.
create table if not exists public.push_tokens (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.students(id) on delete cascade,
  token        text not null unique,
  device_info  jsonb,
  disabled_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists ix_push_tokens_student on public.push_tokens(student_id);
create index if not exists ix_push_tokens_live
  on public.push_tokens(student_id)
  where disabled_at is null;

drop trigger if exists t_push_tokens_touch on public.push_tokens;
create trigger t_push_tokens_touch before update on public.push_tokens
  for each row execute function public.touch_updated_at();


-- ============================================================
--  PART 3 — messages
-- ============================================================
-- scope + target_id together name the audience:
--   * 'school'  → target_id null  → every student
--   * 'class'   → target_id = classes.id   → students enrolled in that class
--                                            (current year, active enrollment)
--   * 'student' → target_id = students.id  → that one student
-- The CHECK enforces that target_id is present exactly when the scope needs it,
-- so a malformed row can't exist. sender_id is the authoring profile (audit:
-- who sent it), kept even if that account is later removed (set null).
create table if not exists public.messages (
  id          uuid primary key default gen_random_uuid(),
  sender_id   uuid references public.profiles(id) on delete set null,
  scope       text not null check (scope in ('school','class','student')),
  target_id   uuid,
  title       text not null,
  body        text not null,
  created_at  timestamptz not null default now(),
  constraint messages_target_matches_scope check (
    (scope = 'school'  and target_id is null) or
    (scope in ('class','student') and target_id is not null)
  )
);

-- Reads are "newest messages I'm allowed to see" — both the inbox (per student)
-- and the audience fan-out order by created_at.
create index if not exists ix_messages_created on public.messages(created_at desc);
create index if not exists ix_messages_scope_target on public.messages(scope, target_id);


-- ============================================================
--  PART 4 — Row-Level Security
-- ============================================================
alter table public.push_tokens enable row level security;
alter table public.messages    enable row level security;

-- ---- push_tokens ----
-- A student manages only their own device tokens; the check ties every write to
-- the signed-in student's id, so one student can't register/read another's
-- device. Staff can read all (support/debugging); the Edge Function runs as
-- service_role and bypasses RLS entirely for the send fan-out + dead-token
-- marking.
drop policy if exists p_push_tokens_owner on public.push_tokens;
create policy p_push_tokens_owner on public.push_tokens
  for all
  using (student_id = public.my_student_id())
  with check (student_id = public.my_student_id());

drop policy if exists p_push_tokens_staff_read on public.push_tokens;
create policy p_push_tokens_staff_read on public.push_tokens
  for select using (public.is_staff());

-- ---- messages ----
-- Staff (admin/developer): full control, any scope.
drop policy if exists p_messages_staff on public.messages;
create policy p_messages_staff on public.messages
  for all using (public.is_staff()) with check (public.is_staff());

-- Teachers may send, but only to an audience they own: a class they teach, or a
-- student in a class they teach. No school-wide broadcast from a teacher. They
-- can read back what they sent. sender_id must be themselves (audit integrity).
drop policy if exists p_messages_teacher_send on public.messages;
create policy p_messages_teacher_send on public.messages
  for insert with check (
    public.is_teacher()
    and sender_id = auth.uid()
    and (
      (scope = 'class' and public.teaches_class(target_id))
      or (scope = 'student' and exists (
            select 1 from public.enrollments e
            where e.student_id = target_id and public.teaches_class(e.class_id)))
    )
  );

drop policy if exists p_messages_teacher_read on public.messages;
create policy p_messages_teacher_read on public.messages
  for select using (public.is_teacher() and sender_id = auth.uid());

-- Students read only messages addressed to them: school-wide, their own class
-- (current year, active enrollment), or them by id. This is the inbox query's
-- security boundary — the client filter is convenience only.
drop policy if exists p_messages_student_read on public.messages;
create policy p_messages_student_read on public.messages
  for select using (
    public.my_student_id() is not null
    and (
      scope = 'school'
      or (scope = 'student' and target_id = public.my_student_id())
      or (scope = 'class' and exists (
            select 1
            from public.enrollments e
            join public.academic_years ay on ay.id = e.year_id
            where e.student_id = public.my_student_id()
              and e.class_id = target_id
              and e.status = 'active'
              and ay.is_current))
    )
  );
