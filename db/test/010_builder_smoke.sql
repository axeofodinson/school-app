-- Smoke test for prompt 10 (question authoring + assessment builder). No schema
-- change: it replays the exact writes apps/mobile/features/{questions,assessments}/api.ts
-- make, as a teacher and an admin, against the RLS in setup.sql + db/003.
-- Passes in production order (setup + 002–016 + 024) and after 017–023.
-- Throwaway local Postgres only (TEST_PLAN.md DB-1 / AB-1).
\set ON_ERROR_STOP 1
reset role;
set request.jwt.claim.sub = '';
grant usage on schema public, auth to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- Fixtures: a year, two classes, a teacher of 9-A only, another teacher, an admin.
insert into auth.users(id, email) values
 ('01000000-0000-0000-0000-000000000001', 'ab.teacher@school.test'),
 ('01000000-0000-0000-0000-000000000002', 'ab.other@school.test'),
 ('01000000-0000-0000-0000-000000000003', 'ab.admin@school.test');
update profiles set role = 'teacher' where id in
 ('01000000-0000-0000-0000-000000000001', '01000000-0000-0000-0000-000000000002');
update profiles set role = 'admin' where id = '01000000-0000-0000-0000-000000000003';

update academic_years set is_current = false;
insert into academic_years(id, label, is_current) values
 ('01000000-0000-0000-0000-0000000000a0', 'AB-2026-27', true);
insert into classes(id, name, grade_level) values
 ('01000000-0000-0000-0000-0000000000c1', 'AB Class 9-A', 9),
 ('01000000-0000-0000-0000-0000000000c2', 'AB Class 8', 8);
insert into subjects(id, class_id, name) values
 ('01000000-0000-0000-0000-0000000000d1', '01000000-0000-0000-0000-0000000000c1', 'AB Maths'),
 ('01000000-0000-0000-0000-0000000000d2', '01000000-0000-0000-0000-0000000000c2', 'AB Science');
insert into chapters(id, subject_id, title) values
 ('01000000-0000-0000-0000-0000000000e1', '01000000-0000-0000-0000-0000000000d1', 'AB Sets'),
 ('01000000-0000-0000-0000-0000000000e2', '01000000-0000-0000-0000-0000000000d2', 'AB Cells');
insert into teacher_assignments(teacher_id, class_id, subject_id, year_id) values
 ('01000000-0000-0000-0000-000000000001', '01000000-0000-0000-0000-0000000000c1',
  '01000000-0000-0000-0000-0000000000d1', '01000000-0000-0000-0000-0000000000a0'),
 ('01000000-0000-0000-0000-000000000002', '01000000-0000-0000-0000-0000000000c1',
  null, '01000000-0000-0000-0000-0000000000a0');
-- Another teacher's question in 9-A, and an admin-made assessment for Class 8.
insert into questions(id, chapter_id, type, cognitive_level, body, answer, created_by) values
 ('01000000-0000-0000-0000-0000000000f2', '01000000-0000-0000-0000-0000000000e1', 'true_false',
  'understand', '{"stem":"The empty set is a subset of every set."}', '{"correct":true}',
  '01000000-0000-0000-0000-000000000002');
insert into assessments(id, year_id, class_id, subject_id, title, status) values
 ('01000000-0000-0000-0000-0000000000b8', '01000000-0000-0000-0000-0000000000a0',
  '01000000-0000-0000-0000-0000000000c2', '01000000-0000-0000-0000-0000000000d2',
  'AB Class 8 test', 'draft');

set role authenticated;
set request.jwt.claim.sub = '01000000-0000-0000-0000-000000000001';

-- Scope reads the app makes (features/scope/api.ts).
do $$ begin
  assert (select count(*) from teacher_assignments) = 1, 'teacher sees only own assignments';
  assert (select count(*) from assessments
          where id = '01000000-0000-0000-0000-0000000000b8') = 0, 'teacher reads a foreign class assessment';
end $$;

-- Questions: create in a taught chapter (api.ts createQuestion), not in a foreign one.
insert into questions(id, chapter_id, created_by, type, cognitive_level, body, answer, default_marks)
values ('01000000-0000-0000-0000-0000000000f1', '01000000-0000-0000-0000-0000000000e1',
  '01000000-0000-0000-0000-000000000001', 'mcq', 'recall',
  '{"stem":"Which set has no elements?","options":[{"key":"A","text":"Universal"},{"key":"B","text":"Empty"}]}',
  '{"correct":"B"}', 2)
returning id;
insert into questions(chapter_id, created_by, type, cognitive_level, body, answer)
values ('01000000-0000-0000-0000-0000000000e1', '01000000-0000-0000-0000-000000000001',
  'short_text', 'apply', '{"stem":"Capital of Punjab?"}', '{"correct":"Lahore","also":["lahore city"]}');
do $$ begin
  begin
    insert into questions(chapter_id, created_by, type, cognitive_level, body, answer)
    values ('01000000-0000-0000-0000-0000000000e2', '01000000-0000-0000-0000-000000000001',
      'true_false', 'recall', '{"stem":"x"}', '{"correct":true}');
    raise exception 'TEACHER_WROTE_FOREIGN_QUESTION';
  exception when insufficient_privilege then null; end;
  -- Can't move own question into a foreign class.
  begin
    update questions set chapter_id = '01000000-0000-0000-0000-0000000000e2'
     where id = '01000000-0000-0000-0000-0000000000f1';
    raise exception 'TEACHER_MOVED_QUESTION_OUT';
  exception when insufficient_privilege then null; end;
end $$;
-- Edit own (updateQuestion returns rows), not another teacher's (0 rows = "forbidden").
do $$ declare n int; begin
  update questions set default_marks = 3 where id = '01000000-0000-0000-0000-0000000000f1';
  get diagnostics n = row_count; assert n = 1, 'own question not updatable';
  update questions set default_marks = 9 where id = '01000000-0000-0000-0000-0000000000f2';
  get diagnostics n = row_count; assert n = 0, 'teacher edited another teacher''s question';
end $$;

-- Assessments: createAssessment = insert draft (returning id), items, then publish.
insert into assessments(id, year_id, class_id, subject_id, created_by, status, title, type,
  weightage, scheduled_on, total_marks)
values ('01000000-0000-0000-0000-0000000000b1', '01000000-0000-0000-0000-0000000000a0',
  '01000000-0000-0000-0000-0000000000c1', '01000000-0000-0000-0000-0000000000d1',
  '01000000-0000-0000-0000-000000000001', 'draft', 'AB Sets quiz', 'quiz', 10, '2026-12-01', 5)
returning id;
insert into assessment_questions(assessment_id, question_id, marks, sort_order) values
 ('01000000-0000-0000-0000-0000000000b1', '01000000-0000-0000-0000-0000000000f2', 3, 0),
 ('01000000-0000-0000-0000-0000000000b1', '01000000-0000-0000-0000-0000000000f1', 2, 1)
on conflict (assessment_id, question_id) do update set marks = excluded.marks, sort_order = excluded.sort_order;
do $$ declare n int; begin
  update assessments set status = 'published' where id = '01000000-0000-0000-0000-0000000000b1';
  get diagnostics n = row_count; assert n = 1, 'teacher could not publish own class assessment';
end $$;
-- lockedQuestionIds(): both questions are now in a non-draft assessment.
do $$ begin
  assert (select count(*) from assessment_questions aq
          join assessments a on a.id = aq.assessment_id
          where aq.question_id in ('01000000-0000-0000-0000-0000000000f1',
                                   '01000000-0000-0000-0000-0000000000f2')
            and a.status <> 'draft') = 2, 'locked lookup';
end $$;

-- ...and none of it for a class they don't teach.
do $$ declare n int; begin
  begin
    insert into assessments(year_id, class_id, subject_id, created_by, title)
    values ('01000000-0000-0000-0000-0000000000a0', '01000000-0000-0000-0000-0000000000c2',
      '01000000-0000-0000-0000-0000000000d2', '01000000-0000-0000-0000-000000000001', 'nope');
    raise exception 'TEACHER_CREATED_FOREIGN_ASSESSMENT';
  exception when insufficient_privilege then null; end;
  begin
    insert into assessment_questions(assessment_id, question_id)
    values ('01000000-0000-0000-0000-0000000000b8', '01000000-0000-0000-0000-0000000000f1');
    raise exception 'TEACHER_FILLED_FOREIGN_ASSESSMENT';
  exception when insufficient_privilege then null; end;
  update assessments set status = 'published' where id = '01000000-0000-0000-0000-0000000000b8';
  get diagnostics n = row_count; assert n = 0, 'teacher published a foreign assessment';
  begin
    update assessments set class_id = '01000000-0000-0000-0000-0000000000c2',
      subject_id = '01000000-0000-0000-0000-0000000000d2'
     where id = '01000000-0000-0000-0000-0000000000b1';
    raise exception 'TEACHER_MOVED_ASSESSMENT_OUT';
  exception when insufficient_privilege then null; end;
  -- Teachers never delete assessments (the app doesn't try; RLS has no policy).
  delete from assessments where id = '01000000-0000-0000-0000-0000000000b1';
  get diagnostics n = row_count; assert n = 0, 'teacher deleted an assessment';
end $$;

-- Admin: every class.
set request.jwt.claim.sub = '01000000-0000-0000-0000-000000000003';
insert into questions(chapter_id, created_by, type, cognitive_level, body, answer)
values ('01000000-0000-0000-0000-0000000000e2', '01000000-0000-0000-0000-000000000003',
  'numeric', 'apply', '{"stem":"2+2"}', '{"correct":4}');
insert into assessment_questions(assessment_id, question_id, marks)
select '01000000-0000-0000-0000-0000000000b8', id, 1 from questions
 where chapter_id = '01000000-0000-0000-0000-0000000000e2';
update assessments set status = 'published' where id = '01000000-0000-0000-0000-0000000000b8';

reset role;
set request.jwt.claim.sub = '';
do $$ begin
  assert (select status from assessments where id = '01000000-0000-0000-0000-0000000000b1') = 'published';
  assert (select class_id from assessments where id = '01000000-0000-0000-0000-0000000000b1')
         = '01000000-0000-0000-0000-0000000000c1';
  assert (select count(*) from assessment_questions
          where assessment_id = '01000000-0000-0000-0000-0000000000b1') = 2;
  assert (select status from assessments where id = '01000000-0000-0000-0000-0000000000b8') = 'published';
  assert (select count(*) from questions where chapter_id = '01000000-0000-0000-0000-0000000000e2') = 1,
         'only the admin question in the foreign chapter';
  assert (select default_marks from questions where id = '01000000-0000-0000-0000-0000000000f2') = 1;
end $$;
select 'AB-1 builder smoke: pass' as result;
