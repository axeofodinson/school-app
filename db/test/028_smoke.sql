-- Smoke test for prompt 14 (attendance) and db/028. Replays, as a signed-in
-- teacher, admin and students, the calls apps/mobile/features/attendance/api.ts
-- makes (record_attendance, the summaries, the history read), the old app's
-- direct upsert, and the direct writes 028 refuses. Throwaway local Postgres
-- only (TEST_PLAN.md DB-1 / AD-1). Passes in production order (setup + 002–016
-- + 024–026 + 028) and after the other smokes (with or without 018).
-- Without 028 it fails at the first record_attendance call.
\set ON_ERROR_STOP 1
reset role;
set request.jwt.claim.sub = '';
grant usage on schema public, auth to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
-- 028 narrows attendance_edits again (the line above re-grants like Supabase's defaults).
revoke insert, update, delete, truncate on public.attendance_edits from authenticated;

-- Fixtures: 9-A (teacher T1; S1, S3, S4 struck off) and Class 8 (S2; admin only).
update academic_years set is_current = false;
insert into academic_years(id, label, is_current) values
 ('02800000-0000-0000-0000-0000000000a0', 'AD-2026-27', true);
insert into classes(id, name, grade_level) values
 ('02800000-0000-0000-0000-0000000000c1', 'AD Class 9-A', 9),
 ('02800000-0000-0000-0000-0000000000c2', 'AD Class 8', 8);
insert into subjects(id, class_id, name) values
 ('02800000-0000-0000-0000-0000000000d1', '02800000-0000-0000-0000-0000000000c1', 'AD Maths');
insert into students(id, student_code, full_name) values
 ('02800000-0000-0000-0000-000000000051', 'AD-1', 'TEST- AD One'),
 ('02800000-0000-0000-0000-000000000052', 'AD-2', 'TEST- AD Two'),
 ('02800000-0000-0000-0000-000000000053', 'AD-3', 'TEST- AD Three'),
 ('02800000-0000-0000-0000-000000000054', 'AD-4', 'TEST- AD Four');
insert into enrollments(id, student_id, class_id, year_id, status, roll_number) values
 ('02800000-0000-0000-0000-000000000061', '02800000-0000-0000-0000-000000000051',
  '02800000-0000-0000-0000-0000000000c1', '02800000-0000-0000-0000-0000000000a0', 'active', 1),
 ('02800000-0000-0000-0000-000000000062', '02800000-0000-0000-0000-000000000052',
  '02800000-0000-0000-0000-0000000000c2', '02800000-0000-0000-0000-0000000000a0', 'active', 1),
 ('02800000-0000-0000-0000-000000000063', '02800000-0000-0000-0000-000000000053',
  '02800000-0000-0000-0000-0000000000c1', '02800000-0000-0000-0000-0000000000a0', 'active', 2),
 ('02800000-0000-0000-0000-000000000064', '02800000-0000-0000-0000-000000000054',
  '02800000-0000-0000-0000-0000000000c1', '02800000-0000-0000-0000-0000000000a0', 'active', 3);
insert into auth.users(id, email) values
 ('02800000-0000-0000-0000-000000000001', 'ad.teacher@school.test'),
 ('02800000-0000-0000-0000-000000000002', 'ad.admin@school.test'),
 ('02800000-0000-0000-0000-000000000011', 'ad1@students.school.invalid'),
 ('02800000-0000-0000-0000-000000000013', 'ad3@students.school.invalid');
update profiles set role = 'teacher' where id = '02800000-0000-0000-0000-000000000001';
update profiles set role = 'admin' where id = '02800000-0000-0000-0000-000000000002';
update profiles set role = 'student', student_id = '02800000-0000-0000-0000-000000000051'
 where id = '02800000-0000-0000-0000-000000000011';
update profiles set role = 'student', student_id = '02800000-0000-0000-0000-000000000053'
 where id = '02800000-0000-0000-0000-000000000013';
insert into teacher_assignments(teacher_id, class_id, subject_id, year_id) values
 ('02800000-0000-0000-0000-000000000001', '02800000-0000-0000-0000-0000000000c1',
  '02800000-0000-0000-0000-0000000000d1', '02800000-0000-0000-0000-0000000000a0');
-- S4 had one day marked before being struck off (written by the SQL Editor).
insert into attendance(enrollment_id, on_date, status) values
 ('02800000-0000-0000-0000-000000000064', (now() at time zone 'Asia/Karachi')::date - 10, 'present');
update enrollments set status = 'struck_off' where id = '02800000-0000-0000-0000-000000000064';

-- Helper for the assertions below (school "today").
create or replace function public._ad_today() returns date language sql stable as
$$ select (now() at time zone 'Asia/Karachi')::date $$;

-- ---- Teacher T1 (9-A) ---------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '02800000-0000-0000-0000-000000000001';
do $$
declare r jsonb; n int; rec attendance; e text;
begin
  -- Today, first save: one request for the class (features/attendance/api.ts sendAttendance).
  r := record_attendance('02800000-0000-0000-0000-0000000000c1', public._ad_today(),
    '[{"enrollment_id":"02800000-0000-0000-0000-000000000061","status":"absent"},
      {"enrollment_id":"02800000-0000-0000-0000-000000000063","status":"present"}]', null, now());
  assert r = '{"inserted":2,"changed":0,"unchanged":0}', format('first save: %s', r);
  select * into rec from attendance where enrollment_id = '02800000-0000-0000-0000-000000000061'
    and on_date = public._ad_today();
  assert rec.status = 'absent' and rec.marked_by = '02800000-0000-0000-0000-000000000001'
     and rec.marked_at is not null and rec.edit_count = 0, 'first mark not stored with marker + time';

  -- The queue re-sends the same payload (lost reply): nothing changes, no history.
  r := record_attendance('02800000-0000-0000-0000-0000000000c1', public._ad_today(),
    '[{"enrollment_id":"02800000-0000-0000-0000-000000000061","status":"absent"},
      {"enrollment_id":"02800000-0000-0000-0000-000000000063","status":"present"}]', null, now());
  assert r = '{"inserted":0,"changed":0,"unchanged":2}', format('re-send: %s', r);
  assert (select count(*) from attendance_edits) = 0, 'unchanged re-send wrote history';

  -- Same day: S1 turns up late. No reason needed; history keeps both values.
  r := record_attendance('02800000-0000-0000-0000-0000000000c1', public._ad_today(),
    '[{"enrollment_id":"02800000-0000-0000-0000-000000000061","status":"late"},
      {"enrollment_id":"02800000-0000-0000-0000-000000000063","status":"present"}]', '', now());
  assert r = '{"inserted":0,"changed":1,"unchanged":1}', format('same-day change: %s', r);
  select * into rec from attendance where enrollment_id = '02800000-0000-0000-0000-000000000061'
    and on_date = public._ad_today();
  assert rec.status = 'late' and rec.edit_count = 1 and rec.last_edited_at is not null, 'same-day change not counted';
  assert exists (select 1 from attendance_edits where attendance_id = rec.id and prev_status = 'absent'
                 and new_status = 'late' and reason = 'Changed the same day'
                 and edited_by = '02800000-0000-0000-0000-000000000001'), 'same-day change not in history';

  -- A past day marked for the first time: no reason needed (nothing is changed).
  r := record_attendance('02800000-0000-0000-0000-0000000000c1', public._ad_today() - 3,
    '[{"enrollment_id":"02800000-0000-0000-0000-000000000061","status":"present"},
      {"enrollment_id":"02800000-0000-0000-0000-000000000063","status":"present"}]', null, now());
  assert r ->> 'inserted' = '2', 'first marking of a past day refused';

  -- Changing that past day: a reason is required (blank, spaces, null all refused).
  foreach e in array array['', '   ', null] loop
    begin
      perform record_attendance('02800000-0000-0000-0000-0000000000c1', public._ad_today() - 3,
        '[{"enrollment_id":"02800000-0000-0000-0000-000000000063","status":"absent"}]', e, now());
      raise exception 'PAST_CHANGE_WITHOUT_REASON (%)', coalesce(e, 'null');
    exception when raise_exception then
      if sqlerrm <> 'reason_required' then raise; end if;
    end;
  end loop;
  assert (select status from attendance where enrollment_id = '02800000-0000-0000-0000-000000000063'
          and on_date = public._ad_today() - 3) = 'present', 'refused change was written';
  r := record_attendance('02800000-0000-0000-0000-0000000000c1', public._ad_today() - 3,
    '[{"enrollment_id":"02800000-0000-0000-0000-000000000063","status":"absent"}]',
    'Register shows absent', now());
  assert r ->> 'changed' = '1', 'past change with a reason refused';
  assert exists (select 1 from attendance_edits ed join attendance a on a.id = ed.attendance_id
                 where a.enrollment_id = '02800000-0000-0000-0000-000000000063'
                   and a.on_date = public._ad_today() - 3 and ed.prev_status = 'present'
                   and ed.new_status = 'absent' and ed.reason = 'Register shows absent'), 'past change not in history';

  -- Offline: a same-day correction saved yesterday on the device, sent today. It
  -- was the same day when the teacher pressed Save, so no reason is needed.
  perform record_attendance('02800000-0000-0000-0000-0000000000c1', public._ad_today() - 1,
    '[{"enrollment_id":"02800000-0000-0000-0000-000000000061","status":"present"}]', null,
    ((public._ad_today() - 1) + time '08:00') at time zone 'Asia/Karachi');
  r := record_attendance('02800000-0000-0000-0000-0000000000c1', public._ad_today() - 1,
    '[{"enrollment_id":"02800000-0000-0000-0000-000000000061","status":"late"}]', null,
    ((public._ad_today() - 1) + time '09:30') at time zone 'Asia/Karachi');
  assert r ->> 'changed' = '1', 'queued same-day change refused';
  -- A taken_at in the future can't dodge the reason: it is clamped to now().
  begin
    perform record_attendance('02800000-0000-0000-0000-0000000000c1', public._ad_today() - 3,
      '[{"enrollment_id":"02800000-0000-0000-0000-000000000063","status":"late"}]', null,
      now() + interval '3 days');
    raise exception 'FUTURE_TAKEN_AT_SKIPPED_REASON';
  exception when raise_exception then
    if sqlerrm <> 'reason_required' then raise; end if;
  end;

  -- A taken_at older than a week counts as now(): it can't waive the reason either.
  begin
    perform record_attendance('02800000-0000-0000-0000-0000000000c1', public._ad_today() - 3,
      '[{"enrollment_id":"02800000-0000-0000-0000-000000000063","status":"late"}]', null,
      now() - interval '30 days');
    raise exception 'STALE_TAKEN_AT_SKIPPED_REASON';
  exception when raise_exception then
    if sqlerrm <> 'reason_required' then raise; end if;
  end;

  -- Refusals with stable messages.
  foreach e in array array[
    'date_in_future', 'enrollment_class_mismatch', 'bad_mark', 'duplicate_enrollment',
    'marks_required', 'enrollment_not_active', 'not_authorized', 'bad_mark'] loop
    begin
      case e
        when 'date_in_future' then
          perform record_attendance('02800000-0000-0000-0000-0000000000c1', public._ad_today() + 1,
            '[{"enrollment_id":"02800000-0000-0000-0000-000000000061","status":"present"}]');
        when 'enrollment_class_mismatch' then
          perform record_attendance('02800000-0000-0000-0000-0000000000c1', public._ad_today(),
            '[{"enrollment_id":"02800000-0000-0000-0000-000000000062","status":"present"}]');
        when 'duplicate_enrollment' then
          perform record_attendance('02800000-0000-0000-0000-0000000000c1', public._ad_today(),
            '[{"enrollment_id":"02800000-0000-0000-0000-000000000061","status":"present"},
              {"enrollment_id":"02800000-0000-0000-0000-000000000061","status":"late"}]');
        when 'marks_required' then
          perform record_attendance('02800000-0000-0000-0000-0000000000c1', public._ad_today(), '[]');
        when 'enrollment_not_active' then
          perform record_attendance('02800000-0000-0000-0000-0000000000c1', public._ad_today(),
            '[{"enrollment_id":"02800000-0000-0000-0000-000000000064","status":"present"}]');
        when 'not_authorized' then
          perform record_attendance('02800000-0000-0000-0000-0000000000c2', public._ad_today(),
            '[{"enrollment_id":"02800000-0000-0000-0000-000000000062","status":"present"}]');
        else
          perform record_attendance('02800000-0000-0000-0000-0000000000c1', public._ad_today(),
            '[{"enrollment_id":"02800000-0000-0000-0000-000000000061","status":"sick"}]');
      end case;
      raise exception 'ACCEPTED_%', upper(e);
    exception when raise_exception then
      if sqlerrm <> e then raise; end if;
    end;
  end loop;
  begin
    perform record_attendance('02800000-0000-0000-0000-0000000000c1', public._ad_today(),
      '[{"enrollment_id":"not-a-uuid","status":"present"}]');
    raise exception 'ACCEPTED_BAD_UUID';
  exception when raise_exception then
    if sqlerrm <> 'bad_mark' then raise; end if;
  end;

  -- All or nothing: one bad entry and the good ones aren't written either.
  begin
    perform record_attendance('02800000-0000-0000-0000-0000000000c1', public._ad_today() - 5,
      '[{"enrollment_id":"02800000-0000-0000-0000-000000000061","status":"present"},
        {"enrollment_id":"02800000-0000-0000-0000-000000000062","status":"present"}]');
    raise exception 'PARTIAL_BATCH_ACCEPTED';
  exception when raise_exception then
    if sqlerrm <> 'enrollment_class_mismatch' then raise; end if;
  end;
  assert not exists (select 1 from attendance where on_date = public._ad_today() - 5), 'partial batch written';

  -- A struck-off student's existing day can still be corrected (with a reason).
  r := record_attendance('02800000-0000-0000-0000-0000000000c1', public._ad_today() - 10,
    '[{"enrollment_id":"02800000-0000-0000-0000-000000000064","status":"leave"}]', 'Leave note found', now());
  assert r ->> 'changed' = '1', 'struck-off student''s past day not correctable';

  -- History is readable for the class, and can't be written, changed or removed.
  select count(*) into n from attendance_edits;
  assert n = 4, format('teacher sees %s history rows, want 4', n);
  begin
    insert into attendance_edits(attendance_id, prev_status, new_status, reason)
      values (rec.id, 'late', 'present', 'forged');
    raise exception 'TEACHER_FORGED_HISTORY';
  exception when insufficient_privilege then null; end;
  begin
    update attendance_edits set reason = 'x';
    raise exception 'TEACHER_EDITED_HISTORY';
  exception when insufficient_privilege then null; end;
  begin
    delete from attendance_edits;
    raise exception 'TEACHER_DELETED_HISTORY';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  assert (select count(*) from attendance_edits where reason = 'x') = 0, 'history edited';
  assert (select count(*) from attendance_edits) = 4, 'history rows lost';
end $$;

-- ---- T1, direct writes (the old app's path, and what 028 refuses) -----------------
set role authenticated;
set request.jwt.claim.sub = '02800000-0000-0000-0000-000000000001';
do $$
declare rec attendance; n int;
begin
  -- Old app: AttendanceScreen.js upserts the whole roster with marked_by.
  insert into attendance(enrollment_id, on_date, status, marked_by) values
   ('02800000-0000-0000-0000-000000000061', public._ad_today(), 'present', '02800000-0000-0000-0000-000000000001'),
   ('02800000-0000-0000-0000-000000000063', public._ad_today(), 'present', '02800000-0000-0000-0000-000000000001')
  on conflict (enrollment_id, on_date) do update set status = excluded.status, marked_by = excluded.marked_by;
  select * into rec from attendance where enrollment_id = '02800000-0000-0000-0000-000000000061'
    and on_date = public._ad_today();
  assert rec.status = 'present' and rec.edit_count = 2, 'old-app change not counted';
  assert exists (select 1 from attendance_edits where attendance_id = rec.id and prev_status = 'late'
                 and new_status = 'present' and reason = 'Changed in the old app'), 'old-app change not in history';
  assert (select edit_count from attendance where enrollment_id = '02800000-0000-0000-0000-000000000063'
          and on_date = public._ad_today()) = 0, 'unchanged old-app row counted as an edit';

  -- Bookkeeping can't be faked.
  update attendance set edit_count = 0, last_edited_at = null, marked_at = null
   where id = rec.id;
  select * into rec from attendance where id = rec.id;
  assert rec.edit_count = 2 and rec.marked_at is not null, 'client reset the edit counters';
  insert into attendance(enrollment_id, on_date, status, marked_by, edit_count, marked_at) values
   ('02800000-0000-0000-0000-000000000061', public._ad_today() - 2, 'absent',
    '02800000-0000-0000-0000-000000000002', 5, now() - interval '1 year');
  select * into rec from attendance where enrollment_id = '02800000-0000-0000-0000-000000000061'
    and on_date = public._ad_today() - 2;
  assert rec.edit_count = 0 and rec.marked_by = '02800000-0000-0000-0000-000000000001'
     and rec.marked_at > now() - interval '1 minute', 'client faked marker / time / counter on insert';

  -- No deletes and no moving a mark to another student or day.
  begin
    delete from attendance where id = rec.id;
    raise exception 'TEACHER_DELETED_ATTENDANCE';
  exception when insufficient_privilege then null; end;
  begin
    update attendance set on_date = on_date - 1 where id = rec.id;
    raise exception 'TEACHER_MOVED_ATTENDANCE';
  exception when insufficient_privilege then null; end;
  begin
    update attendance set enrollment_id = '02800000-0000-0000-0000-000000000063' where id = rec.id;
    raise exception 'TEACHER_MOVED_ATTENDANCE_TO_OTHER_STUDENT';
  exception when insufficient_privilege then null; end;

  -- Summaries: only the class T1 teaches.
  select count(*) into n from attendance_day_summary('02800000-0000-0000-0000-0000000000a0', public._ad_today());
  assert n = 1, format('teacher day summary has %s classes, want 1', n);
  assert (select row(enrolled, marked, present, absent, late, on_leave)::text
            from attendance_day_summary('02800000-0000-0000-0000-0000000000a0', public._ad_today()))
         = '(2,2,2,0,0,0)', 'teacher day summary counts wrong';
end $$;

-- ---- Admin: every class, the summaries ------------------------------------------------
set request.jwt.claim.sub = '02800000-0000-0000-0000-000000000002';
do $$
declare r jsonb; n int;
begin
  r := record_attendance('02800000-0000-0000-0000-0000000000c2', public._ad_today(),
    '[{"enrollment_id":"02800000-0000-0000-0000-000000000062","status":"leave"}]');
  assert r ->> 'inserted' = '1', 'admin could not mark Class 8';
  select count(*) into n from attendance_day_summary('02800000-0000-0000-0000-0000000000a0', public._ad_today());
  assert n = 2, format('admin day summary has %s classes, want 2', n);
  assert (select row(enrolled, marked, on_leave)::text
            from attendance_day_summary('02800000-0000-0000-0000-0000000000a0', public._ad_today())
           where class_id = '02800000-0000-0000-0000-0000000000c2') = '(1,1,1)', 'Class 8 day counts wrong';
  -- An unmarked day: students counted, nothing marked.
  assert (select row(enrolled, marked)::text
            from attendance_day_summary('02800000-0000-0000-0000-0000000000a0', public._ad_today() - 20)
           where class_id = '02800000-0000-0000-0000-0000000000c1') = '(2,0)', 'unmarked day counts wrong';
  -- Per-student counts over a range; the struck-off student keeps their days.
  assert (select row(present, absent, late, on_leave)::text
            from attendance_student_summary('02800000-0000-0000-0000-0000000000c1',
                 '02800000-0000-0000-0000-0000000000a0', public._ad_today() - 30, public._ad_today())
           where enrollment_id = '02800000-0000-0000-0000-000000000061') = '(2,1,1,0)', 'S1 range counts wrong';
  assert (select row(present, on_leave)::text
            from attendance_student_summary('02800000-0000-0000-0000-0000000000c1',
                 '02800000-0000-0000-0000-0000000000a0', public._ad_today() - 30, public._ad_today())
           where enrollment_id = '02800000-0000-0000-0000-000000000064') = '(0,1)', 'struck-off counts wrong';
  select count(*) into n from attendance_edits;
  assert n = 5, format('admin sees %s history rows, want 5', n);
  -- The admin is bound by the guard too.
  begin
    delete from attendance where enrollment_id = '02800000-0000-0000-0000-000000000062';
    raise exception 'ADMIN_DELETED_ATTENDANCE';
  exception when insufficient_privilege then null; end;
end $$;

-- ---- T1 can't read Class 8's history --------------------------------------------------
-- The admin changes S2's Class 8 day; T1 must not see that history row.
select record_attendance('02800000-0000-0000-0000-0000000000c2', public._ad_today(),
  '[{"enrollment_id":"02800000-0000-0000-0000-000000000062","status":"present"}]') \g /dev/null
set request.jwt.claim.sub = '02800000-0000-0000-0000-000000000001';
do $$
declare n int;
begin
  select count(*) into n from attendance_edits ed join attendance a on a.id = ed.attendance_id
   where a.enrollment_id = '02800000-0000-0000-0000-000000000062';
  assert n = 0, 'teacher read another class''s attendance history';
  select count(*) into n from attendance where enrollment_id = '02800000-0000-0000-0000-000000000062';
  assert n = 0, 'teacher read another class''s attendance';
end $$;

-- ---- Students ---------------------------------------------------------------------------
set request.jwt.claim.sub = '02800000-0000-0000-0000-000000000011';
do $$
declare n int;
begin
  -- features/attendance/api.ts loadMyAttendance: own rows only.
  select count(*) into n from attendance;
  assert n = 4, format('S1 sees %s attendance rows, want 4 (own)', n);
  assert not exists (select 1 from attendance where enrollment_id <> '02800000-0000-0000-0000-000000000061'),
    'S1 read another student''s attendance';
  select count(*) into n from attendance_edits;
  assert n = 0, 'student read attendance history';
  begin
    perform record_attendance('02800000-0000-0000-0000-0000000000c1', public._ad_today(),
      '[{"enrollment_id":"02800000-0000-0000-0000-000000000061","status":"present"}]');
    raise exception 'STUDENT_MARKED_ATTENDANCE';
  exception when raise_exception then
    if sqlerrm <> 'not_authorized' then raise; end if;
  end;
  begin
    insert into attendance(enrollment_id, on_date, status)
      values ('02800000-0000-0000-0000-000000000061', public._ad_today() - 7, 'present');
    raise exception 'STUDENT_INSERTED_ATTENDANCE';
  exception when insufficient_privilege then null; end;
  update attendance set status = 'present';
  get diagnostics n = row_count;
  assert n = 0, 'student changed own attendance';
  -- A student calling the summaries sees only their own enrollment's numbers.
  select count(*) into n from attendance_student_summary('02800000-0000-0000-0000-0000000000c1',
    '02800000-0000-0000-0000-0000000000a0', public._ad_today() - 30, public._ad_today());
  assert n = 1, format('student summary returned %s rows, want 1 (own)', n);
end $$;

-- ---- anon can't call the write path ------------------------------------------------------
reset role;
set role anon;
set request.jwt.claim.sub = '';
do $$ begin
  begin
    perform record_attendance('02800000-0000-0000-0000-0000000000c1', current_date, '[]');
    raise exception 'ANON_CALLED_RECORD_ATTENDANCE';
  exception when insufficient_privilege then null; end;
end $$;

-- ---- The SQL Editor (postgres) is unrestricted; trigger functions can't be called -------
reset role;
set request.jwt.claim.sub = '';
do $$
declare n int;
begin
  begin
    perform attendance_audit();
    raise exception 'TRIGGER_FUNCTION_CALLED';
  exception when feature_not_supported then null; end;
  delete from attendance where on_date = public._ad_today() - 2
    and enrollment_id = '02800000-0000-0000-0000-000000000061';
  get diagnostics n = row_count;
  assert n = 1, 'SQL Editor could not delete';
end $$;

-- Clean up the fixtures so later smokes start clean.
delete from attendance where enrollment_id in (select id from enrollments where year_id = '02800000-0000-0000-0000-0000000000a0');
delete from teacher_assignments where year_id = '02800000-0000-0000-0000-0000000000a0';
delete from enrollments where year_id = '02800000-0000-0000-0000-0000000000a0';
delete from subjects where id = '02800000-0000-0000-0000-0000000000d1';
delete from classes where id in ('02800000-0000-0000-0000-0000000000c1', '02800000-0000-0000-0000-0000000000c2');
delete from academic_years where id = '02800000-0000-0000-0000-0000000000a0';
drop function public._ad_today();
select 'AD-1 attendance smoke: pass' as result;
