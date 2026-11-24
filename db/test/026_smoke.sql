-- Smoke test for prompt 12 (grading + file assessments) and db/026. Replays, as a
-- signed-in teacher, admin and students, the exact calls
-- apps/mobile/features/{grading,files}/api.ts make: record_grade() (db/013), the
-- history read, the assessment-files bucket (db/014), and the direct writes
-- db/026 now refuses. Throwaway local Postgres only (TEST_PLAN.md DB-1 / GR-1).
-- Passes in production order (setup + 002–016 + 024 + 025 + 026) and after the
-- other smokes. Without 026 it fails at TEACHER_BYPASSED_RECORD_GRADE.
\set ON_ERROR_STOP 1
reset role;
set request.jwt.claim.sub = '';
grant usage on schema public, auth, storage to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select, insert, update, delete on storage.objects to authenticated;
grant execute on all functions in schema public to authenticated;

-- Fixtures: 9-A (teacher T1, students S1 + S3) and Class 8 (S2, no teacher but the admin).
update academic_years set is_current = false;
insert into academic_years(id, label, is_current) values
 ('02600000-0000-0000-0000-0000000000a0', 'GR-2026-27', true);
insert into classes(id, name, grade_level) values
 ('02600000-0000-0000-0000-0000000000c1', 'GR Class 9-A', 9),
 ('02600000-0000-0000-0000-0000000000c2', 'GR Class 8', 8);
insert into subjects(id, class_id, name) values
 ('02600000-0000-0000-0000-0000000000d1', '02600000-0000-0000-0000-0000000000c1', 'GR Maths'),
 ('02600000-0000-0000-0000-0000000000d2', '02600000-0000-0000-0000-0000000000c2', 'GR Science');
insert into students(id, student_code, full_name) values
 ('02600000-0000-0000-0000-000000000051', 'GR-1', 'TEST- GR One'),
 ('02600000-0000-0000-0000-000000000052', 'GR-2', 'TEST- GR Two'),
 ('02600000-0000-0000-0000-000000000053', 'GR-3', 'TEST- GR Three');
insert into enrollments(id, student_id, class_id, year_id, status, roll_number) values
 ('02600000-0000-0000-0000-000000000061', '02600000-0000-0000-0000-000000000051',
  '02600000-0000-0000-0000-0000000000c1', '02600000-0000-0000-0000-0000000000a0', 'active', 1),
 ('02600000-0000-0000-0000-000000000062', '02600000-0000-0000-0000-000000000052',
  '02600000-0000-0000-0000-0000000000c2', '02600000-0000-0000-0000-0000000000a0', 'active', 1),
 ('02600000-0000-0000-0000-000000000063', '02600000-0000-0000-0000-000000000053',
  '02600000-0000-0000-0000-0000000000c1', '02600000-0000-0000-0000-0000000000a0', 'active', 2);
insert into auth.users(id, email) values
 ('02600000-0000-0000-0000-000000000001', 'gr.teacher@school.test'),
 ('02600000-0000-0000-0000-000000000002', 'gr.admin@school.test'),
 ('02600000-0000-0000-0000-000000000011', 'gr1@students.school.invalid'),
 ('02600000-0000-0000-0000-000000000012', 'gr2@students.school.invalid'),
 ('02600000-0000-0000-0000-000000000013', 'gr3@students.school.invalid');
update profiles set role = 'teacher' where id = '02600000-0000-0000-0000-000000000001';
update profiles set role = 'admin' where id = '02600000-0000-0000-0000-000000000002';
update profiles set role = 'student', student_id = '02600000-0000-0000-0000-000000000051'
 where id = '02600000-0000-0000-0000-000000000011';
update profiles set role = 'student', student_id = '02600000-0000-0000-0000-000000000052'
 where id = '02600000-0000-0000-0000-000000000012';
update profiles set role = 'student', student_id = '02600000-0000-0000-0000-000000000053'
 where id = '02600000-0000-0000-0000-000000000013';
insert into teacher_assignments(teacher_id, class_id, subject_id, year_id) values
 ('02600000-0000-0000-0000-000000000001', '02600000-0000-0000-0000-0000000000c1',
  '02600000-0000-0000-0000-0000000000d1', '02600000-0000-0000-0000-0000000000a0');
-- f1: 9-A file worksheet (out of 10). t1: 9-A question test (out of 20). b8: Class 8 test.
insert into assessments(id, year_id, class_id, subject_id, title, type, status, total_marks) values
 ('02600000-0000-0000-0000-0000000000f1', '02600000-0000-0000-0000-0000000000a0',
  '02600000-0000-0000-0000-0000000000c1', '02600000-0000-0000-0000-0000000000d1',
  'GR 9-A worksheet', 'file', 'draft', 10),
 ('02600000-0000-0000-0000-0000000000b1', '02600000-0000-0000-0000-0000000000a0',
  '02600000-0000-0000-0000-0000000000c1', '02600000-0000-0000-0000-0000000000d1',
  'GR 9-A test', 'test', 'published', 20),
 ('02600000-0000-0000-0000-0000000000b8', '02600000-0000-0000-0000-0000000000a0',
  '02600000-0000-0000-0000-0000000000c2', '02600000-0000-0000-0000-0000000000d2',
  'GR Class 8 test', 'test', 'published', 5);

-- ---- Teacher T1 (9-A): file worksheet upload ---------------------------------------
set role authenticated;
set request.jwt.claim.sub = '02600000-0000-0000-0000-000000000001';
do $$ begin
  -- features/files/api.ts uploadWorksheet: object under "{assessment_id}/{uuid}.{ext}".
  insert into storage.objects(bucket_id, name) values
   ('assessment-files', '02600000-0000-0000-0000-0000000000f1/aaaaaaaa-0000-4000-8000-000000000001.pdf');
  update assessments set file_path = '02600000-0000-0000-0000-0000000000f1/aaaaaaaa-0000-4000-8000-000000000001.pdf',
         file_name = 'Worksheet 3.pdf', file_mime = 'application/pdf', status = 'published'
   where id = '02600000-0000-0000-0000-0000000000f1';
  assert found, 'teacher could not attach the file to own worksheet';
  begin
    insert into storage.objects(bucket_id, name) values
     ('assessment-files', '02600000-0000-0000-0000-0000000000b8/x.pdf');
    raise exception 'TEACHER_UPLOADED_TO_FOREIGN_CLASS';
  exception when insufficient_privilege then null; end;
end $$;

-- ---- T1 grades: first grade, correction needs a reason, history keeps both ----------
do $$
declare s submissions; n int; e text;
begin
  -- First grade: no reason needed (stored as 'Initial grade').
  s := record_grade('02600000-0000-0000-0000-000000000061', '02600000-0000-0000-0000-0000000000f1', 7, '');
  assert s.score = 7 and s.edit_count = 0, 'first grade not stored';

  -- Correction without a reason: refused (blank, spaces, null).
  foreach e in array array['', '   ', null] loop
    begin
      perform record_grade('02600000-0000-0000-0000-000000000061', '02600000-0000-0000-0000-0000000000f1', 8, e);
      raise exception 'CORRECTION_WITHOUT_REASON_ACCEPTED (%)', coalesce(e, 'null');
    exception when raise_exception then
      if sqlerrm <> 'reason_required' then raise; end if;
    end;
  end loop;
  assert (select score from submissions where enrollment_id = '02600000-0000-0000-0000-000000000061'
          and assessment_id = '02600000-0000-0000-0000-0000000000f1') = 7, 'refused correction changed the score';

  -- Correction with a reason: stored, counted, both values in history.
  s := record_grade('02600000-0000-0000-0000-000000000061', '02600000-0000-0000-0000-0000000000f1', 8.5, 'Recounted page 2');
  assert s.score = 8.5 and s.edit_count = 1 and s.last_edited_at is not null, 'correction not stored';
  -- Re-saving the same value is not a change: no history noise.
  perform record_grade('02600000-0000-0000-0000-000000000061', '02600000-0000-0000-0000-0000000000f1', 8.5, '');
  -- features/grading/api.ts loadHistory
  select count(*) into n from submission_grade_edits where submission_id = s.id;
  assert n = 2, format('history rows = %s, want 2', n);
  assert exists (select 1 from submission_grade_edits where submission_id = s.id
                 and prev_score is null and new_score = 7 and reason = 'Initial grade'), 'first grade not in history';
  assert exists (select 1 from submission_grade_edits where submission_id = s.id
                 and prev_score = 7 and new_score = 8.5 and reason = 'Recounted page 2'
                 and edited_by = '02600000-0000-0000-0000-000000000001'), 'correction not in history with both values';

  -- Range and scope refusals.
  foreach e in array array['11', '-1'] loop
    begin
      perform record_grade('02600000-0000-0000-0000-000000000063', '02600000-0000-0000-0000-0000000000f1', e::numeric, '');
      raise exception 'OUT_OF_RANGE_ACCEPTED %', e;
    exception when raise_exception then
      if sqlerrm <> 'score_out_of_range' then raise; end if;
    end;
  end loop;
  begin
    perform record_grade('02600000-0000-0000-0000-000000000062', '02600000-0000-0000-0000-0000000000f1', 5, '');
    raise exception 'OTHER_CLASS_ENROLLMENT_GRADED';
  exception when raise_exception then
    if sqlerrm <> 'enrollment_class_mismatch' then raise; end if;
  end;
  begin
    perform record_grade('02600000-0000-0000-0000-000000000062', '02600000-0000-0000-0000-0000000000b8', 5, '');
    raise exception 'TEACHER_GRADED_FOREIGN_CLASS';
  exception when raise_exception then
    if sqlerrm <> 'not_authorized' then raise; end if;
  end;
end $$;

-- ---- db/026: no direct grade writes, no deletes, from a client session -------------
do $$
declare n int;
begin
  begin
    update submissions set score = 1
     where enrollment_id = '02600000-0000-0000-0000-000000000061'
       and assessment_id = '02600000-0000-0000-0000-0000000000f1';
    get diagnostics n = row_count;
    if n > 0 then raise exception 'TEACHER_BYPASSED_RECORD_GRADE'; end if;
  exception when insufficient_privilege then null; end;
  begin
    update submissions set responses = '{"forged":true}'
     where enrollment_id = '02600000-0000-0000-0000-000000000061';
    get diagnostics n = row_count;
    if n > 0 then raise exception 'TEACHER_REWROTE_RESPONSES'; end if;
  exception when insufficient_privilege then null; end;
  begin
    delete from submissions where enrollment_id = '02600000-0000-0000-0000-000000000061';
    get diagnostics n = row_count;
    if n > 0 then raise exception 'TEACHER_DELETED_A_GRADE'; end if;
  exception when insufficient_privilege then null; end;
  begin
    insert into submissions(enrollment_id, assessment_id, score)
    values ('02600000-0000-0000-0000-000000000063', '02600000-0000-0000-0000-0000000000f1', 9);
    raise exception 'TEACHER_INSERTED_A_GRADED_ROW';
  exception when insufficient_privilege then null; end;
  -- History is append-only for clients too (no update/delete policy).
  update submission_grade_edits set new_score = 0;
  get diagnostics n = row_count;
  assert n = 0, 'history row edited';
  delete from submission_grade_edits;
  get diagnostics n = row_count;
  assert n = 0, 'history row deleted';
end $$;

-- ---- The "graded before the attempt" case (features/grading warns about it) ---------
do $$ begin
  perform record_grade('02600000-0000-0000-0000-000000000063', '02600000-0000-0000-0000-0000000000b1', 12, '');
end $$;
set request.jwt.claim.sub = '02600000-0000-0000-0000-000000000013';
do $$ begin
  begin
    insert into submissions(id, enrollment_id, assessment_id, responses, submitted_at) values
     ('02600000-0000-0000-0000-0000000005a3', '02600000-0000-0000-0000-000000000063',
      '02600000-0000-0000-0000-0000000000b1', '{"q":"A"}', now());
    raise exception 'ATTEMPT_AFTER_GRADE_STORED_TWICE';
  exception when unique_violation then null; end;   -- the app's queue reads this as "duplicate"
end $$;

-- ---- Student S1: sees the file + own clean score, never the history ---------------
set request.jwt.claim.sub = '02600000-0000-0000-0000-000000000011';
do $$ declare n int; begin
  -- features/files/api.ts signedFileUrl → storage policy p_afiles_student_read
  assert (select count(*) from storage.objects where bucket_id = 'assessment-files') = 1,
    'student cannot read own class worksheet';
  assert (select file_name from assessments where id = '02600000-0000-0000-0000-0000000000f1') = 'Worksheet 3.pdf',
    'student cannot see worksheet row';
  assert (select score from submissions where assessment_id = '02600000-0000-0000-0000-0000000000f1') = 8.5,
    'student does not see corrected score';
  assert (select count(*) from submission_grade_edits) = 0, 'student reads grade history';
  update submissions set score = 10;
  get diagnostics n = row_count;
  assert n = 0, 'student changed own score';
  begin
    perform record_grade('02600000-0000-0000-0000-000000000061', '02600000-0000-0000-0000-0000000000f1', 10, 'me');
    raise exception 'STUDENT_GRADED_SELF';
  exception when raise_exception then
    if sqlerrm <> 'not_authorized' then raise; end if;
  end;
  insert into storage.objects(bucket_id, name) values
   ('assessment-files', '02600000-0000-0000-0000-0000000000f1/student.png');
  raise exception 'STUDENT_UPLOADED_A_FILE';
exception when insufficient_privilege then null;
end $$;

-- ---- Student S2 (Class 8): can't reach 9-A's worksheet; submits own attempt --------
set request.jwt.claim.sub = '02600000-0000-0000-0000-000000000012';
do $$ begin
  assert (select count(*) from storage.objects where bucket_id = 'assessment-files') = 0,
    'other class student reads the worksheet';
  -- An ungraded attempt still goes in under db/026 (features/attempts).
  insert into submissions(enrollment_id, assessment_id, responses, submitted_at) values
   ('02600000-0000-0000-0000-000000000062', '02600000-0000-0000-0000-0000000000b8', '{"q":"B"}', now());
end $$;

-- ---- Admin: grades Class 8; teacher can't read Class 8 history ---------------------
set request.jwt.claim.sub = '02600000-0000-0000-0000-000000000002';
do $$ declare s submissions; begin
  s := record_grade('02600000-0000-0000-0000-000000000062', '02600000-0000-0000-0000-0000000000b8', 4, '');
  assert s.score = 4 and s.submitted_at is not null, 'admin grade on a submitted attempt';
  s := record_grade('02600000-0000-0000-0000-000000000062', '02600000-0000-0000-0000-0000000000b8', 5, 'Missed a mark');
  assert (select count(*) from submission_grade_edits where submission_id = s.id) = 2, 'admin history';
  -- db/026 binds admins too: grades only through record_grade.
  begin
    update submissions set score = 0 where id = s.id;
    raise exception 'ADMIN_BYPASSED_RECORD_GRADE';
  exception when insufficient_privilege then null; end;
end $$;
set request.jwt.claim.sub = '02600000-0000-0000-0000-000000000001';
do $$ begin
  assert (select count(*) from submission_grade_edits e join submissions s on s.id = e.submission_id
          where s.assessment_id = '02600000-0000-0000-0000-0000000000b8') = 0, 'teacher reads foreign history';
  assert (select count(*) from submission_grade_edits) = 3, 'teacher sees own class history (2 + 1)';
end $$;

-- ---- The SQL Editor (postgres) is not a client: still unrestricted -----------------
reset role;
do $$ begin
  update submissions set graded_at = graded_at where assessment_id = '02600000-0000-0000-0000-0000000000b8';
  assert found, 'postgres blocked';
end $$;
select 'GR-1 026 smoke: pass' as result;
