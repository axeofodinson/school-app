-- Curriculum RLS matrix (TEST_PLAN DB-2 / CU-1, prompt 20). Replays, as each
-- role, the writes apps/mobile/features/curriculum/api.ts makes, plus the ones
-- 017 must refuse. Throwaway local Postgres only. Passes in production order
-- (setup + 002–016 + 024–026 + 017, with or without 023) and in the dev order
-- (+ 018, 028–030), on its own or after the other smokes.
-- Every check raises on failure.
\set ON_ERROR_STOP 1
reset role;
set request.jwt.claim.sub = '';
grant usage on schema public, auth to authenticated, anon;
grant select, insert, update, delete on all tables in schema public to authenticated, anon;
grant execute on all functions in schema public to authenticated;

-- Fixtures -------------------------------------------------------------------
-- This year: Class 9 (Maths, Physics), Class 8 (Maths). Last year: T1 taught
-- Class 9 Physics. T1 teaches Class 9 Maths now; T2 teaches Class 8 (whole
-- class, subject null). S1 is a Class 9 student.
update academic_years set is_current = false;
insert into academic_years(id, label, is_current) values
 ('02000000-0000-0000-0000-0000000000a0', 'CU-2026-27', true),
 ('02000000-0000-0000-0000-0000000000a9', 'CU-2025-26', false);
insert into classes(id, name, grade_level) values
 ('02000000-0000-0000-0000-0000000000c9', 'CU Class 9', 9),
 ('02000000-0000-0000-0000-0000000000c8', 'CU Class 8', 8);
insert into subjects(id, class_id, name) values
 ('02000000-0000-0000-0000-0000000000d1', '02000000-0000-0000-0000-0000000000c9', 'CU Maths'),
 ('02000000-0000-0000-0000-0000000000d2', '02000000-0000-0000-0000-0000000000c9', 'CU Physics'),
 ('02000000-0000-0000-0000-0000000000d3', '02000000-0000-0000-0000-0000000000c8', 'CU Maths');
insert into chapters(id, subject_id, title, sort_order) values
 ('02000000-0000-0000-0000-0000000000e1', '02000000-0000-0000-0000-0000000000d1', 'Sets', 1),
 ('02000000-0000-0000-0000-0000000000e2', '02000000-0000-0000-0000-0000000000d2', 'Motion', 1),
 ('02000000-0000-0000-0000-0000000000e3', '02000000-0000-0000-0000-0000000000d3', 'Fractions', 1),
 ('02000000-0000-0000-0000-0000000000e4', '02000000-0000-0000-0000-0000000000d1', 'Algebra', 2);
insert into students(id, student_code, full_name) values
 ('02000000-0000-0000-0000-000000000051', 'CU-1', 'TEST- CU One');
insert into enrollments(student_id, class_id, year_id, status) values
 ('02000000-0000-0000-0000-000000000051', '02000000-0000-0000-0000-0000000000c9',
  '02000000-0000-0000-0000-0000000000a0', 'active');
insert into auth.users(id, email) values
 ('02000000-0000-0000-0000-000000000001', 'cu.t1@school.test'),
 ('02000000-0000-0000-0000-000000000002', 'cu.t2@school.test'),
 ('02000000-0000-0000-0000-000000000003', 'cu.admin@school.test'),
 ('02000000-0000-0000-0000-000000000011', 'cu1@students.school.invalid'),
 ('02000000-0000-0000-0000-000000000012', 'cu.pending@school.test');
update profiles set role = 'teacher' where id in ('02000000-0000-0000-0000-000000000001',
                                                   '02000000-0000-0000-0000-000000000002');
update profiles set role = 'admin' where id = '02000000-0000-0000-0000-000000000003';
update profiles set role = 'student', student_id = '02000000-0000-0000-0000-000000000051'
 where id = '02000000-0000-0000-0000-000000000011';
insert into teacher_assignments(teacher_id, class_id, subject_id, year_id) values
 ('02000000-0000-0000-0000-000000000001', '02000000-0000-0000-0000-0000000000c9',
  '02000000-0000-0000-0000-0000000000d1', '02000000-0000-0000-0000-0000000000a0'),
 ('02000000-0000-0000-0000-000000000001', '02000000-0000-0000-0000-0000000000c9',
  '02000000-0000-0000-0000-0000000000d2', '02000000-0000-0000-0000-0000000000a9'),
 ('02000000-0000-0000-0000-000000000002', '02000000-0000-0000-0000-0000000000c8',
  null, '02000000-0000-0000-0000-0000000000a0');

-- A helper: expect a statement to be refused (RLS / check / trigger).
create or replace function public._cu_refused(p_sql text) returns boolean
language plpgsql as $$
begin
  execute p_sql;
  return false;
exception when insufficient_privilege or check_violation or not_null_violation
          or foreign_key_violation then
  return true;
end $$;
create or replace function public._cu_rows(p_sql text) returns int
language plpgsql as $$
declare n int;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function public._cu_refused(text), public._cu_rows(text) to authenticated, anon;

-- ---- Admin: editions, chapters, topics anywhere --------------------------------
set role authenticated;
set request.jwt.claim.sub = '02000000-0000-0000-0000-000000000003';
do $$ begin
  insert into curricula(id, code, board, name, effective_from)
  values ('02000000-0000-0000-0000-0000000000f1', 'CU-PTB-2025', 'Punjab Textbook Board',
          'PTB 2025 edition', '2025-04-01');
  assert public._cu_refused($q$insert into curricula(code, board, name) values ('  ', 'PTB', 'x')$q$),
    'blank edition code accepted';
  -- Backfill helper: attach this year's chapters to the edition, with Urdu titles.
  assert public._cu_rows($q$update chapters set curriculum_id = '02000000-0000-0000-0000-0000000000f1'
     where subject_id in ('02000000-0000-0000-0000-0000000000d1','02000000-0000-0000-0000-0000000000d2',
                          '02000000-0000-0000-0000-0000000000d3') and curriculum_id is null$q$) = 4,
    'admin could not attach chapters';
  update chapters set title_ur = 'سیٹ', textbook_ref = 'Unit 1'
   where id = '02000000-0000-0000-0000-0000000000e1';
  -- Topics + concepts in any class.
  insert into topics(id, chapter_id, title_en, title_ur, sort_order, diagnostic_size) values
   ('02000000-0000-0000-0000-000000000101', '02000000-0000-0000-0000-0000000000e3', 'Adding fractions', 'کسروں کو جمع کرنا', 1, 20),
   ('02000000-0000-0000-0000-000000000102', '02000000-0000-0000-0000-0000000000e2', 'Speed', null, 1, null);
  insert into concepts(id, topic_id, title_en, sort_order) values
   ('02000000-0000-0000-0000-000000000201', '02000000-0000-0000-0000-000000000101', 'Same denominators', 1),
   ('02000000-0000-0000-0000-000000000202', '02000000-0000-0000-0000-000000000102', 'Distance over time', 1);
  assert public._cu_refused($q$insert into topics(chapter_id, title_en, diagnostic_size)
     values ('02000000-0000-0000-0000-0000000000e3', 'Tiny diagnostic', 3)$q$),
    'diagnostic size 3 accepted';
  assert public._cu_refused($q$insert into topics(chapter_id, title_en)
     values ('02000000-0000-0000-0000-0000000000e3', '   ')$q$), 'blank topic title accepted';
  -- Retire, never delete: even an admin deletes nothing.
  assert public._cu_rows($q$delete from topics where id = '02000000-0000-0000-0000-000000000102'$q$) = 0,
    'ADMIN_DELETED_TOPIC';
  assert public._cu_rows($q$delete from concepts where id = '02000000-0000-0000-0000-000000000202'$q$) = 0,
    'ADMIN_DELETED_CONCEPT';
  update concepts set status = 'retired' where id = '02000000-0000-0000-0000-000000000202';
  update concepts set status = 'active' where id = '02000000-0000-0000-0000-000000000202';
end $$;

-- ---- Teacher T1: Class 9 Maths this year (Physics only last year) -------------
set request.jwt.claim.sub = '02000000-0000-0000-0000-000000000001';
do $$ begin
  assert (select count(*) from topics where id::text like '02000000%') = 2, 'teacher cannot read topics';
  -- Own subject: add, edit, reorder, retire.
  insert into topics(id, chapter_id, title_en, sort_order) values
   ('02000000-0000-0000-0000-000000000111', '02000000-0000-0000-0000-0000000000e1', 'Kinds of sets', 1),
   ('02000000-0000-0000-0000-000000000112', '02000000-0000-0000-0000-0000000000e1', 'Venn diagrams', 2);
  assert public._cu_rows($q$update topics set sort_order = 3 - sort_order, title_ur = 'وین ڈایاگرام'
     where id in ('02000000-0000-0000-0000-000000000111','02000000-0000-0000-0000-000000000112')$q$) = 2,
    'teacher could not reorder own topics';
  insert into concepts(id, topic_id, title_en, title_ur, summary_en, sort_order) values
   ('02000000-0000-0000-0000-000000000211', '02000000-0000-0000-0000-000000000111', 'Finite and infinite sets', 'محدود اور لامحدود سیٹ', 'A set you can finish counting.', 1),
   ('02000000-0000-0000-0000-000000000212', '02000000-0000-0000-0000-000000000112', 'Union in a Venn diagram', null, null, 1),
   ('02000000-0000-0000-0000-000000000213', '02000000-0000-0000-0000-000000000112', 'Intersection', null, null, 2);
  -- Move a topic to the other Maths chapter: allowed (same subject).
  assert public._cu_rows($q$update topics set chapter_id = '02000000-0000-0000-0000-0000000000e4'
     where id = '02000000-0000-0000-0000-000000000112'$q$) = 1, 'teacher could not move topic within subject';
  update topics set chapter_id = '02000000-0000-0000-0000-0000000000e1'
   where id = '02000000-0000-0000-0000-000000000112';
  update topics set status = 'retired' where id = '02000000-0000-0000-0000-000000000111';
  update topics set status = 'active' where id = '02000000-0000-0000-0000-000000000111';

  -- Not in a subject they don't teach this year, nor another class.
  assert public._cu_refused($q$insert into topics(chapter_id, title_en)
     values ('02000000-0000-0000-0000-0000000000e2', 'Velocity')$q$), 'TEACHER_WROTE_LAST_YEARS_SUBJECT';
  assert public._cu_refused($q$insert into topics(chapter_id, title_en)
     values ('02000000-0000-0000-0000-0000000000e3', 'Mixed numbers')$q$), 'TEACHER_WROTE_OTHER_CLASS';
  assert public._cu_rows($q$update topics set title_en = 'hacked'
     where id = '02000000-0000-0000-0000-000000000101'$q$) = 0, 'TEACHER_EDITED_OTHER_CLASS_TOPIC';
  assert public._cu_refused($q$update topics set chapter_id = '02000000-0000-0000-0000-0000000000e3'
     where id = '02000000-0000-0000-0000-000000000111'$q$), 'TEACHER_MOVED_TOPIC_OUT';
  assert public._cu_refused($q$insert into concepts(topic_id, title_en)
     values ('02000000-0000-0000-0000-000000000101', 'x')$q$), 'TEACHER_ADDED_CONCEPT_OTHER_CLASS';
  assert public._cu_refused($q$insert into concepts(topic_id, title_en)
     values ('02000000-0000-0000-0000-000000000102', 'x')$q$), 'TEACHER_ADDED_CONCEPT_LAST_YEARS_SUBJECT';
  assert public._cu_refused($q$update concepts set topic_id = '02000000-0000-0000-0000-000000000101'
     where id = '02000000-0000-0000-0000-000000000211'$q$), 'TEACHER_MOVED_CONCEPT_OUT';
  assert public._cu_rows($q$delete from topics where id = '02000000-0000-0000-0000-000000000111'$q$) = 0,
    'TEACHER_DELETED_TOPIC';
  assert public._cu_rows($q$delete from concepts where id = '02000000-0000-0000-0000-000000000211'$q$) = 0,
    'TEACHER_DELETED_CONCEPT';

  -- Prerequisites: own concept may need a concept from another class.
  insert into concept_prerequisites(concept_id, requires_concept_id) values
   ('02000000-0000-0000-0000-000000000212', '02000000-0000-0000-0000-000000000211'),
   ('02000000-0000-0000-0000-000000000213', '02000000-0000-0000-0000-000000000212'),
   ('02000000-0000-0000-0000-000000000211', '02000000-0000-0000-0000-000000000201');
  begin
    insert into concept_prerequisites values
     ('02000000-0000-0000-0000-000000000211', '02000000-0000-0000-0000-000000000213');
    raise exception 'PREREQ_CYCLE_ACCEPTED';
  exception when check_violation then
    if sqlerrm not like 'prerequisite_cycle%' then raise; end if;
  end;
  assert public._cu_refused($q$insert into concept_prerequisites values
     ('02000000-0000-0000-0000-000000000211', '02000000-0000-0000-0000-000000000211')$q$),
    'self prerequisite accepted';
  assert public._cu_refused($q$insert into concept_prerequisites values
     ('02000000-0000-0000-0000-000000000201', '02000000-0000-0000-0000-000000000211')$q$),
    'TEACHER_SET_PREREQ_ON_OTHER_CLASS';
  assert public._cu_rows($q$delete from concept_prerequisites
     where concept_id = '02000000-0000-0000-0000-000000000211'$q$) = 1, 'teacher could not remove own prerequisite';

  -- Editions and chapters stay admin-only.
  assert public._cu_refused($q$insert into curricula(code, board, name) values ('T-1', 'PTB', 'mine')$q$),
    'TEACHER_ADDED_EDITION';
  assert public._cu_rows($q$update chapters set title_ur = 'x' where id = '02000000-0000-0000-0000-0000000000e1'$q$) = 0,
    'TEACHER_EDITED_CHAPTER';
  assert public._cu_rows($q$update curricula set name = 'x'$q$) = 0, 'TEACHER_EDITED_EDITION';
end $$;

-- ---- Teacher T2: Class 8 (class-wide assignment) -------------------------------
set request.jwt.claim.sub = '02000000-0000-0000-0000-000000000002';
do $$ begin
  assert public._cu_rows($q$update topics set title_en = 'Adding like fractions'
     where id = '02000000-0000-0000-0000-000000000101'$q$) = 1, 'class-wide teacher could not edit';
  assert public._cu_rows($q$update topics set title_en = 'x'
     where id = '02000000-0000-0000-0000-000000000111'$q$) = 0, 'T2_EDITED_T1_TOPIC';
  assert public._cu_rows($q$update concepts set title_en = 'x'
     where id = '02000000-0000-0000-0000-000000000211'$q$) = 0, 'T2_EDITED_T1_CONCEPT';
  assert public._cu_rows($q$delete from concept_prerequisites
     where concept_id = '02000000-0000-0000-0000-000000000213'$q$) = 0, 'T2_REMOVED_T1_PREREQ';
end $$;

-- ---- Student S1 and a pending sign-up: read only ---------------------------------
do $$
declare who text;
begin
  foreach who in array array['02000000-0000-0000-0000-000000000011', '02000000-0000-0000-0000-000000000012'] loop
    perform set_config('request.jwt.claim.sub', who, true);
    assert (select count(*) from concepts where id::text like '02000000%') = 5, 'reader cannot read concepts';
    assert (select count(*) from curricula where code = 'CU-PTB-2025') = 1, 'reader cannot read editions';
    assert public._cu_refused($q$insert into topics(chapter_id, title_en)
       values ('02000000-0000-0000-0000-0000000000e1', 'x')$q$), 'STUDENT_ADDED_TOPIC';
    assert public._cu_refused($q$insert into concepts(topic_id, title_en)
       values ('02000000-0000-0000-0000-000000000111', 'x')$q$), 'STUDENT_ADDED_CONCEPT';
    assert public._cu_refused($q$insert into concept_prerequisites values
       ('02000000-0000-0000-0000-000000000213', '02000000-0000-0000-0000-000000000211')$q$),
      'STUDENT_ADDED_PREREQ';
    assert public._cu_rows($q$update topics set title_en = 'x'$q$) = 0, 'STUDENT_EDITED_TOPIC';
    assert public._cu_rows($q$update concepts set title_en = 'x'$q$) = 0, 'STUDENT_EDITED_CONCEPT';
    assert public._cu_rows($q$update chapters set title_ur = 'x'$q$) = 0, 'STUDENT_EDITED_CHAPTER';
    assert public._cu_rows($q$delete from concept_prerequisites$q$) = 0, 'STUDENT_REMOVED_PREREQ';
  end loop;
end $$;

-- ---- Review tables written in later prompts: insert-only / no delete ------------
set request.jwt.claim.sub = '02000000-0000-0000-0000-000000000001';
do $$ begin
  insert into item_reviews(item_kind, item_id, version, reviewer_id, decision)
  values ('question', gen_random_uuid(), 1, '02000000-0000-0000-0000-000000000001', 'approve');
  assert public._cu_rows($q$update item_reviews set decision = 'reject'$q$) = 0, 'REVIEW_LOG_EDITED';
  assert public._cu_rows($q$delete from item_reviews$q$) = 0, 'REVIEW_LOG_DELETED';
  insert into item_approvals(item_kind, item_id, version, scope, approved_by)
  values ('question', gen_random_uuid(), 1, 'practice', '02000000-0000-0000-0000-000000000001');
  assert public._cu_rows($q$delete from item_approvals$q$) = 0, 'APPROVAL_DELETED';
  assert public._cu_refused($q$insert into item_approvals(item_kind, item_id, version, scope, approved_by)
     values ('question', gen_random_uuid(), 1, 'exam', '02000000-0000-0000-0000-000000000003')$q$),
    'APPROVED_AS_SOMEONE_ELSE';
end $$;
set request.jwt.claim.sub = '02000000-0000-0000-0000-000000000011';
do $$ begin
  assert public._cu_refused($q$insert into import_batches(imported_by, origin)
     values ('02000000-0000-0000-0000-000000000011', 'human')$q$), 'STUDENT_MADE_IMPORT_BATCH';
  assert public._cu_refused($q$insert into item_reviews(item_kind, item_id, version, reviewer_id, decision)
     values ('question', gen_random_uuid(), 1, '02000000-0000-0000-0000-000000000011', 'approve')$q$),
    'STUDENT_REVIEWED';
end $$;

-- ---- Anonymous: nothing ---------------------------------------------------------
reset role;
set role anon;
set request.jwt.claim.sub = '';
do $$ begin
  assert (select count(*) from topics) = 0, 'ANON_READ_TOPICS';
  assert (select count(*) from curricula) = 0, 'ANON_READ_EDITIONS';
end $$;

reset role;
set request.jwt.claim.sub = '';
-- The SQL Editor (postgres) is unrestricted; the snapshot of what was built:
select (select count(*) from topics where id::text like '02000000%') as topics,
       (select count(*) from concepts where id::text like '02000000%') as concepts,
       (select count(*) from concept_prerequisites where concept_id::text like '02000000%') as prereqs;
drop function public._cu_refused(text);
drop function public._cu_rows(text);
