-- Review queue smoke (TEST_PLAN RQ-1, prompt 22). Replays, as signed-in users,
-- what apps/mobile/features/review/api.ts calls: the queue, counts, approve for
-- scopes, edit (new version), request changes, reject, bulk approve. Throwaway
-- local Postgres only. Passes in the production order (setup + 002–016 +
-- 024–026 + 017 + 023 + 031 + 032) and the full dev order (+ 018, 028–030).
-- Every check raises on failure. Without 032 it fails at once (no function).
\set ON_ERROR_STOP 1
reset role;
set request.jwt.claim.sub = '';
grant usage on schema public, auth to authenticated, anon;
grant select, insert, update, delete on all tables in schema public to authenticated, anon;
grant execute on all functions in schema public to authenticated;

-- Fixtures: Class 9 with Maths (T1 teaches it) and Science (nobody here),
-- Class 8 Maths (T2), one Class 9 student, one admin.
update academic_years set is_current = false;
insert into academic_years(id, label, is_current) values
 ('05000000-0000-0000-0000-0000000000a0', 'RQ-2026-27', true);
insert into classes(id, name, grade_level) values
 ('05000000-0000-0000-0000-0000000000c9', 'RQ Class 9', 9),
 ('05000000-0000-0000-0000-0000000000c8', 'RQ Class 8', 8);
insert into subjects(id, class_id, name) values
 ('05000000-0000-0000-0000-0000000000d1', '05000000-0000-0000-0000-0000000000c9', 'RQ Maths'),
 ('05000000-0000-0000-0000-0000000000d2', '05000000-0000-0000-0000-0000000000c9', 'RQ Science'),
 ('05000000-0000-0000-0000-0000000000d3', '05000000-0000-0000-0000-0000000000c8', 'RQ Maths');
insert into chapters(id, subject_id, title, sort_order) values
 ('05000000-0000-0000-0000-0000000000e1', '05000000-0000-0000-0000-0000000000d1', 'RQ Equations', 1),
 ('05000000-0000-0000-0000-0000000000e2', '05000000-0000-0000-0000-0000000000d2', 'RQ Cells', 1),
 ('05000000-0000-0000-0000-0000000000e3', '05000000-0000-0000-0000-0000000000d3', 'RQ Fractions', 1);
insert into topics(id, chapter_id, title_en) values
 ('05000000-0000-0000-0000-0000000000a1', '05000000-0000-0000-0000-0000000000e1', 'RQ Solving'),
 ('05000000-0000-0000-0000-0000000000a2', '05000000-0000-0000-0000-0000000000e2', 'RQ Cell parts'),
 ('05000000-0000-0000-0000-0000000000a3', '05000000-0000-0000-0000-0000000000e3', 'RQ Halves');
insert into concepts(id, topic_id, title_en) values
 ('05000000-0000-0000-0000-0000000000f1', '05000000-0000-0000-0000-0000000000a1', 'RQ Balance'),
 ('05000000-0000-0000-0000-0000000000f4', '05000000-0000-0000-0000-0000000000a1', 'RQ Both sides'),
 ('05000000-0000-0000-0000-0000000000f2', '05000000-0000-0000-0000-0000000000a2', 'RQ Nucleus'),
 ('05000000-0000-0000-0000-0000000000f3', '05000000-0000-0000-0000-0000000000a3', 'RQ Half');
insert into students(id, student_code, full_name) values
 ('05000000-0000-0000-0000-000000000051', 'RQ-1', 'TEST- RQ One');
insert into enrollments(student_id, class_id, year_id, status) values
 ('05000000-0000-0000-0000-000000000051', '05000000-0000-0000-0000-0000000000c9',
  '05000000-0000-0000-0000-0000000000a0', 'active');
insert into auth.users(id, email) values
 ('05000000-0000-0000-0000-000000000001', 'rq.t1@school.test'),
 ('05000000-0000-0000-0000-000000000002', 'rq.t2@school.test'),
 ('05000000-0000-0000-0000-000000000003', 'rq.admin@school.test'),
 ('05000000-0000-0000-0000-000000000011', 'rq1@students.school.invalid');
update profiles set role = 'teacher'
 where id in ('05000000-0000-0000-0000-000000000001', '05000000-0000-0000-0000-000000000002');
update profiles set role = 'admin' where id = '05000000-0000-0000-0000-000000000003';
update profiles set role = 'student', student_id = '05000000-0000-0000-0000-000000000051'
 where id = '05000000-0000-0000-0000-000000000011';
insert into teacher_assignments(teacher_id, class_id, subject_id, year_id) values
 ('05000000-0000-0000-0000-000000000001', '05000000-0000-0000-0000-0000000000c9',
  '05000000-0000-0000-0000-0000000000d1', '05000000-0000-0000-0000-0000000000a0'),
 ('05000000-0000-0000-0000-000000000002', '05000000-0000-0000-0000-0000000000c8',
  '05000000-0000-0000-0000-0000000000d3', '05000000-0000-0000-0000-0000000000a0');

-- Drafts as the importer leaves them (status draft, version 1, AI origin).
-- q1..q3 Maths (q3 untagged), q4 Science, q5 Class 8, q6 Maths on a published paper.
insert into questions(id, chapter_id, concept_id, type, cognitive_level, body, answer, explanation,
                      status, origin, created_by, is_test_data) values
 ('05000000-0000-0000-0000-000000000091', '05000000-0000-0000-0000-0000000000e1',
  '05000000-0000-0000-0000-0000000000f1', 'mcq', 'apply',
  '{"stem":{"en":"Solve 2x + 3 = 7","ur":"حل کریں"},"options":[{"key":"A","text":{"en":"x = 2","ur":"x = 2"}},{"key":"B","text":{"en":"x = 5","ur":"x = 5"}}]}',
  '{"correct":"A"}', '{"en":"Subtract 3.","ur":"3 منفی کریں۔"}', 'draft', 'ai',
  '05000000-0000-0000-0000-000000000002', true),
 ('05000000-0000-0000-0000-000000000092', '05000000-0000-0000-0000-0000000000e1',
  '05000000-0000-0000-0000-0000000000f4', 'true_false', 'recall',
  '{"stem":{"en":"Adding 5 to both sides is allowed","ur":"ہاں"}}', '{"correct":true}', null,
  'draft', 'ai', null, true),
 ('05000000-0000-0000-0000-000000000093', '05000000-0000-0000-0000-0000000000e1',
  null, 'numeric', 'apply', '{"stem":{"en":"Solve 5x = 10"}}', '{"correct":2}', null,
  'draft', 'human', null, true),
 ('05000000-0000-0000-0000-000000000094', '05000000-0000-0000-0000-0000000000e2',
  '05000000-0000-0000-0000-0000000000f2', 'true_false', 'recall',
  '{"stem":{"en":"Cells have a nucleus","ur":"خلیہ"}}', '{"correct":true}', null, 'draft', 'ai', null, true),
 ('05000000-0000-0000-0000-000000000095', '05000000-0000-0000-0000-0000000000e3',
  '05000000-0000-0000-0000-0000000000f3', 'true_false', 'recall',
  '{"stem":{"en":"Half of 4 is 2","ur":"آدھا"}}', '{"correct":true}', null, 'draft', 'ai', null, true),
 ('05000000-0000-0000-0000-000000000096', '05000000-0000-0000-0000-0000000000e1',
  '05000000-0000-0000-0000-0000000000f1', 'true_false', 'recall',
  '{"stem":{"en":"x = x","ur":"x = x"}}', '{"correct":true}', null, 'draft', 'human', null, true);
insert into assessments(id, year_id, class_id, subject_id, title, status) values
 ('05000000-0000-0000-0000-0000000000b9', '05000000-0000-0000-0000-0000000000a0',
  '05000000-0000-0000-0000-0000000000c9', '05000000-0000-0000-0000-0000000000d1', 'RQ test', 'published');
insert into assessment_questions(assessment_id, question_id) values
 ('05000000-0000-0000-0000-0000000000b9', '05000000-0000-0000-0000-000000000096');

create or replace function public._rq_refused(p_sql text, p_expect text default null) returns boolean
language plpgsql as $$
begin
  execute p_sql;
  return false;
exception when others then
  if p_expect is not null and sqlerrm <> p_expect then
    raise exception 'RQ_WRONG_ERROR: expected %, got %', p_expect, sqlerrm;
  end if;
  return true;
end $$;
create or replace function public._rq_rows(p_sql text) returns int
language plpgsql as $$
declare n int;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function public._rq_refused(text, text), public._rq_rows(text) to authenticated, anon;

-- ---- T1 (Class 9 Maths) reads the queue ---------------------------------------
set role authenticated;
set request.jwt.claim.sub = '05000000-0000-0000-0000-000000000001';
do $$
declare n int; c jsonb; can boolean;
begin
  select count(*) into n from public.review_queue('05000000-0000-0000-0000-0000000000d1');
  if n <> 4 then raise exception 'QUEUE_COUNT: % (want 4 Maths drafts)', n; end if;
  select can_review into can from public.review_queue('05000000-0000-0000-0000-0000000000d1')
   where id = '05000000-0000-0000-0000-000000000093';
  if can then raise exception 'UNTAGGED_REVIEWABLE_BY_TEACHER'; end if;
  select in_use into can from public.review_queue('05000000-0000-0000-0000-0000000000d1')
   where id = '05000000-0000-0000-0000-000000000096';
  if not can then raise exception 'IN_USE_NOT_FLAGGED'; end if;
  select count(*) into n from public.review_queue('05000000-0000-0000-0000-0000000000d1',
    p_topic => '05000000-0000-0000-0000-0000000000a1');
  if n <> 3 then raise exception 'TOPIC_FILTER: %', n; end if;
  c := public.review_counts('05000000-0000-0000-0000-0000000000d1');
  if (c->>'to_review')::int <> 4 or (c->>'approved')::int <> 0 then raise exception 'COUNTS: %', c; end if;

  -- No direct writes to approvals or the review log any more (017 allowed them).
  if not public._rq_refused($q$insert into public.item_approvals(item_kind, item_id, version, scope, approved_by)
       values ('question', '05000000-0000-0000-0000-000000000094', 1, 'practice',
               '05000000-0000-0000-0000-000000000001')$q$) then
    raise exception 'DIRECT_APPROVAL_INSERT_ALLOWED';
  end if;
  if not public._rq_refused($q$insert into public.item_reviews(item_kind, item_id, version, reviewer_id, decision)
       values ('question', '05000000-0000-0000-0000-000000000094', 1,
               '05000000-0000-0000-0000-000000000001', 'approve')$q$) then
    raise exception 'DIRECT_REVIEW_INSERT_ALLOWED';
  end if;

  -- Not their subject (Science, same class) or class (Class 8): refused.
  if not public._rq_refused($q$select public.review_question('05000000-0000-0000-0000-000000000094', 1,
       'approve', array['practice'])$q$, 'review_forbidden') then
    raise exception 'TEACHER_APPROVED_OTHER_SUBJECT';
  end if;
  if not public._rq_refused($q$select public.review_question('05000000-0000-0000-0000-000000000095', 1,
       'approve', array['practice'])$q$, 'review_forbidden') then
    raise exception 'TEACHER_APPROVED_OTHER_CLASS';
  end if;
  if not public._rq_refused($q$select public.review_edit_question('05000000-0000-0000-0000-000000000094', 1,
       '{"difficulty":3}')$q$, 'review_forbidden') then
    raise exception 'TEACHER_EDITED_OTHER_SUBJECT';
  end if;
  -- Untagged question: a teacher can't approve or tag it (staff tag it).
  if not public._rq_refused($q$select public.review_question('05000000-0000-0000-0000-000000000093', 1,
       'approve', array['practice'])$q$, 'review_forbidden') then
    raise exception 'TEACHER_APPROVED_UNTAGGED';
  end if;
  -- Bad input
  if not public._rq_refused($q$select public.review_question('05000000-0000-0000-0000-000000000091', 1,
       'approve', array['homework'])$q$, 'review_scopes') then
    raise exception 'BAD_SCOPE_ACCEPTED';
  end if;
  if not public._rq_refused($q$select public.review_question('05000000-0000-0000-0000-000000000091', 1,
       'approve', array[]::text[])$q$, 'review_scopes') then
    raise exception 'EMPTY_SCOPES_ACCEPTED';
  end if;
  if not public._rq_refused($q$select public.review_question('05000000-0000-0000-0000-000000000091', 2,
       'approve', array['practice'])$q$, 'review_stale_version') then
    raise exception 'STALE_VERSION_ACCEPTED';
  end if;
  if not public._rq_refused($q$select public.review_question('05000000-0000-0000-0000-000000000091', 1,
       'reject', null, null, '  ')$q$, 'review_reason_required') then
    raise exception 'REJECT_WITHOUT_REASON';
  end if;
  -- On a published paper: can't be edited from the queue.
  if not public._rq_refused($q$select public.review_edit_question('05000000-0000-0000-0000-000000000096', 1,
       '{"difficulty":3}')$q$, 'review_in_use') then
    raise exception 'IN_USE_EDITED';
  end if;
end $$;

-- Nothing approved yet: the student reads no version.
set request.jwt.claim.sub = '05000000-0000-0000-0000-000000000011';
do $$
declare n int;
begin
  select count(*) into n from public.question_versions
   where question_id::text like '05000000-%';
  if n <> 0 then raise exception 'STUDENT_READS_DRAFT_VERSION: %', n; end if;
  if not public._rq_refused($q$select public.review_question('05000000-0000-0000-0000-000000000091', 1,
       'approve', array['practice'])$q$, 'review_forbidden') then
    raise exception 'STUDENT_APPROVED';
  end if;
  select count(*) into n from public.review_queue('05000000-0000-0000-0000-0000000000d1');
  if n <> 0 and to_regprocedure('public.student_paper(uuid)') is not null then
    -- After 018 students read no questions at all.
    raise exception 'STUDENT_READS_QUEUE: %', n;
  end if;
end $$;

-- ---- T1 approves, then edits: the approval drops for the new version --------
set request.jwt.claim.sub = '05000000-0000-0000-0000-000000000001';
do $$
declare r jsonb;
begin
  r := public.review_question('05000000-0000-0000-0000-000000000091', 1, 'approve',
         array['practice', 'learn', 'practice'], true, null);
  if r->>'status' <> 'approved' or r->'scopes' <> '["learn", "practice"]'::jsonb then
    raise exception 'APPROVE_RESULT: %', r;
  end if;
  -- Change scopes: exam + worksheet only (practice and learn revoked).
  r := public.review_question('05000000-0000-0000-0000-000000000091', 1, 'approve',
         array['worksheet', 'exam'], false, 'Urdu option wording is stiff');
  if r->'scopes' <> '["exam", "worksheet"]'::jsonb then raise exception 'RESCOPE: %', r; end if;
  if not public.is_approved('question', '05000000-0000-0000-0000-000000000091', 'worksheet') then
    raise exception 'IS_APPROVED_FALSE';
  end if;
  if public.is_approved('question', '05000000-0000-0000-0000-000000000091', 'practice') then
    raise exception 'REVOKED_SCOPE_STILL_APPROVED';
  end if;
  -- Revoked approvals can't be revived, and nothing is deleted.
  if public._rq_rows($q$update public.item_approvals set revoked_at = null
       where item_id = '05000000-0000-0000-0000-000000000091'$q$) <> 0 then
    raise exception 'TEACHER_REVIVED_APPROVAL';
  end if;
  if public._rq_rows($q$delete from public.item_approvals
       where item_id = '05000000-0000-0000-0000-000000000091'$q$) <> 0 then
    raise exception 'TEACHER_DELETED_APPROVAL';
  end if;
  if public._rq_rows($q$delete from public.item_reviews
       where item_id = '05000000-0000-0000-0000-000000000091'$q$) <> 0 then
    raise exception 'TEACHER_DELETED_REVIEW';
  end if;
end $$;

-- Student reads the approved version 1 (worksheet scope), with its answer.
set request.jwt.claim.sub = '05000000-0000-0000-0000-000000000011';
do $$
declare n int; a jsonb;
begin
  select count(*), max(answer::text)::jsonb into n, a from public.question_versions
   where question_id = '05000000-0000-0000-0000-000000000091';
  if n <> 1 or a->>'correct' <> 'A' then raise exception 'STUDENT_CANT_READ_APPROVED: % %', n, a; end if;
end $$;

-- An exam-only approval is not readable by students.
set request.jwt.claim.sub = '05000000-0000-0000-0000-000000000001';
select public.review_question('05000000-0000-0000-0000-000000000092', 1, 'approve', array['exam'], true);
set request.jwt.claim.sub = '05000000-0000-0000-0000-000000000011';
do $$
declare n int;
begin
  select count(*) into n from public.question_versions
   where question_id = '05000000-0000-0000-0000-000000000092';
  if n <> 0 then raise exception 'STUDENT_READS_EXAM_ONLY_VERSION'; end if;
end $$;

-- Edit → version 2, approval dropped, status draft, origin ai_edited.
set request.jwt.claim.sub = '05000000-0000-0000-0000-000000000001';
do $$
declare r jsonb; q record; n int;
begin
  r := public.review_edit_question('05000000-0000-0000-0000-000000000091', 1,
         jsonb_build_object('body', '{"stem":{"en":"Solve 2x + 3 = 9","ur":"حل کریں"},"options":[{"key":"A","text":{"en":"x = 3","ur":"x = 3"}},{"key":"B","text":{"en":"x = 5","ur":"x = 5"}}]}'::jsonb,
                            'concept_id', '05000000-0000-0000-0000-0000000000f4'));
  if (r->>'version')::int <> 2 or r->>'status' <> 'draft' then raise exception 'EDIT_RESULT: %', r; end if;
  select status, origin, current_version, concept_id into q from public.questions
   where id = '05000000-0000-0000-0000-000000000091';
  if q.origin <> 'ai_edited' or q.concept_id <> '05000000-0000-0000-0000-0000000000f4' then
    raise exception 'EDIT_STATE: %', q;
  end if;
  select count(*) into n from public.item_approvals
   where item_id = '05000000-0000-0000-0000-000000000091' and revoked_at is null;
  if n <> 0 then raise exception 'APPROVAL_SURVIVED_EDIT: %', n; end if;
  if public.is_approved('question', '05000000-0000-0000-0000-000000000091', 'worksheet') then
    raise exception 'IS_APPROVED_AFTER_EDIT';
  end if;
  -- Version 1 stays (history is never rewritten).
  select count(*) into n from public.question_versions
   where question_id = '05000000-0000-0000-0000-000000000091';
  if n <> 2 then raise exception 'VERSIONS: %', n; end if;
  -- Back in "to review"; the old version can't be approved now.
  if not exists (select 1 from public.review_queue('05000000-0000-0000-0000-0000000000d1')
                  where id = '05000000-0000-0000-0000-000000000091' and version = 2
                    and scopes = '{}') then
    raise exception 'EDITED_NOT_IN_QUEUE';
  end if;
  if not public._rq_refused($q$select public.review_question('05000000-0000-0000-0000-000000000091', 1,
       'approve', array['practice'])$q$, 'review_stale_version') then
    raise exception 'OLD_VERSION_APPROVED';
  end if;
  -- Moving to a concept in another chapter, or a Science concept: refused.
  if not public._rq_refused($q$select public.review_edit_question('05000000-0000-0000-0000-000000000091', 2,
       '{"concept_id":"05000000-0000-0000-0000-0000000000f2"}')$q$, 'review_bad_concept') then
    raise exception 'MOVED_TO_FOREIGN_CONCEPT';
  end if;
  if not public._rq_refused($q$select public.review_edit_question('05000000-0000-0000-0000-000000000091', 2,
       '{"status":"approved"}')$q$, 'review_bad_patch') then
    raise exception 'PATCH_SET_STATUS';
  end if;
  -- A no-op edit keeps the version.
  r := public.review_edit_question('05000000-0000-0000-0000-000000000091', 2, '{}');
  if (r->>'changed')::boolean then raise exception 'NOOP_EDIT_BUMPED'; end if;
end $$;

-- Student: version 1 is no longer readable (its approval was revoked), version 2 never was.
set request.jwt.claim.sub = '05000000-0000-0000-0000-000000000011';
do $$
declare n int;
begin
  select count(*) into n from public.question_versions
   where question_id = '05000000-0000-0000-0000-000000000091';
  if n <> 0 then raise exception 'STUDENT_READS_UNAPPROVED_AFTER_EDIT: %', n; end if;
end $$;

-- An edit through the question table itself (question bank path) also drops it.
set request.jwt.claim.sub = '05000000-0000-0000-0000-000000000001';
select public.review_question('05000000-0000-0000-0000-000000000091', 2, 'approve', array['practice'], true);
reset role;
update public.questions set difficulty = 3 where id = '05000000-0000-0000-0000-000000000091';
do $$
begin
  if exists (select 1 from public.item_approvals
              where item_id = '05000000-0000-0000-0000-000000000091' and revoked_at is null) then
    raise exception 'TABLE_EDIT_KEPT_APPROVAL';
  end if;
  if (select status from public.questions where id = '05000000-0000-0000-0000-000000000091') <> 'draft' then
    raise exception 'TABLE_EDIT_KEPT_STATUS';
  end if;
end $$;
set role authenticated;

-- ---- Request changes, reject, bulk -------------------------------------------
do $$
declare r jsonb; c jsonb; n int;
begin
  r := public.review_question('05000000-0000-0000-0000-000000000092', 1, 'request_changes',
         null, false, 'Urdu stem is one word');
  if r->>'status' <> 'draft' or r->'scopes' <> '[]'::jsonb then raise exception 'CHANGES: %', r; end if;
  if not exists (select 1 from public.review_queue('05000000-0000-0000-0000-0000000000d1', p_status => 'changes')
                  where id = '05000000-0000-0000-0000-000000000092'
                    and last_decision = 'request_changes' and last_notes = 'Urdu stem is one word') then
    raise exception 'CHANGES_TAB';
  end if;
  if exists (select 1 from public.review_queue('05000000-0000-0000-0000-0000000000d1')
              where id = '05000000-0000-0000-0000-000000000092') then
    raise exception 'CHANGES_STILL_TO_REVIEW';
  end if;
  -- Bulk: q91 (v3) approves; q92 approves too; q93 (untagged) and q94 (Science) are skipped.
  r := public.review_approve_many(jsonb_build_array(
         jsonb_build_object('id', '05000000-0000-0000-0000-000000000091', 'version', 3),
         jsonb_build_object('id', '05000000-0000-0000-0000-000000000092', 'version', 1),
         jsonb_build_object('id', '05000000-0000-0000-0000-000000000093', 'version', 1),
         jsonb_build_object('id', '05000000-0000-0000-0000-000000000094', 'version', 1)),
       array['practice', 'worksheet'], true);
  if (r->>'approved')::int <> 2 or jsonb_array_length(r->'skipped') <> 2 then
    raise exception 'BULK: %', r;
  end if;
  if not public._rq_refused($q$select public.review_approve_many('[{"id":"05000000-0000-0000-0000-000000000092","version":1}]',
       array['nope'])$q$, 'review_scopes') then
    raise exception 'BULK_BAD_SCOPE';
  end if;
  -- Reject retires (kept) and revokes.
  r := public.review_question('05000000-0000-0000-0000-000000000092', 1, 'reject', null, null, 'Wrong concept');
  if r->>'status' <> 'retired' or r->'scopes' <> '[]'::jsonb then raise exception 'REJECT: %', r; end if;
  if not public._rq_refused($q$select public.review_question('05000000-0000-0000-0000-000000000092', 1,
       'approve', array['practice'])$q$, 'review_retired') then
    raise exception 'RETIRED_APPROVED';
  end if;
  c := public.review_counts('05000000-0000-0000-0000-0000000000d1');
  if (c->>'approved')::int <> 1 or (c->>'retired')::int <> 1 or (c->>'to_review')::int <> 2 then
    raise exception 'COUNTS_AFTER: %', c;
  end if;
  select count(*) into n from public.item_reviews where item_id::text like '05000000-%';
  if n < 6 then raise exception 'REVIEW_LOG: %', n; end if;
end $$;

-- Retiring through the table (031's retire_import_batch path) revokes too.
reset role;
update public.questions set status = 'retired' where id = '05000000-0000-0000-0000-000000000091';
do $$
begin
  if exists (select 1 from public.item_approvals
              where item_id = '05000000-0000-0000-0000-000000000091' and revoked_at is null) then
    raise exception 'RETIRE_KEPT_APPROVAL';
  end if;
end $$;

-- ---- Staff: any subject, can tag an untagged question -------------------------
set role authenticated;
set request.jwt.claim.sub = '05000000-0000-0000-0000-000000000003';
do $$
declare r jsonb;
begin
  if not public._rq_refused($q$select public.review_question('05000000-0000-0000-0000-000000000093', 1,
       'approve', array['practice'])$q$, 'review_concept_required') then
    raise exception 'UNTAGGED_APPROVED';
  end if;
  r := public.review_edit_question('05000000-0000-0000-0000-000000000093', 1,
         '{"concept_id":"05000000-0000-0000-0000-0000000000f1"}');
  r := public.review_question('05000000-0000-0000-0000-000000000093', (r->>'version')::int, 'approve',
         array['practice']);
  if r->>'status' <> 'approved' then raise exception 'ADMIN_TAG_APPROVE: %', r; end if;
  r := public.review_question('05000000-0000-0000-0000-000000000094', 1, 'approve', array['learn']);
  if r->>'status' <> 'approved' then raise exception 'ADMIN_OTHER_SUBJECT: %', r; end if;
end $$;
-- T2 (Class 8) sees Class 9 drafts only as far as RLS lets them, and can't decide.
set request.jwt.claim.sub = '05000000-0000-0000-0000-000000000002';
do $$
begin
  if exists (select 1 from public.review_queue('05000000-0000-0000-0000-0000000000d1') where can_review) then
    raise exception 'T2_CAN_REVIEW_CLASS9';
  end if;
  if public.review_question('05000000-0000-0000-0000-000000000095', 1, 'approve',
       array['practice'])->>'status' <> 'approved' then
    raise exception 'T2_OWN_CLASS';
  end if;
end $$;

reset role;
set request.jwt.claim.sub = '';
-- The SQL Editor can still fix a mistake by revoking, never by deleting.
do $$
begin
  if not public._rq_refused($q$delete from public.item_approvals
       where item_id = '05000000-0000-0000-0000-000000000095'$q$) then
    raise exception 'OWNER_DELETED_APPROVAL';
  end if;
end $$;
drop function if exists public._rq_refused(text, text);
drop function if exists public._rq_rows(text);
select 'RQ-1 OK' as result;
