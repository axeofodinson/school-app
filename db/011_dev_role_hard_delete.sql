-- ============================================================
--  011 — Dev role + hard-delete-student RPC
--
--  Additive migration. SAFE to run on a live database (adds functions only, no
--  table/row drops, no column changes) and idempotent (safe to re-run — every
--  function is create-or-replace). Run once in the Supabase SQL Editor after 010.
--
--  WHY THIS EXISTS
--  ---------------
--  The platform intentionally NEVER hard-deletes anything with consequences
--  (CLAUDE.md rule 3): students are struck off (009), tokens are soft-disabled
--  (010), enrollments are closed, submissions keep raw responses. That is the
--  correct default and stays the default for admins.
--
--  But someone has to be able to *truly* erase a record — a test student created
--  by mistake, a duplicate, a GDPR-style "delete everything" request. That power
--  is dangerous and irreversible, so it is scoped to the DEV role and to the dev
--  console only, never to the admin UI.
--
--  "dev" here IS the existing `developer` role (setup.sql: role in
--  ('developer','admin',...)). developer is already "staff with full visibility,
--  distinct from admin" (is_staff() = developer OR admin, and RootNavigator
--  routes both into the console). This migration does NOT add a new enum value
--  (CLAUDE.md rule 4 fixes the role set); it gives the developer role its one
--  extra capability: dev_hard_delete_student().
--
--  THE SECURITY BOUNDARY IS HERE, NOT IN THE APP
--  ---------------------------------------------
--  dev_hard_delete_student() re-checks the caller's role itself (is_dev()) and
--  raises if the caller is not a developer. Hiding the button in the client is
--  convenience only — an admin (or anyone) who calls this RPC directly is
--  rejected by the function. RLS + this in-function check are the real boundary
--  (CLAUDE.md rule 4).
-- ============================================================


-- ============================================================
--  PART 1 — is_dev(): is the caller the developer role?
-- ============================================================
-- Mirrors is_staff()/is_teacher() from setup.sql. Leans on my_role(), which
-- resolves the SIGNED-IN user's role via auth.uid() — so even though callers
-- reach this through a SECURITY DEFINER function below, is_dev() still reflects
-- the real caller, not the function owner. Returns false for admin/teacher/
-- student/pending and for an unauthenticated (anon) request.
create or replace function public.is_dev()
returns boolean language sql stable as $$
  select public.my_role() = 'developer'
$$;


-- ============================================================
--  PART 2 — dev_hard_delete_student(): irreversible cascade
-- ============================================================
-- Permanently erases one student and everything hanging off them, in a single
-- transaction (a plpgsql function body is atomic — any error rolls the WHOLE
-- thing back, so a student is never left half-deleted). The cascade order is
-- explicit rather than leaning on FK ON DELETE CASCADE, so the intent is
-- auditable and the row counts can be reported back:
--
--   attempts (submissions)  → attendance → push_tokens → enrollments → student
--
-- submissions and attendance are keyed on enrollment_id, so they are cleared via
-- the student's enrollments before those enrollments (and the student) go. As a
-- final step the student's own login (the auth.users row linked through
-- profiles.student_id, if the student was ever given a login) is removed too —
-- otherwise a live credential would survive its now-deleted profile. The profile
-- row itself disappears via the students → profiles FK cascade.
--
-- This is the ONE thing developer can do that admin cannot. The guard below is
-- the enforcement: not client-side, not RLS-adjacent — the function refuses a
-- non-dev caller outright.
--
-- Returns a jsonb summary of what was removed (handy for a dev-console
-- confirmation and a lightweight audit line).
create or replace function public.dev_hard_delete_student(p_student_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare
  v_login_uid  uuid;
  v_attempts   int;
  v_attendance int;
  v_tokens     int;
  v_enroll     int;
  v_students   int;
begin
  -- Enforcement: only the developer role may hard-delete. Everyone else —
  -- admin included — is rejected here regardless of what the UI showed them.
  if not public.is_dev() then
    raise exception 'only the dev role may hard-delete a student'
      using errcode = '42501'; -- insufficient_privilege
  end if;

  -- The student must exist. A no-op "delete" of a missing id is almost always a
  -- mistake (stale UI, wrong id), so surface it rather than silently succeed.
  if not exists (select 1 from public.students where id = p_student_id) then
    raise exception 'student % not found', p_student_id
      using errcode = 'no_data_found';
  end if;

  -- Capture the linked login account (if the student was ever provisioned one)
  -- BEFORE the student row goes — the students → profiles cascade will remove
  -- the profile that carries this link, so we read it up front.
  select id into v_login_uid
  from public.profiles
  where student_id = p_student_id;

  -- 1) attempts (a student's submission IS their attempt — see 005). Keyed on
  --    the student's enrollments.
  delete from public.submissions
  where enrollment_id in (
    select id from public.enrollments where student_id = p_student_id
  );
  get diagnostics v_attempts = row_count;

  -- 2) attendance — also keyed on the student's enrollments.
  delete from public.attendance
  where enrollment_id in (
    select id from public.enrollments where student_id = p_student_id
  );
  get diagnostics v_attendance = row_count;

  -- 3) push_tokens — keyed directly on the student.
  delete from public.push_tokens where student_id = p_student_id;
  get diagnostics v_tokens = row_count;

  -- 4) enrollments — now safe to remove (their submissions/attendance are gone).
  delete from public.enrollments where student_id = p_student_id;
  get diagnostics v_enroll = row_count;

  -- 5) the student row itself. This cascades to the linked profile row (if any)
  --    via profiles.student_id → students ON DELETE CASCADE.
  delete from public.students where id = p_student_id;
  get diagnostics v_students = row_count;

  -- 6) the student's login credential. Deleting the auth.users row cascades to
  --    auth.identities (and to the profile, already gone). Skipped when the
  --    student never had a login. Being inside this transaction, a failure here
  --    rolls back the whole delete.
  if v_login_uid is not null then
    delete from auth.users where id = v_login_uid;
  end if;

  return jsonb_build_object(
    'student_id',    p_student_id,
    'attempts',      v_attempts,
    'attendance',    v_attendance,
    'push_tokens',   v_tokens,
    'enrollments',   v_enroll,
    'students',      v_students,
    'login_removed', v_login_uid is not null
  );
end $$;


-- ============================================================
--  PART 3 — create ONE dedicated dev account
--
--  A dev login is its OWN account, distinct from your admin/owner account — not
--  a flag toggled on an existing admin. Create it in two steps, ONCE:
--
--    (a) Make the auth user + set its credentials yourself, so the password is
--        never written in this file. Easiest path (least fragile, works on any
--        GoTrue version): Supabase Dashboard → Authentication → Users →
--        "Add user" → enter the dev email + a password, tick "Auto Confirm
--        User". (Programmatic alternative: the Auth Admin API's createUser with
--        email_confirm:true from an Edge Function — same as the note in 004.)
--
--    (b) Promote that account to the developer role by running the block below
--        with its email filled in. Idempotent: safe to re-run; re-promotes in
--        place. It raises if no auth user with that email exists yet — so do
--        step (a) first.
--
--  This deliberately does NOT touch your own account. After it runs you have two
--  developer logins: your original one and this dedicated dev account.
-- ============================================================
do $$
declare
  v_dev_email text := 'REPLACE_WITH_DEV_ACCOUNT_EMAIL'; -- <-- set this, then run
  v_uid       uuid;
begin
  if v_dev_email = 'REPLACE_WITH_DEV_ACCOUNT_EMAIL' then
    raise notice 'Skipping dev-account promotion: set v_dev_email first (see PART 3).';
    return;
  end if;

  select id into v_uid from auth.users where email = v_dev_email;
  if v_uid is null then
    raise exception 'No auth user with email % — create it first (PART 3 step a).', v_dev_email;
  end if;

  insert into public.profiles (id, role)
  values (v_uid, 'developer')
  on conflict (id) do update set role = 'developer';

  raise notice 'Promoted % to developer.', v_dev_email;
end $$;
