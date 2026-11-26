-- Offline exams smoke (TEST_PLAN OX-1, prompt 60; O-6 server side). As signed-in
-- users: only the subject teacher schedules an offline exam with a sane window;
-- an enrolled student downloads the paper without answer keys (deadline = the
-- window's end), again on "another device" gets the same session; an upload in
-- time is accepted and graded at once, a retry of it changes nothing; over the
-- duration → stored, flagged, not graded; after the window (time travel) →
-- stored as late, not graded; a second upload after submitting → already
-- closed; the teacher accepts a flagged upload with a reason (then it is
-- graded); bad answers are refused; RLS: own uploads only, no client writes;
-- a live session can't use the offline path. Throwaway local Postgres only.
-- Passes after 017 + 019 + 020 + 038 (035 optional).
\set ON_ERROR_STOP 1
reset role;
set request.jwt.claim.sub = '';
grant usage on schema public, auth to authenticated, anon;
grant select, insert, update, delete on all tables in schema public to authenticated, anon;
revoke insert, update, delete on public.exam_offline_uploads from authenticated, anon;

update academic_years set is_current = false;
insert into academic_years(id, label, is_current) values ('38000000-0000-0000-0000-0000000000a0', 'OX-2026-27', true);
insert into classes(id, name, grade_level) values
 ('38000000-0000-0000-0000-0000000000c9', 'OX Class 9', 9), ('38000000-0000-0000-0000-0000000000c8', 'OX Class 8', 8);
insert into subjects(id, class_id, name) values
 ('38000000-0000-0000-0000-0000000000d1', '38000000-0000-0000-0000-0000000000c9', 'OX Maths'),
 ('38000000-0000-0000-0000-0000000000d2', '38000000-0000-0000-0000-0000000000c9', 'OX Science');
insert into chapters(id, subject_id, title, sort_order) values
 ('38000000-0000-0000-0000-0000000000e1', '38000000-0000-0000-0000-0000000000d1', 'OX Algebra', 1);
insert into topics(id, chapter_id, title_en, sort_order) values
 ('38000000-0000-0000-0000-0000000000b1', '38000000-0000-0000-0000-0000000000e1', 'OX Equations', 1);
insert into concepts(id, topic_id, title_en) values
 ('38000000-0000-0000-0000-0000000000f1', '38000000-0000-0000-0000-0000000000b1', 'OX Balance');
insert into students(id, student_code, full_name) values
 ('38000000-0000-0000-0000-000000000051', 'OX-1', 'TEST- OX One'),
 ('38000000-0000-0000-0000-000000000052', 'OX-2', 'TEST- OX Two'),
 ('38000000-0000-0000-0000-000000000053', 'OX-3', 'TEST- OX Three'),
 ('38000000-0000-0000-0000-000000000054', 'OX-4', 'TEST- OX Four');
insert into enrollments(student_id, class_id, year_id, status) values
 ('38000000-0000-0000-0000-000000000051', '38000000-0000-0000-0000-0000000000c9', '38000000-0000-0000-0000-0000000000a0', 'active'),
 ('38000000-0000-0000-0000-000000000052', '38000000-0000-0000-0000-0000000000c9', '38000000-0000-0000-0000-0000000000a0', 'active'),
 ('38000000-0000-0000-0000-000000000053', '38000000-0000-0000-0000-0000000000c8', '38000000-0000-0000-0000-0000000000a0', 'active'),
 ('38000000-0000-0000-0000-000000000054', '38000000-0000-0000-0000-0000000000c9', '38000000-0000-0000-0000-0000000000a0', 'active');
insert into auth.users(id, email) values
 ('38000000-0000-0000-0000-000000000001', 'ox.tm@school.test'),
 ('38000000-0000-0000-0000-000000000002', 'ox.ts@school.test'),
 ('38000000-0000-0000-0000-000000000003', 'ox.admin@school.test'),
 ('38000000-0000-0000-0000-000000000011', 'ox1@students.school.invalid'),
 ('38000000-0000-0000-0000-000000000012', 'ox2@students.school.invalid'),
 ('38000000-0000-0000-0000-000000000013', 'ox3@students.school.invalid'),
 ('38000000-0000-0000-0000-000000000014', 'ox4@students.school.invalid');
update profiles set role = 'teacher' where id in ('38000000-0000-0000-0000-000000000001', '38000000-0000-0000-0000-000000000002');
update profiles set role = 'admin' where id = '38000000-0000-0000-0000-000000000003';
update profiles set role = 'student', student_id = ('38000000-0000-0000-0000-00000000005' || right(id::text, 1))::uuid
 where id in ('38000000-0000-0000-0000-000000000011', '38000000-0000-0000-0000-000000000012',
              '38000000-0000-0000-0000-000000000013', '38000000-0000-0000-0000-000000000014');
insert into teacher_assignments(teacher_id, class_id, subject_id, year_id) values
 ('38000000-0000-0000-0000-000000000001', '38000000-0000-0000-0000-0000000000c9', '38000000-0000-0000-0000-0000000000d1', '38000000-0000-0000-0000-0000000000a0'),
 ('38000000-0000-0000-0000-000000000002', '38000000-0000-0000-0000-0000000000c9', '38000000-0000-0000-0000-0000000000d2', '38000000-0000-0000-0000-0000000000a0');
-- q01–q04 MCQ (key A), q05 short text (key "x"); all approved for exams.
insert into questions(id, chapter_id, concept_id, type, cognitive_level, difficulty, body, answer, status, created_by, is_test_data)
select format('38000000-0000-0000-0000-0000000001%s', lpad(n::text, 2, '0'))::uuid,
       '38000000-0000-0000-0000-0000000000e1', '38000000-0000-0000-0000-0000000000f1',
       case when n = 5 then 'short_text' else 'mcq' end, 'apply', 2,
       case when n = 5 then '{"stem":{"en":"OX 5"}}'::jsonb
            else format('{"stem":{"en":"OX %s"},"options":[{"key":"A","text":{"en":"a"}},{"key":"B","text":{"en":"b"}},{"key":"C","text":{"en":"c"}}]}', n)::jsonb end,
       case when n = 5 then '{"correct":"x"}'::jsonb else '{"correct":"A"}'::jsonb end,
       'approved', '38000000-0000-0000-0000-000000000003', true
  from generate_series(1, 5) n;
insert into item_approvals(item_kind, item_id, version, scope, approved_by)
select 'question', id, 1, 'exam', '38000000-0000-0000-0000-000000000003'
  from questions where id::text like '38000000-0000-0000-0000-0000000001%';
insert into assessments(id, year_id, class_id, subject_id, title, type, status, created_by) values
 ('38000000-0000-0000-0000-00000000aa01', '38000000-0000-0000-0000-0000000000a0', '38000000-0000-0000-0000-0000000000c9',
  '38000000-0000-0000-0000-0000000000d1', 'OX offline exam', 'test', 'draft', '38000000-0000-0000-0000-000000000001'),
 ('38000000-0000-0000-0000-00000000aa02', '38000000-0000-0000-0000-0000000000a0', '38000000-0000-0000-0000-0000000000c9',
  '38000000-0000-0000-0000-0000000000d1', 'OX live exam', 'test', 'draft', '38000000-0000-0000-0000-000000000001');
insert into assessment_questions(assessment_id, question_id, marks, sort_order)
select '38000000-0000-0000-0000-00000000aa01', id, 1, row_number() over (order by id)
  from questions where id::text like '38000000-0000-0000-0000-0000000001%';
insert into assessment_questions(assessment_id, question_id, marks, sort_order) values
 ('38000000-0000-0000-0000-00000000aa02', '38000000-0000-0000-0000-000000000101', 1, 1);

create or replace function public._ox_refused(p_sql text, p_like text default '%') returns boolean
language plpgsql as $$
begin execute p_sql; return false;
exception when others then return sqlerrm like p_like; end $$;
-- One upload: p_answers by question number, elapsed in minutes.
create or replace function public._ox_up(p_upload int, p_session uuid, p_answers jsonb, p_minutes numeric)
returns jsonb language sql as $$
  select public.exam_offline_submit(
    format('38000000-0000-0000-0000-0000000ab%s', lpad(p_upload::text, 3, '0'))::uuid, p_session,
    (select coalesce(jsonb_object_agg(format('38000000-0000-0000-0000-0000000001%s', lpad(key, 2, '0')), value), '{}')
       from jsonb_each(p_answers)),
    (p_minutes * 60000)::bigint, now() - interval '30 minutes', now(), 'smoke-device',
    '{"hidden": 2, "clock_back": 0}')
$$;
grant execute on function public._ox_refused(text, text), public._ox_up(int, uuid, jsonb, numeric) to authenticated;

-- ---- Scheduling: only the subject teacher, with a sane window ----------------------
set role authenticated;
set request.jwt.claim.sub = '38000000-0000-0000-0000-000000000011';
do $$ begin
  if not public._ox_refused($q$select public.exam_schedule_offline('38000000-0000-0000-0000-00000000aa01', now(), now() + interval '1 day', 20)$q$, '%not_your_class%') then
    raise exception 'OX_STUDENT_SCHEDULED';
  end if;
end $$;
set request.jwt.claim.sub = '38000000-0000-0000-0000-000000000002';  -- Science teacher
do $$ begin
  if not public._ox_refused($q$select public.exam_schedule_offline('38000000-0000-0000-0000-00000000aa01', now(), now() + interval '1 day', 20)$q$, '%not_your_class%') then
    raise exception 'OX_OTHER_SUBJECT_SCHEDULED';
  end if;
end $$;
set request.jwt.claim.sub = '38000000-0000-0000-0000-000000000001';  -- Maths teacher
do $$
declare r jsonb;
begin
  if not public._ox_refused($q$select public.exam_schedule_offline('38000000-0000-0000-0000-00000000aa01', now(), now() - interval '1 hour', 20)$q$, '%bad_window%') then
    raise exception 'OX_PAST_WINDOW';
  end if;
  if not public._ox_refused($q$select public.exam_schedule_offline('38000000-0000-0000-0000-00000000aa01', now(), now() + interval '40 days', 20)$q$, '%bad_window%') then
    raise exception 'OX_HUGE_WINDOW';
  end if;
  r := public.exam_schedule_offline('38000000-0000-0000-0000-00000000aa01', now(), now() + interval '1 day', 20);
  if (r->>'duration_seconds')::int <> 1200 then raise exception 'OX_SCHEDULE: %', r; end if;
  perform public.exam_launch('38000000-0000-0000-0000-00000000aa02', 10);
end $$;

-- ---- Download: enrolled only, no keys, deadline = window end, one session ----------
set request.jwt.claim.sub = '38000000-0000-0000-0000-000000000013';  -- Class 8
do $$ begin
  if not public._ox_refused($q$select public.exam_offline_download('38000000-0000-0000-0000-00000000aa01')$q$, '%not_enrolled%') then
    raise exception 'OX_OTHER_CLASS_DOWNLOADED';
  end if;
end $$;
set request.jwt.claim.sub = '38000000-0000-0000-0000-000000000011';
do $$
declare d jsonb; d2 jsonb; r jsonb; live jsonb;
begin
  d := public.exam_offline_download('38000000-0000-0000-0000-00000000aa01');
  if jsonb_array_length(d->'questions') <> 5 then raise exception 'OX_PAPER: %', d; end if;
  if d::text like '%"correct"%' then raise exception 'OX_KEYS_IN_PAPER'; end if;
  if (d->>'deadline_at')::timestamptz <> (d->>'closes_at')::timestamptz then
    raise exception 'OX_DEADLINE_NOT_WINDOW: % vs %', d->>'deadline_at', d->>'closes_at';
  end if;
  if (d->>'duration_seconds')::int <> 1200 or (d->>'grace_seconds')::int <> 30 then
    raise exception 'OX_DOWNLOAD_META: %', d;
  end if;
  if (select delivery from exam_sessions where id = (d->>'session_id')::uuid) <> 'offline' then
    raise exception 'OX_NOT_OFFLINE_DELIVERY';
  end if;
  d2 := public.exam_offline_download('38000000-0000-0000-0000-00000000aa01');   -- another device
  if d2->>'session_id' <> d->>'session_id' or d2->'questions' <> d->'questions' then
    raise exception 'OX_SECOND_DEVICE_NEW_PAPER';
  end if;
  -- Bad uploads are refused outright.
  if not public._ox_refused(format($q$select public._ox_up(90, %L, '{"9":"A"}', 10)$q$, d->>'session_id'), '%question_not_in_paper%') then
    raise exception 'OX_FOREIGN_QUESTION';
  end if;
  if not public._ox_refused(format($q$select public._ox_up(91, %L, '{"1":{"x":1}}', 10)$q$, d->>'session_id'), '%bad_answer%') then
    raise exception 'OX_OBJECT_ANSWER';
  end if;
  if not public._ox_refused(format($q$select public._ox_up(92, %L, '{"1":"A"}', -1)$q$, d->>'session_id'), '%bad_elapsed%') then
    raise exception 'OX_NEGATIVE_ELAPSED';
  end if;
  -- In time: accepted, graded at once (q1, q2, q5 right; q3 wrong; q4 blank).
  r := public._ox_up(1, (d->>'session_id')::uuid, '{"1":"A","2":"A","3":"B","5":"x"}', 15);
  if r->>'verdict' <> 'accepted' or (r->>'score')::numeric <> 3 or (r->>'total')::numeric <> 5
     or r->>'status' <> 'submitted' or (r->>'answered')::int <> 4 then
    raise exception 'OX_ACCEPTED: %', r;
  end if;
  -- A retry of the same upload: same verdict, nothing new stored.
  r := public._ox_up(1, (d->>'session_id')::uuid, '{"1":"B","2":"B","3":"B","4":"B","5":"y"}', 15);
  if r->>'verdict' <> 'accepted' or (r->>'score')::numeric <> 3 then raise exception 'OX_RETRY: %', r; end if;
  if (select count(*) from exam_offline_uploads) <> 1 then raise exception 'OX_RETRY_STORED_TWICE'; end if;
  -- A second, different upload after handing in: stored, not counted.
  r := public._ox_up(2, (d->>'session_id')::uuid, '{"1":"B"}', 16);
  if r->>'verdict' <> 'already_closed' or r ? 'score' and r->>'score' is not null then
    raise exception 'OX_ALREADY_CLOSED: %', r;
  end if;
  if (select score from exam_sessions where id = (d->>'session_id')::uuid) <> 3 then
    raise exception 'OX_SECOND_UPLOAD_CHANGED_SCORE';
  end if;
  -- The live exam's session can't take the offline path.
  live := public.start_exam_session('38000000-0000-0000-0000-00000000aa02');
  if not public._ox_refused(format($q$select public._ox_up(93, %L, '{"1":"A"}', 1)$q$, live->>'session_id'), '%not_offline%') then
    raise exception 'OX_LIVE_USED_OFFLINE_PATH';
  end if;
  -- My offline exams: shows my result.
  r := public.my_offline_exams();
  if jsonb_array_length(r) <> 1 or (r->0->>'score')::numeric <> 3 then raise exception 'OX_MY_LIST: %', r; end if;
  -- No direct writes.
  if not public._ox_refused($q$insert into exam_offline_uploads(id, session_id, learner_id, answers, client_elapsed_ms, verdict)
       select gen_random_uuid(), session_id, learner_id, '{}', 1, 'accepted' from exam_offline_uploads limit 1$q$) then
    raise exception 'OX_CLIENT_WROTE_UPLOAD';
  end if;
end $$;

-- ---- Over the duration: stored, flagged, not graded --------------------------------
set request.jwt.claim.sub = '38000000-0000-0000-0000-000000000012';
do $$
declare d jsonb; r jsonb;
begin
  if exists (select 1 from exam_offline_uploads) then raise exception 'OX_SAW_OTHERS_UPLOADS'; end if;
  d := public.exam_offline_download('38000000-0000-0000-0000-00000000aa01');
  r := public._ox_up(3, (d->>'session_id')::uuid, '{"1":"A","2":"A","3":"A","4":"A","5":"x"}', 21);
  if r->>'verdict' <> 'over_time' or r->>'score' is not null or r->>'status' <> 'auto_submitted' then
    raise exception 'OX_OVER_TIME: %', r;
  end if;
  if exists (select 1 from exam_session_answers where session_id = (d->>'session_id')::uuid) then
    raise exception 'OX_OVER_TIME_ANSWERS_STORED';
  end if;
  if not public._ox_refused($q$select public.exam_offline_accept('38000000-0000-0000-0000-0000000ab003', 'me')$q$, '%not_your_class%') then
    raise exception 'OX_STUDENT_ACCEPTED_OWN';
  end if;
end $$;

-- ---- After the window (time travel): late, stored, not graded -----------------------
set request.jwt.claim.sub = '38000000-0000-0000-0000-000000000014';
select public.exam_offline_download('38000000-0000-0000-0000-00000000aa01') \gset dl_
reset role;
update exam_sessions set deadline_at = now() - interval '2 hours'
 where learner_id = '38000000-0000-0000-0000-000000000014';
select public.exam_sweep() as swept \gset
set role authenticated;
set request.jwt.claim.sub = '38000000-0000-0000-0000-000000000014';
do $$
declare r jsonb; sid uuid;
begin
  select id into sid from exam_sessions where learner_id = auth.uid();
  if (select status from exam_sessions where id = sid) <> 'auto_submitted' then raise exception 'OX_SWEEP_DID_NOT_CLOSE'; end if;
  r := public._ox_up(4, sid, '{"1":"A","2":"A"}', 10);
  if r->>'verdict' <> 'late' or r->>'score' is not null then raise exception 'OX_LATE: %', r; end if;
  if (select count(*) from exam_offline_uploads where session_id = sid) <> 1 then raise exception 'OX_LATE_NOT_STORED'; end if;
end $$;

-- ---- The teacher: offline status, accept a flagged upload with a reason ------------
set request.jwt.claim.sub = '38000000-0000-0000-0000-000000000002';  -- Science teacher
do $$ begin
  if not public._ox_refused($q$select public.exam_offline_status('38000000-0000-0000-0000-00000000aa01')$q$, '%not_your_class%') then
    raise exception 'OX_OTHER_TEACHER_STATUS';
  end if;
  if exists (select 1 from exam_offline_uploads) then raise exception 'OX_OTHER_TEACHER_SAW_UPLOADS'; end if;
end $$;
set request.jwt.claim.sub = '38000000-0000-0000-0000-000000000001';
do $$
declare st jsonb; r jsonb;
begin
  st := public.exam_offline_status('38000000-0000-0000-0000-00000000aa01');
  if jsonb_array_length(st) <> 3 then raise exception 'OX_STATUS_ROWS: %', st; end if;
  if (st->0->'client_flags'->>'hidden')::int <> 2 then raise exception 'OX_STATUS_FLAGS: %', st->0; end if;
  if (select count(*) from jsonb_array_elements(st) x where x->>'delivery' = 'offline') <> 3 then
    raise exception 'OX_STATUS_DELIVERY: %', st;
  end if;
  if (select string_agg(x->>'verdict', ',' order by x->>'verdict') from jsonb_array_elements(st) x)
     <> 'already_closed,late,over_time' then
    raise exception 'OX_STATUS_VERDICTS: %', st;
  end if;
  if (select count(*) from exam_offline_uploads) <> 4 then raise exception 'OX_TEACHER_UPLOADS'; end if;
  if not public._ox_refused($q$select public.exam_offline_accept('38000000-0000-0000-0000-0000000ab003', '  ')$q$, '%reason_required%') then
    raise exception 'OX_ACCEPT_NO_REASON';
  end if;
  r := public.exam_offline_accept('38000000-0000-0000-0000-0000000ab003', 'Power cut at home, timer ran on');
  if r->>'status' <> 'submitted' or (r->>'score')::numeric <> 5 then raise exception 'OX_ACCEPT: %', r; end if;
  if (select accepted_by::text || '|' || accept_reason from exam_offline_uploads
       where id = '38000000-0000-0000-0000-0000000ab003')
     <> '38000000-0000-0000-0000-000000000001|Power cut at home, timer ran on' then
    raise exception 'OX_ACCEPT_NOT_LOGGED';
  end if;
  if not public._ox_refused($q$select public.exam_offline_accept('38000000-0000-0000-0000-0000000ab003', 'again')$q$, '%already_accepted%') then
    raise exception 'OX_ACCEPTED_TWICE';
  end if;
  if not public._ox_refused($q$select public.exam_offline_accept('38000000-0000-0000-0000-0000000ab001', 'x')$q$, '%already_accepted%') then
    raise exception 'OX_ACCEPTED_AN_ACCEPTED';
  end if;
end $$;
set request.jwt.claim.sub = '38000000-0000-0000-0000-000000000012';
do $$
declare r jsonb := public._ox_up(3, (select id from exam_sessions where learner_id = auth.uid()), '{}', 21);
begin
  if r->>'verdict' <> 'over_time' or (r->>'score')::numeric <> 5 then
    raise exception 'OX_STUDENT_SEES_ACCEPTED_SCORE: %', r;
  end if;
end $$;

reset role;
drop function public._ox_refused(text, text), public._ox_up(int, uuid, jsonb, numeric);
\echo '038 smoke: all checks passed'
