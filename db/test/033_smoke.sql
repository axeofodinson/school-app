-- Lesson review + student lesson reads smoke (TEST_PLAN LS-1, prompt 30).
-- Replays, as signed-in users, what apps/mobile/features/learn/api.ts does:
-- the student's lesson read (learning_content → approval → that version) and
-- the teacher preview's review_lesson() decisions. Throwaway local Postgres
-- only. Passes after 017 + 023 (+ 031, 032 when present) + 033.
-- Every check raises on failure. Without 033 it fails at once (no function).
\set ON_ERROR_STOP 1
reset role;
set request.jwt.claim.sub = '';
grant usage on schema public, auth to authenticated, anon;
grant select, insert, update, delete on all tables in schema public to authenticated, anon;
grant execute on all functions in schema public to authenticated;

-- Fixtures: Class 9 Science (T1 teaches it this year) + Class 8 Science (T2),
-- one Class 9 student, one admin. One lesson with two versions.
update academic_years set is_current = false;
insert into academic_years(id, label, is_current) values
 ('05000000-0000-0000-0000-0000000000a0', 'LS-2026-27', true);
insert into classes(id, name, grade_level) values
 ('05000000-0000-0000-0000-0000000000c9', 'LS Class 9', 9),
 ('05000000-0000-0000-0000-0000000000c8', 'LS Class 8', 8);
insert into subjects(id, class_id, name) values
 ('05000000-0000-0000-0000-0000000000d1', '05000000-0000-0000-0000-0000000000c9', 'LS Science'),
 ('05000000-0000-0000-0000-0000000000d3', '05000000-0000-0000-0000-0000000000c8', 'LS Science');
insert into chapters(id, subject_id, title, sort_order) values
 ('05000000-0000-0000-0000-0000000000e1', '05000000-0000-0000-0000-0000000000d1', 'LS Cells', 1),
 ('05000000-0000-0000-0000-0000000000e3', '05000000-0000-0000-0000-0000000000d3', 'LS Plants', 1);
insert into topics(id, chapter_id, title_en) values
 ('05000000-0000-0000-0000-0000000000b1', '05000000-0000-0000-0000-0000000000e1', 'LS Parts of a cell'),
 ('05000000-0000-0000-0000-0000000000b3', '05000000-0000-0000-0000-0000000000e3', 'LS Leaves');
insert into students(id, student_code, full_name) values
 ('05000000-0000-0000-0000-000000000051', 'LS-1', 'TEST- LS One');
insert into enrollments(student_id, class_id, year_id, status) values
 ('05000000-0000-0000-0000-000000000051', '05000000-0000-0000-0000-0000000000c9',
  '05000000-0000-0000-0000-0000000000a0', 'active');
insert into auth.users(id, email) values
 ('05000000-0000-0000-0000-000000000001', 'ls.t1@school.test'),
 ('05000000-0000-0000-0000-000000000002', 'ls.t2@school.test'),
 ('05000000-0000-0000-0000-000000000003', 'ls.admin@school.test'),
 ('05000000-0000-0000-0000-000000000011', 'ls1@students.school.invalid');
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

insert into learning_content(id, topic_id, kind, current_version, status, is_test_data) values
 ('05000000-0000-0000-0000-0000000000f1', '05000000-0000-0000-0000-0000000000b1', 'lesson', 2, 'draft', true),
 ('05000000-0000-0000-0000-0000000000f3', '05000000-0000-0000-0000-0000000000b3', 'lesson', 1, 'draft', true);
insert into learning_content_versions(content_id, version, blocks) values
 ('05000000-0000-0000-0000-0000000000f1', 1, '[{"type":"simple","en":"old"}]'),
 ('05000000-0000-0000-0000-0000000000f1', 2, '[{"type":"simple","en":"new"}]'),
 ('05000000-0000-0000-0000-0000000000f3', 1, '[{"type":"simple","en":"leaf"}]');

create or replace function public._ls_refused(p_sql text, p_like text default '%') returns boolean
language plpgsql as $$
begin
  execute p_sql;
  return false;
exception when others then
  return sqlerrm like p_like;
end $$;
create or replace function public._ls_count(p_sql text) returns int
language plpgsql as $$
declare n int;
begin
  execute 'select count(*) from (' || p_sql || ') x' into n;
  return n;
end $$;
grant execute on function public._ls_refused(text, text), public._ls_count(text) to authenticated, anon;

-- What the student's reader asks for (features/learn/api.ts).
create or replace function public._ls_student_sees(p_version int) returns int
language sql as $$
  select public._ls_count(format(
    'select 1 from learning_content_versions where content_id = %L and version = %s',
    '05000000-0000-0000-0000-0000000000f1', p_version))
$$;
grant execute on function public._ls_student_sees(int) to authenticated;

-- ---- Before any review: the student sees nothing -----------------------------
set role authenticated;
set request.jwt.claim.sub = '05000000-0000-0000-0000-000000000011';
do $$ begin
  if public._ls_count('select 1 from learning_content') <> 0 then raise exception 'STUDENT_SAW_DRAFT_LESSON'; end if;
  if public._ls_student_sees(2) + public._ls_student_sees(1) <> 0 then raise exception 'STUDENT_SAW_DRAFT_VERSION'; end if;
  if not public._ls_refused($q$select public.review_lesson('05000000-0000-0000-0000-0000000000f1', 2, 'approve')$q$, 'review_forbidden') then
    raise exception 'STUDENT_REVIEWED_LESSON';
  end if;
end $$;

-- ---- A teacher of another class can't decide on it ---------------------------
set request.jwt.claim.sub = '05000000-0000-0000-0000-000000000002';
do $$ begin
  if not public._ls_refused($q$select public.review_lesson('05000000-0000-0000-0000-0000000000f1', 2, 'approve')$q$, 'review_forbidden') then
    raise exception 'OTHER_TEACHER_APPROVED';
  end if;
end $$;

-- ---- The subject teacher approves the current version -------------------------
set request.jwt.claim.sub = '05000000-0000-0000-0000-000000000001';
do $$
declare r jsonb;
begin
  if public._ls_count('select 1 from learning_content') < 1 then raise exception 'TEACHER_CANT_PREVIEW_DRAFT'; end if;
  if public._ls_count($q$select 1 from learning_content_versions where content_id = '05000000-0000-0000-0000-0000000000f1'$q$) <> 2 then
    raise exception 'TEACHER_CANT_READ_DRAFT_VERSIONS';
  end if;
  if not public._ls_refused($q$select public.review_lesson('05000000-0000-0000-0000-0000000000f1', 1, 'approve')$q$, 'review_stale_version') then
    raise exception 'STALE_VERSION_APPROVED';
  end if;
  if not public._ls_refused($q$select public.review_lesson('05000000-0000-0000-0000-0000000000f1', 2, 'maybe')$q$, 'review_bad_decision') then
    raise exception 'BAD_DECISION_TAKEN';
  end if;
  r := public.review_lesson('05000000-0000-0000-0000-0000000000f1', 2, 'approve', true, '  ');
  if r->>'status' <> 'approved' then raise exception 'APPROVE_STATUS %', r; end if;
  -- Approving twice keeps one live approval.
  perform public.review_lesson('05000000-0000-0000-0000-0000000000f1', 2, 'approve');
end $$;
reset role;
do $$ begin
  if (select count(*) from item_approvals where item_kind = 'content'
        and item_id = '05000000-0000-0000-0000-0000000000f1' and revoked_at is null) <> 1 then
    raise exception 'ONE_LIVE_APPROVAL_EXPECTED';
  end if;
  if (select version from item_approvals where item_kind = 'content'
        and item_id = '05000000-0000-0000-0000-0000000000f1' and revoked_at is null) <> 2 then
    raise exception 'APPROVAL_WRONG_VERSION';
  end if;
  if (select count(*) from item_reviews where item_kind = 'content'
        and item_id = '05000000-0000-0000-0000-0000000000f1') <> 2 then
    raise exception 'REVIEW_NOT_LOGGED';
  end if;
  if (select notes from item_reviews where item_kind = 'content' order by created_at limit 1) is not null then
    raise exception 'BLANK_NOTE_STORED';
  end if;
end $$;

-- ---- The student reads exactly the approved version ---------------------------
set role authenticated;
set request.jwt.claim.sub = '05000000-0000-0000-0000-000000000011';
do $$ begin
  if public._ls_count($q$select 1 from learning_content where status = 'approved'$q$) <> 1 then raise exception 'STUDENT_CANT_SEE_LESSON'; end if;
  if public._ls_count($q$select 1 from item_approvals where item_kind = 'content' and scope = 'learn' and revoked_at is null$q$) <> 1 then
    raise exception 'STUDENT_CANT_SEE_APPROVAL';
  end if;
  if public._ls_student_sees(2) <> 1 then raise exception 'STUDENT_CANT_READ_APPROVED_VERSION'; end if;
  if public._ls_student_sees(1) <> 0 then raise exception 'STUDENT_READ_UNAPPROVED_VERSION'; end if;
end $$;

-- ---- An edit (new version) stays hidden until it is approved -------------------
set request.jwt.claim.sub = '05000000-0000-0000-0000-000000000001';
insert into learning_content_versions(content_id, version, blocks) values
 ('05000000-0000-0000-0000-0000000000f1', 3, '[{"type":"simple","en":"edited"}]');
update learning_content set current_version = 3 where id = '05000000-0000-0000-0000-0000000000f1';
set request.jwt.claim.sub = '05000000-0000-0000-0000-000000000011';
do $$ begin
  if public._ls_student_sees(3) <> 0 then raise exception 'STUDENT_READ_UNREVIEWED_EDIT'; end if;
  if public._ls_student_sees(2) <> 1 then raise exception 'STUDENT_LOST_APPROVED_VERSION'; end if;
end $$;

-- ---- Send back: a reason is required; the student loses it --------------------
set request.jwt.claim.sub = '05000000-0000-0000-0000-000000000001';
do $$
declare r jsonb;
begin
  if not public._ls_refused($q$select public.review_lesson('05000000-0000-0000-0000-0000000000f1', 3, 'request_changes', null, '   ')$q$, 'review_reason_required') then
    raise exception 'SENT_BACK_WITHOUT_REASON';
  end if;
  r := public.review_lesson('05000000-0000-0000-0000-0000000000f1', 3, 'request_changes', false, 'Urdu caption 2 is missing');
  if r->>'status' <> 'draft' then raise exception 'SEND_BACK_STATUS %', r; end if;
end $$;
set request.jwt.claim.sub = '05000000-0000-0000-0000-000000000011';
do $$ begin
  if public._ls_count('select 1 from learning_content') <> 0 then raise exception 'STUDENT_SEES_SENT_BACK_LESSON'; end if;
  if public._ls_student_sees(2) + public._ls_student_sees(3) <> 0 then raise exception 'STUDENT_READS_SENT_BACK_VERSION'; end if;
end $$;

-- ---- Approve v3, then a newer approval revokes it; reject retires --------------
set request.jwt.claim.sub = '05000000-0000-0000-0000-000000000001';
do $$
declare r jsonb;
begin
  perform public.review_lesson('05000000-0000-0000-0000-0000000000f1', 3, 'approve');
  r := public.review_lesson('05000000-0000-0000-0000-0000000000f1', 3, 'reject', null, 'Wrong chapter');
  if r->>'status' <> 'retired' then raise exception 'REJECT_STATUS %', r; end if;
  if not public._ls_refused($q$select public.review_lesson('05000000-0000-0000-0000-0000000000f1', 3, 'approve')$q$, 'review_retired') then
    raise exception 'RETIRED_LESSON_APPROVED';
  end if;
  if not public._ls_refused($q$select public.review_lesson('05000000-0000-0000-0000-0000000000ff', 1, 'approve')$q$, 'review_not_found') then
    raise exception 'MISSING_LESSON_ACCEPTED';
  end if;
end $$;
set request.jwt.claim.sub = '05000000-0000-0000-0000-000000000011';
do $$ begin
  if public._ls_student_sees(3) <> 0 then raise exception 'STUDENT_READS_RETIRED_LESSON'; end if;
end $$;

-- ---- The admin decides on any subject; the teacher can't on Class 8 ------------
set request.jwt.claim.sub = '05000000-0000-0000-0000-000000000001';
do $$ begin
  if not public._ls_refused($q$select public.review_lesson('05000000-0000-0000-0000-0000000000f3', 1, 'approve')$q$, 'review_forbidden') then
    raise exception 'TEACHER_APPROVED_OTHER_SUBJECT';
  end if;
end $$;
set request.jwt.claim.sub = '05000000-0000-0000-0000-000000000003';
do $$ begin
  if (public.review_lesson('05000000-0000-0000-0000-0000000000f3', 1, 'approve'))->>'status' <> 'approved' then
    raise exception 'ADMIN_COULD_NOT_APPROVE';
  end if;
end $$;

reset role;
do $$ begin
  if (select count(*) from item_approvals where item_kind = 'content'
        and item_id = '05000000-0000-0000-0000-0000000000f1' and revoked_at is null) <> 0 then
    raise exception 'RETIRED_LESSON_STILL_APPROVED';
  end if;
  if (select count(*) from item_reviews where item_kind = 'content'
        and item_id = '05000000-0000-0000-0000-0000000000f1') <> 5 then
    raise exception 'REVIEW_LOG_COUNT';
  end if;
  if (select count(*) from learning_content_versions where content_id = '05000000-0000-0000-0000-0000000000f1') <> 3 then
    raise exception 'VERSION_LOST';
  end if;
end $$;

drop function public._ls_student_sees(int);
drop function public._ls_refused(text, text);
drop function public._ls_count(text);
select 'LS-1 033 lesson review smoke: PASS' as result;
