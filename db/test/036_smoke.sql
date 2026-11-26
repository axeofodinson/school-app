-- Offline learn packs smoke (TEST_PLAN OP-1, prompt 32). As signed-in users:
-- a student's pack holds only what the online reader and practice would show
-- (active topics, the lesson at its live learn approval, practice-approved
-- items with keys, never exam-only items or drafts); a delta request returns
-- known entries without their content; an unknown chapter is null; anon can't
-- call it. Prints the pack's size. Throwaway local Postgres only. Passes after
-- 017 + 023 (+ 031/032/033) + 036.
\set ON_ERROR_STOP 1
reset role;
set request.jwt.claim.sub = '';
grant usage on schema public, auth to authenticated, anon;
grant select, insert, update, delete on all tables in schema public to authenticated, anon;

update academic_years set is_current = false;
insert into academic_years(id, label, is_current) values
 ('36000000-0000-0000-0000-0000000000a0', 'OP-2026-27', true);
insert into classes(id, name, grade_level) values ('36000000-0000-0000-0000-0000000000c9', 'OP Class 9', 9);
insert into subjects(id, class_id, name) values
 ('36000000-0000-0000-0000-0000000000d1', '36000000-0000-0000-0000-0000000000c9', 'OP Physics');
insert into chapters(id, subject_id, title, sort_order) values
 ('36000000-0000-0000-0000-0000000000e1', '36000000-0000-0000-0000-0000000000d1', 'OP Motion', 1);
insert into topics(id, chapter_id, title_en, sort_order, status) values
 ('36000000-0000-0000-0000-0000000000b1', '36000000-0000-0000-0000-0000000000e1', 'OP Speed', 1, 'active'),
 ('36000000-0000-0000-0000-0000000000b2', '36000000-0000-0000-0000-0000000000e1', 'OP Old topic', 2, 'retired');
insert into concepts(id, topic_id, title_en, sort_order) values
 ('36000000-0000-0000-0000-0000000000f1', '36000000-0000-0000-0000-0000000000b1', 'OP Speed = distance / time', 1);
insert into students(id, student_code, full_name) values
 ('36000000-0000-0000-0000-000000000051', 'OP-1', 'TEST- OP One');
insert into enrollments(student_id, class_id, year_id, status) values
 ('36000000-0000-0000-0000-000000000051', '36000000-0000-0000-0000-0000000000c9',
  '36000000-0000-0000-0000-0000000000a0', 'active');
insert into auth.users(id, email) values
 ('36000000-0000-0000-0000-000000000003', 'op.admin@school.test'),
 ('36000000-0000-0000-0000-000000000011', 'op1@students.school.invalid');
update profiles set role = 'admin' where id = '36000000-0000-0000-0000-000000000003';
update profiles set role = 'student', student_id = '36000000-0000-0000-0000-000000000051'
 where id = '36000000-0000-0000-0000-000000000011';

-- Lessons: f1 approved at v1 (v2 is a newer draft), f2 a draft never approved.
insert into learning_content(id, topic_id, kind, current_version, status, is_test_data) values
 ('36000000-0000-0000-0000-0000000001f1', '36000000-0000-0000-0000-0000000000b1', 'lesson', 2, 'approved', true),
 ('36000000-0000-0000-0000-0000000001f2', '36000000-0000-0000-0000-0000000000b1', 'alternative', 1, 'draft', true);
insert into learning_content_versions(content_id, version, blocks) values
 ('36000000-0000-0000-0000-0000000001f1', 1, '[{"type":"simple","en":"Speed is how far in one second: $v=d/t$"}]'),
 ('36000000-0000-0000-0000-0000000001f1', 2, '[{"type":"simple","en":"DRAFT v2"}]'),
 ('36000000-0000-0000-0000-0000000001f2', 1, '[{"type":"simple","en":"DRAFT alt"}]');
insert into item_approvals(item_kind, item_id, version, scope, approved_by) values
 ('content', '36000000-0000-0000-0000-0000000001f1', 1, 'learn', '36000000-0000-0000-0000-000000000003');

-- Questions: q1 approved for practice, q2 approved for exams only.
insert into questions(id, chapter_id, concept_id, type, cognitive_level, difficulty, body, answer, status, created_by, is_test_data) values
 ('36000000-0000-0000-0000-000000000101', '36000000-0000-0000-0000-0000000000e1', '36000000-0000-0000-0000-0000000000f1',
  'mcq', 'apply', 1, '{"stem":"OP 1","options":[{"key":"A","text":"2"},{"key":"B","text":"3"}]}', '{"correct":"A"}', 'approved',
  '36000000-0000-0000-0000-000000000003', true),
 ('36000000-0000-0000-0000-000000000102', '36000000-0000-0000-0000-0000000000e1', '36000000-0000-0000-0000-0000000000f1',
  'mcq', 'apply', 2, '{"stem":"OP 2 EXAM","options":[{"key":"A","text":"1"},{"key":"B","text":"4"}]}', '{"correct":"B"}', 'approved',
  '36000000-0000-0000-0000-000000000003', true);
insert into item_approvals(item_kind, item_id, version, scope, approved_by) values
 ('question', '36000000-0000-0000-0000-000000000101', 1, 'practice', '36000000-0000-0000-0000-000000000003'),
 ('question', '36000000-0000-0000-0000-000000000102', 1, 'exam', '36000000-0000-0000-0000-000000000003');

create or replace function public._op_refused(p_sql text) returns boolean
language plpgsql as $$
begin execute p_sql; return false;
exception when others then return true; end $$;
grant execute on function public._op_refused(text) to anon, authenticated;

-- ---- Anonymous: refused ----------------------------------------------------------
set role anon;
do $$ begin
  if not public._op_refused($q$select public.learn_pack('36000000-0000-0000-0000-0000000000e1')$q$) then
    raise exception 'ANON_GOT_PACK';
  end if;
end $$;

-- ---- The student's pack ----------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '36000000-0000-0000-0000-000000000011';
do $$
declare p jsonb; d jsonb; l jsonb; q jsonb;
begin
  p := public.learn_pack('36000000-0000-0000-0000-0000000000e1');
  if p is null then raise exception 'NO_PACK'; end if;
  if p->'chapter'->>'title' <> 'OP Motion' or p->'chapter'->>'subject_name' <> 'OP Physics'
     or p->'chapter'->>'class_name' <> 'OP Class 9' then
    raise exception 'PACK_CHAPTER: %', p->'chapter';
  end if;
  if jsonb_array_length(p->'topics') <> 1 or p->'topics'->0->>'title_en' <> 'OP Speed' then
    raise exception 'PACK_TOPICS (retired topic must be left out): %', p->'topics';
  end if;
  if jsonb_array_length(p->'concepts') <> 1 then raise exception 'PACK_CONCEPTS: %', p->'concepts'; end if;
  if jsonb_array_length(p->'lessons') <> 1 then raise exception 'PACK_LESSONS (draft must be left out): %', p->'lessons'; end if;
  l := p->'lessons'->0;
  if (l->>'version')::int <> 1 or l->'blocks'->0->>'en' not like 'Speed is%' then
    raise exception 'PACK_LESSON_VERSION (approved v1, not the newer draft): %', l;
  end if;
  if jsonb_array_length(p->'questions') <> 1 then
    raise exception 'PACK_QUESTIONS (exam-only item must be left out): %', p->'questions';
  end if;
  q := p->'questions'->0;
  if q->>'id' <> '36000000-0000-0000-0000-000000000101' or q->'answer'->>'correct' <> 'A'
     or q->'body'->>'stem' <> 'OP 1' then
    raise exception 'PACK_QUESTION: %', q;
  end if;
  raise notice 'OP-1 pack size: % bytes (1 topic, 1 lesson, 1 item)', octet_length(p::text);

  -- Delta: entries the device holds at the same version come back without content.
  d := public.learn_pack('36000000-0000-0000-0000-0000000000e1',
         jsonb_build_object('l:36000000-0000-0000-0000-0000000001f1', 1,
                            'q:36000000-0000-0000-0000-000000000101', 1));
  if d->'lessons'->0->'blocks' <> 'null'::jsonb or (d->'lessons'->0->>'version')::int <> 1 then
    raise exception 'DELTA_LESSON: %', d->'lessons';
  end if;
  if d->'questions'->0 ? 'body' or d->'questions'->0 ? 'answer' or (d->'questions'->0->>'version')::int <> 1 then
    raise exception 'DELTA_QUESTION: %', d->'questions';
  end if;
  if octet_length(d::text) >= octet_length(p::text) then raise exception 'DELTA_NOT_SMALLER'; end if;
  -- An older held version is sent again.
  d := public.learn_pack('36000000-0000-0000-0000-0000000000e1',
         '{"q:36000000-0000-0000-0000-000000000101": 0}');
  if not (d->'questions'->0 ? 'body') then raise exception 'DELTA_STALE_NOT_RESENT'; end if;

  if public.learn_pack('36000000-0000-0000-0000-00000000ffff') is not null then
    raise exception 'UNKNOWN_CHAPTER_NOT_NULL';
  end if;
end $$;

-- ---- Withdrawn: a revoked approval drops the lesson from the next pack -----------
reset role;
update item_approvals set revoked_at = now(), revoked_by = '36000000-0000-0000-0000-000000000003'
 where item_id = '36000000-0000-0000-0000-0000000001f1';
set role authenticated;
set request.jwt.claim.sub = '36000000-0000-0000-0000-000000000011';
do $$ begin
  if jsonb_array_length(public.learn_pack('36000000-0000-0000-0000-0000000000e1')->'lessons') <> 0 then
    raise exception 'REVOKED_LESSON_STILL_IN_PACK';
  end if;
end $$;

reset role;
drop function public._op_refused(text);
\echo '036 smoke: all checks passed'
