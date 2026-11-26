-- ============================================================
--  035 — LIVE EXAM VIEW, ITEM ANALYSIS, EXAM FOLLOW-UPS, CONFIRM (prompt 51)
--  DRAFT — NOT YET RUN
-- ============================================================
--  RUN ORDER: after db/020 (refuses without it) and db/013 (record_grade).
--  Dev first; production like 017, on a day the nightly backup succeeded.
--
--  Additive + idempotent: two nullable columns on exam_sessions (why and by
--  whom a session was voided), functions dropped-then-created, exam_sessions
--  added to the Realtime publication once. No row is changed by running it.
--
--  WHAT IT ADDS (ARCHITECTURE §4)
--  * Realtime on exam_sessions (RLS applies: a teacher only hears their own
--    classes). The teacher's live view subscribes to ONE assessment and
--    re-reads exam_live() at most every few seconds; students never subscribe.
--    log_exam_event (replaces 017's) also touches the session, so a flag
--    reaches the live view through that same subscription.
--  * exam_live(assessment): every active student of the class with their
--    session state, answered count, flags and score (not joined = no session).
--  * exam_item_analysis(assessment): per question % right, the count of each
--    option picked (the distractors), blanks; per concept % right. Teachers
--    only (it shows the key). Void sessions don't count.
--  * exam_void_session(session, reason): a teacher voids one paper (cheating,
--    a broken device). Logged on the session; refused once results are confirmed.
--  * exam_confirm(assessment, reason): only after every paper is in. Writes
--    each score through record_grade() (audited, reason 'Exam result'),
--    stamps results_confirmed_at/by, and opens an exam follow-up (kind
--    'exam', merged per concept) for each concept a student got below the
--    mastery weak line. Before this, exam scores never reach submissions.
-- ============================================================

do $$
begin
  if to_regprocedure('public.exam_launch(uuid,integer)') is null then
    raise exception '035 needs db/020 (live exams). Run 020 first.';
  end if;
  if to_regprocedure('public.record_grade(uuid,uuid,numeric,text)') is null then
    raise exception '035 needs db/013 (record_grade).';
  end if;
end $$;

alter table public.exam_sessions
  add column if not exists void_reason text,
  add column if not exists voided_by   uuid references public.profiles(id);


-- ============================================================
--  PART 1 — Realtime + events that reach it
-- ============================================================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public'
                        and tablename = 'exam_sessions') then
    alter publication supabase_realtime add table public.exam_sessions;
  end if;
end $$;

create or replace function public.log_exam_event(p_session uuid, p_kind text, p_detail jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.exam_sessions
                  where id = p_session and learner_id = auth.uid()) then
    raise exception 'no_such_session' using errcode = 'P0002';
  end if;
  insert into public.exam_events (session_id, kind, detail) values (p_session, p_kind, p_detail);
  update public.exam_sessions set last_seen_at = now() where id = p_session;
end $$;


-- ============================================================
--  PART 2 — Who may watch / confirm an exam
-- ============================================================
create or replace function public.can_run_exam(p_assessment uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.assessments a
                  where a.id = p_assessment
                    and public.teaches_class_subject_now(a.class_id, a.subject_id))
$$;


-- ============================================================
--  PART 3 — Live view
-- ============================================================
drop function if exists public.exam_live(uuid);
create or replace function public.exam_live(p_assessment uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare a public.assessments;
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  select * into a from public.assessments where id = p_assessment;
  if a.id is null then raise exception 'exam_not_available' using errcode = 'P0002'; end if;
  if not public.can_run_exam(a.id) then raise exception 'not_your_class' using errcode = '42501'; end if;
  return jsonb_build_object(
    'title', a.title, 'mode', a.mode, 'status', a.status, 'join_code', a.join_code,
    'opens_at', a.opens_at, 'closes_at', a.closes_at, 'duration_seconds', a.duration_seconds,
    'confirmed_at', a.results_confirmed_at, 'server_now', now(),
    'questions', (select count(*) from public.assessment_questions where assessment_id = a.id),
    'total_marks', (select coalesce(sum(marks), 0) from public.assessment_questions where assessment_id = a.id),
    'students', coalesce((
      select jsonb_agg(jsonb_build_object(
               'enrollment_id', e.id, 'student_name', st.full_name, 'student_code', st.student_code,
               'session_id', s.id, 'status', s.status, 'started_at', s.started_at,
               'deadline_at', s.deadline_at, 'submitted_at', s.submitted_at,
               'last_seen_at', s.last_seen_at, 'score', s.score, 'total', s.total,
               'void_reason', s.void_reason,
               'answered', (select count(*) from public.exam_session_answers sa
                             where sa.session_id = s.id and sa.answer is not null
                               and sa.answer not in ('null'::jsonb, '""'::jsonb)),
               'flags', (select count(*) from public.exam_events ev
                          where ev.session_id = s.id and ev.kind in ('blur','hidden','fullscreen_exit')),
               'late', (select count(*) from public.exam_events ev
                         where ev.session_id = s.id and ev.kind = 'late_answer'))
             order by st.full_name, st.student_code)
        from public.enrollments e
        join public.students st on st.id = e.student_id
        left join public.profiles pr on pr.student_id = st.id
        left join public.exam_sessions s on s.assessment_id = a.id and s.learner_id = pr.id
       where e.class_id = a.class_id and e.year_id = a.year_id and e.status = 'active'), '[]'::jsonb));
end $$;


-- ============================================================
--  PART 4 — Item analysis
-- ============================================================
drop function if exists public.exam_item_analysis(uuid);
create or replace function public.exam_item_analysis(p_assessment uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare a public.assessments;
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  select * into a from public.assessments where id = p_assessment;
  if a.id is null then raise exception 'exam_not_available' using errcode = 'P0002'; end if;
  if not public.can_run_exam(a.id) then raise exception 'not_your_class' using errcode = '42501'; end if;
  return jsonb_build_object(
    'papers', (select count(*) from public.exam_sessions
                where assessment_id = a.id and status in ('submitted','auto_submitted')),
    'items', coalesce((
      select jsonb_agg(item order by ord) from (
        select aq.sort_order as ord, jsonb_build_object(
                 'question_id', aq.question_id, 'marks', aq.marks, 'type', qv.type,
                 'body', qv.body, 'key', qv.answer->'correct',
                 'concept_id', q.concept_id, 'concept_en', c.title_en, 'concept_ur', c.title_ur,
                 'answered', count(sa.answer) filter (where sa.answer is not null
                               and sa.answer not in ('null'::jsonb, '""'::jsonb)),
                 'correct', count(*) filter (where sa.is_correct),
                 'to_mark', count(*) filter (where sa.answer is not null and sa.is_correct is null
                               and sa.answer not in ('null'::jsonb, '""'::jsonb)),
                 'papers', count(s.id),
                 'choices', coalesce((
                   select jsonb_object_agg(k, n) from (
                     select sa2.answer #>> '{}' as k, count(*) as n
                       from public.exam_session_answers sa2
                       join public.exam_sessions s2 on s2.id = sa2.session_id
                      where s2.assessment_id = a.id and s2.status in ('submitted','auto_submitted')
                        and sa2.question_id = aq.question_id
                        and jsonb_typeof(sa2.answer) in ('string','boolean')
                        and qv.type in ('mcq','true_false')
                      group by 1) x), '{}'::jsonb)) as item
          from public.assessment_questions aq
          join public.questions q on q.id = aq.question_id
          join public.question_versions qv
            on qv.question_id = aq.question_id
           and qv.version = coalesce(aq.question_version, q.current_version)
          left join public.concepts c on c.id = q.concept_id
          left join public.exam_sessions s
            on s.assessment_id = a.id and s.status in ('submitted','auto_submitted')
          left join public.exam_session_answers sa
            on sa.session_id = s.id and sa.question_id = aq.question_id
         where aq.assessment_id = a.id
         group by aq.sort_order, aq.question_id, aq.marks, qv.type, qv.body, qv.answer,
                  q.concept_id, c.title_en, c.title_ur) t), '[]'::jsonb));
end $$;


-- ============================================================
--  PART 5 — Void one paper
-- ============================================================
drop function if exists public.exam_void_session(uuid, text);
create or replace function public.exam_void_session(p_session uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s public.exam_sessions;
  a public.assessments;
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required' using errcode = '22023'; end if;
  select * into s from public.exam_sessions where id = p_session for update;
  if s.id is null then raise exception 'no_such_session' using errcode = 'P0002'; end if;
  select * into a from public.assessments where id = s.assessment_id;
  if not public.can_run_exam(a.id) then raise exception 'not_your_class' using errcode = '42501'; end if;
  if a.results_confirmed_at is not null then
    raise exception 'already_confirmed' using errcode = '22023';
  end if;
  if s.status = 'void' then return jsonb_build_object('status', 'void'); end if;
  update public.exam_sessions
     set status = 'void', void_reason = btrim(p_reason), voided_by = auth.uid(),
         submitted_at = coalesce(submitted_at, now())
   where id = s.id;
  return jsonb_build_object('status', 'void');
end $$;


-- ============================================================
--  PART 6 — Confirm results → grades + exam follow-ups
-- ============================================================
drop function if exists public.exam_confirm(uuid, text);
create or replace function public.exam_confirm(p_assessment uuid, p_reason text default 'Exam result')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  a      public.assessments;
  s      record;
  graded int := 0;
  opened int := 0;
  weak   int := coalesce((public.mastery_cfg()->>'weakPct')::int, 60);
  reason text := coalesce(nullif(btrim(p_reason), ''), 'Exam result');
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  select * into a from public.assessments where id = p_assessment for update;
  if a.id is null or a.mode = 'standard' then
    raise exception 'exam_not_available' using errcode = 'P0002';
  end if;
  if not public.can_run_exam(a.id) then raise exception 'not_your_class' using errcode = '42501'; end if;
  if a.results_confirmed_at is not null then
    raise exception 'already_confirmed' using errcode = '22023';
  end if;
  -- Close anything past its time first, then refuse while a paper is still open.
  perform public.exam_close_if_expired(x.id)
     from public.exam_sessions x where x.assessment_id = a.id and x.status = 'in_progress';
  if exists (select 1 from public.exam_sessions
              where assessment_id = a.id and status = 'in_progress') then
    raise exception 'exam_still_running' using errcode = '22023';
  end if;

  for s in
    select x.* from public.exam_sessions x
     where x.assessment_id = a.id and x.status in ('submitted','auto_submitted') and x.score is not null
  loop
    perform public.record_grade(s.enrollment_id, a.id, s.score, reason);
    graded := graded + 1;

    -- A concept this student got below the weak line becomes an exam follow-up
    -- (one open per learner + concept + kind: stacked exams merge).
    with per as (
      select q.concept_id, q.chapter_id,
             count(*) filter (where sa.is_correct is not null or sa.answer is null
                              or sa.answer in ('null'::jsonb, '""'::jsonb)) as counted,
             count(*) filter (where sa.is_correct) as right_n
        from jsonb_array_elements(s.paper) p(item)
        join public.questions q on q.id = (p.item->>'q')::uuid
        left join public.exam_session_answers sa
          on sa.session_id = s.id and sa.question_id = q.id
       where q.concept_id is not null
       group by q.concept_id, q.chapter_id
    ), ins as (
      insert into public.follow_ups (learner_id, concept_id, subject_id, kind, source_exam_session_id)
      select s.learner_id, per.concept_id, ch.subject_id, 'exam', s.id
        from per join public.chapters ch on ch.id = per.chapter_id
       where per.counted > 0 and per.right_n * 100 < weak * per.counted
      on conflict (learner_id, concept_id, kind) where status = 'open'
      do update set updated_at = now()
      returning 1
    )
    select opened + count(*) into opened from ins;
  end loop;

  update public.assessments
     set results_confirmed_at = now(), results_confirmed_by = auth.uid()
   where id = a.id;
  return jsonb_build_object('graded', graded, 'follow_ups', opened);
end $$;


-- ============================================================
--  PART 7 — Grants
-- ============================================================
revoke all on function public.can_run_exam(uuid)               from public, anon;
revoke all on function public.exam_live(uuid)                  from public, anon;
revoke all on function public.exam_item_analysis(uuid)         from public, anon;
revoke all on function public.exam_void_session(uuid, text)    from public, anon;
revoke all on function public.exam_confirm(uuid, text)         from public, anon;
revoke all on function public.log_exam_event(uuid, text, jsonb) from public, anon;
grant execute on function public.can_run_exam(uuid)            to authenticated;
grant execute on function public.exam_live(uuid)               to authenticated;
grant execute on function public.exam_item_analysis(uuid)      to authenticated;
grant execute on function public.exam_void_session(uuid, text) to authenticated;
grant execute on function public.exam_confirm(uuid, text)      to authenticated;
grant execute on function public.log_exam_event(uuid, text, jsonb) to authenticated;
