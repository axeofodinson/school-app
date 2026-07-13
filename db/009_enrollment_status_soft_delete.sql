-- ============================================================
--  009 — Enrollment lifecycle: struck_off + soft-remove + login revocation
--
--  Additive migration. SAFE to run on a live database (no table/row drops,
--  no data loss) and idempotent (safe to re-run). Run once in the Supabase
--  SQL Editor after 008.
--
--  WHY THIS EXISTS
--  ---------------
--  Removing a student must never be a hard delete (CLAUDE.md rule 3: never
--  hard-delete anything with grades/attendance/history attached). An enrollment
--  carries a whole year of consequences — submissions and attendance hang off
--  it — so "removing" a student is a soft close on the enrollment, not a DELETE.
--
--  This migration:
--    * widens enrollments.status with 'struck_off' and adds end_date + reason,
--      so a close records WHAT happened, WHEN, and WHY (audit trail);
--    * revokes the student's login the moment their last active enrollment
--      closes — at the AUTH layer (Supabase ban + session kill), NOT by deleting
--      their credentials, so the account and its history survive and access is
--      restored automatically if they are re-enrolled;
--    * keeps every historical row intact and queryable by staff (RLS is
--      unchanged — is_staff() already reads every enrollment/submission/
--      attendance row regardless of status). Only active-FACING views filter to
--      status = 'active'; the office can still pull a struck-off student's full
--      record.
-- ============================================================


-- ============================================================
--  PART 1 — Schema: widen the status enum, add end_date + reason
-- ============================================================
-- The status check was created inline and unnamed in setup.sql, so Postgres
-- named it enrollments_status_check. Drop-if-exists then re-add makes this
-- idempotent and adds 'struck_off' (a disciplinary/administrative removal)
-- alongside the existing terminal states.
alter table public.enrollments
  drop constraint if exists enrollments_status_check;
alter table public.enrollments
  add constraint enrollments_status_check
  check (status in ('active','struck_off','withdrawn','transferred','graduated'));

-- When the enrollment closed, and why. Both nullable: an active enrollment has
-- neither. reason is free text the office fills in at removal time; end_date is
-- the effective last day (defaults to the removal date in the app).
alter table public.enrollments add column if not exists end_date date;
alter table public.enrollments add column if not exists reason   text;

-- Active rosters (attendance marking, class views) are the hot path and always
-- filter class + year + status='active'. A partial index keeps that lookup fast
-- and small as struck-off rows accumulate over the years.
create index if not exists ix_enroll_active
  on public.enrollments (class_id, year_id)
  where status = 'active';


-- ============================================================
--  PART 2 — Revoke / restore a student's login from their enrollments
-- ============================================================
-- A student has ONE login for their whole time at the school, keyed on their
-- immutable id (db/008: student_login_handle). Access should track whether they
-- currently have ANY active enrollment: close the last one and they can no
-- longer sign in; re-enroll them and access comes back — without ever touching
-- their credentials.
--
-- We block at the AUTH layer using Supabase's own ban mechanism
-- (auth.users.banned_until) plus deleting live sessions so an already-signed-in
-- student is kicked at their next token refresh (existing access tokens are
-- short-lived). The password/identity rows are left untouched, so this is a
-- reversible revocation, not a deletion.
--
-- A concrete far-future timestamp is used rather than 'infinity' because GoTrue
-- scans banned_until into a Go time.Time, which cannot represent infinity.
create or replace function public.sync_student_login_access(p_student_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_has_active boolean;
  v_uid        uuid;
begin
  select exists (
    select 1 from public.enrollments e
    where e.student_id = p_student_id and e.status = 'active'
  ) into v_has_active;

  -- The student's login account, if one was ever provisioned. The synthesized
  -- email is derived from the immutable student id, so this is a stable lookup.
  select id into v_uid
  from auth.users
  where email = public.student_login_handle(p_student_id);

  if v_uid is null then
    return;  -- no login provisioned yet — nothing to revoke or restore
  end if;

  if v_has_active then
    -- Restore access: lift the ban. Credentials were never removed.
    update auth.users
      set banned_until = null, updated_at = now()
      where id = v_uid and banned_until is not null;
  else
    -- Revoke access: ban the account and kill live sessions. Deleting the
    -- session cascades to its refresh tokens, so the student cannot refresh
    -- back in; the ban blocks any fresh sign-in.
    update auth.users
      set banned_until = timestamptz '9999-12-31 23:59:59+00', updated_at = now()
      where id = v_uid;
    delete from auth.sessions where user_id = v_uid;
  end if;
end $$;


-- Fire the sync whenever an enrollment is created or its status changes, so
-- login access follows enrollment state no matter HOW the write happened — the
-- admin "Remove student" update, a re-enroll insert, or a manual SQL fix all go
-- through here. AFTER-row so the enrollment change is already committed to the
-- row the sync reads. SECURITY DEFINER (above) is what lets this reach auth.*
-- from a staff session whose RLS role cannot touch those tables directly.
create or replace function public.enrollment_login_sync()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  perform public.sync_student_login_access(new.student_id);
  return new;
end $$;

drop trigger if exists t_enrollments_login_sync on public.enrollments;
create trigger t_enrollments_login_sync
  after insert or update of status on public.enrollments
  for each row execute function public.enrollment_login_sync();


-- ============================================================
--  PART 3 — Backfill any already-closed enrollments
-- ============================================================
-- If the deployed DB already has non-active enrollments (e.g. someone marked a
-- withdrawal before this migration), reconcile their login state once now.
-- Idempotent: sync only bans the accounts that should be banned.
do $$
declare r record;
begin
  for r in
    select distinct student_id from public.enrollments
  loop
    perform public.sync_student_login_access(r.student_id);
  end loop;
end $$;
