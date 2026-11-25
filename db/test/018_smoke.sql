-- Smoke test for db/018 + prompt 13 (answer keys closed, papers + marking on the
-- server). Replays, as signed-in students and a teacher, what
-- apps/mobile/features/attempts/api.ts and grading/api.ts now call. Throwaway
-- local Postgres only (TEST_PLAN.md DB-1 / CO-1). Run from the repo root (it
-- reads packages/core/test/fixtures/auto-mark-cases.json, the cases the core
-- test pins too). Passes in production order (setup + 002–016 + 024 + 025 +
-- 026 + 018) and after the other smokes. Without 018 it fails at
-- STUDENT_READ_ANSWER_KEY.
\set ON_ERROR_STOP 1
\set cases `cat packages/core/test/fixtures/auto-mark-cases.json`
reset role;
set request.jwt.claim.sub = '';
grant usage on schema public, auth to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- ---- Marking rule: same answers as packages/core autoMark.ts ---------------------
create temp table co_cases as select :'cases'::jsonb as j;
do $$
declare c jsonb; got boolean; bad text := '';
begin
  if to_regprocedure('public.auto_mark_item(text, jsonb, jsonb)') is null then
    raise exception 'STUDENT_READ_ANSWER_KEY (018 not applied: no auto_mark_item)';
  end if;
  for c in select jsonb_array_elements(j) from co_cases loop
    execute 'select public.auto_mark_item($1, $2, $3)' into got
      using c->>'type', c->'value', c->'answer';
    if got is distinct from (case when jsonb_typeof(c->'expect') = 'null' then null
                                  else (c->>'expect')::boolean end) then
      bad := bad || format(E'\n  %s: got %s', c->>'note', coalesce(got::text, 'null'));
    end if;
  end loop;
  if bad <> '' then raise exception 'AUTO_MARK_DIFFERS_FROM_CORE:%', bad; end if;
end $$;
drop table co_cases;

-- ---- Fixtures --------------------------------------------------------------------
-- 9-A (teacher T1; students S1, S3, S4) and Class 8 (S2). Papers:
--   P1 9-A published, 5 auto-markable questions (2+1+1+2+1 = 7 marks, total 7)
--   P2 9-A published, mcq + match (match can't be auto-marked)
--   P3 9-A draft · P4 Class 8 published · P5 9-A closed · P6 9-A published, total 1 < marks 2
update academic_years set is_current = false;
insert into academic_years(id, label, is_current) values
 ('01800000-0000-0000-0000-0000000000a0', 'CO-2026-27', true);
insert into classes(id, name, grade_level) values
 ('01800000-0000-0000-0000-0000000000c1', 'CO Class 9-A', 9),
 ('01800000-0000-0000-0000-0000000000c2', 'CO Class 8', 8);
insert into subjects(id, class_id, name) values
 ('01800000-0000-0000-0000-0000000000d1', '01800000-0000-0000-0000-0000000000c1', 'CO Maths'),
 ('01800000-0000-0000-0000-0000000000d2', '01800000-0000-0000-0000-0000000000c2', 'CO Science');
insert into chapters(id, subject_id, title) values
 ('01800000-0000-0000-0000-0000000000e1', '01800000-0000-0000-0000-0000000000d1', 'CO Sets'),
 ('01800000-0000-0000-0000-0000000000e2', '01800000-0000-0000-0000-0000000000d2', 'CO Plants');
insert into students(id, student_code, full_name) values
 ('01800000-0000-0000-0000-000000000051', 'CO-1', 'TEST- CO One'),
 ('01800000-0000-0000-0000-000000000052', 'CO-2', 'TEST- CO Two'),
 ('01800000-0000-0000-0000-000000000053', 'CO-3', 'TEST- CO Three'),
 ('01800000-0000-0000-0000-000000000054', 'CO-4', 'TEST- CO Four');
insert into enrollments(id, student_id, class_id, year_id, status) values
 ('01800000-0000-0000-0000-000000000061', '01800000-0000-0000-0000-000000000051',
  '01800000-0000-0000-0000-0000000000c1', '01800000-0000-0000-0000-0000000000a0', 'active'),
 ('01800000-0000-0000-0000-000000000062', '01800000-0000-0000-0000-000000000052',
  '01800000-0000-0000-0000-0000000000c2', '01800000-0000-0000-0000-0000000000a0', 'active'),
 ('01800000-0000-0000-0000-000000000063', '01800000-0000-0000-0000-000000000053',
  '01800000-0000-0000-0000-0000000000c1', '01800000-0000-0000-0000-0000000000a0', 'active'),
 ('01800000-0000-0000-0000-000000000064', '01800000-0000-0000-0000-000000000054',
  '01800000-0000-0000-0000-0000000000c1', '01800000-0000-0000-0000-0000000000a0', 'active');
insert into auth.users(id, email) values
 ('01800000-0000-0000-0000-000000000001', 'co.teacher@school.test'),
 ('01800000-0000-0000-0000-000000000011', 'co1@students.school.invalid'),
 ('01800000-0000-0000-0000-000000000012', 'co2@students.school.invalid'),
 ('01800000-0000-0000-0000-000000000013', 'co3@students.school.invalid'),
 ('01800000-0000-0000-0000-000000000014', 'co4@students.school.invalid'),
 ('01800000-0000-0000-0000-000000000019', 'co.pending@school.test');
update profiles set role = 'teacher' where id = '01800000-0000-0000-0000-000000000001';
update profiles set role = 'student', student_id = '01800000-0000-0000-0000-000000000051'
 where id = '01800000-0000-0000-0000-000000000011';
update profiles set role = 'student', student_id = '01800000-0000-0000-0000-000000000052'
 where id = '01800000-0000-0000-0000-000000000012';
update profiles set role = 'student', student_id = '01800000-0000-0000-0000-000000000053'
 where id = '01800000-0000-0000-0000-000000000013';
update profiles set role = 'student', student_id = '01800000-0000-0000-0000-000000000054'
 where id = '01800000-0000-0000-0000-000000000014';
insert into teacher_assignments(teacher_id, class_id, subject_id, year_id) values
 ('01800000-0000-0000-0000-000000000001', '01800000-0000-0000-0000-0000000000c1',
  '01800000-0000-0000-0000-0000000000d1', '01800000-0000-0000-0000-0000000000a0');

insert into questions(id, chapter_id, type, cognitive_level, body, answer) values
 ('01800000-0000-0000-0000-0000000000f1', '01800000-0000-0000-0000-0000000000e1', 'mcq', 'recall',
  '{"stem":"Which set has no elements?","options":[{"key":"A","text":"Universal"},{"key":"B","text":"Empty"}]}',
  '{"correct":"B","worked":"SECRET-WORKING"}'),
 ('01800000-0000-0000-0000-0000000000f2', '01800000-0000-0000-0000-0000000000e1', 'true_false', 'understand',
  '{"stem":"Every set is a subset of itself."}', '{"correct":true}'),
 ('01800000-0000-0000-0000-0000000000f3', '01800000-0000-0000-0000-0000000000e1', 'numeric', 'apply',
  '{"stem":"|{1,2,3}| = ?"}', '{"correct":3}'),
 ('01800000-0000-0000-0000-0000000000f4', '01800000-0000-0000-0000-0000000000e1', 'short_text', 'recall',
  '{"stem":"Capital of Punjab?"}', '{"correct":"Lahore","also":["lahore city"]}'),
 ('01800000-0000-0000-0000-0000000000f5', '01800000-0000-0000-0000-0000000000e1', 'tap_image', 'understand',
  '{"prompt":{"en":"Tap MORE"},"choices":[{"id":"left"},{"id":"right"}]}', '{"correct":"right"}'),
 ('01800000-0000-0000-0000-0000000000f6', '01800000-0000-0000-0000-0000000000e1', 'match', 'analyze',
  '{"stem":"Match"}', '{"correct":{"1":"a"}}'),
 ('01800000-0000-0000-0000-0000000000f8', '01800000-0000-0000-0000-0000000000e2', 'mcq', 'recall',
  '{"stem":"Leaf colour?","options":[{"key":"A","text":"Green"}]}', '{"correct":"A"}');
insert into assessments(id, year_id, class_id, subject_id, title, status, total_marks) values
 ('01800000-0000-0000-0000-0000000000b1', '01800000-0000-0000-0000-0000000000a0',
  '01800000-0000-0000-0000-0000000000c1', '01800000-0000-0000-0000-0000000000d1', 'CO P1', 'published', 7),
 ('01800000-0000-0000-0000-0000000000b2', '01800000-0000-0000-0000-0000000000a0',
  '01800000-0000-0000-0000-0000000000c1', '01800000-0000-0000-0000-0000000000d1', 'CO P2', 'published', 3),
 ('01800000-0000-0000-0000-0000000000b3', '01800000-0000-0000-0000-0000000000a0',
  '01800000-0000-0000-0000-0000000000c1', '01800000-0000-0000-0000-0000000000d1', 'CO P3 draft', 'draft', 2),
 ('01800000-0000-0000-0000-0000000000b4', '01800000-0000-0000-0000-0000000000a0',
  '01800000-0000-0000-0000-0000000000c2', '01800000-0000-0000-0000-0000000000d2', 'CO P4 Class 8', 'published', 1),
 ('01800000-0000-0000-0000-0000000000b5', '01800000-0000-0000-0000-0000000000a0',
  '01800000-0000-0000-0000-0000000000c1', '01800000-0000-0000-0000-0000000000d1', 'CO P5 closed', 'closed', 2),
 ('01800000-0000-0000-0000-0000000000b6', '01800000-0000-0000-0000-0000000000a0',
  '01800000-0000-0000-0000-0000000000c1', '01800000-0000-0000-0000-0000000000d1', 'CO P6 small total', 'published', 1);
insert into assessment_questions(assessment_id, question_id, marks, sort_order) values
 ('01800000-0000-0000-0000-0000000000b1', '01800000-0000-0000-0000-0000000000f1', 2, 0),
 ('01800000-0000-0000-0000-0000000000b1', '01800000-0000-0000-0000-0000000000f2', 1, 1),
 ('01800000-0000-0000-0000-0000000000b1', '01800000-0000-0000-0000-0000000000f3', 1, 2),
 ('01800000-0000-0000-0000-0000000000b1', '01800000-0000-0000-0000-0000000000f4', 2, 3),
 ('01800000-0000-0000-0000-0000000000b1', '01800000-0000-0000-0000-0000000000f5', 1, 4),
 ('01800000-0000-0000-0000-0000000000b2', '01800000-0000-0000-0000-0000000000f1', 2, 0),
 ('01800000-0000-0000-0000-0000000000b2', '01800000-0000-0000-0000-0000000000f6', 1, 1),
 ('01800000-0000-0000-0000-0000000000b3', '01800000-0000-0000-0000-0000000000f1', 2, 0),
 ('01800000-0000-0000-0000-0000000000b4', '01800000-0000-0000-0000-0000000000f8', 1, 0),
 ('01800000-0000-0000-0000-0000000000b5', '01800000-0000-0000-0000-0000000000f1', 2, 0),
 ('01800000-0000-0000-0000-0000000000b6', '01800000-0000-0000-0000-0000000000f1', 2, 0);

-- ---- As student S1 (9-A) ---------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '01800000-0000-0000-0000-000000000011';

do $$ begin
  -- THE HOLE: any signed-in student could read every answer key.
  assert (select count(*) from (select answer from questions) x) = 0, 'STUDENT_READ_ANSWER_KEY';
  assert (select count(*) from questions where id = '01800000-0000-0000-0000-0000000000f1') = 0,
    'STUDENT_READ_QUESTION_BY_ID';
  -- The old app's embed (assessment_questions → questions) now comes back empty.
  assert (select count(q.id) from assessment_questions aq
            left join questions q on q.id = aq.question_id
           where aq.assessment_id = '01800000-0000-0000-0000-0000000000b1') = 0,
    'STUDENT_READ_QUESTION_THROUGH_EMBED';
  -- The paper items themselves (marks, order) stay readable (home counts them).
  assert (select count(*) from assessment_questions
           where assessment_id = '01800000-0000-0000-0000-0000000000b1') = 5, 'paper items visible';

  -- api.ts loadPaper → student_paper(): own published paper, in order, no answer.
  assert (select count(*) from student_paper('01800000-0000-0000-0000-0000000000b1')) = 5,
    'own published paper';
  assert (select array_agg(type order by sort_order)
            from student_paper('01800000-0000-0000-0000-0000000000b1'))
         = array['mcq','true_false','numeric','short_text','tap_image'], 'paper order';
  assert not exists (select 1 from student_paper('01800000-0000-0000-0000-0000000000b1') p
                      where to_jsonb(p) ? 'answer'
                         or to_jsonb(p)::text like '%SECRET-WORKING%'
                         or to_jsonb(p)::text like '%lahore city%'), 'STUDENT_PAPER_LEAKS_ANSWER';
  assert (select body->>'stem' from student_paper('01800000-0000-0000-0000-0000000000b1')
           where question_id = '01800000-0000-0000-0000-0000000000f1') = 'Which set has no elements?',
    'paper carries the body';
  assert (select count(*) from student_paper('01800000-0000-0000-0000-0000000000b3')) = 0, 'DRAFT_PAPER_READ';
  assert (select count(*) from student_paper('01800000-0000-0000-0000-0000000000b4')) = 0, 'OTHER_CLASS_PAPER_READ';
  assert (select count(*) from student_paper('01800000-0000-0000-0000-0000000000b5')) = 0, 'CLOSED_PAPER_READ';

  -- grading/api.ts loadCognitive → student_paper_levels(): own published + closed only.
  assert (select count(*) from student_paper_levels(array[
            '01800000-0000-0000-0000-0000000000b1', '01800000-0000-0000-0000-0000000000b3',
            '01800000-0000-0000-0000-0000000000b4', '01800000-0000-0000-0000-0000000000b5']::uuid[])) = 6,
    'levels: P1 (5) + P5 (1), not draft or other class';
  assert (select sum(marks) from student_paper_levels(array['01800000-0000-0000-0000-0000000000b1']::uuid[])) = 7,
    'levels carry marks';
  assert (select count(*) from student_paper_levels('{}'::uuid[])) = 0, 'empty list';
end $$;

-- The app's submit (sendSubmission): plain insert, client UUID. All right, with Urdu
-- digits, odd case and spacing → auto-marked 7/7 by the server.
insert into submissions(id, enrollment_id, assessment_id, responses, submitted_at) values
 ('01800000-0000-0000-0000-00000000aaa1', '01800000-0000-0000-0000-000000000061',
  '01800000-0000-0000-0000-0000000000b1',
  '{"answers":[
     {"question_id":"01800000-0000-0000-0000-0000000000f1","type":"mcq","value":"B"},
     {"question_id":"01800000-0000-0000-0000-0000000000f2","type":"true_false","value":true},
     {"question_id":"01800000-0000-0000-0000-0000000000f3","type":"numeric","value":"۳"},
     {"question_id":"01800000-0000-0000-0000-0000000000f4","type":"short_text","value":"  LAHORE  City"},
     {"question_id":"01800000-0000-0000-0000-0000000000f5","type":"tap_image","value":"right"}],
    "answered_count":5,"total_questions":5,"version":1}', now());
-- P2 has a match question: stays for the teacher.
insert into submissions(id, enrollment_id, assessment_id, responses, submitted_at) values
 ('01800000-0000-0000-0000-00000000aaa2', '01800000-0000-0000-0000-000000000061',
  '01800000-0000-0000-0000-0000000000b2',
  '{"answers":[{"question_id":"01800000-0000-0000-0000-0000000000f1","type":"mcq","value":"B"},
               {"question_id":"01800000-0000-0000-0000-0000000000f6","type":"match","value":null}],
    "answered_count":1,"total_questions":2,"version":1}', now());
-- P6: right answer worth 2 but the test's total is 1 → left for the teacher.
insert into submissions(id, enrollment_id, assessment_id, responses, submitted_at) values
 ('01800000-0000-0000-0000-00000000aaa6', '01800000-0000-0000-0000-000000000061',
  '01800000-0000-0000-0000-0000000000b6',
  '{"answers":[{"question_id":"01800000-0000-0000-0000-0000000000f1","type":"mcq","value":"B"}],
    "answered_count":1,"total_questions":1,"version":1}', now());

do $$ begin
  assert (select score from submissions where id = '01800000-0000-0000-0000-00000000aaa1') = 7,
    'AUTO_MARK_WRONG_SCORE (all right = 7)';
  assert (select graded_at is not null and graded_by is null from submissions
           where id = '01800000-0000-0000-0000-00000000aaa1'), 'auto mark: graded_at set, graded_by system';
  assert (select responses->>'answered_count' from submissions
           where id = '01800000-0000-0000-0000-00000000aaa1') = '5', 'raw responses kept';
  assert (select score from submissions where id = '01800000-0000-0000-0000-00000000aaa2') is null,
    'MIXED_PAPER_AUTO_MARKED';
  assert (select score from submissions where id = '01800000-0000-0000-0000-00000000aaa6') is null,
    'SCORE_ABOVE_TOTAL_AUTO_MARKED';
  -- Still can't self-grade or change the row (005/025/026).
  begin
    insert into submissions(enrollment_id, assessment_id, responses, score) values
     ('01800000-0000-0000-0000-000000000061', '01800000-0000-0000-0000-0000000000b3', '{}', 5);
    raise exception 'STUDENT_SELF_GRADED';
  exception when insufficient_privilege then null; end;
  update submissions set score = 0 where id = '01800000-0000-0000-0000-00000000aaa1';
  assert (select score from submissions where id = '01800000-0000-0000-0000-00000000aaa1') = 7,
    'STUDENT_CHANGED_AUTO_MARK';
  -- The trigger function can't be called through the API.
  begin
    perform public.submissions_auto_mark();
    raise exception 'TRIGGER_FN_CALLABLE';
  exception when feature_not_supported or insufficient_privilege or object_not_in_prerequisite_state then null; end;
end $$;

-- ---- As S3 (9-A): some wrong, some blank → partial score ---------------------------
set request.jwt.claim.sub = '01800000-0000-0000-0000-000000000013';
insert into submissions(id, enrollment_id, assessment_id, responses, submitted_at) values
 ('01800000-0000-0000-0000-00000000aaa3', '01800000-0000-0000-0000-000000000063',
  '01800000-0000-0000-0000-0000000000b1',
  '{"answers":[
     {"question_id":"01800000-0000-0000-0000-0000000000f1","type":"mcq","value":"B"},
     {"question_id":"01800000-0000-0000-0000-0000000000f2","type":"true_false","value":false},
     {"question_id":"01800000-0000-0000-0000-0000000000f3","type":"numeric","value":"three"},
     {"question_id":"01800000-0000-0000-0000-0000000000f4","type":"short_text","value":null}],
    "answered_count":3,"total_questions":5,"version":1}', now());
-- A malformed record (an old client, a bug) is accepted and left for the teacher.
insert into submissions(id, enrollment_id, assessment_id, responses, submitted_at) values
 ('01800000-0000-0000-0000-00000000aaa7', '01800000-0000-0000-0000-000000000063',
  '01800000-0000-0000-0000-0000000000b6', '{"answers":"oops"}', now());
do $$ begin
  assert (select score from submissions where id = '01800000-0000-0000-0000-00000000aaa3') = 2,
    'AUTO_MARK_WRONG_SCORE (partial = 2)';
  assert (select score from submissions where id = '01800000-0000-0000-0000-00000000aaa7') is null,
    'malformed record marked';
  assert (select count(*) from submissions) = 2, 'S3 sees own two rows';
  assert (select count(*) from questions) = 0, 'S3 reads questions';
end $$;

-- ---- As S2 (Class 8): own paper only -----------------------------------------------
set request.jwt.claim.sub = '01800000-0000-0000-0000-000000000012';
do $$ begin
  assert (select count(*) from student_paper('01800000-0000-0000-0000-0000000000b4')) = 1, 'S2 own paper';
  assert (select count(*) from student_paper('01800000-0000-0000-0000-0000000000b1')) = 0, 'S2 read 9-A paper';
  assert (select count(*) from submissions) = 0, 'S2 sees others submissions';
end $$;

-- ---- A pending sign-up (no student link) --------------------------------------------
set request.jwt.claim.sub = '01800000-0000-0000-0000-000000000019';
do $$ begin
  assert (select count(*) from questions) = 0, 'PENDING_READ_QUESTIONS';
  assert (select count(*) from student_paper('01800000-0000-0000-0000-0000000000b1')) = 0, 'PENDING_READ_PAPER';
end $$;

-- ---- Teacher T1 (9-A) ---------------------------------------------------------------
set request.jwt.claim.sub = '01800000-0000-0000-0000-000000000001';
do $$
declare s submissions;
begin
  -- The builder and question bank still read questions with their keys.
  assert (select answer->>'correct' from questions where id = '01800000-0000-0000-0000-0000000000f1') = 'B',
    'TEACHER_LOST_QUESTION_READ';
  -- The auto mark is in the history.
  assert (select count(*) from submission_grade_edits
           where submission_id = '01800000-0000-0000-0000-00000000aaa1'
             and prev_score is null and new_score = 7 and reason = 'Auto-marked' and edited_by is null) = 1,
    'AUTO_MARK_NOT_IN_HISTORY';
  -- Changing it is a correction: reason required (record_grade).
  begin
    perform record_grade('01800000-0000-0000-0000-000000000061', '01800000-0000-0000-0000-0000000000b1', 6, '');
    raise exception 'CORRECTION_WITHOUT_REASON';
  exception when others then
    if sqlerrm <> 'reason_required' then raise; end if;
  end;
  s := record_grade('01800000-0000-0000-0000-000000000061', '01800000-0000-0000-0000-0000000000b1', 6,
                    'Spelling was off');
  assert s.score = 6 and s.edit_count = 1, 'correction recorded';
  -- The teacher marks the mixed paper by hand as before (first grade, no reason).
  s := record_grade('01800000-0000-0000-0000-000000000061', '01800000-0000-0000-0000-0000000000b2', 3, '');
  assert s.score = 3, 'teacher marks mixed paper';
  -- A teacher inserting responses for a student gets no system mark (it must be
  -- their own grade via record_grade, under their name).
  insert into submissions(id, enrollment_id, assessment_id, responses, submitted_at) values
   ('01800000-0000-0000-0000-00000000aaa8', '01800000-0000-0000-0000-000000000063',
    '01800000-0000-0000-0000-0000000000b2',
    '{"answers":[{"question_id":"01800000-0000-0000-0000-0000000000f1","type":"mcq","value":"B"}],"version":1}',
    now());
  assert (select score from submissions where id = '01800000-0000-0000-0000-00000000aaa8') is null,
    'TEACHER_INSERT_AUTO_MARKED';
  -- Grade first (no attempt yet), then the student's attempt arrives: duplicate, grade kept.
  s := record_grade('01800000-0000-0000-0000-000000000064', '01800000-0000-0000-0000-0000000000b1', 5, '');
  -- Teachers get nothing from the student functions (they read the tables).
  assert (select count(*) from student_paper('01800000-0000-0000-0000-0000000000b1')) = 0, 'teacher paper rpc';
end $$;

set request.jwt.claim.sub = '01800000-0000-0000-0000-000000000014';
do $$ begin
  begin
    insert into submissions(id, enrollment_id, assessment_id, responses, submitted_at) values
     ('01800000-0000-0000-0000-00000000aaa4', '01800000-0000-0000-0000-000000000064',
      '01800000-0000-0000-0000-0000000000b1',
      '{"answers":[{"question_id":"01800000-0000-0000-0000-0000000000f1","type":"mcq","value":"A"}],"version":1}',
      now());
    raise exception 'GRADE_FIRST_MADE_SECOND_ROW';
  exception when unique_violation then null; end;
  assert (select score from submissions where enrollment_id = '01800000-0000-0000-0000-000000000064') = 5,
    'grade-first score kept';
end $$;

-- anon can't call the paper function at all.
reset role;
set role anon;
do $$ begin
  begin
    perform public.student_paper('01800000-0000-0000-0000-0000000000b1');
    raise exception 'ANON_CALLED_STUDENT_PAPER';
  exception when insufficient_privilege then null; end;
end $$;

reset role;
set request.jwt.claim.sub = '';
do $$ begin
  assert (select count(*) from submission_grade_edits e join submissions s on s.id = e.submission_id
           where s.enrollment_id in ('01800000-0000-0000-0000-000000000061',
                                     '01800000-0000-0000-0000-000000000063')
             and e.reason = 'Auto-marked') = 2, 'exactly two auto marks (S1 P1, S3 P1)';
end $$;
select 'CO-1 018 smoke: pass' as result;
