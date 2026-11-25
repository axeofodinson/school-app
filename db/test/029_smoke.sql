-- Smoke test for db/029 + prompt 15 (messaging). Replays, as signed-in users, what
-- apps/mobile/features/messages/api.ts does. Throwaway local Postgres only
-- (TEST_PLAN.md DB-1 / MS-1). Passes in production order (setup + 002–016 + 024
-- + 029) and in the full order. Without 029 it fails at the first read-state call.
\set ON_ERROR_STOP 1
reset role;
set request.jwt.claim.sub = '';
grant usage on schema public, auth to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- Fixtures: Class 9-A (S1 active, S3 struck off) + Class 8 (S2). T teaches 9-A; A is admin.
update academic_years set is_current = false;
insert into academic_years(id, label, is_current) values
 ('02900000-0000-0000-0000-0000000000a0', 'MS-2026-27', true);
insert into classes(id, name, grade_level) values
 ('02900000-0000-0000-0000-0000000000c1', 'MS Class 9-A', 9),
 ('02900000-0000-0000-0000-0000000000c2', 'MS Class 8', 8);
insert into subjects(id, class_id, name) values
 ('02900000-0000-0000-0000-0000000000d1', '02900000-0000-0000-0000-0000000000c1', 'MS Maths');
insert into students(id, student_code, full_name) values
 ('02900000-0000-0000-0000-000000000051', 'MS-1', 'TEST- MS One'),
 ('02900000-0000-0000-0000-000000000052', 'MS-2', 'TEST- MS Two'),
 ('02900000-0000-0000-0000-000000000053', 'MS-3', 'TEST- MS Three');
insert into enrollments(id, student_id, class_id, year_id, status) values
 ('02900000-0000-0000-0000-000000000061', '02900000-0000-0000-0000-000000000051',
  '02900000-0000-0000-0000-0000000000c1', '02900000-0000-0000-0000-0000000000a0', 'active'),
 ('02900000-0000-0000-0000-000000000062', '02900000-0000-0000-0000-000000000052',
  '02900000-0000-0000-0000-0000000000c2', '02900000-0000-0000-0000-0000000000a0', 'active'),
 ('02900000-0000-0000-0000-000000000063', '02900000-0000-0000-0000-000000000053',
  '02900000-0000-0000-0000-0000000000c1', '02900000-0000-0000-0000-0000000000a0', 'struck_off');
insert into auth.users(id, email) values
 ('02900000-0000-0000-0000-000000000001', 'ms.teacher@school.test'),
 ('02900000-0000-0000-0000-000000000002', 'ms.admin@school.test'),
 ('02900000-0000-0000-0000-000000000011', 'ms1@students.school.invalid'),
 ('02900000-0000-0000-0000-000000000012', 'ms2@students.school.invalid'),
 ('02900000-0000-0000-0000-000000000013', 'ms3@students.school.invalid'),
 ('02900000-0000-0000-0000-000000000004', 'ms.other@school.test');
update profiles set role = 'teacher' where id in
 ('02900000-0000-0000-0000-000000000001', '02900000-0000-0000-0000-000000000004');
update profiles set role = 'admin' where id = '02900000-0000-0000-0000-000000000002';
update profiles set role = 'student', student_id = '02900000-0000-0000-0000-000000000051'
 where id = '02900000-0000-0000-0000-000000000011';
update profiles set role = 'student', student_id = '02900000-0000-0000-0000-000000000052'
 where id = '02900000-0000-0000-0000-000000000012';
update profiles set role = 'student', student_id = '02900000-0000-0000-0000-000000000053'
 where id = '02900000-0000-0000-0000-000000000013';
insert into teacher_assignments(teacher_id, class_id, subject_id, year_id) values
 ('02900000-0000-0000-0000-000000000001', '02900000-0000-0000-0000-0000000000c1',
  '02900000-0000-0000-0000-0000000000d1', '02900000-0000-0000-0000-0000000000a0');

-- An old message from before 029 (written by the SQL Editor), to check the backfill.
insert into messages(id, sender_id, scope, target_id, title, body, created_at) values
 ('02900000-0000-0000-0000-0000000000e0', null, 'school', null, 'MS old', 'old', now() - interval '3 days');

-- ---- 029 itself: apply, backfill, idempotent ------------------------------------
\i db/029_messaging_inbox.sql
\i db/029_messaging_inbox.sql

do $$ begin
  assert (select push_claimed_at from messages where id = '02900000-0000-0000-0000-0000000000e0') is not null,
    'old message not marked as already pushed';
end $$;

create or replace function public._ms_fails(p_sql text) returns boolean language plpgsql as $$
begin
  execute p_sql;
  return false;
exception when others then
  return true;
end $$;
grant execute on function public._ms_fails(text) to authenticated;

-- ---- Teacher T (teaches 9-A) sends --------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '02900000-0000-0000-0000-000000000001';

-- features/messages/api.ts sendMessage: client UUID as id, no read-back.
insert into messages(id, sender_id, scope, target_id, title, body) values
 ('02900000-0000-0000-0000-0000000000e1', auth.uid(), 'class',
  '02900000-0000-0000-0000-0000000000c1', 'MS to 9-A', 'Bring your sets notebook.');
insert into messages(id, sender_id, scope, target_id, title, body) values
 ('02900000-0000-0000-0000-0000000000e2', auth.uid(), 'student',
  '02900000-0000-0000-0000-000000000051', 'MS to S1', 'See me after school.');
do $$ begin
  -- The queue-style retry of the same send is a unique violation (the app treats it as done).
  begin
    insert into messages(id, sender_id, scope, target_id, title, body) values
     ('02900000-0000-0000-0000-0000000000e1', auth.uid(), 'class',
      '02900000-0000-0000-0000-0000000000c1', 'MS to 9-A', 'Bring your sets notebook.');
    raise exception 'RETRY_NOT_REFUSED';
  exception when unique_violation then null;
  end;
  assert (select count(*) from messages where title like 'MS %') = 2, 'teacher reads own sent only';
  assert public._ms_fails($q$ insert into messages(sender_id, scope, title, body)
      values (auth.uid(), 'school', 'MS blast', 'x') $q$), 'TEACHER_SENT_SCHOOL_WIDE';
  assert public._ms_fails($q$ insert into messages(sender_id, scope, target_id, title, body)
      values (auth.uid(), 'class', '02900000-0000-0000-0000-0000000000c2', 'MS c8', 'x') $q$),
    'TEACHER_SENT_OTHER_CLASS';
  assert public._ms_fails($q$ insert into messages(sender_id, scope, target_id, title, body)
      values (auth.uid(), 'student', '02900000-0000-0000-0000-000000000052', 'MS s2', 'x') $q$),
    'TEACHER_SENT_OTHER_CLASS_STUDENT';
  assert public._ms_fails($q$ insert into messages(sender_id, scope, target_id, title, body)
      values ('02900000-0000-0000-0000-000000000002', 'class',
              '02900000-0000-0000-0000-0000000000c1', 'MS spoof', 'x') $q$), 'TEACHER_SPOOFED_SENDER';
  -- Messages are immutable from the app: no edit, no delete, no push bookkeeping.
  assert public._ms_fails($q$ update messages set body = 'changed'
      where id = '02900000-0000-0000-0000-0000000000e1' $q$), 'TEACHER_EDITED_MESSAGE';
  assert public._ms_fails($q$ delete from messages
      where id = '02900000-0000-0000-0000-0000000000e1' $q$), 'TEACHER_DELETED_MESSAGE';
  assert public._ms_fails($q$ update messages set push_claimed_at = null
      where id = '02900000-0000-0000-0000-0000000000e1' $q$), 'TEACHER_RESET_PUSH_CLAIM';
  -- Not a student: no read state of their own.
  assert public._ms_fails($q$ select public.mark_messages_read(
      array['02900000-0000-0000-0000-0000000000e1']::uuid[]) $q$), 'TEACHER_MARKED_READ';
end $$;

-- Another teacher (teaches nothing) sends to nobody and reads none of T's.
set request.jwt.claim.sub = '02900000-0000-0000-0000-000000000004';
do $$ begin
  assert public._ms_fails($q$ insert into messages(sender_id, scope, target_id, title, body)
      values (auth.uid(), 'class', '02900000-0000-0000-0000-0000000000c1', 'MS x', 'x') $q$),
    'OTHER_TEACHER_SENT';
  assert (select count(*) from messages) = 0, 'other teacher reads T''s messages';
end $$;

-- ---- Admin A sends school-wide and to a class ----------------------------------
set request.jwt.claim.sub = '02900000-0000-0000-0000-000000000002';
insert into messages(id, sender_id, scope, target_id, title, body) values
 ('02900000-0000-0000-0000-0000000000e3', auth.uid(), 'school', null, 'MS school', 'Holiday on Monday.'),
 ('02900000-0000-0000-0000-0000000000e4', auth.uid(), 'class',
  '02900000-0000-0000-0000-0000000000c2', 'MS to 8', 'Class 8 only.');
do $$ begin
  assert (select count(*) from messages where title like 'MS %') = 5, 'admin reads every message';
  assert public._ms_fails($q$ delete from messages
      where id = '02900000-0000-0000-0000-0000000000e3' $q$), 'ADMIN_DELETED_MESSAGE';
end $$;

-- ---- Student S1 (9-A): inbox + read state --------------------------------------
set request.jwt.claim.sub = '02900000-0000-0000-0000-000000000011';
do $$ begin
  -- api.ts loadInbox: school-wide, own class, personal; never Class 8's or the old one's other class.
  assert (select count(*) from messages where title like 'MS %') = 4, 'S1 inbox count (e0 school, e1, e2, e3)';
  assert not exists (select 1 from messages where title = 'MS to 8'), 'S1_READ_OTHER_CLASS';
  assert public._ms_fails($q$ insert into messages(scope, title, body) values ('school', 'MS s1', 'x') $q$),
    'STUDENT_SENT_MESSAGE';
  assert public._ms_fails($q$ update messages set title = 'x' where title = 'MS school' $q$), 'STUDENT_EDITED';

  -- Mark two read; the Class 8 message (not visible) and a made-up id are ignored.
  assert public.mark_messages_read(array[
    '02900000-0000-0000-0000-0000000000e1', '02900000-0000-0000-0000-0000000000e3',
    '02900000-0000-0000-0000-0000000000e4', '02900000-0000-0000-0000-0000000000ff']::uuid[]) = 2,
    'mark_messages_read counts visible only';
  assert public.mark_messages_read(array['02900000-0000-0000-0000-0000000000e1']::uuid[]) = 0,
    'marking again is a no-op';
  assert (select count(*) from message_reads) = 2, 'S1 sees own read rows';

  -- Direct writes: only own student id, only for a visible message, never edited/deleted.
  assert public._ms_fails($q$ insert into message_reads(message_id, student_id) values
      ('02900000-0000-0000-0000-0000000000e4', '02900000-0000-0000-0000-000000000051') $q$),
    'S1_MARKED_INVISIBLE_MESSAGE';
  assert public._ms_fails($q$ insert into message_reads(message_id, student_id) values
      ('02900000-0000-0000-0000-0000000000e2', '02900000-0000-0000-0000-000000000052') $q$),
    'S1_MARKED_FOR_ANOTHER_STUDENT';
  assert public._ms_fails($q$ update message_reads set read_at = now() $q$), 'S1_EDITED_READ';
  assert public._ms_fails($q$ delete from message_reads $q$), 'S1_UNREAD';
end $$;

-- ---- Student S2 (Class 8): only school-wide + Class 8 ---------------------------
set request.jwt.claim.sub = '02900000-0000-0000-0000-000000000012';
do $$ begin
  assert (select count(*) from messages where title like 'MS %') = 3, 'S2 inbox (e0, e3, e4)';
  assert not exists (select 1 from messages where title in ('MS to 9-A', 'MS to S1')), 'S2_READ_9A';
  assert public.mark_messages_read(array['02900000-0000-0000-0000-0000000000e1']::uuid[]) = 0,
    'S2 marked a message it cannot read';
  assert (select count(*) from message_reads) = 0, 'S2 sees S1 reads';
  assert public.mark_messages_read(array['02900000-0000-0000-0000-0000000000e3']::uuid[]) = 1,
    'S2 marks the school message';
end $$;

-- A student's counts cover only their own reads, never classmates'.
set request.jwt.claim.sub = '02900000-0000-0000-0000-000000000011';
do $$ begin
  assert (select read_count from public.message_read_counts(
    array['02900000-0000-0000-0000-0000000000e3']::uuid[])) = 1, 'S1_SAW_OTHER_STUDENTS_READS';
end $$;

-- ---- Student S3 (struck off): no class messages --------------------------------
set request.jwt.claim.sub = '02900000-0000-0000-0000-000000000013';
do $$ begin
  assert not exists (select 1 from messages where title = 'MS to 9-A'), 'STRUCK_OFF_READ_CLASS_MESSAGE';
end $$;

-- ---- Read counts for the senders ----------------------------------------------
set request.jwt.claim.sub = '02900000-0000-0000-0000-000000000001';
do $$ begin
  assert (select read_count from public.message_read_counts(
    array['02900000-0000-0000-0000-0000000000e1', '02900000-0000-0000-0000-0000000000e3']::uuid[])
    where message_id = '02900000-0000-0000-0000-0000000000e1') = 1, 'T sees read count of own message';
  assert not exists (select 1 from public.message_read_counts(
    array['02900000-0000-0000-0000-0000000000e3']::uuid[])), 'T saw reads of the admin''s message';
end $$;
set request.jwt.claim.sub = '02900000-0000-0000-0000-000000000004';
do $$ begin
  assert (select count(*) from public.message_read_counts(
    array['02900000-0000-0000-0000-0000000000e1']::uuid[])) = 0, 'OTHER_TEACHER_SAW_READS';
end $$;
set request.jwt.claim.sub = '02900000-0000-0000-0000-000000000002';
do $$ begin
  assert (select read_count from public.message_read_counts(
    array['02900000-0000-0000-0000-0000000000e3']::uuid[])) = 2, 'admin sees all read counts';
end $$;

-- ---- Shared device: one push token moves S1 -> S2, sign-out disables it -------------
set request.jwt.claim.sub = '02900000-0000-0000-0000-000000000011';
select public.register_push_token('ExponentPushToken[ms-shared]', '{"os":"android"}');
do $$ begin
  assert (select count(*) from push_tokens where token = 'ExponentPushToken[ms-shared]'
          and student_id = '02900000-0000-0000-0000-000000000051' and disabled_at is null) = 1, 'S1 token';
  assert public._ms_fails($q$ select public.register_push_token('not-a-token') $q$), 'BAD_TOKEN_ACCEPTED';
end $$;
select public.disable_push_token('ExponentPushToken[ms-shared]');
do $$ begin
  assert (select disabled_at from push_tokens where token = 'ExponentPushToken[ms-shared]') is not null,
    'sign-out did not disable the token';
end $$;
set request.jwt.claim.sub = '02900000-0000-0000-0000-000000000012';
select public.register_push_token('ExponentPushToken[ms-shared]', '{"os":"android"}');
do $$ begin
  assert (select student_id from push_tokens where token = 'ExponentPushToken[ms-shared]'
          and disabled_at is null) = '02900000-0000-0000-0000-000000000052', 'token did not move to S2';
  assert (select count(*) from push_tokens where token = 'ExponentPushToken[ms-shared]') = 1, 'duplicate token row';
end $$;
-- S1 can't switch off S2's token, and a teacher has no token of their own.
set request.jwt.claim.sub = '02900000-0000-0000-0000-000000000011';
select public.disable_push_token('ExponentPushToken[ms-shared]');
do $$ begin
  assert (select disabled_at from push_tokens where token = 'ExponentPushToken[ms-shared]') is null,
    'S1_DISABLED_S2_TOKEN';
end $$;
set request.jwt.claim.sub = '02900000-0000-0000-0000-000000000001';
do $$ begin
  assert public._ms_fails($q$ select public.register_push_token('ExponentPushToken[ms-t]') $q$),
    'TEACHER_REGISTERED_TOKEN';
end $$;

-- ---- Anon can't call or read -----------------------------------------------------
reset role;
set role anon;
do $$ begin
  assert public._ms_fails($q$ select public.mark_messages_read('{}'::uuid[]) $q$), 'ANON_CALLED_RPC';
  assert public._ms_fails($q$ select 1 from message_reads $q$), 'ANON_READ_REPLAYS';
end $$;

-- ---- The SQL Editor / Edge Function (service role) stay unrestricted ------------
reset role;
do $$ begin
  update messages set push_claimed_at = now(), push_result = '{"sent":1}'
   where id = '02900000-0000-0000-0000-0000000000e1' and push_claimed_at is null;
  assert (select push_result->>'sent' from messages where id = '02900000-0000-0000-0000-0000000000e1') = '1',
    'service-side claim failed';
end $$;

-- Clean up fixtures' helper.
drop function public._ms_fails(text);
\echo 029 smoke OK
