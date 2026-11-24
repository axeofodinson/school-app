-- ============================================================
--  023 — Access tiers: school vs prep-only (Google sign-in)
--                                              *** DRAFT — NOT YET RUN ***
--
--  Prompt 05, DECISIONS #23 / #57–#60. Needs 017 applied first (learning
--  tables); refuses to run otherwise. Additive + idempotent: new columns are
--  IF NOT EXISTS, functions CREATE OR REPLACE, policies drop-then-create.
--  Never touches db/setup.sql or an applied migration (the old
--  handle_new_user() stays in place; the auth trigger now calls a NEW
--  function, handle_new_user_v2()).
--
--  WHAT IT DOES
--  1. profiles.access_tier ('school' | 'prep_only', existing rows = 'school'),
--     merged_into / merged_at for the upgrade path, and a check that a
--     prep-only profile is always role 'student' with no student_id.
--  2. New sign-ups: a Google sign-up becomes a prep-only student; any other
--     sign-up (email, anonymous, another provider) stays 'pending' as before.
--  3. Guard on auth.identities: a Google identity can only belong to a
--     prep-only account. Linking Google to a staff, school-student or
--     password account is refused, so Google sign-in never yields school or
--     staff access.
--  4. Guard on profiles: a non-staff user can only edit their own full_name /
--     phone (closes a hole in setup.sql's p_profiles_self_update, which let any
--     signed-in user set their own role); nobody can turn a prep-only profile
--     into a school one.
--  5. is_school_member() + RESTRICTIVE policies: prep-only users get 0 rows
--     from (and cannot write) enrollments, students, assessments, submissions,
--     attendance, messages, exams, push tokens, project teams/scores, the old
--     `questions` table (answer keys) and the school storage buckets. Learning
--     tables (017) already key on learner_id = auth.uid() and stay open to them.
--  6. Upgrade path: find_prep_accounts() + link_prep_account(), staff only,
--     move a prep account's learning history to the student's school login and
--     log it in account_links (insert-only).
-- ============================================================

do $$
begin
  if to_regclass('public.practice_attempts') is null then
    raise exception '023 needs db/017_lms_foundation.sql applied first';
  end if;
end $$;


-- ============================================================
--  PART 1 — Columns
-- ============================================================
alter table public.profiles add column if not exists access_tier text not null default 'school';
alter table public.profiles add column if not exists merged_into uuid references public.profiles(id);
alter table public.profiles add column if not exists merged_at   timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_access_tier_check') then
    alter table public.profiles add constraint profiles_access_tier_check
      check (access_tier in ('school','prep_only'));
  end if;
end $$;

create index if not exists ix_profiles_prep on public.profiles(created_at desc)
  where access_tier = 'prep_only';


-- ============================================================
--  PART 2 — Helper
-- ============================================================
-- True when the signed-in account is on the school tier (staff, teachers,
-- admission-number students, pending staff sign-ups). False for prep-only
-- Google accounts and for no session at all.
create or replace function public.is_school_member()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select p.access_tier = 'school' from public.profiles p where p.id = auth.uid()),
    false)
$$;

-- Identities that are not a school password login (email; phone is unused).
create or replace function public.is_oauth_provider(p text)
returns boolean language sql immutable as $$
  select coalesce(p, 'email') not in ('email', 'phone')
$$;

-- The one provider that creates a prep-only account. Anything else that is
-- not email (anonymous sign-in, another OAuth provider someone enables later)
-- stays 'pending' like an email sign-up: nothing until an admin acts.
create or replace function public.is_prep_provider(p text)
returns boolean language sql immutable as $$
  select coalesce(p, '') = 'google'
$$;


-- ============================================================
--  PART 3 — Profiles guard (before update)
-- ============================================================
create or replace function public.profiles_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  -- Client roles (PostgREST) that are not staff may only change these columns
  -- on their own row. SECURITY DEFINER functions, the SQL editor and the
  -- service role run as another current_user and are not limited here.
  if current_user in ('authenticated', 'anon') and not public.is_staff() then
    if (to_jsonb(new) - array['full_name','phone','updated_at'])
       is distinct from (to_jsonb(old) - array['full_name','phone','updated_at']) then
      raise exception 'you can only change your own name or phone'
        using errcode = '42501';
    end if;
  end if;
  -- One way only: a prep-only (Google) account never becomes a school account.
  -- The upgrade path moves its history to the student's school login instead.
  if old.access_tier = 'prep_only' and new.access_tier <> 'prep_only' then
    raise exception 'a prep-only account cannot be made a school account; link it with link_prep_account()'
      using errcode = '42501';
  end if;
  if new.access_tier = 'prep_only' and (new.role <> 'student' or new.student_id is not null) then
    raise exception 'a prep-only account must stay role student with no student record'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists t_profiles_guard on public.profiles;
create trigger t_profiles_guard before update on public.profiles
  for each row execute function public.profiles_guard();

-- Backfill BEFORE the shape check: a pending account that already signed up
-- with an OAuth provider (none expected) becomes a prep-only learner.
update public.profiles p
   set access_tier = 'prep_only', role = 'student'
 where p.access_tier = 'school' and p.role = 'pending' and p.student_id is null
   and exists (select 1 from auth.identities i
                where i.user_id = p.id and public.is_prep_provider(i.provider))
   and not exists (select 1 from auth.identities i
                    where i.user_id = p.id and not public.is_oauth_provider(i.provider));

do $$
declare n int;
begin
  select count(*) into n from public.profiles p
   where p.access_tier = 'school' and p.role <> 'pending'
     and exists (select 1 from auth.identities i
                  where i.user_id = p.id and public.is_oauth_provider(i.provider));
  if n > 0 then
    raise notice '023: % school account(s) already have an OAuth identity; left as they are. Review them.', n;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'profiles_prep_only_shape') then
    alter table public.profiles add constraint profiles_prep_only_shape
      check (access_tier = 'school' or (role = 'student' and student_id is null));
  end if;
end $$;


-- ============================================================
--  PART 4 — New sign-ups (handle_new_user_v2) + identity guard
-- ============================================================
-- Same as setup.sql's handle_new_user() for every sign-up (role 'pending')
-- except Google, which becomes a prep-only student. GoTrue sets
-- raw_app_meta_data.provider before inserting the user; the identity guard
-- below covers the case where it doesn't.
create or replace function public.handle_new_user_v2()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_name text := left(coalesce(new.raw_user_meta_data->>'full_name',
                               new.raw_user_meta_data->>'name'), 120);
begin
  if public.is_prep_provider(new.raw_app_meta_data->>'provider') then
    insert into public.profiles (id, full_name, role, access_tier)
    values (new.id, v_name, 'student', 'prep_only')
    on conflict (id) do nothing;
  else
    insert into public.profiles (id, full_name)
    values (new.id, new.raw_user_meta_data->>'full_name')
    on conflict (id) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists t_on_auth_user_created on auth.users;
create trigger t_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user_v2();

-- A Google identity may only belong to a prep-only account, and no OAuth
-- identity may attach to a school/staff account (only 'pending' or prep-only
-- accounts can gain one). Runs inside
-- GoTrue's sign-in transaction, so raising here makes the sign-in fail (the
-- app shows "this Google account can't be used here").
create or replace function public.guard_oauth_identity()
returns trigger language plpgsql security definer set search_path = public, auth as $$
declare
  p public.profiles;
  v_has_password boolean;
begin
  if not public.is_oauth_provider(new.provider) then
    return new;
  end if;

  select * into p from public.profiles where id = new.user_id for update;
  if p.id is null then
    insert into public.profiles (id, role, access_tier)
    values (new.user_id, 'student', 'prep_only')
    on conflict (id) do nothing;
    return new;
  end if;
  if p.access_tier = 'prep_only' then
    return new;
  end if;
  -- Another OAuth provider on a pending account: allowed, stays pending.
  if not public.is_prep_provider(new.provider) and p.role = 'pending' then
    return new;
  end if;

  -- A brand-new Google user whose profile was created as 'pending' (provider not
  -- known at user insert): no password, no other identity -> prep-only.
  select coalesce(u.encrypted_password, '') <> '' into v_has_password
    from auth.users u where u.id = new.user_id;
  if public.is_prep_provider(new.provider)
     and p.role = 'pending' and p.student_id is null and not coalesce(v_has_password, false)
     and not exists (select 1 from auth.identities i
                      where i.user_id = new.user_id and i.id is distinct from new.id
                        and not public.is_oauth_provider(i.provider)) then
    update public.profiles set role = 'student', access_tier = 'prep_only' where id = new.user_id;
    return new;
  end if;

  raise exception 'oauth_school_account: social sign-in cannot be used for a school or staff account'
    using errcode = '42501';
end $$;

drop trigger if exists t_guard_oauth_identity on auth.identities;
create trigger t_guard_oauth_identity
  before insert or update of user_id, provider on auth.identities
  for each row execute function public.guard_oauth_identity();

revoke all on function public.handle_new_user_v2()   from public, anon, authenticated;
revoke all on function public.guard_oauth_identity() from public, anon, authenticated;
revoke all on function public.profiles_guard()       from public, anon, authenticated;


-- ============================================================
--  PART 5 — School-only tables: RESTRICTIVE policies
-- ============================================================
-- Restrictive policies AND with the existing permissive ones, so school users
-- are unaffected and prep-only users get nothing, whatever later permissive
-- policies say. Tables from drafts that aren't applied yet are skipped:
-- re-run 023 after applying them (022).
do $$
declare t text;
begin
  foreach t in array array[
    'students','enrollments','teacher_assignments',
    'assessments','assessment_questions','submissions','submission_grade_edits',
    'attendance','messages','push_tokens',
    'exam_sessions','exam_session_answers','exam_events',
    'project_teams','project_team_members','project_scores'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists p_%1$s_school_only on public.%1$I', t);
      execute format(
        'create policy p_%1$s_school_only on public.%1$I as restrictive for all to authenticated '
        'using ((select public.is_school_member())) with check ((select public.is_school_member()))', t);
    end if;
  end loop;
end $$;

-- The old `questions` table holds answer keys (closed for students at 018).
-- Prep-only users read only approved practice versions (question_versions, 017).
drop policy if exists p_questions_school_only on public.questions;
create policy p_questions_school_only on public.questions
  as restrictive for all to authenticated
  using ((select public.is_school_member())) with check ((select public.is_school_member()));

-- School file buckets (014 assessment files, 022 project evidence).
drop policy if exists p_school_buckets_school_only on storage.objects;
create policy p_school_buckets_school_only on storage.objects
  as restrictive for all to authenticated
  using (bucket_id not in ('assessment-files','project-evidence') or (select public.is_school_member()))
  with check (bucket_id not in ('assessment-files','project-evidence') or (select public.is_school_member()));


-- ============================================================
--  PART 6 — Upgrade path: link a prep-only account to a school login
-- ============================================================
-- Insert-only log of every link (who, when, why, what moved).
create table if not exists public.account_links (
  id                uuid primary key default gen_random_uuid(),
  prep_profile_id   uuid not null references public.profiles(id),
  school_profile_id uuid not null references public.profiles(id),
  student_id        uuid not null references public.students(id),
  linked_by         uuid references public.profiles(id),
  reason            text not null check (length(trim(reason)) > 0),
  moved             jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);
create index if not exists ix_account_links_prep   on public.account_links(prep_profile_id);
create index if not exists ix_account_links_school on public.account_links(school_profile_id);
drop trigger if exists t_account_links_immutable on public.account_links;
create trigger t_account_links_immutable before update or delete on public.account_links
  for each row execute function public.forbid_mutation();

alter table public.account_links enable row level security;
drop policy if exists p_account_links_staff_read on public.account_links;
create policy p_account_links_staff_read on public.account_links
  for select using (public.is_staff());
-- No write policy: link_prep_account() is the only writer.

-- Staff search for prep-only accounts by email or name (email lives in
-- auth.users, which clients can't read).
create or replace function public.find_prep_accounts(p_query text)
returns table (id uuid, email text, full_name text, created_at timestamptz,
               merged_into uuid, attempts bigint)
language plpgsql stable security definer set search_path = public, auth as $$
declare q text := trim(coalesce(p_query, ''));
begin
  if not public.is_staff() then
    raise exception 'only staff may search prep-only accounts' using errcode = '42501';
  end if;
  if length(q) < 3 then
    return;
  end if;
  q := '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return query
    select p.id, u.email::text, p.full_name, p.created_at, p.merged_into,
           (select count(*) from public.practice_attempts a where a.learner_id = p.id)
      from public.profiles p
      join auth.users u on u.id = p.id
     where p.access_tier = 'prep_only'
       and (u.email ilike q or p.full_name ilike q)
     order by p.created_at desc
     limit 20;
end $$;

-- Move a prep-only account's learning history to the student's school login.
-- Staff only. Re-running for the same pair moves anything that arrived since
-- (an offline queue flushing late). What moves:
--   practice_attempts  all rows (raw evidence; content unchanged, owner re-keyed)
--   concept_mastery    rows for concepts the school login has no row for
--   follow_ups         all, except an OPEN one that would clash with the school
--                      login's own open follow-up for the same concept + kind
-- What stays on the prep account: gate_overrides (append-only history of what
-- happened to that account) and anything that clashed (counted in `moved`).
-- Mastery for the school login is recomputed by the mastery RPCs (prompt 40).
create or replace function public.link_prep_account(
  p_prep_profile uuid, p_student_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  prep   public.profiles;
  school public.profiles;
  n_pa int; n_cm int; n_cm_kept int; n_fu int; n_fu_kept int;
  v_moved jsonb;
begin
  if not public.is_staff() then
    raise exception 'only staff may link accounts' using errcode = '42501';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'a reason is required';
  end if;

  select * into prep from public.profiles where id = p_prep_profile for update;
  if prep.id is null or prep.access_tier <> 'prep_only' then
    raise exception 'not a prep-only account';
  end if;

  select * into school from public.profiles
   where student_id = p_student_id and access_tier = 'school' and role = 'student'
   for update;
  if school.id is null then
    raise exception 'this student has no school login yet; give them a login first';
  end if;
  if prep.merged_into is not null and prep.merged_into <> school.id then
    raise exception 'this account is already linked to another student';
  end if;

  update public.practice_attempts set learner_id = school.id where learner_id = prep.id;
  get diagnostics n_pa = row_count;

  update public.concept_mastery m set learner_id = school.id
   where m.learner_id = prep.id
     and not exists (select 1 from public.concept_mastery s
                      where s.learner_id = school.id and s.concept_id = m.concept_id);
  get diagnostics n_cm = row_count;
  select count(*) into n_cm_kept from public.concept_mastery where learner_id = prep.id;

  update public.follow_ups f set learner_id = school.id, updated_at = now()
   where f.learner_id = prep.id
     and not (f.status = 'open' and exists (
           select 1 from public.follow_ups s
            where s.learner_id = school.id and s.concept_id = f.concept_id
              and s.kind = f.kind and s.status = 'open'));
  get diagnostics n_fu = row_count;
  select count(*) into n_fu_kept from public.follow_ups where learner_id = prep.id;

  v_moved := jsonb_build_object(
    'practice_attempts', n_pa,
    'concept_mastery', n_cm, 'concept_mastery_kept', n_cm_kept,
    'follow_ups', n_fu, 'follow_ups_kept', n_fu_kept);

  update public.profiles
     set merged_into = school.id, merged_at = coalesce(merged_at, now())
   where id = prep.id;

  insert into public.account_links
    (prep_profile_id, school_profile_id, student_id, linked_by, reason, moved)
  values (prep.id, school.id, p_student_id, auth.uid(), trim(p_reason), v_moved);

  return v_moved;
end $$;

revoke all on function public.find_prep_accounts(text) from public, anon;
grant execute on function public.find_prep_accounts(text) to authenticated;
revoke all on function public.link_prep_account(uuid, uuid, text) from public, anon;
grant execute on function public.link_prep_account(uuid, uuid, text) to authenticated;
