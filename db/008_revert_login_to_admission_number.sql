-- ============================================================
--  008 — Revert student-login functions to the admission-number design
--
--  Corrective migration. Changes only FUNCTION definitions (no table/column
--  drops, no data loss) and is idempotent (every function is dropped first,
--  then recreated). Run once in the Supabase SQL Editor after 007.
--
--  WHY THIS EXISTS
--  ---------------
--  004 keyed student login on the student's IMMUTABLE identity: the auth email
--  is derived from students.id, and a student signs in with their ADMISSION
--  NUMBER (students.student_code) + PIN. That was a deliberate design choice —
--  student_code is globally unique and STABLE across academic years, so a
--  student keeps one login for their whole time at the school.
--
--  The deployed database had since drifted to an ENROLLMENT-keyed model
--  (login by class_id + roll_number, email derived from the enrollment id),
--  which 007 captured to make the committed migrations match production. But
--  that model ties a student's login to a single year's enrollment: class and
--  roll change year to year (and re-enrolling mints a new enrollment id, hence
--  a new account), so a student cannot keep one stable identity. That defeats
--  the reason admission number was chosen.
--
--  This migration reverts all three functions to the 004 admission-number
--  design. It is NOT a byte-for-byte copy of 004 (it must first DROP the
--  drifted signatures), but the restored definitions match 004's intent and
--  bodies. The surrounding schema they depend on (students.student_code /
--  full_name, profiles.student_id, auth.users/identities, is_staff) is
--  unchanged since 004 — 005 and 006 add no columns to those tables — so the
--  original bodies restore cleanly.
--
--  WHAT REVERTS (deployed/007  ->  back to 004 intent)
--  ---------------------------------------------------
--    * student_login_handle(uuid): parameter p_enrollment_id -> p_student_id.
--      The synthesized email is derived from the STUDENT id again.
--    * student_login_email: (p_class_id uuid, p_roll integer) ->
--      (p_student_code text). Login identity is the admission number again;
--      no class/year context needed.
--    * provision_student_login(uuid, text): parameter p_enrollment_id ->
--      p_student_id, and the body looks the student up directly by id.
--
--  Signature/parameter changes cannot go through CREATE OR REPLACE (Postgres
--  forbids renaming an input parameter, and a new argument list is a different
--  function), so each function is DROP FUNCTION IF EXISTS + CREATE, in reverse
--  dependency order (callers before the shared helper), with the grants
--  re-asserted since DROP clears the ACL (same approach as 007).
-- ============================================================


-- Reverse-dependency drops: the two callers first, then the shared helper.
-- The drifted signatures (from 007) are what exist when this runs on a live DB.
drop function if exists public.provision_student_login(uuid, text);
drop function if exists public.student_login_email(uuid, integer);   -- drifted signature
drop function if exists public.student_login_email(text);            -- in case already reverted (idempotent)
drop function if exists public.student_login_handle(uuid);


-- ============================================================
--  Synthesized login handle — keyed on the STUDENT id (immutable identity).
-- ============================================================
-- The synthesized, non-routable email for a given student. Keyed on the
-- immutable students.id so a student's login identity is stable for their whole
-- time at the school. `.invalid` is a reserved TLD — the address can never reach
-- a real inbox; it is an internal identifier, not a contactable email.
create or replace function public.student_login_handle(p_student_id uuid)
returns text
language sql immutable set search_path = public as $$
  select 's.' || replace(p_student_id::text, '-', '') || '@students.school.invalid'
$$;


-- ============================================================
--  Read-side login lookup — keyed on the ADMISSION NUMBER (student_code).
-- ============================================================
-- Resolve an admission number to the synthesized login email, or null when no
-- student has that code. student_code is globally unique and stable across
-- years, so it is all the identity a student needs — no class, no year, no roll.
-- The match is trimmed and case-insensitive so a kid isn't tripped by casing.
-- SECURITY DEFINER so the pre-auth login screen (role `anon`) can reach it past
-- RLS. Returns only the derived handle — never student PII; signing in still
-- requires the PIN.
create or replace function public.student_login_email(p_student_code text)
returns text
language sql stable security definer set search_path = public as $$
  select public.student_login_handle(s.id)
  from public.students s
  where lower(s.student_code) = lower(trim(p_student_code))
  limit 1
$$;

-- Only this function is reachable before sign-in.
revoke all on function public.student_login_email(text) from public;
grant execute on function public.student_login_email(text) to anon, authenticated;


-- ============================================================
--  Provisioning — keyed on the STUDENT id.
-- ============================================================
-- Creates (or re-PINs) the login account for a student. The synthesized email
-- comes from student_login_handle(p_student_id) so it matches what
-- student_login_email() returns at sign-in. See 004's Part 5 header for the
-- GoTrue caveats around the direct auth.users insert.
create or replace function public.provision_student_login(
  p_student_id uuid,
  p_pin text
)
returns uuid
language plpgsql security definer set search_path = public, auth, extensions as $$
declare
  v_full_name  text;
  v_email      text;
  v_uid        uuid;
begin
  if not public.is_staff() then
    raise exception 'only staff may provision student logins';
  end if;

  select full_name into v_full_name
  from public.students
  where id = p_student_id;

  if not found then
    raise exception 'student % not found', p_student_id;
  end if;

  v_email := public.student_login_handle(p_student_id);

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

  -- Link + promote the profile. The handle_new_user trigger already inserted a
  -- 'pending' row on the auth.users insert; upsert makes this safe either way.
  insert into public.profiles (id, role, full_name, student_id)
  values (v_uid, 'student', v_full_name, p_student_id)
  on conflict (id) do update
    set role = 'student', full_name = excluded.full_name, student_id = excluded.student_id;

  return v_uid;
end $$;

-- Callable only by authenticated staff (the body re-checks is_staff()).
revoke all on function public.provision_student_login(uuid, text) from public;
grant execute on function public.provision_student_login(uuid, text) to authenticated;
