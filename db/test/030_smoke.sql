-- Smoke test for prompt 16 (pre-reader read-aloud) and db/030 (question-audio
-- bucket). Replays, as signed-in users, what apps/mobile/features/prereader does
-- (download a clip = select on storage.objects) and what only staff / the
-- service role may do (write a clip). Throwaway local Postgres only (TEST_PLAN
-- DB-1 / PR-1). Passes in production order (setup + 002–016 + 024–026 + 030)
-- and the full order. Without 030 it fails at STUDENT_CANT_READ_OWN_CLIP.
\set ON_ERROR_STOP 1
reset role;
set request.jwt.claim.sub = '';
grant usage on schema public, auth, storage to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select, insert, update, delete on storage.objects to authenticated;
grant execute on all functions in schema public to authenticated;

-- PG (teacher T1, student S1) and Class 1 (student S2). q1 is on a published PG
-- quiz, q2 only on a draft PG quiz, q3 on Class 1's published quiz.
update academic_years set is_current = false;
insert into academic_years(id, label, is_current) values
 ('03000000-0000-0000-0000-0000000000a0', 'PR-2026-27', true);
insert into classes(id, name, grade_level) values
 ('03000000-0000-0000-0000-0000000000c1', 'PR Playgroup', 0),
 ('03000000-0000-0000-0000-0000000000c2', 'PR Class 1', 1);
insert into subjects(id, class_id, name) values
 ('03000000-0000-0000-0000-0000000000d1', '03000000-0000-0000-0000-0000000000c1', 'PR Numeracy'),
 ('03000000-0000-0000-0000-0000000000d2', '03000000-0000-0000-0000-0000000000c2', 'PR Maths');
insert into chapters(id, subject_id, title) values
 ('03000000-0000-0000-0000-0000000000e1', '03000000-0000-0000-0000-0000000000d1', 'PR Counting'),
 ('03000000-0000-0000-0000-0000000000e2', '03000000-0000-0000-0000-0000000000d2', 'PR Adding');
insert into questions(id, chapter_id, type, cognitive_level, body, answer) values
 ('03000000-0000-0000-0000-000000000071', '03000000-0000-0000-0000-0000000000e1', 'tap_image', 'apply',
  '{"prompt":{"en":"Tap 3"},"choices":[{"id":"a","emoji":"🦆"},{"id":"b","emoji":"🦆","count":3}]}', '{"correct":"b"}'),
 ('03000000-0000-0000-0000-000000000072', '03000000-0000-0000-0000-0000000000e1', 'tap_image', 'apply',
  '{"prompt":{"en":"Tap 2"},"choices":[{"id":"a","emoji":"🍎"},{"id":"b","emoji":"🍎","count":2}]}', '{"correct":"b"}'),
 ('03000000-0000-0000-0000-000000000073', '03000000-0000-0000-0000-0000000000e2', 'tap_image', 'apply',
  '{"prompt":{"en":"Tap 4"},"choices":[{"id":"a","emoji":"⭐"},{"id":"b","emoji":"⭐","count":4}]}', '{"correct":"b"}');
insert into students(id, student_code, full_name) values
 ('03000000-0000-0000-0000-000000000051', 'PR-1', 'TEST- PR One'),
 ('03000000-0000-0000-0000-000000000052', 'PR-2', 'TEST- PR Two');
insert into enrollments(id, student_id, class_id, year_id, status, roll_number) values
 ('03000000-0000-0000-0000-000000000061', '03000000-0000-0000-0000-000000000051',
  '03000000-0000-0000-0000-0000000000c1', '03000000-0000-0000-0000-0000000000a0', 'active', 1),
 ('03000000-0000-0000-0000-000000000062', '03000000-0000-0000-0000-000000000052',
  '03000000-0000-0000-0000-0000000000c2', '03000000-0000-0000-0000-0000000000a0', 'active', 1);
insert into auth.users(id, email) values
 ('03000000-0000-0000-0000-000000000001', 'pr.teacher@school.test'),
 ('03000000-0000-0000-0000-000000000002', 'pr.admin@school.test'),
 ('03000000-0000-0000-0000-000000000011', 'pr1@students.school.invalid'),
 ('03000000-0000-0000-0000-000000000012', 'pr2@students.school.invalid'),
 ('03000000-0000-0000-0000-000000000019', 'pr.pending@school.test');
update profiles set role = 'teacher' where id = '03000000-0000-0000-0000-000000000001';
update profiles set role = 'admin' where id = '03000000-0000-0000-0000-000000000002';
update profiles set role = 'student', student_id = '03000000-0000-0000-0000-000000000051'
 where id = '03000000-0000-0000-0000-000000000011';
update profiles set role = 'student', student_id = '03000000-0000-0000-0000-000000000052'
 where id = '03000000-0000-0000-0000-000000000012';
insert into assessments(id, year_id, class_id, subject_id, title, type, status, total_marks) values
 ('03000000-0000-0000-0000-0000000000b1', '03000000-0000-0000-0000-0000000000a0',
  '03000000-0000-0000-0000-0000000000c1', '03000000-0000-0000-0000-0000000000d1', 'PR quiz', 'quiz', 'published', 2),
 ('03000000-0000-0000-0000-0000000000b2', '03000000-0000-0000-0000-0000000000a0',
  '03000000-0000-0000-0000-0000000000c1', '03000000-0000-0000-0000-0000000000d1', 'PR draft', 'quiz', 'draft', 1),
 ('03000000-0000-0000-0000-0000000000b3', '03000000-0000-0000-0000-0000000000a0',
  '03000000-0000-0000-0000-0000000000c2', '03000000-0000-0000-0000-0000000000d2', 'PR Class 1 quiz', 'quiz', 'published', 1);
insert into assessment_questions(assessment_id, question_id) values
 ('03000000-0000-0000-0000-0000000000b1', '03000000-0000-0000-0000-000000000071'),
 ('03000000-0000-0000-0000-0000000000b2', '03000000-0000-0000-0000-000000000072'),
 ('03000000-0000-0000-0000-0000000000b3', '03000000-0000-0000-0000-000000000073');

-- The generator (service role / SQL Editor) writes the clips; a stray non-uuid name too.
insert into storage.objects(bucket_id, name) values
 ('question-audio', '03000000-0000-0000-0000-000000000071/0123456789abcdef.en.mp3'),
 ('question-audio', '03000000-0000-0000-0000-000000000071/0123456789abcdef.ur.mp3'),
 ('question-audio', '03000000-0000-0000-0000-000000000072/0123456789abcdef.en.mp3'),
 ('question-audio', '03000000-0000-0000-0000-000000000073/0123456789abcdef.en.mp3'),
 ('question-audio', 'readme.txt');

do $$ begin
  assert (select public = false and file_size_limit = 204800 and 'audio/mpeg' = any(allowed_mime_types)
            from storage.buckets where id = 'question-audio'), 'BUCKET_NOT_PRIVATE_OR_UNLIMITED';
end $$;

-- ---- Student S1 (PG) --------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '03000000-0000-0000-0000-000000000011';
do $$ declare n int; begin
  select count(*) into n from storage.objects
   where bucket_id = 'question-audio' and name like '03000000-0000-0000-0000-000000000071/%';
  assert n = 2, 'STUDENT_CANT_READ_OWN_CLIP';
  -- Listing the whole bucket (stray name included) must not raise and shows only q1.
  select count(*) into n from storage.objects where bucket_id = 'question-audio';
  assert n = 2, format('STUDENT_SEES_OTHER_CLIPS (%s)', n);
  begin
    insert into storage.objects(bucket_id, name) values
     ('question-audio', '03000000-0000-0000-0000-000000000071/evil.en.mp3');
    raise exception 'STUDENT_WROTE_CLIP';
  exception when insufficient_privilege then null; end;
  update storage.objects set name = name || '.x' where bucket_id = 'question-audio';
  assert not found, 'STUDENT_RENAMED_CLIP';
  delete from storage.objects where bucket_id = 'question-audio';
  assert not found, 'STUDENT_DELETED_CLIP';
end $$;

-- ---- Student S2 (Class 1): only Class 1's published clip ------------------------
set request.jwt.claim.sub = '03000000-0000-0000-0000-000000000012';
do $$ declare n int; begin
  select count(*) into n from storage.objects where bucket_id = 'question-audio';
  assert n = 1, format('S2_CLIP_SCOPE (%s)', n);
end $$;

-- ---- After the quiz is closed, S1 loses its clips (same gate as the paper) --------
reset role;
update assessments set status = 'closed' where id = '03000000-0000-0000-0000-0000000000b1';
set role authenticated;
set request.jwt.claim.sub = '03000000-0000-0000-0000-000000000011';
do $$ begin
  assert (select count(*) from storage.objects where bucket_id = 'question-audio') = 0,
    'STUDENT_READS_CLOSED_QUIZ_CLIP';
end $$;
reset role;
update assessments set status = 'published' where id = '03000000-0000-0000-0000-0000000000b1';
-- A struck-off student hears nothing.
update enrollments set status = 'withdrawn' where id = '03000000-0000-0000-0000-000000000061';
set role authenticated;
do $$ begin
  assert (select count(*) from storage.objects where bucket_id = 'question-audio') = 0,
    'WITHDRAWN_STUDENT_READS_CLIP';
end $$;
reset role;
update enrollments set status = 'active' where id = '03000000-0000-0000-0000-000000000061';

-- ---- Teacher: reads every clip (review before approval), writes none ------------
set role authenticated;
set request.jwt.claim.sub = '03000000-0000-0000-0000-000000000001';
do $$ declare n int; begin
  select count(*) into n from storage.objects where bucket_id = 'question-audio';
  assert n = 5, format('TEACHER_CANT_REVIEW_CLIPS (%s)', n);
  begin
    insert into storage.objects(bucket_id, name) values
     ('question-audio', '03000000-0000-0000-0000-000000000071/t.en.mp3');
    raise exception 'TEACHER_WROTE_CLIP';
  exception when insufficient_privilege then null; end;
  delete from storage.objects where bucket_id = 'question-audio';
  assert not found, 'TEACHER_DELETED_CLIP';
end $$;

-- ---- Pending account: nothing ----------------------------------------------------
set request.jwt.claim.sub = '03000000-0000-0000-0000-000000000019';
do $$ begin
  assert (select count(*) from storage.objects where bucket_id = 'question-audio') = 0,
    'PENDING_READS_CLIP';
end $$;

-- ---- Admin: full access ----------------------------------------------------------
set request.jwt.claim.sub = '03000000-0000-0000-0000-000000000002';
do $$ begin
  insert into storage.objects(bucket_id, name) values
   ('question-audio', '03000000-0000-0000-0000-000000000072/fedcba9876543210.ur.mp3');
  delete from storage.objects where bucket_id = 'question-audio'
   and name = '03000000-0000-0000-0000-000000000072/fedcba9876543210.ur.mp3';
  assert found, 'ADMIN_CANT_MANAGE_CLIPS';
end $$;

reset role;
set request.jwt.claim.sub = '';
delete from storage.objects where bucket_id = 'question-audio';
\echo '030 smoke: PASS'
