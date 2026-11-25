-- Smoke test for db/025 + prompt 11 (student attempts). Replays, as a signed-in
-- student, the exact reads and writes apps/mobile/features/attempts/api.ts makes.
-- Throwaway local Postgres only (TEST_PLAN.md DB-1 / AT-1). Passes in production
-- order (setup + 002–016 + 024 + 025) and after the 017–024 smokes.
-- Without 025 it fails at STUDENT_SUBMITTED_OTHER_CLASS.
\set ON_ERROR_STOP 1
reset role;
set request.jwt.claim.sub = '';
grant usage on schema public, auth to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- Fixtures: Class 9-A (S1 active, S3 struck off) and Class 8 (S2); four assessments.
update academic_years set is_current = false;
insert into academic_years(id, label, is_current) values
 ('02500000-0000-0000-0000-0000000000a9', 'AT-2025-26', false),
 ('02500000-0000-0000-0000-0000000000a0', 'AT-2026-27', true);
insert into classes(id, name, grade_level) values
 ('02500000-0000-0000-0000-0000000000c1', 'AT Class 9-A', 9),
 ('02500000-0000-0000-0000-0000000000c2', 'AT Class 8', 8);
insert into subjects(id, class_id, name) values
 ('02500000-0000-0000-0000-0000000000d1', '02500000-0000-0000-0000-0000000000c1', 'AT Maths'),
 ('02500000-0000-0000-0000-0000000000d2', '02500000-0000-0000-0000-0000000000c2', 'AT Science');
insert into chapters(id, subject_id, title) values
 ('02500000-0000-0000-0000-0000000000e1', '02500000-0000-0000-0000-0000000000d1', 'AT Sets');
insert into students(id, student_code, full_name) values
 ('02500000-0000-0000-0000-000000000051', 'AT-1', 'TEST- AT One'),
 ('02500000-0000-0000-0000-000000000052', 'AT-2', 'TEST- AT Two'),
 ('02500000-0000-0000-0000-000000000053', 'AT-3', 'TEST- AT Three');
insert into enrollments(id, student_id, class_id, year_id, status) values
 ('02500000-0000-0000-0000-000000000061', '02500000-0000-0000-0000-000000000051',
  '02500000-0000-0000-0000-0000000000c1', '02500000-0000-0000-0000-0000000000a0', 'active'),
 ('02500000-0000-0000-0000-000000000062', '02500000-0000-0000-0000-000000000052',
  '02500000-0000-0000-0000-0000000000c2', '02500000-0000-0000-0000-0000000000a0', 'active'),
 ('02500000-0000-0000-0000-000000000063', '02500000-0000-0000-0000-000000000053',
  '02500000-0000-0000-0000-0000000000c1', '02500000-0000-0000-0000-0000000000a0', 'struck_off'),
 -- S1 was in Class 8 last year; the rollover left that enrollment active (old data does).
 ('02500000-0000-0000-0000-000000000069', '02500000-0000-0000-0000-000000000051',
  '02500000-0000-0000-0000-0000000000c2', '02500000-0000-0000-0000-0000000000a9', 'active');
insert into auth.users(id, email) values
 ('02500000-0000-0000-0000-000000000001', 'at1@students.school.invalid'),
 ('02500000-0000-0000-0000-000000000002', 'at2@students.school.invalid'),
 ('02500000-0000-0000-0000-000000000003', 'at3@students.school.invalid');
update profiles set role = 'student', student_id = '02500000-0000-0000-0000-000000000051'
 where id = '02500000-0000-0000-0000-000000000001';
update profiles set role = 'student', student_id = '02500000-0000-0000-0000-000000000052'
 where id = '02500000-0000-0000-0000-000000000002';
update profiles set role = 'student', student_id = '02500000-0000-0000-0000-000000000053'
 where id = '02500000-0000-0000-0000-000000000003';
insert into assessments(id, year_id, class_id, subject_id, title, status, total_marks) values
 ('02500000-0000-0000-0000-0000000000b1', '02500000-0000-0000-0000-0000000000a0',
  '02500000-0000-0000-0000-0000000000c1', '02500000-0000-0000-0000-0000000000d1', 'AT 9-A published', 'published', 3),
 ('02500000-0000-0000-0000-0000000000b2', '02500000-0000-0000-0000-0000000000a0',
  '02500000-0000-0000-0000-0000000000c1', '02500000-0000-0000-0000-0000000000d1', 'AT 9-A draft', 'draft', null),
 ('02500000-0000-0000-0000-0000000000b3', '02500000-0000-0000-0000-0000000000a0',
  '02500000-0000-0000-0000-0000000000c1', '02500000-0000-0000-0000-0000000000d1', 'AT 9-A closed', 'closed', 5),
 ('02500000-0000-0000-0000-0000000000b8', '02500000-0000-0000-0000-0000000000a0',
  '02500000-0000-0000-0000-0000000000c2', '02500000-0000-0000-0000-0000000000d2', 'AT Class 8 published', 'published', 2),
 ('02500000-0000-0000-0000-0000000000b9', '02500000-0000-0000-0000-0000000000a9',
  '02500000-0000-0000-0000-0000000000c2', '02500000-0000-0000-0000-0000000000d2', 'AT Class 8 last year', 'published', 2);
insert into questions(id, chapter_id, type, cognitive_level, body, answer) values
 ('02500000-0000-0000-0000-0000000000f1', '02500000-0000-0000-0000-0000000000e1', 'mcq', 'recall',
  '{"stem":"Which set has no elements?","options":[{"key":"A","text":"Universal"},{"key":"B","text":"Empty"}]}',
  '{"correct":"B"}');
insert into assessment_questions(assessment_id, question_id, marks, sort_order) values
 ('02500000-0000-0000-0000-0000000000b1', '02500000-0000-0000-0000-0000000000f1', 3, 0),
 ('02500000-0000-0000-0000-0000000000b3', '02500000-0000-0000-0000-0000000000f1', 5, 0),
 ('02500000-0000-0000-0000-0000000000b8', '02500000-0000-0000-0000-0000000000f1', 2, 0);

-- ---- As student S1 (9-A) ------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '02500000-0000-0000-0000-000000000001';

do $$ begin
  -- api.ts myEnrollment / listMyAssessments / loadPaper
  assert (select count(*) from enrollments) = 2, 'student sees exactly own enrollments';
  -- This year's published + closed, plus last year's own class (the app filters by class + year).
  assert (select count(*) from assessments where title like 'AT %') = 3, 'published + closed of own classes';
  assert not exists (select 1 from assessments where title in ('AT 9-A draft', 'AT Class 8 published')),
    'draft or other class assessment visible';
  assert (select count(*) from assessment_questions
          where assessment_id = '02500000-0000-0000-0000-0000000000b1') = 1, 'own published paper';
  assert (select count(*) from assessment_questions
          where assessment_id in ('02500000-0000-0000-0000-0000000000b3',
                                  '02500000-0000-0000-0000-0000000000b8')) = 0,
    'closed or other class paper readable';
end $$;

-- The app's submit (features/attempts/api.ts sendSubmission): client UUID as id.
insert into submissions(id, enrollment_id, assessment_id, responses, submitted_at) values
 ('02500000-0000-0000-0000-00000000aaa1', '02500000-0000-0000-0000-000000000061',
  '02500000-0000-0000-0000-0000000000b1',
  '{"answers":[{"question_id":"02500000-0000-0000-0000-0000000000f1","type":"mcq","value":"B"}],"answered_count":1,"total_questions":1,"version":1}',
  now());

do $$ begin
  -- A retried send (same client UUID) is a duplicate, never a second row.
  begin
    insert into submissions(id, enrollment_id, assessment_id, responses) values
     ('02500000-0000-0000-0000-00000000aaa1', '02500000-0000-0000-0000-000000000061',
      '02500000-0000-0000-0000-0000000000b1', '{}');
    raise exception 'RETRY_MADE_SECOND_ROW';
  exception when unique_violation then null; end;
  -- A second device with a fresh UUID: still one row per test.
  begin
    insert into submissions(id, enrollment_id, assessment_id, responses) values
     ('02500000-0000-0000-0000-00000000aaa2', '02500000-0000-0000-0000-000000000061',
      '02500000-0000-0000-0000-0000000000b1', '{}');
    raise exception 'SECOND_DEVICE_MADE_SECOND_ROW';
  exception when unique_violation then null; end;

  -- THE HOLE 025 closes: this year's 9-A enrollment against a Class 8 test the
  -- student can read through last year's enrollment.
  begin
    insert into submissions(enrollment_id, assessment_id, responses) values
     ('02500000-0000-0000-0000-000000000061', '02500000-0000-0000-0000-0000000000b9', '{}');
    raise exception 'STUDENT_SUBMITTED_OTHER_CLASS';
  exception when insufficient_privilege then null; end;
  -- Own enrollment, another class's test this year (also hidden by read RLS).
  begin
    insert into submissions(enrollment_id, assessment_id, responses) values
     ('02500000-0000-0000-0000-000000000061', '02500000-0000-0000-0000-0000000000b8', '{}');
    raise exception 'STUDENT_SUBMITTED_OTHER_CLASS_THIS_YEAR';
  exception when insufficient_privilege then null; end;
  -- Someone else's enrollment.
  begin
    insert into submissions(enrollment_id, assessment_id, responses) values
     ('02500000-0000-0000-0000-000000000062', '02500000-0000-0000-0000-0000000000b8', '{}');
    raise exception 'STUDENT_SUBMITTED_AS_OTHER_STUDENT';
  exception when insufficient_privilege then null; end;
  -- Draft and closed assessments of own class.
  begin
    insert into submissions(enrollment_id, assessment_id, responses) values
     ('02500000-0000-0000-0000-000000000061', '02500000-0000-0000-0000-0000000000b2', '{}');
    raise exception 'STUDENT_SUBMITTED_DRAFT';
  exception when insufficient_privilege then null; end;
  begin
    insert into submissions(enrollment_id, assessment_id, responses) values
     ('02500000-0000-0000-0000-000000000061', '02500000-0000-0000-0000-0000000000b3', '{}');
    raise exception 'STUDENT_SUBMITTED_CLOSED';
  exception when insufficient_privilege then null; end;
  -- Self-grading.
  begin
    insert into submissions(enrollment_id, assessment_id, responses, score) values
     ('02500000-0000-0000-0000-000000000061', '02500000-0000-0000-0000-0000000000b3', '{}', 5);
    raise exception 'STUDENT_SELF_GRADED';
  exception when insufficient_privilege then null; end;

  -- Results list (api.ts listMyResults): own row, can't change it.
  assert (select count(*) from submissions) = 1, 'student reads exactly own submission';
  -- With 018 the server auto-marks this all-mcq paper (3); without it, null.
  -- Either way the student can't change it.
  create temp table at_before as
    select score from submissions where id = '02500000-0000-0000-0000-00000000aaa1';
  update submissions set score = 99 where id = '02500000-0000-0000-0000-00000000aaa1';
  delete from submissions where id = '02500000-0000-0000-0000-00000000aaa1';
  assert (select score from submissions where id = '02500000-0000-0000-0000-00000000aaa1')
         is not distinct from (select score from at_before), 'student graded own submission';
  assert (select score from at_before) is null or (select score from at_before) = 3,
    'auto mark of the one-mcq paper';
  drop table at_before;
end $$;

-- ---- As S3 (struck off from 9-A) ------------------------------------------------
set request.jwt.claim.sub = '02500000-0000-0000-0000-000000000003';
do $$ begin
  begin
    insert into submissions(enrollment_id, assessment_id, responses) values
     ('02500000-0000-0000-0000-000000000063', '02500000-0000-0000-0000-0000000000b1', '{}');
    raise exception 'STRUCK_OFF_STUDENT_SUBMITTED';
  exception when insufficient_privilege then null; end;
end $$;

-- ---- As S2 (Class 8): can't see S1's work ------------------------------------------
set request.jwt.claim.sub = '02500000-0000-0000-0000-000000000002';
do $$ begin
  assert (select count(*) from submissions) = 0, 'other student sees S1 submission';
  assert (select count(*) from assessments where title like 'AT %') = 1, 'S2 sees only Class 8';
end $$;

reset role;
do $$ begin
  assert (select count(*) from submissions
          where enrollment_id = '02500000-0000-0000-0000-000000000061') = 1, 'exactly one submission';
end $$;
select 'AT-1 025 smoke: pass' as result;
