-- ============================================================
--  020 — GENERATED ASSESSMENTS + LIVE EXAMS, PART 1 (prompt 50)
--  DRAFT — NOT YET RUN
-- ============================================================
--  RUN ORDER: after db/019 (refuses without 017's exam tables or a marking
--  function from 018/019). Dev first; production like 017, on a day the
--  nightly backup succeeded. For the sweep, turn on pg_cron first
--  (Dashboard → Database → Extensions → pg_cron); without it everything else
--  works and sessions still close on submit or the next start.
--
--  Additive + idempotent: functions dropped-then-created, one cron job
--  upserted by name. No table, column, policy or row is changed.
--
--  WHAT IT ADDS (DECISIONS #67, ARCHITECTURE §4)
--  * exam_draw_pool(class, subject): the approved exam-scope items of a
--    subject (current version, not retired) with chapter, topic, difficulty
--    and when THIS class last had each one in an assessment (last 60 days).
--    The device draws from it (packages/core drawPaper). Subject teacher of
--    that class this year, or staff.
--  * start_exam_session (replaces 017's): also shuffles each MCQ's options per
--    student (stored in the paper as `o`, so a resume on another device gets
--    the same order), returns marks per question, and closes an expired
--    session first. Answers and explanations never leave the server.
--  * save_exam_answer (replaces 017's): only scalar answers (text ≤ 500,
--    true/false, null) are stored; late ones are logged, not stored.
--  * grade_exam_session (replaces 017's): marks with auto_mark_item (the same
--    rules as tests and practice) and sums the assessment's marks.
--  * submit_exam_session (replaces 017's): also returns answered / to-mark.
--  * exam_sweep(): closes in-progress sessions past deadline + grace and grades
--    them; pg_cron runs it every minute when the extension is on.
--  * exam_launch(assessment, minutes): the teacher starts a live exam now:
--    mode live_exam, published, a 6-character join code. exam_end(assessment)
--    stops it and submits every open session.
--  * exam_join(code), my_live_exams(): how a student finds an exam.
--  * student_paper (018) refuses live/offline exams when 018 is present, so the
--    paper only comes through start_exam_session.
-- ============================================================

do $$
begin
  if to_regclass('public.exam_sessions') is null then
    raise exception '020 needs db/017 (exam sessions). Run 017 first.';
  end if;
  if to_regprocedure('public.auto_mark_item(text,jsonb,jsonb)') is null then
    raise exception '020 needs db/019 (or 018) for auto_mark_item. Run 019 first.';
  end if;
end $$;


-- ============================================================
--  PART 1 — Who may set or run an exam for a class + subject
-- ============================================================
create or replace function public.teaches_class_subject_now(p_class uuid, p_subject uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_staff() or exists (
    select 1
      from public.teacher_assignments ta
      join public.academic_years y on y.id = ta.year_id and y.is_current
     where ta.teacher_id = auth.uid() and ta.class_id = p_class
       and (ta.subject_id is null or ta.subject_id = p_subject))
$$;


-- ============================================================
--  PART 2 — The draw pool
-- ============================================================
drop function if exists public.exam_draw_pool(uuid, uuid);
create or replace function public.exam_draw_pool(p_class uuid, p_subject uuid)
returns table (
  id           uuid,
  version      int,
  type         text,
  chapter_id   uuid,
  topic_id     uuid,
  difficulty   int,
  last_used_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if not public.teaches_class_subject_now(p_class, p_subject) then
    raise exception 'not_your_class' using errcode = '42501';
  end if;
  return query
  select q.id, q.current_version::int, q.type::text, q.chapter_id, c.topic_id, q.difficulty::int,
         (select max(a.created_at)
            from public.assessment_questions aq
            join public.assessments a on a.id = aq.assessment_id
           where aq.question_id = q.id and a.class_id = p_class
             and a.status <> 'draft' and a.created_at > now() - interval '60 days')
    from public.questions q
    join public.chapters ch on ch.id = q.chapter_id and ch.subject_id = p_subject
    left join public.concepts c on c.id = q.concept_id
   where q.status <> 'retired'
     and (q.scope_class_id is null or q.scope_class_id = p_class)
     and public.is_approved('question', q.id, 'exam')
   order by q.id
   limit 5000;
end $$;


-- ============================================================
--  PART 3 — Grading, sessions, saves, submit
-- ============================================================
create or replace function public.grade_exam_session(p_session uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.exam_session_answers sa
     set is_correct = public.auto_mark_item(qv.type, sa.answer, qv.answer)
    from public.question_versions qv
   where sa.session_id = p_session
     and qv.question_id = sa.question_id and qv.version = sa.question_version;
  update public.exam_sessions s
     set score = coalesce((
           select sum(aq.marks) from public.exam_session_answers sa
             join public.assessment_questions aq
               on aq.assessment_id = s.assessment_id and aq.question_id = sa.question_id
            where sa.session_id = s.id and sa.is_correct), 0),
         total = coalesce((
           select sum(aq.marks)
             from jsonb_array_elements(s.paper) p(item)
             join public.assessment_questions aq
               on aq.assessment_id = s.assessment_id and aq.question_id = (p.item->>'q')::uuid), 0)
   where s.id = p_session;
end $$;

-- Close one expired session (deadline + grace passed): auto-submitted, graded.
create or replace function public.exam_close_if_expired(p_session uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  s public.exam_sessions;
  grace int;
begin
  select * into s from public.exam_sessions where id = p_session for update;
  if s.id is null or s.status <> 'in_progress' then return false; end if;
  select coalesce((settings->>'grace_seconds')::int, 30) into grace
    from public.assessments where id = s.assessment_id;
  if now() <= s.deadline_at + make_interval(secs => grace) then return false; end if;
  update public.exam_sessions
     set status = 'auto_submitted', submitted_at = s.deadline_at
   where id = s.id;
  perform public.grade_exam_session(s.id);
  return true;
end $$;

drop function if exists public.start_exam_session(uuid);
create or replace function public.start_exam_session(p_assessment uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  a public.assessments;
  enr uuid;
  s public.exam_sessions;
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  select * into a from public.assessments where id = p_assessment;
  if a.id is null or a.status <> 'published' or a.mode not in ('live_exam','offline_exam') then
    raise exception 'exam_not_available' using errcode = 'P0002';
  end if;

  select e.id into enr from public.enrollments e
   where e.student_id = public.my_student_id() and e.class_id = a.class_id
     and e.year_id = a.year_id and e.status = 'active';
  if enr is null then raise exception 'not_enrolled' using errcode = '42501'; end if;

  select * into s from public.exam_sessions
   where assessment_id = a.id and learner_id = auth.uid();
  if s.id is null then
    -- A new start needs the exam open; a resume doesn't (the deadline rules).
    if a.opens_at is not null and now() < a.opens_at then
      raise exception 'exam_not_open' using errcode = '22023';
    end if;
    if a.closes_at is not null and now() > a.closes_at then
      raise exception 'exam_closed' using errcode = '22023';
    end if;
    if not exists (select 1 from public.assessment_questions where assessment_id = a.id) then
      raise exception 'exam_not_available' using errcode = 'P0002';
    end if;
    insert into public.exam_sessions
      (assessment_id, enrollment_id, learner_id, delivery, paper, deadline_at)
    values
      (a.id, enr, auth.uid(),
       case when a.mode = 'offline_exam' then 'offline' else 'online' end,
       (select jsonb_agg(
                 jsonb_build_object('q', aq.question_id,
                                    'v', coalesce(aq.question_version, q.current_version))
                 || case when q.type = 'mcq'
                           and jsonb_typeof(qv.body->'options') = 'array' then
                      jsonb_build_object('o', (
                        select jsonb_agg(o->'key' order by random())
                          from jsonb_array_elements(qv.body->'options') o))
                    else '{}'::jsonb end
                 order by random())
          from public.assessment_questions aq
          join public.questions q on q.id = aq.question_id
          join public.question_versions qv
            on qv.question_id = aq.question_id
           and qv.version = coalesce(aq.question_version, q.current_version)
         where aq.assessment_id = a.id),
       least(coalesce(a.closes_at, 'infinity'::timestamptz),
             now() + make_interval(secs => coalesce(a.duration_seconds, 3600))))
    on conflict (assessment_id, learner_id) do nothing
    returning * into s;
    if s.id is null then   -- a second device raced us: use its session
      select * into s from public.exam_sessions
       where assessment_id = a.id and learner_id = auth.uid();
    end if;
  else
    perform public.exam_close_if_expired(s.id);
    select * into s from public.exam_sessions where id = s.id;
    if s.status = 'in_progress' then
      insert into public.exam_events (session_id, kind) values (s.id, 'resume');
    end if;
  end if;

  return jsonb_build_object(
    'session_id', s.id, 'status', s.status, 'started_at', s.started_at,
    'deadline_at', s.deadline_at, 'server_now', now(),
    'title', a.title, 'score', s.score, 'total', s.total,
    'questions', case when s.status = 'in_progress' then (
      select jsonb_agg(jsonb_build_object(
               'q', qv.question_id, 'v', qv.version, 'type', qv.type,
               'marks', coalesce(aq.marks, 1),
               'body', case when p.item ? 'o' and jsonb_typeof(qv.body->'options') = 'array' then
                         jsonb_set(qv.body, '{options}', (
                           select coalesce(jsonb_agg(opt order by k.ord), '[]'::jsonb)
                             from jsonb_array_elements(p.item->'o') with ordinality k(key, ord)
                             join lateral (
                               select o as opt from jsonb_array_elements(qv.body->'options') o
                                where o->'key' = k.key limit 1) x on true))
                       else qv.body end)
             order by ord)
        from jsonb_array_elements(s.paper) with ordinality as p(item, ord)
        join public.question_versions qv
          on qv.question_id = (p.item->>'q')::uuid and qv.version = (p.item->>'v')::int
        left join public.assessment_questions aq
          on aq.assessment_id = s.assessment_id and aq.question_id = qv.question_id)
      else '[]'::jsonb end,
    'answers', case when s.status = 'in_progress' then
                 (select coalesce(jsonb_object_agg(question_id, answer), '{}'::jsonb)
                    from public.exam_session_answers where session_id = s.id)
               else '{}'::jsonb end);
end $$;

-- Idempotent per-answer save. Late answers are logged (audit), not stored.
drop function if exists public.save_exam_answer(uuid, uuid, jsonb, timestamptz);
create or replace function public.save_exam_answer(
  p_session uuid, p_question uuid, p_answer jsonb, p_client_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s public.exam_sessions;
  grace int;
  v int;
begin
  select * into s from public.exam_sessions where id = p_session and learner_id = auth.uid();
  if s.id is null then raise exception 'no_such_session' using errcode = 'P0002'; end if;
  if p_answer is not null and not (
       jsonb_typeof(p_answer) in ('boolean','null')
       or (jsonb_typeof(p_answer) = 'string' and length(p_answer #>> '{}') <= 500)) then
    raise exception 'bad_answer' using errcode = '22023';
  end if;
  select coalesce((settings->>'grace_seconds')::int, 30) into grace
    from public.assessments where id = s.assessment_id;
  select (item->>'v')::int into v
    from jsonb_array_elements(s.paper) item where (item->>'q')::uuid = p_question;
  if v is null then raise exception 'question_not_in_paper' using errcode = '22023'; end if;

  if s.status <> 'in_progress' or now() > s.deadline_at + make_interval(secs => grace) then
    insert into public.exam_events (session_id, kind, detail)
    values (s.id, 'late_answer', jsonb_build_object('q', p_question, 'answer', p_answer));
    return jsonb_build_object('accepted', false, 'reason', 'deadline_passed');
  end if;

  insert into public.exam_session_answers
    (session_id, question_id, question_version, answer, client_answered_at)
  values (s.id, p_question, v, p_answer, p_client_at)
  on conflict (session_id, question_id)
  do update set answer = excluded.answer,
                client_answered_at = excluded.client_answered_at,
                received_at = now()
   -- an older tap arriving after a newer one never overwrites it
   where exam_session_answers.client_answered_at is null
      or excluded.client_answered_at is null
      or excluded.client_answered_at >= exam_session_answers.client_answered_at;
  update public.exam_sessions set last_seen_at = now() where id = s.id;
  return jsonb_build_object('accepted', true);
end $$;

drop function if exists public.submit_exam_session(uuid);
create or replace function public.submit_exam_session(p_session uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.exam_sessions;
begin
  select * into s from public.exam_sessions
   where id = p_session and learner_id = auth.uid() for update;
  if s.id is null then raise exception 'no_such_session' using errcode = 'P0002'; end if;
  if s.status = 'in_progress' then
    update public.exam_sessions
       set status = case when now() > deadline_at then 'auto_submitted' else 'submitted' end,
           submitted_at = least(now(), deadline_at)
     where id = s.id;
    perform public.grade_exam_session(s.id);
  end if;
  select * into s from public.exam_sessions where id = p_session;
  return jsonb_build_object(
    'status', s.status, 'score', s.score, 'total', s.total,
    'questions', jsonb_array_length(s.paper),
    'answered', (select count(*) from public.exam_session_answers
                  where session_id = s.id and answer is not null and answer <> 'null'::jsonb
                    and answer <> '""'::jsonb),
    'to_mark', (select count(*) from public.exam_session_answers
                 where session_id = s.id and is_correct is null
                   and answer is not null and answer <> 'null'::jsonb));
end $$;

create or replace function public.exam_sweep()
returns int language plpgsql security definer set search_path = public as $$
declare
  n int := 0;
  sid uuid;
begin
  for sid in
    select s.id from public.exam_sessions s
      join public.assessments a on a.id = s.assessment_id
     where s.status = 'in_progress'
       and now() > s.deadline_at + make_interval(secs => coalesce((a.settings->>'grace_seconds')::int, 30))
     limit 2000
  loop
    if public.exam_close_if_expired(sid) then n := n + 1; end if;
  end loop;
  return n;
end $$;


-- ============================================================
--  PART 4 — Launch, end, join
-- ============================================================
create or replace function public.exam_new_join_code()
returns text language plpgsql volatile security definer set search_path = public as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  code text;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.assessments
                           where join_code = code and status = 'published');
  end loop;
  return code;
end $$;

drop function if exists public.exam_launch(uuid, int);
create or replace function public.exam_launch(p_assessment uuid, p_minutes int default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a public.assessments;
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  select * into a from public.assessments where id = p_assessment for update;
  if a.id is null then raise exception 'exam_not_available' using errcode = 'P0002'; end if;
  if not public.teaches_class_subject_now(a.class_id, a.subject_id) then
    raise exception 'not_your_class' using errcode = '42501';
  end if;
  if p_minutes is not null and (p_minutes < 1 or p_minutes > 600) then
    raise exception 'bad_minutes' using errcode = '22023';
  end if;
  -- Already running: hand back the same code (a second click changes nothing).
  if a.mode = 'live_exam' and a.status = 'published' and a.join_code is not null
     and (a.closes_at is null or a.closes_at > now()) then
    return jsonb_build_object('join_code', a.join_code, 'opens_at', a.opens_at,
                              'duration_seconds', a.duration_seconds);
  end if;
  if a.status = 'closed' then raise exception 'exam_closed' using errcode = '22023'; end if;
  if not exists (select 1 from public.assessment_questions where assessment_id = a.id) then
    raise exception 'exam_no_questions' using errcode = '22023';
  end if;
  update public.assessments
     set mode = 'live_exam', status = 'published', opens_at = now(), closes_at = null,
         duration_seconds = coalesce(p_minutes * 60, duration_seconds, 1800),
         join_code = public.exam_new_join_code()
   where id = a.id
  returning * into a;
  return jsonb_build_object('join_code', a.join_code, 'opens_at', a.opens_at,
                            'duration_seconds', a.duration_seconds);
end $$;

drop function if exists public.exam_end(uuid);
create or replace function public.exam_end(p_assessment uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  a public.assessments;
  n int := 0;
  sid uuid;
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  select * into a from public.assessments where id = p_assessment for update;
  if a.id is null or a.mode <> 'live_exam' then
    raise exception 'exam_not_available' using errcode = 'P0002';
  end if;
  if not public.teaches_class_subject_now(a.class_id, a.subject_id) then
    raise exception 'not_your_class' using errcode = '42501';
  end if;
  update public.assessments set closes_at = least(coalesce(closes_at, now()), now()), status = 'closed'
   where id = a.id;
  for sid in select id from public.exam_sessions
              where assessment_id = a.id and status = 'in_progress'
  loop
    update public.exam_sessions
       set status = 'auto_submitted', submitted_at = least(now(), deadline_at)
     where id = sid;
    perform public.grade_exam_session(sid);
    n := n + 1;
  end loop;
  return jsonb_build_object('closed_sessions', n);
end $$;

drop function if exists public.exam_join(text);
create or replace function public.exam_join(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare a public.assessments;
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  select x.* into a from public.assessments x
   where x.join_code = upper(regexp_replace(coalesce(p_code, ''), '[\s-]', '', 'g'))
     and x.status = 'published' and x.mode = 'live_exam'
     and exists (select 1 from public.enrollments e
                  where e.student_id = public.my_student_id() and e.class_id = x.class_id
                    and e.year_id = x.year_id and e.status = 'active')
   limit 1;
  if a.id is null then raise exception 'exam_code_unknown' using errcode = 'P0002'; end if;
  return jsonb_build_object('assessment_id', a.id, 'title', a.title);
end $$;

drop function if exists public.my_live_exams();
create or replace function public.my_live_exams()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'assessment_id', a.id, 'title', a.title, 'subject_name', sj.name,
           'duration_seconds', a.duration_seconds, 'opens_at', a.opens_at,
           'session_status', s.status, 'deadline_at', s.deadline_at,
           'score', s.score, 'total', s.total)
         order by a.opens_at desc), '[]'::jsonb)
    from public.assessments a
    join public.enrollments e
      on e.class_id = a.class_id and e.year_id = a.year_id and e.status = 'active'
     and e.student_id = public.my_student_id()
    left join public.subjects sj on sj.id = a.subject_id
    left join public.exam_sessions s on s.assessment_id = a.id and s.learner_id = auth.uid()
   where a.mode = 'live_exam' and a.status = 'published'
     and (a.opens_at is null or a.opens_at <= now())
     and (a.closes_at is null or a.closes_at > now())
$$;


-- ============================================================
--  PART 5 — The test paper path never serves an exam (018, if present)
-- ============================================================
do $$
begin
  if to_regprocedure('public.student_paper(uuid)') is not null then
    execute $f$
      create or replace function public.student_paper(p_assessment_id uuid)
      returns table (
        question_id     uuid,
        type            text,
        body            jsonb,
        marks           int,
        sort_order      int,
        cognitive_level text
      )
      language sql stable security definer set search_path = public as $b$
        select q.id, q.type, q.body, aq.marks, aq.sort_order, q.cognitive_level
          from public.assessment_questions aq
          join public.assessments a on a.id = aq.assessment_id
          join public.questions   q on q.id = aq.question_id
         where aq.assessment_id = p_assessment_id
           and a.status = 'published'
           and a.mode = 'standard'
           and exists (
             select 1 from public.enrollments e
              where e.student_id = public.my_student_id()
                and e.class_id = a.class_id
                and e.year_id  = a.year_id)
         order by aq.sort_order, q.id
      $b$;
    $f$;
  end if;
end $$;


-- ============================================================
--  PART 6 — Grants + the sweep schedule
-- ============================================================
revoke all on function public.teaches_class_subject_now(uuid, uuid) from public, anon;
revoke all on function public.exam_draw_pool(uuid, uuid)            from public, anon;
revoke all on function public.grade_exam_session(uuid)              from public, anon, authenticated;
revoke all on function public.exam_close_if_expired(uuid)           from public, anon, authenticated;
revoke all on function public.exam_sweep()                          from public, anon, authenticated;
revoke all on function public.exam_new_join_code()                  from public, anon, authenticated;
revoke all on function public.start_exam_session(uuid)              from public, anon;
revoke all on function public.save_exam_answer(uuid, uuid, jsonb, timestamptz) from public, anon;
revoke all on function public.submit_exam_session(uuid)             from public, anon;
revoke all on function public.exam_launch(uuid, int)                from public, anon;
revoke all on function public.exam_end(uuid)                        from public, anon;
revoke all on function public.exam_join(text)                       from public, anon;
revoke all on function public.my_live_exams()                       from public, anon;
grant execute on function public.teaches_class_subject_now(uuid, uuid) to authenticated;
grant execute on function public.exam_draw_pool(uuid, uuid)            to authenticated;
grant execute on function public.start_exam_session(uuid)              to authenticated;
grant execute on function public.save_exam_answer(uuid, uuid, jsonb, timestamptz) to authenticated;
grant execute on function public.submit_exam_session(uuid)             to authenticated;
grant execute on function public.exam_launch(uuid, int)                to authenticated;
grant execute on function public.exam_end(uuid)                        to authenticated;
grant execute on function public.exam_join(text)                       to authenticated;
grant execute on function public.my_live_exams()                       to authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('exam-sweep', '* * * * *', 'select public.exam_sweep()');
  else
    raise notice '020: pg_cron is off, so the exam sweep is not scheduled. Turn it on and run 020 again.';
  end if;
end $$;
