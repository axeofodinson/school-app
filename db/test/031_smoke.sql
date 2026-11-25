-- Importer RLS + RPC smoke (TEST_PLAN IM-1, prompt 21). Replays, as signed-in
-- users, exactly what apps/mobile/features/importer/api.ts calls: find matches,
-- import a chunk, re-send the same chunk, retire a batch. Throwaway local
-- Postgres only. Passes in the production order (setup + 002–016 + 024–026 +
-- 017 + 023 + 031) and in the full dev order (+ 018, 028–030).
-- Every check raises on failure. Without 031 it fails at once (no function).
\set ON_ERROR_STOP 1
reset role;
set request.jwt.claim.sub = '';
grant usage on schema public, auth to authenticated, anon;
grant select, insert, update, delete on all tables in schema public to authenticated, anon;
grant execute on all functions in schema public to authenticated;

-- Fixtures: Class 9 Maths (T1 teaches it this year) + Class 8 Maths (T2), one
-- student, one admin.
update academic_years set is_current = false;
insert into academic_years(id, label, is_current) values
 ('04000000-0000-0000-0000-0000000000a0', 'IM-2026-27', true);
insert into classes(id, name, grade_level) values
 ('04000000-0000-0000-0000-0000000000c9', 'IM Class 9', 9),
 ('04000000-0000-0000-0000-0000000000c8', 'IM Class 8', 8);
insert into subjects(id, class_id, name) values
 ('04000000-0000-0000-0000-0000000000d1', '04000000-0000-0000-0000-0000000000c9', 'IM Maths'),
 ('04000000-0000-0000-0000-0000000000d3', '04000000-0000-0000-0000-0000000000c8', 'IM Maths');
insert into chapters(id, subject_id, title, sort_order) values
 ('04000000-0000-0000-0000-0000000000e1', '04000000-0000-0000-0000-0000000000d1', 'IM Equations', 1),
 ('04000000-0000-0000-0000-0000000000e3', '04000000-0000-0000-0000-0000000000d3', 'IM Fractions', 1);
insert into students(id, student_code, full_name) values
 ('04000000-0000-0000-0000-000000000051', 'IM-1', 'TEST- IM One');
insert into enrollments(student_id, class_id, year_id, status) values
 ('04000000-0000-0000-0000-000000000051', '04000000-0000-0000-0000-0000000000c9',
  '04000000-0000-0000-0000-0000000000a0', 'active');
insert into auth.users(id, email) values
 ('04000000-0000-0000-0000-000000000001', 'im.t1@school.test'),
 ('04000000-0000-0000-0000-000000000002', 'im.t2@school.test'),
 ('04000000-0000-0000-0000-000000000003', 'im.admin@school.test'),
 ('04000000-0000-0000-0000-000000000011', 'im1@students.school.invalid');
update profiles set role = 'teacher'
 where id in ('04000000-0000-0000-0000-000000000001', '04000000-0000-0000-0000-000000000002');
update profiles set role = 'admin' where id = '04000000-0000-0000-0000-000000000003';
update profiles set role = 'student', student_id = '04000000-0000-0000-0000-000000000051'
 where id = '04000000-0000-0000-0000-000000000011';
insert into teacher_assignments(teacher_id, class_id, subject_id, year_id) values
 ('04000000-0000-0000-0000-000000000001', '04000000-0000-0000-0000-0000000000c9',
  '04000000-0000-0000-0000-0000000000d1', '04000000-0000-0000-0000-0000000000a0'),
 ('04000000-0000-0000-0000-000000000002', '04000000-0000-0000-0000-0000000000c8',
  '04000000-0000-0000-0000-0000000000d3', '04000000-0000-0000-0000-0000000000a0');

create or replace function public._im_refused(p_sql text) returns boolean
language plpgsql as $$
begin
  execute p_sql;
  return false;
exception when others then
  return true;
end $$;
create or replace function public._im_rows(p_sql text) returns int
language plpgsql as $$
declare n int;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function public._im_refused(text), public._im_rows(text) to authenticated, anon;

-- The chunk the app sends (one topic, 2 concepts, 1 prerequisite, 1 lesson,
-- 1 maths rendering, 3 questions).
create or replace function public._im_chunk(p_batch uuid, p_topic uuid, p_chap uuid,
                                            p_final boolean default true, p_qs jsonb default null)
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'batch', jsonb_build_object('id', p_batch, 'origin', 'ai', 'source_note', 'C1 run',
      'file_name', 'topic.json', 'chapter_id', p_chap, 'topic_id', p_topic, 'is_test_data', true),
    'topic', jsonb_build_object('id', p_topic, 'title_en', 'IM Solving', 'title_ur', 'حل', 'sort_order', 0),
    'concepts', jsonb_build_array(
      jsonb_build_object('id', '04000000-0000-0000-0000-0000000000f1', 'title_en', 'IM Balance',
                         'title_ur', 'توازن', 'sort_order', 0),
      jsonb_build_object('id', '04000000-0000-0000-0000-0000000000f2', 'title_en', 'IM Both sides',
                         'title_ur', 'دونوں طرف', 'sort_order', 1)),
    'prereqs', jsonb_build_array(jsonb_build_object(
      'concept_id', '04000000-0000-0000-0000-0000000000f2',
      'requires_concept_id', '04000000-0000-0000-0000-0000000000f1')),
    'lessons', jsonb_build_array(jsonb_build_object(
      'id', '04000000-0000-0000-0000-0000000000f9', 'kind', 'lesson', 'concept_id', null,
      'blocks', jsonb_build_array(jsonb_build_object('type', 'simple', 'en', 'Balance both sides.',
                                                     'ur', 'دونوں طرف برابر۔')))),
    'math', jsonb_build_array(jsonb_build_object('key', '2x + 3 = 7',
      'svg', '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>')),
    'questions', coalesce(p_qs, jsonb_build_array(
      jsonb_build_object('id', '04000000-0000-0000-0000-000000000091',
        'concept_id', '04000000-0000-0000-0000-0000000000f1', 'type', 'mcq',
        'cognitive_level', 'apply', 'difficulty', 2, 'default_marks', 1,
        'body', jsonb_build_object('stem', jsonb_build_object('en', 'Solve 2x + 3 = 7', 'ur', 'حل کریں'),
          'options', jsonb_build_array(
            jsonb_build_object('key', 'A', 'text', jsonb_build_object('en', 'x = 2', 'ur', 'x = 2')),
            jsonb_build_object('key', 'B', 'text', jsonb_build_object('en', 'x = 5', 'ur', 'x = 5')))),
        'answer', jsonb_build_object('correct', 'A'),
        'explanation', jsonb_build_object('en', 'Subtract 3.', 'ur', '3 منفی کریں۔'),
        'source', jsonb_build_object('book', 'PTB', 'page', 41), 'language_complete', true),
      jsonb_build_object('id', '04000000-0000-0000-0000-000000000092',
        'concept_id', '04000000-0000-0000-0000-0000000000f2', 'type', 'numeric',
        'cognitive_level', 'apply', 'difficulty', 2, 'default_marks', 1,
        'body', jsonb_build_object('stem', jsonb_build_object('en', 'Solve 5x - 2 = 3x + 6', 'ur', 'حل')),
        'answer', jsonb_build_object('correct', 4), 'explanation', null, 'source', null,
        'language_complete', false),
      jsonb_build_object('id', '04000000-0000-0000-0000-000000000093',
        'concept_id', '04000000-0000-0000-0000-0000000000f2', 'type', 'true_false',
        'cognitive_level', 'recall', 'difficulty', 1, 'default_marks', 1,
        'body', jsonb_build_object('stem', jsonb_build_object('en', 'Adding 5 to both sides is allowed', 'ur', 'ہاں')),
        'answer', jsonb_build_object('correct', true), 'explanation', null, 'source', null,
        'language_complete', true))),
    'final', p_final,
    'report', jsonb_build_object('counts', jsonb_build_object('questions', 3, 'imported', 3)))
$$;
grant execute on function public._im_chunk(uuid, uuid, uuid, boolean, jsonb) to authenticated;

-- ---- A teacher imports into a subject they teach ------------------------------
set role authenticated;
set request.jwt.claim.sub = '04000000-0000-0000-0000-000000000001';

do $$
declare r jsonb;
begin
  r := public.import_content(public._im_chunk(
        '04000000-0000-0000-0000-0000000000b1'::uuid,
        '04000000-0000-0000-0000-00000000a0a1'::uuid,
        '04000000-0000-0000-0000-0000000000e1'::uuid));
  if (r->>'inserted')::int <> 3 or r->>'status' <> 'done' then
    raise exception 'IMPORT_DID_NOT_WRITE: %', r;
  end if;
end $$;

do $$
declare n int;
begin
  select count(*) into n from public.questions
   where import_batch_id = '04000000-0000-0000-0000-0000000000b1';
  if n <> 3 then raise exception 'WRONG_QUESTION_COUNT: %', n; end if;
  -- every imported question is a draft at version 1, with its concept + level
  if exists (select 1 from public.questions
              where import_batch_id = '04000000-0000-0000-0000-0000000000b1'
                and (status <> 'draft' or current_version <> 1 or origin <> 'ai'
                     or concept_id is null or cognitive_level is null or is_test_data = false)) then
    raise exception 'IMPORTED_QUESTION_WRONG_SHAPE';
  end if;
  select count(*) into n from public.question_versions qv
   join public.questions q on q.id = qv.question_id
   where q.import_batch_id = '04000000-0000-0000-0000-0000000000b1' and qv.version = 1;
  if n <> 3 then raise exception 'NO_VERSION_SNAPSHOT: %', n; end if;
  select count(*) into n from public.concepts where topic_id = '04000000-0000-0000-0000-00000000a0a1';
  if n <> 2 then raise exception 'CONCEPTS_MISSING: %', n; end if;
  select count(*) into n from public.concept_prerequisites
   where concept_id = '04000000-0000-0000-0000-0000000000f2';
  if n <> 1 then raise exception 'PREREQ_MISSING'; end if;
  select count(*) into n from public.learning_content_versions
   where content_id = '04000000-0000-0000-0000-0000000000f9' and version = 1;
  if n <> 1 then raise exception 'LESSON_MISSING'; end if;
  select count(*) into n from public.math_svgs where key = '2x + 3 = 7';
  if n <> 1 then raise exception 'MATH_MISSING'; end if;
  select question_count into n from public.import_batches
   where id = '04000000-0000-0000-0000-0000000000b1';
  if n <> 3 then raise exception 'BATCH_COUNT_WRONG: %', n; end if;
end $$;

-- Re-sending the same chunk (a retry after a lost reply) changes nothing.
do $$
declare r jsonb; n int;
begin
  r := public.import_content(public._im_chunk(
        '04000000-0000-0000-0000-0000000000b1'::uuid,
        '04000000-0000-0000-0000-00000000a0a1'::uuid,
        '04000000-0000-0000-0000-0000000000e1'::uuid));
  if (r->>'inserted')::int <> 0 then raise exception 'RETRY_DUPLICATED: %', r; end if;
  select count(*) into n from public.questions
   where import_batch_id = '04000000-0000-0000-0000-0000000000b1';
  if n <> 3 then raise exception 'RETRY_DUPLICATED_ROWS: %', n; end if;
  select count(*) into n from public.topics where id = '04000000-0000-0000-0000-00000000a0a1';
  if n <> 1 then raise exception 'RETRY_DUPLICATED_TOPIC'; end if;
end $$;

-- A stored rendering can never be changed or removed.
do $$
begin
  -- No UPDATE/DELETE policy: the statement touches no row and the SVG stands.
  if public._im_rows($q$update public.math_svgs set svg = '<svg/>' where key = '2x + 3 = 7'$q$) <> 0
     or public._im_rows($q$delete from public.math_svgs where key = '2x + 3 = 7'$q$) <> 0
     or (select svg from public.math_svgs where key = '2x + 3 = 7') = '<svg/>' then
    raise exception 'MATH_SVG_MUTABLE';
  end if;
  -- and nothing dangerous can be stored, even by hand
  if not public._im_refused($q$insert into public.math_svgs(key, svg)
       values ('bad', '<svg><script>alert(1)</script></svg>')$q$)
     or not public._im_refused($q$insert into public.math_svgs(key, svg)
       values ('bad2', '<svg><image href="https://evil.example/x.png"/></svg>')$q$)
     or not public._im_refused($q$insert into public.math_svgs(key, svg)
       values ('bad3', '<svg onload="x()"/>')$q$) then
    raise exception 'MATH_SVG_ACCEPTED_UNSAFE';
  end if;
end $$;

-- Duplicate search finds the question just imported, in this subject only.
do $$
declare n int; q uuid;
begin
  select count(*) into n from public.import_find_matches(
    '04000000-0000-0000-0000-0000000000d1',
    array['solve 2x 3 7 x 2 x 5']);
  if n = 0 then raise exception 'MATCH_NOT_FOUND'; end if;
  select question_id into q from public.import_find_matches(
    '04000000-0000-0000-0000-0000000000d1', array['solve 2x 3 7 x 2 x 5']) limit 1;
  if q <> '04000000-0000-0000-0000-000000000091' then raise exception 'WRONG_MATCH: %', q; end if;
  -- the other subject has nothing like it
  select count(*) into n from public.import_find_matches(
    '04000000-0000-0000-0000-0000000000d3', array['solve 2x 3 7 x 2 x 5']);
  if n <> 0 then raise exception 'MATCH_CROSSED_SUBJECTS: %', n; end if;
  -- no answer keys in the candidates (the report shows stems only)
  if exists (select 1 from public.import_find_matches(
               '04000000-0000-0000-0000-0000000000d1', array['solve 2x 3 7 x 2 x 5'])
              where body ? 'answer') then
    raise exception 'MATCH_LEAKED_ANSWER';
  end if;
end $$;

-- ---- Refusals ------------------------------------------------------------------
-- The same teacher cannot import into Class 8's chapter (RLS on questions).
do $$
begin
  -- Its own topic and concept, so only RLS can stop it.
  if not public._im_refused($q$select public.import_content(jsonb_set(jsonb_set(
       public._im_chunk('04000000-0000-0000-0000-0000000000b2'::uuid,
                        '04000000-0000-0000-0000-00000000a0a2'::uuid,
                        '04000000-0000-0000-0000-0000000000e3'::uuid, true,
       jsonb_build_array(jsonb_build_object(
         'id', '04000000-0000-0000-0000-000000000098',
         'concept_id', '04000000-0000-0000-0000-0000000000f8', 'type', 'mcq',
         'cognitive_level', 'apply', 'difficulty', 2, 'body', '{"stem":{"en":"Foreign"}}'::jsonb,
         'answer', '{"correct":"A"}'::jsonb, 'language_complete', true))),
       '{concepts}', jsonb_build_array(jsonb_build_object(
         'id', '04000000-0000-0000-0000-0000000000f8', 'title_en', 'IM Foreign',
         'title_ur', 'باہر', 'sort_order', 0))),
       '{prereqs}', '[]'::jsonb))$q$) then
    raise exception 'TEACHER_IMPORTED_FOREIGN_SUBJECT';
  end if;
  if exists (select 1 from public.questions where id = '04000000-0000-0000-0000-000000000098')
     or exists (select 1 from public.topics where id = '04000000-0000-0000-0000-00000000a0a2') then
    raise exception 'FOREIGN_IMPORT_WROTE_ROWS';
  end if;
  if exists (select 1 from public.import_batches where id = '04000000-0000-0000-0000-0000000000b2'
              and status = 'done') then
    raise exception 'FOREIGN_IMPORT_LEFT_A_BATCH';
  end if;
end $$;

-- A question whose concept belongs to another topic is refused as a whole chunk.
do $$
begin
  if not public._im_refused($q$select public.import_content(public._im_chunk(
       '04000000-0000-0000-0000-0000000000b3'::uuid,
       '04000000-0000-0000-0000-00000000a0a3'::uuid,
       '04000000-0000-0000-0000-0000000000e1'::uuid, true,
       jsonb_build_array(jsonb_build_object(
         'id', '04000000-0000-0000-0000-000000000099',
         'concept_id', '04000000-0000-0000-0000-0000000000f1', 'type', 'mcq',
         'cognitive_level', 'apply', 'difficulty', 2, 'body', '{"stem":{"en":"x"}}'::jsonb,
         'answer', '{"correct":"A"}'::jsonb, 'language_complete', true))))$q$) then
    raise exception 'CONCEPT_FROM_OTHER_TOPIC_ACCEPTED';
  end if;
  if exists (select 1 from public.questions where id = '04000000-0000-0000-0000-000000000099') then
    raise exception 'PARTIAL_CHUNK_WRITTEN';
  end if;
end $$;

-- Another teacher can't add to, or see, this batch; a student can't import at all.
set request.jwt.claim.sub = '04000000-0000-0000-0000-000000000002';
do $$
declare n int;
begin
  if not public._im_refused($q$select public.import_content(public._im_chunk(
       '04000000-0000-0000-0000-0000000000b1'::uuid,
       '04000000-0000-0000-0000-00000000a0a1'::uuid,
       '04000000-0000-0000-0000-0000000000e1'::uuid))$q$) then
    raise exception 'OTHER_TEACHER_ADDED_TO_BATCH';
  end if;
  select count(*) into n from public.import_batches
   where id = '04000000-0000-0000-0000-0000000000b1';
  if n <> 0 then raise exception 'OTHER_TEACHER_READ_BATCH'; end if;
  if not public._im_refused($q$select public.retire_import_batch(
       '04000000-0000-0000-0000-0000000000b1', 'not mine')$q$) then
    raise exception 'OTHER_TEACHER_RETIRED_BATCH';
  end if;
end $$;

set request.jwt.claim.sub = '04000000-0000-0000-0000-000000000011';
do $$
declare n int;
begin
  if not public._im_refused($q$select public.import_content(public._im_chunk(
       '04000000-0000-0000-0000-0000000000b4'::uuid,
       '04000000-0000-0000-0000-00000000a0a4'::uuid,
       '04000000-0000-0000-0000-0000000000e1'::uuid))$q$) then
    raise exception 'STUDENT_IMPORTED';
  end if;
  if not public._im_refused($q$select * from public.import_find_matches(
       '04000000-0000-0000-0000-0000000000d1', array['solve 2x 3 7'])$q$) then
    raise exception 'STUDENT_SEARCHED_BANK';
  end if;
  -- a student can read a rendered expression (maths is not secret) but not write one
  select count(*) into n from public.math_svgs;
  if n <> 1 then raise exception 'STUDENT_CANT_READ_MATH: %', n; end if;
  if not public._im_refused($q$insert into public.math_svgs(key, svg)
       values ('s', '<svg xmlns="http://www.w3.org/2000/svg"/>')$q$) then
    raise exception 'STUDENT_WROTE_MATH';
  end if;
  -- the imported questions are drafts: a student sees no version of them
  select count(*) into n from public.question_versions qv
   where qv.question_id = '04000000-0000-0000-0000-000000000091';
  if n <> 0 then raise exception 'STUDENT_READ_DRAFT_VERSION: %', n; end if;
end $$;

-- ---- Retiring a batch ----------------------------------------------------------
set request.jwt.claim.sub = '04000000-0000-0000-0000-000000000001';
do $$
declare r jsonb; n int;
begin
  if not public._im_refused($q$select public.retire_import_batch(
       '04000000-0000-0000-0000-0000000000b1', '  ')$q$) then
    raise exception 'RETIRED_WITHOUT_REASON';
  end if;
  r := public.retire_import_batch('04000000-0000-0000-0000-0000000000b1', 'Wrong chapter');
  if (r->>'questions')::int <> 3 or (r->>'lessons')::int <> 1 then
    raise exception 'RETIRE_WRONG_COUNTS: %', r;
  end if;
  select count(*) into n from public.questions
   where import_batch_id = '04000000-0000-0000-0000-0000000000b1' and status = 'retired';
  if n <> 3 then raise exception 'QUESTIONS_NOT_RETIRED: %', n; end if;
  -- nothing was deleted: rows and versions are all still there
  select count(*) into n from public.question_versions qv join public.questions q
    on q.id = qv.question_id where q.import_batch_id = '04000000-0000-0000-0000-0000000000b1';
  if n <> 3 then raise exception 'RETIRE_DELETED_HISTORY: %', n; end if;
  select count(*) into n from public.learning_content
   where import_batch_id = '04000000-0000-0000-0000-0000000000b1' and status = 'retired';
  if n <> 1 then raise exception 'LESSON_NOT_RETIRED'; end if;
  -- the concepts and topic stay (curriculum, edited in /curriculum)
  select count(*) into n from public.topics where id = '04000000-0000-0000-0000-00000000a0a1';
  if n <> 1 then raise exception 'RETIRE_REMOVED_TOPIC'; end if;
  -- retiring twice is a no-op, and a retired batch takes no more questions
  r := public.retire_import_batch('04000000-0000-0000-0000-0000000000b1', 'again');
  if (r->>'already')::boolean is not true then raise exception 'RETIRE_NOT_IDEMPOTENT: %', r; end if;
  if not public._im_refused($q$select public.import_content(public._im_chunk(
       '04000000-0000-0000-0000-0000000000b1'::uuid,
       '04000000-0000-0000-0000-00000000a0a1'::uuid,
       '04000000-0000-0000-0000-0000000000e1'::uuid))$q$) then
    raise exception 'RETIRED_BATCH_TOOK_MORE';
  end if;
  -- a retired question is out of the duplicate search
  select count(*) into n from public.import_find_matches(
    '04000000-0000-0000-0000-0000000000d1', array['solve 2x 3 7 x 2 x 5']);
  if n <> 0 then raise exception 'RETIRED_QUESTION_STILL_MATCHED: %', n; end if;
end $$;

-- An admin imports into any class.
set request.jwt.claim.sub = '04000000-0000-0000-0000-000000000003';
do $$
declare r jsonb; n int;
begin
  -- a fresh topic with its own concept, in a Class 8 chapter no teacher here owns
  r := public.import_content(jsonb_set(jsonb_set(
        public._im_chunk('04000000-0000-0000-0000-0000000000b6'::uuid,
                         '04000000-0000-0000-0000-00000000a0a6'::uuid,
                         '04000000-0000-0000-0000-0000000000e3'::uuid, true,
        jsonb_build_array(jsonb_build_object(
          'id', '04000000-0000-0000-0000-000000000095',
          'concept_id', '04000000-0000-0000-0000-0000000000f6', 'type', 'mcq',
          'cognitive_level', 'apply', 'difficulty', 1,
          'body', '{"stem":{"en":"Admin question"}}'::jsonb,
          'answer', '{"correct":"A"}'::jsonb, 'language_complete', true))),
        '{concepts}', jsonb_build_array(jsonb_build_object(
          'id', '04000000-0000-0000-0000-0000000000f6', 'title_en', 'IM Eighth',
          'title_ur', 'آٹھ', 'sort_order', 0))),
        '{prereqs}', '[]'::jsonb));
  if (r->>'status') <> 'done' or (r->>'inserted')::int <> 1 then
    raise exception 'ADMIN_IMPORT_FAILED: %', r;
  end if;
  select count(*) into n from public.import_batches;
  if n < 2 then raise exception 'ADMIN_CANT_SEE_BATCHES: %', n; end if;
  -- and retires the teacher's batch (already retired above: a no-op, but allowed)
  if (public.retire_import_batch('04000000-0000-0000-0000-0000000000b1', 'admin check')->>'already')::boolean
     is not true then
    raise exception 'ADMIN_RETIRE_FAILED';
  end if;
end $$;

reset role;
set request.jwt.claim.sub = '';
drop function if exists public._im_chunk(uuid, uuid, uuid, boolean, jsonb);
drop function if exists public._im_refused(text);
drop function if exists public._im_rows(text);
select 'IM-1 OK' as result;
