-- Smoke test for db/024_profiles_self_update_guard.sql. Needs only setup.sql +
-- 002–016 + 024 (production order); also passes after 017–023 and their
-- smokes. Throwaway local Postgres only (TEST_PLAN.md DB-1 / DB-5).
\set ON_ERROR_STOP 1
reset role;
set request.jwt.claim.sub = '';
grant usage on schema public, auth to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

insert into auth.users(id, email) values
 ('02400000-0000-0000-0000-000000000001', 'kid@students.school.invalid'),
 ('02400000-0000-0000-0000-000000000002', 'new.signup@example.test'),
 ('02400000-0000-0000-0000-000000000003', 'office@school.test');
insert into students(id, student_code, full_name) values
 ('02400000-0000-0000-0000-0000000000a1', 'G024-1', 'Guard Kid'),
 ('02400000-0000-0000-0000-0000000000a2', 'G024-2', 'New Kid');
update profiles set role = 'student', student_id = '02400000-0000-0000-0000-0000000000a1'
 where id = '02400000-0000-0000-0000-000000000001';
update profiles set role = 'admin' where id = '02400000-0000-0000-0000-000000000003';

set role authenticated;

-- A student: name/phone yes; role, student link, id no.
set request.jwt.claim.sub = '02400000-0000-0000-0000-000000000001';
update profiles set full_name = 'Guard Kid R', phone = '0300' where id = auth.uid();
do $$ begin
  begin
    update profiles set role = 'developer' where id = auth.uid();
    raise exception 'STUDENT_BECAME_DEVELOPER';
  exception when insufficient_privilege then null; end;
  begin
    update profiles set role = 'admin', full_name = 'sneaky' where id = auth.uid();
    raise exception 'STUDENT_BECAME_ADMIN';
  exception when insufficient_privilege then null; end;
  begin
    update profiles set student_id = null where id = auth.uid();
    raise exception 'STUDENT_UNLINKED';
  exception when insufficient_privilege then null; end;
end $$;

-- A pending sign-up can't approve itself.
set request.jwt.claim.sub = '02400000-0000-0000-0000-000000000002';
do $$ begin
  begin
    update profiles set role = 'teacher' where id = auth.uid();
    raise exception 'PENDING_SELF_APPROVED';
  exception when insufficient_privilege then null; end;
end $$;

-- Staff still manage roles.
set request.jwt.claim.sub = '02400000-0000-0000-0000-000000000003';
update profiles set role = 'teacher' where id = '02400000-0000-0000-0000-000000000002';

reset role;
set request.jwt.claim.sub = '';
do $$ begin
  assert (select role from profiles where id = '02400000-0000-0000-0000-000000000001') = 'student',
         'student role changed';
  assert (select full_name from profiles where id = '02400000-0000-0000-0000-000000000001') = 'Guard Kid R',
         'student could not rename';
  assert (select role from profiles where id = '02400000-0000-0000-0000-000000000002') = 'teacher',
         'admin could not approve';
  -- SQL Editor (postgres) is not limited.
  update profiles set role = 'pending' where id = '02400000-0000-0000-0000-000000000002';
end $$;
-- SECURITY DEFINER path still works: provision_student_login as staff.
set request.jwt.claim.sub = '02400000-0000-0000-0000-000000000003';
set role authenticated;
select provision_student_login('02400000-0000-0000-0000-0000000000a2', '4321') is not null as provisioned;
reset role;
set request.jwt.claim.sub = '';
select '024 smoke: all checks passed' as result;
