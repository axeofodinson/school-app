-- ============================================================
--  024 — Close the profile self-promotion hole (production fix)
--
--  Standalone: needs only setup.sql + 002–016 (what production has today),
--  NOT 017. Run it now, ahead of 017–023. Additive + idempotent (function is
--  CREATE OR REPLACE, trigger dropped then created). DECISIONS #60, #62.
--
--  THE HOLE: setup.sql's policy
--      create policy p_profiles_self_update on public.profiles
--        for update using (id = auth.uid());
--  has no column limit, so any signed-in user (a student with a PIN, a
--  pending sign-up) can run
--      update profiles set role = 'developer' where id = auth.uid();
--  from the browser console with the public anon key and become staff.
--
--  THE FIX: a BEFORE UPDATE trigger. A client session (PostgREST runs as
--  'authenticated' / 'anon') that is not staff may change only full_name and
--  phone on its own row. Staff (developer/admin) are unchanged. SECURITY
--  DEFINER functions (provision_student_login, ...), the SQL Editor and the
--  service role run as another role and are not limited. The old app never
--  writes profiles from a client, so nothing in it changes.
--
--  023 (access tiers) adds its own profiles_guard with the same rule plus the
--  tier rules; the two triggers coexist (different names), so running 024
--  before or after 023 is safe.
--
--  AFTER RUNNING, check nobody already used the hole (read-only):
--      select p.id, u.email, p.role, p.updated_at
--        from public.profiles p join auth.users u on u.id = p.id
--       where p.role in ('developer','admin','teacher')
--       order by p.updated_at desc;
--  Every row should be someone you made staff. Synthesized student logins
--  (…@students.school.invalid) must never appear here.
-- ============================================================

create or replace function public.profiles_self_update_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') and not public.is_staff() then
    if (to_jsonb(new) - array['full_name','phone','updated_at'])
       is distinct from (to_jsonb(old) - array['full_name','phone','updated_at']) then
      raise exception 'you can only change your own name or phone'
        using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

revoke all on function public.profiles_self_update_guard() from public, anon, authenticated;

drop trigger if exists t_profiles_self_update_guard on public.profiles;
create trigger t_profiles_self_update_guard before update on public.profiles
  for each row execute function public.profiles_self_update_guard();
