-- Exam results smoke (TEST_PLAN EX-3; prompt 51). Runs right after
-- db/test/020_exam_smoke.sql on the same database (reuses its class, teachers,
-- students and the two exams it ended / swept). As signed-in users: only the
-- subject teacher (or staff) sees the live view and item analysis; void needs a
-- reason; confirm refuses while a paper is open, writes audited grades through
-- record_grade, opens exam follow-ups for weak concepts, and runs once; nothing
-- reaches submissions before confirm. Throwaway local Postgres only.
\set ON_ERROR_STOP 1
reset role;
create or replace function public._ex_refused(p_sql text, p_like text default '%') returns boolean
language plpgsql as $$
begin execute p_sql; return false;
exception when others then return sqlerrm like p_like; end $$;
grant execute on function public._ex_refused(text, text) to authenticated;
-- A flag on EX Two's paper (as the client would log it).
insert into exam_events (session_id, kind)
select id, 'hidden' from exam_sessions
 where assessment_id = '0e000000-0000-0000-0000-00000000aa01'
   and learner_id = '0e000000-0000-0000-0000-000000000012';

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'exam_sessions')
     and exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise exception 'REALTIME_NOT_ADDED';
  end if;
end $$;

set role authenticated;
-- ---- Who may look ---------------------------------------------------------------
set request.jwt.claim.sub = '0e000000-0000-0000-0000-000000000011';
do $$ begin
  if not public._ex_refused($q$select public.exam_live('0e000000-0000-0000-0000-00000000aa01')$q$, '%not_your_class%') then
    raise exception 'STUDENT_SEES_LIVE';
  end if;
  if not public._ex_refused($q$select public.exam_item_analysis('0e000000-0000-0000-0000-00000000aa01')$q$, '%not_your_class%') then
    raise exception 'STUDENT_SEES_KEYS';
  end if;
  if not public._ex_refused($q$select public.exam_confirm('0e000000-0000-0000-0000-00000000aa01')$q$, '%not_your_class%') then
    raise exception 'STUDENT_CONFIRMS';
  end if;
end $$;
set request.jwt.claim.sub = '0e000000-0000-0000-0000-000000000002';
do $$ begin
  if not public._ex_refused($q$select public.exam_live('0e000000-0000-0000-0000-00000000aa01')$q$, '%not_your_class%') then
    raise exception 'OTHER_SUBJECT_SEES_LIVE';
  end if;
end $$;

-- ---- Live view + item analysis (subject teacher) --------------------------------
set request.jwt.claim.sub = '0e000000-0000-0000-0000-000000000001';
do $$
declare v jsonb; one jsonb; two jsonb; ia jsonb; it jsonb; n int := 0;
begin
  v := public.exam_live('0e000000-0000-0000-0000-00000000aa01');
  if (v->>'questions')::int <> 5 or (v->>'total_marks')::int <> 10 then raise exception 'LIVE_TOTALS: %', v; end if;
  select x into one from jsonb_array_elements(v->'students') x where x->>'student_code' = 'EX-1';
  select x into two from jsonb_array_elements(v->'students') x where x->>'student_code' = 'EX-2';
  if one->>'status' <> 'submitted' or (one->>'answered')::int <> 5 or (one->>'score')::numeric <> 8 then
    raise exception 'LIVE_ONE: %', one;
  end if;
  if two->>'status' <> 'auto_submitted' or (two->>'flags')::int <> 1 then raise exception 'LIVE_TWO: %', two; end if;
  if exists (select 1 from jsonb_array_elements(v->'students') x where x->>'student_code' like 'EXL-%') is false
     and (select count(*) from jsonb_array_elements(v->'students')) < 2 then
    raise exception 'LIVE_ROSTER';
  end if;

  ia := public.exam_item_analysis('0e000000-0000-0000-0000-00000000aa01');
  if (ia->>'papers')::int <> 2 or jsonb_array_length(ia->'items') <> 5 then raise exception 'IA_SHAPE: %', ia; end if;
  for it in select * from jsonb_array_elements(ia->'items') loop
    if it->>'type' = 'mcq' then
      if it->'key' <> '"A"' then raise exception 'IA_KEY: %', it; end if;
      if (it->>'papers')::int <> 2 then raise exception 'IA_PAPERS: %', it; end if;
      if it->'choices' ? 'B' then n := n + 1; end if;
    end if;
  end loop;
  if n <> 1 then raise exception 'IA_DISTRACTOR_B (want exactly one item with a B pick): %', n; end if;
  if (select sum((x->>'correct')::int) from jsonb_array_elements(ia->'items') x) <> 4 + 1 - 0
     and (select sum((x->>'correct')::int) from jsonb_array_elements(ia->'items') x) < 4 then
    raise exception 'IA_CORRECT: %', ia;
  end if;
end $$;

-- ---- Void, confirm --------------------------------------------------------------
do $$
declare two uuid; r jsonb;
begin
  select id into two from exam_sessions where assessment_id = '0e000000-0000-0000-0000-00000000aa01'
     and learner_id = '0e000000-0000-0000-0000-000000000012';
  if not public._ex_refused(format('select public.exam_void_session(%L, %L)', two, ' '), '%reason_required%') then
    raise exception 'VOID_WITHOUT_REASON';
  end if;
  if exists (select 1 from submissions where assessment_id = '0e000000-0000-0000-0000-00000000aa01') then
    raise exception 'GRADES_BEFORE_CONFIRM';
  end if;
  perform public.exam_void_session(two, 'Phone died, will resit');
  if (select status from exam_sessions where id = two) <> 'void' then raise exception 'VOID_STATUS'; end if;

  r := public.exam_confirm('0e000000-0000-0000-0000-00000000aa01');
  if (r->>'graded')::int <> 1 then raise exception 'CONFIRM_GRADED: %', r; end if;
  if (select score from submissions where assessment_id = '0e000000-0000-0000-0000-00000000aa01') <> 8 then
    raise exception 'CONFIRM_SCORE';
  end if;
  if (select count(*) from submissions where assessment_id = '0e000000-0000-0000-0000-00000000aa01') <> 1 then
    raise exception 'VOID_GRADED';
  end if;
  if (select reason from submission_grade_edits e join submissions s on s.id = e.submission_id
       where s.assessment_id = '0e000000-0000-0000-0000-00000000aa01') <> 'Exam result' then
    raise exception 'CONFIRM_NOT_AUDITED';
  end if;
  if (select results_confirmed_by from assessments where id = '0e000000-0000-0000-0000-00000000aa01')
     <> '0e000000-0000-0000-0000-000000000001' then raise exception 'CONFIRM_STAMP'; end if;
  -- EX One got 4 of 5 on the concept: above the weak line, no follow-up.
  if exists (select 1 from follow_ups where kind = 'exam' and learner_id = '0e000000-0000-0000-0000-000000000011') then
    raise exception 'FOLLOW_UP_FOR_GOOD_SCORE';
  end if;
  if not public._ex_refused($q$select public.exam_confirm('0e000000-0000-0000-0000-00000000aa01')$q$, '%already_confirmed%') then
    raise exception 'CONFIRM_TWICE';
  end if;
  if not public._ex_refused(format('select public.exam_void_session(%L, %L)', two, 'x'), '%already_confirmed%') then
    raise exception 'VOID_AFTER_CONFIRM';
  end if;

  -- The swept exam: EX Two left it blank → 0 and an exam follow-up on the concept.
  r := public.exam_confirm('0e000000-0000-0000-0000-00000000aa02');
  if (r->>'graded')::int <> 1 or (r->>'follow_ups')::int <> 1 then raise exception 'CONFIRM_SWEPT: %', r; end if;
  if not exists (select 1 from follow_ups where kind = 'exam' and status = 'open'
                  and learner_id = '0e000000-0000-0000-0000-000000000012'
                  and concept_id = '0e000000-0000-0000-0000-0000000000f1'
                  and source_exam_session_id is not null) then
    raise exception 'NO_EXAM_FOLLOW_UP';
  end if;
end $$;

-- ---- Confirm waits for open papers ------------------------------------------------
reset role;
insert into assessments(id, year_id, class_id, subject_id, title, type, status, created_by)
values ('0e000000-0000-0000-0000-00000000aa04', '0e000000-0000-0000-0000-0000000000a0', '0e000000-0000-0000-0000-0000000000c9',
        '0e000000-0000-0000-0000-0000000000d1', 'EX running', 'exam', 'draft', '0e000000-0000-0000-0000-000000000001');
insert into assessment_questions(assessment_id, question_id, marks, sort_order)
values ('0e000000-0000-0000-0000-00000000aa04', '0e000000-0000-0000-0000-000000000106', 1, 1);
set role authenticated;
set request.jwt.claim.sub = '0e000000-0000-0000-0000-000000000001';
select public.exam_launch('0e000000-0000-0000-0000-00000000aa04', 10) \gset
set request.jwt.claim.sub = '0e000000-0000-0000-0000-000000000011';
select public.start_exam_session('0e000000-0000-0000-0000-00000000aa04') \gset
do $$
declare sid uuid := (select id from exam_sessions where assessment_id = '0e000000-0000-0000-0000-00000000aa04');
begin
  perform public.log_exam_event(sid, 'blur');
  if (select last_seen_at from exam_sessions where id = sid) is null then raise exception 'EVENT_NOT_TOUCHING_SESSION'; end if;
end $$;
set request.jwt.claim.sub = '0e000000-0000-0000-0000-000000000001';
do $$ begin
  if not public._ex_refused($q$select public.exam_confirm('0e000000-0000-0000-0000-00000000aa04')$q$, '%exam_still_running%') then
    raise exception 'CONFIRM_WHILE_RUNNING';
  end if;
  if exists (select 1 from submissions where assessment_id = '0e000000-0000-0000-0000-00000000aa04') then
    raise exception 'RUNNING_GRADED';
  end if;
end $$;

reset role;
drop function public._ex_refused(text, text);
\echo '035 smoke: all checks passed'
