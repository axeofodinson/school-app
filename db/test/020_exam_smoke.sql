-- Live exam smoke (TEST_PLAN EX-1; prompt 50). As signed-in users: the draw
-- pool is the subject teacher's approved exam items with this class's recent
-- use; launch gives one join code; a student joins, starts, gets options
-- shuffled per student without keys, saves (an older tap never overwrites a
-- newer one), resumes on "another device" with the same paper, submits and
-- sees the score at once; late saves are refused; exam_end and the sweep
-- close what is left. Throwaway local Postgres only. Passes after 017 + 019 +
-- 020 (018 optional: then student_paper must refuse the exam too).
\set ON_ERROR_STOP 1
reset role;
set request.jwt.claim.sub = '';
grant usage on schema public, auth to authenticated, anon;
grant select, insert, update, delete on all tables in schema public to authenticated, anon;

update academic_years set is_current = false;
insert into academic_years(id, label, is_current) values ('0e000000-0000-0000-0000-0000000000a0', 'EX-2026-27', true);
insert into classes(id, name, grade_level) values
 ('0e000000-0000-0000-0000-0000000000c9', 'EX Class 9', 9), ('0e000000-0000-0000-0000-0000000000c8', 'EX Class 8', 8);
insert into subjects(id, class_id, name) values
 ('0e000000-0000-0000-0000-0000000000d1', '0e000000-0000-0000-0000-0000000000c9', 'EX Maths'),
 ('0e000000-0000-0000-0000-0000000000d2', '0e000000-0000-0000-0000-0000000000c9', 'EX Science');
insert into chapters(id, subject_id, title, sort_order) values
 ('0e000000-0000-0000-0000-0000000000e1', '0e000000-0000-0000-0000-0000000000d1', 'EX Algebra', 1);
insert into topics(id, chapter_id, title_en, sort_order) values
 ('0e000000-0000-0000-0000-0000000000b1', '0e000000-0000-0000-0000-0000000000e1', 'EX Equations', 1);
insert into concepts(id, topic_id, title_en) values
 ('0e000000-0000-0000-0000-0000000000f1', '0e000000-0000-0000-0000-0000000000b1', 'EX Balance');
insert into students(id, student_code, full_name) values
 ('0e000000-0000-0000-0000-000000000051', 'EX-1', 'TEST- EX One'),
 ('0e000000-0000-0000-0000-000000000052', 'EX-2', 'TEST- EX Two'),
 ('0e000000-0000-0000-0000-000000000053', 'EX-3', 'TEST- EX Three');
insert into enrollments(student_id, class_id, year_id, status) values
 ('0e000000-0000-0000-0000-000000000051', '0e000000-0000-0000-0000-0000000000c9', '0e000000-0000-0000-0000-0000000000a0', 'active'),
 ('0e000000-0000-0000-0000-000000000052', '0e000000-0000-0000-0000-0000000000c9', '0e000000-0000-0000-0000-0000000000a0', 'active'),
 ('0e000000-0000-0000-0000-000000000053', '0e000000-0000-0000-0000-0000000000c8', '0e000000-0000-0000-0000-0000000000a0', 'active');
insert into auth.users(id, email) values
 ('0e000000-0000-0000-0000-000000000001', 'ex.tm@school.test'),
 ('0e000000-0000-0000-0000-000000000002', 'ex.ts@school.test'),
 ('0e000000-0000-0000-0000-000000000003', 'ex.admin@school.test'),
 ('0e000000-0000-0000-0000-000000000011', 'ex1@students.school.invalid'),
 ('0e000000-0000-0000-0000-000000000012', 'ex2@students.school.invalid'),
 ('0e000000-0000-0000-0000-000000000013', 'ex3@students.school.invalid');
update profiles set role = 'teacher' where id in ('0e000000-0000-0000-0000-000000000001', '0e000000-0000-0000-0000-000000000002');
update profiles set role = 'admin' where id = '0e000000-0000-0000-0000-000000000003';
update profiles set role = 'student', student_id = '0e000000-0000-0000-0000-000000000051' where id = '0e000000-0000-0000-0000-000000000011';
update profiles set role = 'student', student_id = '0e000000-0000-0000-0000-000000000052' where id = '0e000000-0000-0000-0000-000000000012';
update profiles set role = 'student', student_id = '0e000000-0000-0000-0000-000000000053' where id = '0e000000-0000-0000-0000-000000000013';
insert into teacher_assignments(teacher_id, class_id, subject_id, year_id) values
 ('0e000000-0000-0000-0000-000000000001', '0e000000-0000-0000-0000-0000000000c9', '0e000000-0000-0000-0000-0000000000d1', '0e000000-0000-0000-0000-0000000000a0'),
 ('0e000000-0000-0000-0000-000000000002', '0e000000-0000-0000-0000-0000000000c9', '0e000000-0000-0000-0000-0000000000d2', '0e000000-0000-0000-0000-0000000000a0');
-- 10 Maths MCQs (key A, four options). q01–q08 approved for exams, q09 for
-- practice only, q10 retired. Plus one short_text (q11, key "x") for exams.
insert into questions(id, chapter_id, concept_id, type, cognitive_level, difficulty, body, answer, status, created_by, is_test_data)
select format('0e000000-0000-0000-0000-0000000001%s', lpad(n::text, 2, '0'))::uuid,
       '0e000000-0000-0000-0000-0000000000e1', '0e000000-0000-0000-0000-0000000000f1',
       'mcq', 'apply', 1 + n % 3,
       format('{"stem":{"en":"EX %s"},"options":[{"key":"A","text":{"en":"a"}},{"key":"B","text":{"en":"b"}},{"key":"C","text":{"en":"c"}},{"key":"D","text":{"en":"d"}}]}', n)::jsonb,
       '{"correct":"A"}', case when n = 10 then 'retired' else 'approved' end,
       '0e000000-0000-0000-0000-000000000003', true
  from generate_series(1, 10) n;
insert into questions(id, chapter_id, concept_id, type, cognitive_level, difficulty, body, answer, status, created_by, is_test_data)
values ('0e000000-0000-0000-0000-000000000111', '0e000000-0000-0000-0000-0000000000e1', '0e000000-0000-0000-0000-0000000000f1',
        'short_text', 'recall', 2, '{"stem":{"en":"EX 11"}}', '{"correct":"x"}', 'approved',
        '0e000000-0000-0000-0000-000000000003', true);
insert into item_approvals(item_kind, item_id, version, scope, approved_by)
select 'question', id, 1, case when id = '0e000000-0000-0000-0000-000000000109' then 'practice' else 'exam' end,
       '0e000000-0000-0000-0000-000000000003'
  from questions where id::text like '0e000000-0000-0000-0000-0000000001%';

create or replace function public._ex_refused(p_sql text, p_like text default '%') returns boolean
language plpgsql as $$
begin execute p_sql; return false;
exception when others then return sqlerrm like p_like; end $$;
grant execute on function public._ex_refused(text, text) to authenticated;

-- An earlier test of this class used q01 (recent use shows in the pool).
insert into assessments(id, year_id, class_id, subject_id, title, type, status, created_by)
values ('0e000000-0000-0000-0000-00000000aa00', '0e000000-0000-0000-0000-0000000000a0', '0e000000-0000-0000-0000-0000000000c9',
        '0e000000-0000-0000-0000-0000000000d1', 'EX old test', 'test', 'closed', '0e000000-0000-0000-0000-000000000001');
insert into assessment_questions(assessment_id, question_id, marks, sort_order)
values ('0e000000-0000-0000-0000-00000000aa00', '0e000000-0000-0000-0000-000000000101', 1, 1);

-- ---- Draw pool -----------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '0e000000-0000-0000-0000-000000000001';
do $$
declare n int; used int;
begin
  select count(*), count(last_used_at) into n, used
    from public.exam_draw_pool('0e000000-0000-0000-0000-0000000000c9', '0e000000-0000-0000-0000-0000000000d1');
  if n <> 9 then raise exception 'POOL_SIZE (want 8 mcq + 1 short): %', n; end if;
  if used <> 1 then raise exception 'POOL_RECENT_USE: %', used; end if;
  if exists (select 1 from public.exam_draw_pool('0e000000-0000-0000-0000-0000000000c9', '0e000000-0000-0000-0000-0000000000d1')
              where id in ('0e000000-0000-0000-0000-000000000109', '0e000000-0000-0000-0000-000000000110')) then
    raise exception 'POOL_HAS_PRACTICE_ONLY_OR_RETIRED';
  end if;
  if (select topic_id from public.exam_draw_pool('0e000000-0000-0000-0000-0000000000c9', '0e000000-0000-0000-0000-0000000000d1') limit 1)
     <> '0e000000-0000-0000-0000-0000000000b1' then raise exception 'POOL_TOPIC'; end if;
end $$;
set request.jwt.claim.sub = '0e000000-0000-0000-0000-000000000002';
do $$ begin
  if not public._ex_refused($q$select * from public.exam_draw_pool('0e000000-0000-0000-0000-0000000000c9', '0e000000-0000-0000-0000-0000000000d1')$q$, '%not_your_class%') then
    raise exception 'POOL_OTHER_SUBJECT_TEACHER_ALLOWED';
  end if;
end $$;
set request.jwt.claim.sub = '0e000000-0000-0000-0000-000000000011';
do $$ begin
  if not public._ex_refused($q$select * from public.exam_draw_pool('0e000000-0000-0000-0000-0000000000c9', '0e000000-0000-0000-0000-0000000000d1')$q$, '%not_your_class%') then
    raise exception 'POOL_STUDENT_ALLOWED';
  end if;
  if not public._ex_refused($q$select public.exam_sweep()$q$) then raise exception 'SWEEP_OPEN_TO_CLIENTS'; end if;
  if not public._ex_refused($q$select public.grade_exam_session(gen_random_uuid())$q$) then raise exception 'GRADE_OPEN_TO_CLIENTS'; end if;
end $$;

-- ---- The teacher makes a draft (as the builder does) and launches it ------------
set request.jwt.claim.sub = '0e000000-0000-0000-0000-000000000001';
insert into assessments(id, year_id, class_id, subject_id, title, type, status, created_by, blueprint)
values ('0e000000-0000-0000-0000-00000000aa01', '0e000000-0000-0000-0000-0000000000a0', '0e000000-0000-0000-0000-0000000000c9',
        '0e000000-0000-0000-0000-0000000000d1', 'EX surprise', 'quiz', 'draft', '0e000000-0000-0000-0000-000000000001',
        '{"count":5,"minutes":20,"marksEach":2}');
insert into assessment_questions(assessment_id, question_id, marks, sort_order, question_version)
select '0e000000-0000-0000-0000-00000000aa01', format('0e000000-0000-0000-0000-0000000001%s', lpad(n::text, 2, '0'))::uuid, 2, n, 1
  from generate_series(1, 4) n;
insert into assessment_questions(assessment_id, question_id, marks, sort_order, question_version)
values ('0e000000-0000-0000-0000-00000000aa01', '0e000000-0000-0000-0000-000000000111', 2, 5, 1);

set request.jwt.claim.sub = '0e000000-0000-0000-0000-000000000011';
do $$ begin
  if not public._ex_refused($q$select public.start_exam_session('0e000000-0000-0000-0000-00000000aa01')$q$, '%exam_not_available%') then
    raise exception 'DRAFT_EXAM_STARTED';
  end if;
end $$;
set request.jwt.claim.sub = '0e000000-0000-0000-0000-000000000002';
do $$ begin
  if not public._ex_refused($q$select public.exam_launch('0e000000-0000-0000-0000-00000000aa01', 20)$q$, '%not_your_class%') then
    raise exception 'LAUNCH_BY_OTHER_SUBJECT_TEACHER';
  end if;
end $$;
set request.jwt.claim.sub = '0e000000-0000-0000-0000-000000000001';
do $$
declare r jsonb; r2 jsonb;
begin
  r := public.exam_launch('0e000000-0000-0000-0000-00000000aa01', 20);
  if r->>'join_code' !~ '^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$' then raise exception 'JOIN_CODE: %', r; end if;
  if (r->>'duration_seconds')::int <> 1200 then raise exception 'DURATION: %', r; end if;
  r2 := public.exam_launch('0e000000-0000-0000-0000-00000000aa01', 20);
  if r2->>'join_code' <> r->>'join_code' then raise exception 'RELAUNCH_NEW_CODE'; end if;
  perform set_config('ex.code', r->>'join_code', false);
end $$;

-- ---- Student joins, starts, saves, resumes, submits ------------------------------
set request.jwt.claim.sub = '0e000000-0000-0000-0000-000000000013';
do $$ begin
  if not public._ex_refused(format('select public.exam_join(%L)', current_setting('ex.code')), '%exam_code_unknown%') then
    raise exception 'OTHER_CLASS_JOINED';
  end if;
  if not public._ex_refused($q$select public.start_exam_session('0e000000-0000-0000-0000-00000000aa01')$q$, '%not_enrolled%') then
    raise exception 'OTHER_CLASS_STARTED';
  end if;
end $$;
set request.jwt.claim.sub = '0e000000-0000-0000-0000-000000000011';
do $$
declare j jsonb; p jsonb; p2 jsonb; sid uuid; q jsonb; mcq uuid; mcq2 uuid; st uuid; r jsonb; n int;
begin
  j := public.exam_join(lower(substr(current_setting('ex.code'), 1, 3)) || ' ' || substr(current_setting('ex.code'), 4));
  if j->>'assessment_id' <> '0e000000-0000-0000-0000-00000000aa01' then raise exception 'JOIN: %', j; end if;
  if jsonb_array_length(public.my_live_exams()) <> 1 then raise exception 'MY_LIVE: %', public.my_live_exams(); end if;

  p := public.start_exam_session('0e000000-0000-0000-0000-00000000aa01');
  sid := (p->>'session_id')::uuid;
  if jsonb_array_length(p->'questions') <> 5 then raise exception 'PAPER_SIZE: %', p; end if;
  if p::text ~ '"correct"' or p::text ~ '"explanation"' then raise exception 'KEY_LEAKED: %', p; end if;
  for q in select * from jsonb_array_elements(p->'questions') loop
    if (q->>'marks')::int <> 2 then raise exception 'MARKS: %', q; end if;
    if q->>'type' = 'mcq' then
      if (select array_agg(o->>'key' order by o->>'key') from jsonb_array_elements(q->'body'->'options') o)
         <> array['A','B','C','D'] then raise exception 'OPTIONS_LOST: %', q; end if;
      if mcq is null then mcq := (q->>'q')::uuid; elsif mcq2 is null then mcq2 := (q->>'q')::uuid; end if;
    else st := (q->>'q')::uuid;
    end if;
  end loop;
  if (select jsonb_agg(x->'o') from jsonb_array_elements((select paper from exam_sessions where id = sid)) x where x ? 'o') is null then
    raise exception 'NO_PERMUTATION_STORED';
  end if;

  -- Answers: three MCQs right, one wrong, the short text right.
  for q in select * from jsonb_array_elements(p->'questions') loop
    if q->>'type' = 'mcq' then
      perform public.save_exam_answer(sid, (q->>'q')::uuid, case when (q->>'q')::uuid = mcq2 then '"B"' else '"A"' end::jsonb,
                                      '2026-11-26T09:00:00Z');
    end if;
  end loop;
  perform public.save_exam_answer(sid, st, '" X "', '2026-11-26T09:00:00Z');
  -- A newer tap, then an older one arriving late: the newer stays.
  perform public.save_exam_answer(sid, mcq, '"C"', '2026-11-26T09:00:05Z');
  perform public.save_exam_answer(sid, mcq, '"A"', '2026-11-26T09:00:10Z');
  perform public.save_exam_answer(sid, mcq, '"D"', '2026-11-26T09:00:07Z');
  if (select answer from exam_session_answers where session_id = sid and question_id = mcq) <> '"A"' then
    raise exception 'OLDER_TAP_WON';
  end if;
  if not public._ex_refused(format('select public.save_exam_answer(%L, %L, %L)', sid, mcq, '{"x":1}'), '%bad_answer%') then
    raise exception 'OBJECT_ANSWER_STORED';
  end if;
  if not public._ex_refused(format('select public.save_exam_answer(%L, %L, %L)', sid, '0e000000-0000-0000-0000-000000000108', '"A"'), '%question_not_in_paper%') then
    raise exception 'FOREIGN_QUESTION_STORED';
  end if;

  -- "Another device": same session, same order, same options, answers back.
  p2 := public.start_exam_session('0e000000-0000-0000-0000-00000000aa01');
  if p2->>'session_id' <> sid::text then raise exception 'RESUME_NEW_SESSION'; end if;
  if p2->'questions' <> p->'questions' then raise exception 'RESUME_DIFFERENT_PAPER'; end if;
  if (select count(*) from jsonb_object_keys(p2->'answers')) <> 5 then raise exception 'RESUME_ANSWERS: %', p2->'answers'; end if;

  r := public.submit_exam_session(sid);
  if r->>'status' <> 'submitted' or (r->>'score')::numeric <> 8 or (r->>'total')::numeric <> 10
     or (r->>'answered')::int <> 5 or (r->>'to_mark')::int <> 0 then
    raise exception 'SUBMIT_RESULT: %', r;
  end if;
  if public.submit_exam_session(sid) <> r then raise exception 'SUBMIT_NOT_IDEMPOTENT'; end if;
  if (public.save_exam_answer(sid, mcq2, '"A"'))->>'accepted' <> 'false' then raise exception 'SAVE_AFTER_SUBMIT'; end if;
  p2 := public.start_exam_session('0e000000-0000-0000-0000-00000000aa01');
  if p2->>'status' <> 'submitted' or jsonb_array_length(p2->'questions') <> 0 then
    raise exception 'REOPEN_AFTER_SUBMIT: %', p2;
  end if;
  -- The paper never comes through the test path (018 present).
  if to_regprocedure('public.student_paper(uuid)') is not null then
    execute 'select count(*) from public.student_paper($1)' into n using '0e000000-0000-0000-0000-00000000aa01'::uuid;
    if n <> 0 then raise exception 'STUDENT_PAPER_SERVED_EXAM'; end if;
  end if;
end $$;

-- Second student: different shuffle is allowed; still one session each.
set request.jwt.claim.sub = '0e000000-0000-0000-0000-000000000012';
do $$
declare p jsonb;
begin
  p := public.start_exam_session('0e000000-0000-0000-0000-00000000aa01');
  perform public.save_exam_answer((p->>'session_id')::uuid, (p->'questions'->0->>'q')::uuid, '"A"');
end $$;

-- ---- The teacher ends it: open sessions are submitted and graded ---------------
set request.jwt.claim.sub = '0e000000-0000-0000-0000-000000000001';
do $$
declare r jsonb;
begin
  r := public.exam_end('0e000000-0000-0000-0000-00000000aa01');
  if (r->>'closed_sessions')::int <> 1 then raise exception 'END: %', r; end if;
  if exists (select 1 from exam_sessions where assessment_id = '0e000000-0000-0000-0000-00000000aa01' and status = 'in_progress') then
    raise exception 'END_LEFT_OPEN';
  end if;
  if (select count(*) from exam_sessions where assessment_id = '0e000000-0000-0000-0000-00000000aa01' and score is not null) <> 2 then
    raise exception 'END_NOT_GRADED';
  end if;
end $$;
set request.jwt.claim.sub = '0e000000-0000-0000-0000-000000000012';
do $$ begin
  if not public._ex_refused(format('select public.exam_join(%L)', current_setting('ex.code')), '%exam_code_unknown%') then
    raise exception 'JOINED_ENDED_EXAM';
  end if;
  if jsonb_array_length(public.my_live_exams()) <> 0 then raise exception 'ENDED_STILL_LIVE'; end if;
end $$;

-- ---- The sweep closes an abandoned session past deadline + grace --------------
reset role;
insert into assessments(id, year_id, class_id, subject_id, title, type, status, created_by)
values ('0e000000-0000-0000-0000-00000000aa02', '0e000000-0000-0000-0000-0000000000a0', '0e000000-0000-0000-0000-0000000000c9',
        '0e000000-0000-0000-0000-0000000000d1', 'EX sweep', 'exam', 'draft', '0e000000-0000-0000-0000-000000000001');
insert into assessment_questions(assessment_id, question_id, marks, sort_order)
values ('0e000000-0000-0000-0000-00000000aa02', '0e000000-0000-0000-0000-000000000105', 1, 1);
set role authenticated;
set request.jwt.claim.sub = '0e000000-0000-0000-0000-000000000001';
select public.exam_launch('0e000000-0000-0000-0000-00000000aa02', 10) \gset
set request.jwt.claim.sub = '0e000000-0000-0000-0000-000000000012';
select public.start_exam_session('0e000000-0000-0000-0000-00000000aa02') \gset
reset role;
update exam_sessions set deadline_at = now() - interval '5 minutes'
 where assessment_id = '0e000000-0000-0000-0000-00000000aa02';
do $$
declare n int := public.exam_sweep();
begin
  if n <> 1 then raise exception 'SWEEP_COUNT: %', n; end if;
  if (select status from exam_sessions where assessment_id = '0e000000-0000-0000-0000-00000000aa02') <> 'auto_submitted' then
    raise exception 'SWEEP_STATUS';
  end if;
  if public.exam_sweep() <> 0 then raise exception 'SWEEP_NOT_IDEMPOTENT'; end if;
end $$;

drop function public._ex_refused(text, text);
\echo '020 smoke: all checks passed'
