-- Smoke test for db/023_access_tiers.sql. Run AFTER db/test/017_smoke.sql (and
-- 022_smoke.sql when 022 is applied; reuses their fixtures: teacher ...0a, student ...0b in
-- Class 9 SMOKE, a published exam, two questions). Throwaway local Postgres
-- only (TEST_PLAN.md DB-1 / DB-4). Every check raises on failure.
\set ON_ERROR_STOP 1
reset role;
set request.jwt.claim.sub = '';

-- Supabase grants these to `authenticated` by default; the stub DB doesn't.
grant usage on schema public, auth, storage to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select, insert, update, delete on storage.objects to authenticated;
grant execute on all functions in schema public to authenticated;

-- Fixtures -------------------------------------------------------------------
-- p1: Google sign-up, provider known at user insert (normal GoTrue order).
insert into auth.users(id, email, raw_app_meta_data, raw_user_meta_data) values
 ('0000000a-0000-0000-0000-0000000000f1', 'prep.kid@gmail.test',
  '{"provider":"google","providers":["google"]}', '{"name":"Prep Kid"}');
insert into auth.identities(id, user_id, provider, provider_id) values
 ('0000000b-0000-0000-0000-0000000000f1', '0000000a-0000-0000-0000-0000000000f1', 'google', 'g-1');
-- p2: Google sign-up where the provider was not in app metadata yet.
insert into auth.users(id, email, raw_app_meta_data) values
 ('0000000a-0000-0000-0000-0000000000f2', 'other.kid@gmail.test', '{}');
insert into auth.identities(id, user_id, provider, provider_id) values
 ('0000000b-0000-0000-0000-0000000000f2', '0000000a-0000-0000-0000-0000000000f2', 'google', 'g-2');
-- a1: anonymous sign-in / another provider: stays pending, never prep-only.
insert into auth.users(id, raw_app_meta_data) values
 ('0000000a-0000-0000-0000-0000000000a1', '{"provider":"anonymous","providers":["anonymous"]}');
insert into auth.users(id, raw_app_meta_data) values
 ('0000000a-0000-0000-0000-0000000000a2', '{"provider":"github","providers":["github"]}');
insert into auth.identities(id, user_id, provider, provider_id) values
 ('0000000b-0000-0000-0000-0000000000a2', '0000000a-0000-0000-0000-0000000000a2', 'github', 'gh-1');
-- c: an admin with a password.
insert into auth.users(id, email, encrypted_password) values
 ('0000000a-0000-0000-0000-0000000000c1', 'admin@school.test', 'x');
update profiles set role = 'admin' where id = '0000000a-0000-0000-0000-0000000000c1';
-- The teacher teaches Class 9 SMOKE (022_smoke.sql makes this too; 022 is a
-- draft that isn't applied everywhere, so don't depend on it).
insert into teacher_assignments(teacher_id, class_id, year_id)
select '00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000001',
       '10000000-0000-0000-0000-000000000001'
where not exists (select 1 from teacher_assignments
                   where teacher_id = '00000000-0000-0000-0000-00000000000a'
                     and class_id = '20000000-0000-0000-0000-000000000001');
-- an approved practice version, an attendance row and a school message
insert into item_approvals(item_kind, item_id, version, scope, approved_by)
values ('question', '80000000-0000-0000-0000-000000000002', 1, 'practice', '0000000a-0000-0000-0000-0000000000c1');
insert into attendance(enrollment_id, on_date, status)
select id, current_date, 'present' from enrollments
 where student_id = '70000000-0000-0000-0000-000000000001' limit 1;
insert into messages(scope, title, body) values ('school', 'Hello', 'School-wide');

do $$ begin
  assert (select role = 'student' and access_tier = 'prep_only' and student_id is null
            and full_name = 'Prep Kid'
            from profiles where id = '0000000a-0000-0000-0000-0000000000f1'), 'p1 not prep_only';
  assert (select role = 'student' and access_tier = 'prep_only'
            from profiles where id = '0000000a-0000-0000-0000-0000000000f2'), 'p2 not converted';
  assert (select role = 'admin' and access_tier = 'school'
            from profiles where id = '0000000a-0000-0000-0000-0000000000c1'), 'admin tier wrong';
  assert (select role = 'pending' and access_tier = 'school'
            from profiles where id = '0000000a-0000-0000-0000-0000000000a1'), 'anonymous became prep';
  assert (select role = 'pending' and access_tier = 'school'
            from profiles where id = '0000000a-0000-0000-0000-0000000000a2'), 'github became prep';
  assert (select count(*) = 0 from profiles where access_tier = 'prep_only'
            and id not in ('0000000a-0000-0000-0000-0000000000f1','0000000a-0000-0000-0000-0000000000f2')),
         'existing rows must stay school';
end $$;

-- Google can never attach to a staff or school-student account.
do $$ begin
  begin
    insert into auth.identities(id, user_id, provider, provider_id)
    values (gen_random_uuid(), '00000000-0000-0000-0000-00000000000a', 'google', 'g-teacher');
    raise exception 'GOOGLE_LINKED_TO_TEACHER';
  exception when insufficient_privilege then null; end;
  begin
    insert into auth.identities(id, user_id, provider, provider_id)
    values (gen_random_uuid(), '00000000-0000-0000-0000-00000000000b', 'google', 'g-student');
    raise exception 'GOOGLE_LINKED_TO_SCHOOL_STUDENT';
  exception when insufficient_privilege then null; end;
  begin
    insert into auth.identities(id, user_id, provider, provider_id)
    values (gen_random_uuid(), '0000000a-0000-0000-0000-0000000000c1', 'google', 'g-admin');
    raise exception 'GOOGLE_LINKED_TO_ADMIN';
  exception when insufficient_privilege then null; end;
  begin
    insert into auth.identities(id, user_id, provider, provider_id)
    values (gen_random_uuid(), '0000000a-0000-0000-0000-0000000000c1', 'github', 'gh-admin');
    raise exception 'OTHER_OAUTH_LINKED_TO_ADMIN';
  exception when insufficient_privilege then null; end;
  -- Even staff/SQL can't turn a prep-only profile into a school one.
  begin
    update profiles set access_tier = 'school' where id = '0000000a-0000-0000-0000-0000000000f1';
    raise exception 'PREP_PROMOTED_TO_SCHOOL';
  exception when insufficient_privilege then null; end;
  begin
    update profiles set role = 'teacher' where id = '0000000a-0000-0000-0000-0000000000f1';
    raise exception 'PREP_MADE_TEACHER';
  exception when insufficient_privilege then null; end;
end $$;

-- As the prep-only learner ----------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '0000000a-0000-0000-0000-0000000000f1';
do $$ begin
  assert not public.is_school_member(), 'prep user is a school member';
  assert (select count(*) from assessments) = 0, 'prep reads assessments';
  assert (select count(*) from assessment_questions) = 0, 'prep reads assessment_questions';
  assert (select count(*) from enrollments) = 0, 'prep reads enrollments';
  assert (select count(*) from attendance) = 0, 'prep reads attendance';
  assert (select count(*) from submissions) = 0, 'prep reads submissions';
  assert (select count(*) from students) = 0, 'prep reads students';
  assert (select count(*) from messages) = 0, 'prep reads messages';
  assert (select count(*) from exam_sessions) = 0, 'prep reads exam_sessions';
  assert (select count(*) from exam_session_answers) = 0, 'prep reads exam answers';
  assert (select count(*) from questions) = 0, 'prep reads questions (answer keys)';
  if to_regclass('public.attendance_edits') is not null then
    assert (select count(*) from attendance_edits) = 0, 'prep reads attendance history';
  end if;
  if to_regclass('public.message_reads') is not null then
    assert (select count(*) from message_reads) = 0, 'prep reads message reads';
  end if;
  if to_regclass('public.project_teams') is not null then
    assert (select count(*) from project_teams) = 0, 'prep reads project teams';
  end if;
  -- Preparation content stays readable.
  assert (select count(*) from question_versions) = 1, 'prep cannot read approved practice versions';
  assert (select count(*) from topics) >= 1, 'prep cannot read topics';
  assert (select count(*) from concepts) >= 1, 'prep cannot read concepts';
  assert (select count(*) from profiles) = 1, 'prep reads other profiles';
end $$;

-- Own practice attempt: allowed. Someone else's: refused.
insert into practice_attempts(id, learner_id, kind, topic_id, started_at, items, n_correct, n_total)
values ('d0000000-0000-0000-0000-000000000001', '0000000a-0000-0000-0000-0000000000f1', 'practice',
        '50000000-0000-0000-0000-000000000001', now(),
        '[{"q":"80000000-0000-0000-0000-000000000002","v":1,"a":"A","c":true,"ms":900}]', 1, 1);
do $$ begin
  assert (select count(*) from practice_attempts) = 1, 'prep cannot read own attempt';
  begin
    insert into practice_attempts(id, learner_id, kind, started_at, items)
    values (gen_random_uuid(), '00000000-0000-0000-0000-00000000000b', 'practice', now(), '[]');
    raise exception 'PREP_WROTE_OTHERS_ATTEMPT';
  exception when insufficient_privilege then null; end;
  begin
    insert into attendance(enrollment_id, on_date, status)
    select id, current_date - 1, 'present' from enrollments limit 1;
    -- enrollments is invisible, so nothing to insert from; try a direct value:
    insert into attendance(enrollment_id, on_date, status)
    values (gen_random_uuid(), current_date, 'present');
    raise exception 'PREP_WROTE_ATTENDANCE';
  exception when insufficient_privilege then null; end;
  begin
    insert into messages(scope, title, body) values ('school', 'x', 'y');
    raise exception 'PREP_WROTE_MESSAGE';
  exception when insufficient_privilege then null; end;
  begin
    perform start_exam_session('90000000-0000-0000-0000-000000000001');
    raise exception 'PREP_STARTED_EXAM';
  exception when others then
    if sqlerrm like 'PREP_%' then raise; end if;
  end;
  -- Own profile: name yes; role / tier / student link no.
  update profiles set full_name = 'Renamed Kid' where id = auth.uid();
  begin
    update profiles set role = 'admin' where id = auth.uid();
    raise exception 'PREP_SELF_PROMOTED';
  exception when insufficient_privilege then null; end;
  begin
    update profiles set access_tier = 'school' where id = auth.uid();
    raise exception 'PREP_SELF_SCHOOL';
  exception when insufficient_privilege then null; end;
  begin
    update profiles set student_id = '70000000-0000-0000-0000-000000000001' where id = auth.uid();
    raise exception 'PREP_SELF_LINKED';
  exception when insufficient_privilege then null; end;
  begin
    perform * from find_prep_accounts('kid');
    raise exception 'PREP_SEARCHED';
  exception when insufficient_privilege then null; end;
  begin
    perform link_prep_account(auth.uid(), '70000000-0000-0000-0000-000000000001', 'me');
    raise exception 'PREP_SELF_LINK';
  exception when insufficient_privilege then null; end;
end $$;
-- storage: no school-bucket objects for prep users
do $$ begin
  begin
    insert into storage.objects(bucket_id, name) values ('assessment-files', 'x/y.pdf');
    raise exception 'PREP_WROTE_SCHOOL_BUCKET';
  exception when insufficient_privilege then null; end;
end $$;

-- Defense in depth: even a future over-broad permissive policy can't leak
-- school tables to prep-only users (the restrictive policy still applies).
reset role;
set request.jwt.claim.sub = '';
create policy p_smoke_leak_assess on assessments for select using (true);
create policy p_smoke_leak_enroll on enrollments for select using (true);
create policy p_smoke_leak_att    on attendance  for select using (true);
set role authenticated;
set request.jwt.claim.sub = '0000000a-0000-0000-0000-0000000000f2';
do $$ begin
  assert (select count(*) from assessments) = 0, 'restrictive policy missing on assessments';
  assert (select count(*) from enrollments) = 0, 'restrictive policy missing on enrollments';
  assert (select count(*) from attendance) = 0, 'restrictive policy missing on attendance';
end $$;
reset role;
drop policy p_smoke_leak_assess on assessments;
drop policy p_smoke_leak_enroll on enrollments;
drop policy p_smoke_leak_att    on attendance;
set role authenticated;

-- As the school student: unchanged access, but the self-promotion hole is shut.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$ begin
  assert public.is_school_member(), 'school student not a member';
  assert (select count(*) from assessments) >= 1, 'school student lost assessments';
  -- Before 018 any signed-in student reads questions (old app); after 018 none
  -- do (papers come from student_paper()). Either way 023 doesn't change it.
  if exists (select 1 from pg_proc where proname = 'student_paper') then
    assert (select count(*) from questions) = 0, 'school student reads answer keys after 018';
  else
    assert (select count(*) from questions) >= 1, 'school student lost questions (old app reads them)';
  end if;
  assert (select count(*) from messages) >= 1, 'school student lost messages';
  assert (select count(*) from exam_sessions) >= 1, 'school student lost own exam session';
  begin
    update profiles set role = 'developer' where id = auth.uid();
    raise exception 'STUDENT_SELF_PROMOTED';
  exception when insufficient_privilege then null; end;
end $$;

-- As the teacher: still reads their class.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ begin
  assert (select count(*) from enrollments) >= 1, 'teacher lost enrollments';
  assert (select count(*) from attendance) >= 1, 'teacher lost attendance';
  assert (select count(*) from practice_attempts) = 0, 'teacher reads a prep learner''s attempts';
  begin
    perform link_prep_account('0000000a-0000-0000-0000-0000000000f1', '70000000-0000-0000-0000-000000000001', 'x');
    raise exception 'TEACHER_LINKED';
  exception when insufficient_privilege then null; end;
end $$;

-- As the admin: find + link (upgrade path) ----------------------------------
set request.jwt.claim.sub = '0000000a-0000-0000-0000-0000000000c1';
do $$
declare r jsonb;
begin
  assert (select count(*) from find_prep_accounts('ki')) = 0, 'short query should return nothing';
  assert (select count(*) from find_prep_accounts('prep.kid@')) = 1, 'find by email failed';
  assert (select count(*) from find_prep_accounts('%')) = 0, 'wildcard not escaped';
  -- admin can change a prep learner's name but not make them school/staff
  begin
    update profiles set role = 'admin' where id = '0000000a-0000-0000-0000-0000000000f1';
    raise exception 'ADMIN_MADE_PREP_STAFF';
  exception when insufficient_privilege or check_violation then null; end;
  begin
    perform link_prep_account('0000000a-0000-0000-0000-0000000000f1', '70000000-0000-0000-0000-000000000001', '  ');
    raise exception 'LINK_WITHOUT_REASON';
  exception when others then if sqlerrm like 'LINK_%' then raise; end if; end;
  begin
    perform link_prep_account('00000000-0000-0000-0000-00000000000b', '70000000-0000-0000-0000-000000000001', 'x');
    raise exception 'LINK_SCHOOL_AS_PREP';
  exception when others then if sqlerrm like 'LINK_%' then raise; end if; end;

  r := link_prep_account('0000000a-0000-0000-0000-0000000000f1', '70000000-0000-0000-0000-000000000001',
                         'Enrolled in Class 9 (smoke)');
  assert (r->>'practice_attempts')::int = 1, 'attempt not moved: ' || r::text;
  assert (select learner_id from practice_attempts where id = 'd0000000-0000-0000-0000-000000000001')
         = '00000000-0000-0000-0000-00000000000b', 'attempt owner not re-keyed';
  assert (select merged_into from profiles where id = '0000000a-0000-0000-0000-0000000000f1')
         = '00000000-0000-0000-0000-00000000000b', 'merged_into not set';
  assert (select access_tier from profiles where id = '0000000a-0000-0000-0000-0000000000f1')
         = 'prep_only', 'linked prep account must stay prep_only';
  -- re-run is safe (moves stragglers only)
  r := link_prep_account('0000000a-0000-0000-0000-0000000000f1', '70000000-0000-0000-0000-000000000001', 'again');
  assert (r->>'practice_attempts')::int = 0, 're-link moved rows twice';
  assert (select count(*) from account_links) = 2, 'links not logged';
end $$;
reset role;
set request.jwt.claim.sub = '';
do $$ begin
  begin
    update account_links set reason = 'rewritten';
    raise exception 'LINK_LOG_MUTABLE';
  exception when others then if sqlerrm like 'LINK_%' then raise; end if; end;
end $$;

-- The linked school student now sees the moved attempt.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$ begin
  assert (select count(*) from practice_attempts where id = 'd0000000-0000-0000-0000-000000000001') = 1,
         'school student cannot see merged attempt';
end $$;
reset role;
set request.jwt.claim.sub = '';
select '023 smoke: all checks passed' as result;
