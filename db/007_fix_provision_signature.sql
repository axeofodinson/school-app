-- ============================================================
--  007 — Reconcile the student-login functions with deployed reality
--
--  Corrective migration. SAFE to run on a live database in the sense that it
--  changes only FUNCTION definitions (no table/column drops, no data loss) and
--  is idempotent (safe to re-run — every function is dropped first, then
--  recreated). Run once in the Supabase SQL Editor after 004 (and 005/006).
--
--  WHY THIS EXISTS
--  ---------------
--  The functions 004 shipped drifted from what was later applied directly to
--  the production database, and the committed migrations were never caught up.
--  A fresh run of setup.sql + 004 therefore reproduced the OLD, student-id-keyed
--  login functions — not the enrollment-id-keyed ones actually running — which
--  is what caused the "POST /rpc/provision_student_login → 404" bug (the app,
--  fixed separately, now sends p_enrollment_id, which the OLD function has no
--  parameter for). This migration makes a from-scratch rebuild (fresh project,
--  disaster recovery, onboarding another school) reproduce the CURRENT, working
--  functions.
--
--  The three definitions below were pulled verbatim from the live database with
--  pg_get_functiondef(...) — they are the source of truth here, not 004.
--
--  WHAT DRIFTED (004  ->  deployed)
--  --------------------------------
--    * student_login_handle(uuid): parameter p_student_id -> p_enrollment_id.
--      Body is unchanged (it just formats the uuid into the synthesized
--      handle), but it is now fed the ENROLLMENT id, so the synthesized login
--      email is derived from the enrollment, not the student.
--    * student_login_email: signature p_student_code text  ->  (p_class_id uuid,
--      p_roll integer). Login identity moved from admission number
--      (students.student_code) to (class + roll number) within the CURRENT
--      active enrollment; the email is derived from that enrollment id, so it
--      matches what provisioning writes.
--    * provision_student_login(uuid, text): parameter p_student_id ->
--      p_enrollment_id, and the body now resolves the student via the enrollment
--      (enrollments -> students) and derives the email from the enrollment id.
--
--  A parameter rename or a signature change cannot go through CREATE OR REPLACE
--  (Postgres forbids renaming an input parameter, and a new argument list is a
--  different function), so each function is DROP FUNCTION IF EXISTS + CREATE.
--  Drops are in reverse dependency order (callers before the helper they call);
--  creates are in forward order.
--
--  NOTE ON CONSEQUENCE (informational, not changed here): because the login
--  email is now keyed on the enrollment id, a student's login identity is scoped
--  to one academic year's enrollment rather than being stable for their whole
--  time at the school (which is what 004's header described). Re-enrolling in a
--  new year yields a new enrollment id and therefore a new login account; that
--  is a product decision to revisit separately — 007 only reproduces what is
--  deployed today.
-- ============================================================


-- Reverse-dependency drops: the two callers first, then the shared helper.
drop function if exists public.provision_student_login(uuid, text);
drop function if exists public.student_login_email(text);         -- old signature
drop function if exists public.student_login_handle(uuid);


-- ============================================================
--  Synthesized login handle — now keyed on the ENROLLMENT id.
-- ============================================================
create or replace function public.student_login_handle(p_enrollment_id uuid)
returns text
language sql immutable set search_path = public as $$
  select 's.' || replace(p_enrollment_id::text, '-', '') || '@students.school.invalid'
$$;


-- ============================================================
--  Read-side login lookup — now (class_id, roll_number) in the current year.
-- ============================================================
-- Resolves a class + roll number to the synthesized login email for that
-- student's CURRENT active enrollment, or null when there is no such enrollment.
-- SECURITY DEFINER so the pre-auth login screen (role `anon`, no session yet)
-- can reach it past RLS. Returns only the derived handle — never student PII;
-- signing in still requires the PIN.
create or replace function public.student_login_email(p_class_id uuid, p_roll integer)
returns text
language sql stable security definer set search_path = public as $$
  select public.student_login_handle(e.id)
  from public.enrollments e
  join public.academic_years y on y.id = e.year_id
  where e.class_id = p_class_id and e.roll_number = p_roll and e.status = 'active' and y.is_current
  limit 1
$$;

-- Only this function is reachable before sign-in.
revoke all on function public.student_login_email(uuid, integer) from public;
grant execute on function public.student_login_email(uuid, integer) to anon, authenticated;


-- ============================================================
--  Provisioning — now keyed on the ENROLLMENT id.
-- ============================================================
-- Creates (or re-PINs) the login account for the student behind an enrollment.
-- The synthesized email comes from student_login_handle(p_enrollment_id) so it
-- matches what student_login_email() returns at sign-in. See 004's Part 5 header
-- for the GoTrue caveats around the direct auth.users insert.
create or replace function public.provision_student_login(
  p_enrollment_id uuid,
  p_pin text
)
returns uuid
language plpgsql security definer set search_path = public, auth, extensions as $$
declare
  v_student_id uuid;
  v_full_name  text;
  v_email      text;
  v_uid        uuid;
begin
  if not public.is_staff() then
    raise exception 'only staff may provision student logins';
  end if;

  select e.student_id, s.full_name into v_student_id, v_full_name
  from public.enrollments e
  join public.students s on s.id = e.student_id
  where e.id = p_enrollment_id;

  if v_student_id is null then
    raise exception 'enrollment % not found', p_enrollment_id;
  end if;

  v_email := public.student_login_handle(p_enrollment_id);

  select id into v_uid from auth.users where email = v_email;

  if v_uid is null then
    v_uid := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
      v_email, crypt(p_pin, gen_salt('bf')),
      now(), now(), now(),
      jsonb_build_object('provider','email','providers', jsonb_build_array('email')),
      jsonb_build_object('full_name', v_full_name),
      '', '', '', ''
    );
    insert into auth.identities (
      id, user_id, provider_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), v_uid, v_uid::text,
      jsonb_build_object('sub', v_uid::text, 'email', v_email),
      'email', now(), now(), now()
    );
  else
    update auth.users
      set encrypted_password = crypt(p_pin, gen_salt('bf')),
          updated_at = now()
      where id = v_uid;
  end if;

  insert into public.profiles (id, role, full_name, student_id)
  values (v_uid, 'student', v_full_name, v_student_id)
  on conflict (id) do update
    set role = 'student', full_name = excluded.full_name, student_id = excluded.student_id;

  return v_uid;
end $$;

-- Callable only by authenticated staff (the body re-checks is_staff()).
revoke all on function public.provision_student_login(uuid, text) from public;
grant execute on function public.provision_student_login(uuid, text) to authenticated;
