-- ============================================================
--  038 — OFFLINE (PRE-DOWNLOADED) EXAMS (prompt 60; 020 part 2)
--  DRAFT — NOT YET RUN
-- ============================================================
--  RUN ORDER: after db/020 (refuses without it) and db/035 when present
--  (uses its can_run_exam if there, else 020's teacher check). Dev first,
--  then production like 017, on a day the nightly backup succeeded.
--
--  Additive + idempotent: one new table (if not exists), functions
--  dropped-then-created. No existing table, column, policy or row is changed.
--
--  THE PROTOCOL (LMS_AUDIT §3.3; DECISIONS #163–166). Honest, lower integrity:
--  the device keeps the clock, so this is monitoring, never lockdown.
--  * exam_schedule_offline(assessment, opens_at, closes_at, minutes): the
--    subject teacher (or staff) publishes it as mode 'offline_exam' with a
--    window and a duration.
--  * exam_offline_download(assessment): while online, inside the window, an
--    enrolled student gets the paper WITHOUT answers (020's start: order and
--    options shuffled per student). Their session is 'offline' and its
--    deadline is the window's end (they start the timer later, on the device).
--  * The device times the exam (monotonic elapsed + time away; core
--    offlineExam.ts), keeps answers locally, then uploads once:
--  * exam_offline_submit(upload id, session, answers, elapsed ms, started,
--    finished, device): every upload is stored (exam_offline_uploads). It is
--    ACCEPTED (answers stored, session submitted and graded, score returned)
--    when the session is still in progress, it arrives by deadline + grace,
--    and elapsed ≤ duration + grace. Otherwise it is stored and FLAGGED
--    ('late', 'over_time', 'already_closed'), never graded; an open session
--    is closed as auto-submitted with what reached the server before. The
--    same upload id again returns the first verdict (a retry is free).
--  * exam_offline_accept(upload, reason): the class's teacher (or staff) may
--    accept a flagged upload: its answers replace the session's, the session
--    is graded, and who/why is recorded on the upload row.
--  * my_offline_exams(): the student's offline exams in their window (plus
--    their own result after it closes).
--  * exam_offline_status(assessment): for the teacher's live view, each
--    session's delivery, elapsed time and latest upload verdict.
--
--  CHECK FIRST: nothing to check.
-- ============================================================

do $$
begin
  if to_regprocedure('public.start_exam_session(uuid)') is null
     or to_regprocedure('public.grade_exam_session(uuid)') is null
     or to_regprocedure('public.teaches_class_subject_now(uuid,uuid)') is null then
    raise exception '038 needs db/020 (live exams). Run 020 first.';
  end if;
end $$;


-- ============================================================
--  PART 1 — Every upload is kept
-- ============================================================
create table if not exists public.exam_offline_uploads (
  id                 uuid primary key,             -- the device's id: a retry is a no-op
  session_id         uuid not null references public.exam_sessions(id),
  learner_id         uuid not null references public.profiles(id),
  answers            jsonb not null,               -- { question id: scalar answer }
  client_elapsed_ms  bigint not null,
  client_started_at  timestamptz,
  client_finished_at timestamptz,
  device_id          text,
  -- What the device noticed: { hidden: n, clock_back: n } (monitoring only).
  client_flags       jsonb not null default '{}'::jsonb,
  received_at        timestamptz not null default now(),
  verdict            text not null
                     check (verdict in ('accepted','late','over_time','already_closed')),
  accepted_by        uuid references public.profiles(id),
  accepted_at        timestamptz,
  accept_reason      text
);
create index if not exists ix_eou_session on public.exam_offline_uploads(session_id, received_at desc);

alter table public.exam_offline_uploads enable row level security;
drop policy if exists p_eou_read on public.exam_offline_uploads;
create policy p_eou_read on public.exam_offline_uploads for select
  using (learner_id = auth.uid() or public.is_staff() or exists (
    select 1 from public.exam_sessions s
      join public.assessments a on a.id = s.assessment_id
     where s.id = exam_offline_uploads.session_id
       and public.teaches_class_subject_now(a.class_id, a.subject_id)));
revoke insert, update, delete on public.exam_offline_uploads from authenticated, anon;
grant select on public.exam_offline_uploads to authenticated;


-- ============================================================
--  PART 2 — Teacher: schedule
-- ============================================================
drop function if exists public.exam_schedule_offline(uuid, timestamptz, timestamptz, int);
create or replace function public.exam_schedule_offline(
  p_assessment uuid, p_opens timestamptz, p_closes timestamptz, p_minutes int default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a public.assessments;
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  select * into a from public.assessments where id = p_assessment for update;
  if a.id is null then raise exception 'exam_not_available' using errcode = 'P0002'; end if;
  if not public.teaches_class_subject_now(a.class_id, a.subject_id) then
    raise exception 'not_your_class' using errcode = '42501';
  end if;
  if a.status = 'closed' then raise exception 'exam_closed' using errcode = '22023'; end if;
  if a.mode = 'live_exam' and a.status = 'published' then
    raise exception 'exam_running_live' using errcode = '22023';
  end if;
  if exists (select 1 from public.exam_sessions where assessment_id = a.id) then
    raise exception 'exam_already_started' using errcode = '22023';
  end if;
  if p_minutes is not null and (p_minutes < 1 or p_minutes > 600) then
    raise exception 'bad_minutes' using errcode = '22023';
  end if;
  if p_closes is null or p_closes <= now() or p_closes <= coalesce(p_opens, now())
     or p_closes > coalesce(p_opens, now()) + interval '31 days' then
    raise exception 'bad_window' using errcode = '22023';
  end if;
  if not exists (select 1 from public.assessment_questions where assessment_id = a.id) then
    raise exception 'exam_no_questions' using errcode = '22023';
  end if;
  update public.assessments
     set mode = 'offline_exam', status = 'published',
         opens_at = coalesce(p_opens, now()), closes_at = p_closes,
         duration_seconds = coalesce(p_minutes * 60, duration_seconds, 1800),
         join_code = null
   where id = a.id
  returning * into a;
  return jsonb_build_object('opens_at', a.opens_at, 'closes_at', a.closes_at,
                            'duration_seconds', a.duration_seconds);
end $$;


-- ============================================================
--  PART 3 — Student: download, submit
-- ============================================================
drop function if exists public.exam_offline_download(uuid);
create or replace function public.exam_offline_download(p_assessment uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  a   public.assessments;
  res jsonb;
  sid uuid;
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  select * into a from public.assessments where id = p_assessment;
  if a.id is null or a.status <> 'published' or a.mode <> 'offline_exam' or a.closes_at is null then
    raise exception 'exam_not_available' using errcode = 'P0002';
  end if;
  -- 020's start: enrollment, window, paper without answers, one session per learner.
  res := public.start_exam_session(a.id);
  sid := (res->>'session_id')::uuid;
  -- A session made by this download runs until the window closes (the device
  -- times the exam itself); one made earlier keeps its own deadline.
  update public.exam_sessions
     set delivery = 'offline', deadline_at = a.closes_at
   where id = sid and status = 'in_progress'
     and not exists (select 1 from public.exam_offline_uploads u where u.session_id = sid)
     and started_at >= now() - interval '5 seconds';
  return res || jsonb_build_object(
    'deadline_at', (select deadline_at from public.exam_sessions where id = sid),
    'closes_at', a.closes_at,
    'duration_seconds', coalesce(a.duration_seconds, 3600),
    'grace_seconds', coalesce((a.settings->>'grace_seconds')::int, 30));
end $$;

drop function if exists public.exam_offline_submit(uuid, uuid, jsonb, bigint, timestamptz, timestamptz, text);
drop function if exists public.exam_offline_submit(uuid, uuid, jsonb, bigint, timestamptz, timestamptz, text, jsonb);
create or replace function public.exam_offline_submit(
  p_upload uuid, p_session uuid, p_answers jsonb, p_elapsed_ms bigint,
  p_started_at timestamptz default null, p_finished_at timestamptz default null,
  p_device text default null, p_flags jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s       public.exam_sessions;
  a       public.assessments;
  u       public.exam_offline_uploads;
  grace   int;
  verdict text;
  k       text;
  v       jsonb;
  ver     int;
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if p_upload is null then raise exception 'upload_id_required' using errcode = '22023'; end if;
  select * into s from public.exam_sessions
   where id = p_session and learner_id = auth.uid() for update;
  if s.id is null then raise exception 'no_such_session' using errcode = 'P0002'; end if;
  if s.delivery <> 'offline' then raise exception 'not_offline' using errcode = '22023'; end if;

  -- The same upload again: the first verdict stands.
  select * into u from public.exam_offline_uploads where id = p_upload;
  if u.id is not null then
    if u.session_id <> s.id then raise exception 'upload_id_taken' using errcode = '23505'; end if;
  else
    if jsonb_typeof(p_answers) is distinct from 'object' then
      raise exception 'bad_answer' using errcode = '22023';
    end if;
    for k, v in select key, value from jsonb_each(p_answers) loop
      if not exists (select 1 from jsonb_array_elements(s.paper) item where item->>'q' = k) then
        raise exception 'question_not_in_paper' using errcode = '22023';
      end if;
      if not (jsonb_typeof(v) in ('boolean','null')
              or (jsonb_typeof(v) = 'string' and length(v #>> '{}') <= 500)) then
        raise exception 'bad_answer' using errcode = '22023';
      end if;
    end loop;
    if p_elapsed_ms is null or p_elapsed_ms < 0 then
      raise exception 'bad_elapsed' using errcode = '22023';
    end if;

    select * into a from public.assessments where id = s.assessment_id;
    grace := coalesce((a.settings->>'grace_seconds')::int, 30);
    verdict := case
      when s.status <> 'in_progress' and now() <= s.deadline_at + make_interval(secs => grace)
        then 'already_closed'
      when s.status <> 'in_progress' or now() > s.deadline_at + make_interval(secs => grace)
        then 'late'
      when p_elapsed_ms > (coalesce(a.duration_seconds, 3600) + grace)::bigint * 1000
        then 'over_time'
      else 'accepted' end;

    insert into public.exam_offline_uploads
      (id, session_id, learner_id, answers, client_elapsed_ms, client_started_at,
       client_finished_at, device_id, client_flags, verdict, received_at)
    values
      (p_upload, s.id, auth.uid(), p_answers, p_elapsed_ms, p_started_at, p_finished_at,
       left(p_device, 120),
       case when jsonb_typeof(p_flags) = 'object' and length(p_flags::text) <= 500
            then p_flags else '{}'::jsonb end,
       verdict, clock_timestamp())
    returning * into u;

    if verdict = 'accepted' then
      for k, v in select key, value from jsonb_each(p_answers) loop
        select (item->>'v')::int into ver
          from jsonb_array_elements(s.paper) item where item->>'q' = k;
        insert into public.exam_session_answers
          (session_id, question_id, question_version, answer, client_answered_at)
        values (s.id, k::uuid, ver, v, p_finished_at)
        on conflict (session_id, question_id)
        do update set answer = excluded.answer, client_answered_at = excluded.client_answered_at,
                      received_at = now();
      end loop;
      update public.exam_sessions
         set status = 'submitted', submitted_at = now(), client_elapsed_ms = p_elapsed_ms,
             last_seen_at = now()
       where id = s.id;
      perform public.grade_exam_session(s.id);
    elsif s.status = 'in_progress' then
      -- Over time: closed with what reached the server before; the upload waits for the teacher.
      update public.exam_sessions
         set status = 'auto_submitted', submitted_at = least(now(), deadline_at),
             client_elapsed_ms = p_elapsed_ms
       where id = s.id;
      perform public.grade_exam_session(s.id);
    end if;
  end if;

  select * into s from public.exam_sessions where id = s.id;
  return jsonb_build_object(
    'upload_id', u.id, 'verdict', u.verdict, 'received_at', u.received_at,
    'status', s.status,
    'score', case when u.verdict = 'accepted' or u.accepted_at is not null then s.score end,
    'total', case when u.verdict = 'accepted' or u.accepted_at is not null then s.total end,
    'questions', jsonb_array_length(s.paper),
    'answered', (select count(*) from jsonb_each(u.answers) x
                  where x.value not in ('null'::jsonb, '""'::jsonb)),
    'to_mark', case when u.verdict = 'accepted' then (
                 select count(*) from public.exam_session_answers
                  where session_id = s.id and is_correct is null
                    and answer is not null and answer <> 'null'::jsonb) else 0 end);
end $$;


-- ============================================================
--  PART 4 — Teacher: accept a flagged upload, see offline status
-- ============================================================
drop function if exists public.exam_offline_accept(uuid, text);
create or replace function public.exam_offline_accept(p_upload uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  u   public.exam_offline_uploads;
  s   public.exam_sessions;
  a   public.assessments;
  k   text;
  v   jsonb;
  ver int;
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  select * into u from public.exam_offline_uploads where id = p_upload for update;
  if u.id is null then raise exception 'upload_not_found' using errcode = 'P0002'; end if;
  select * into s from public.exam_sessions where id = u.session_id for update;
  select * into a from public.assessments where id = s.assessment_id;
  if not public.teaches_class_subject_now(a.class_id, a.subject_id) then
    raise exception 'not_your_class' using errcode = '42501';
  end if;
  if u.verdict = 'accepted' or u.accepted_at is not null then
    raise exception 'upload_already_accepted' using errcode = '22023';
  end if;
  if s.status = 'void' then raise exception 'session_void' using errcode = '22023'; end if;
  if (to_jsonb(a)->>'results_confirmed_at') is not null then  -- 035's column, if present
    raise exception 'results_confirmed' using errcode = '22023';
  end if;

  for k, v in select key, value from jsonb_each(u.answers) loop
    select (item->>'v')::int into ver
      from jsonb_array_elements(s.paper) item where item->>'q' = k;
    continue when ver is null;
    insert into public.exam_session_answers
      (session_id, question_id, question_version, answer, client_answered_at)
    values (s.id, k::uuid, ver, v, u.client_finished_at)
    on conflict (session_id, question_id)
    do update set answer = excluded.answer, client_answered_at = excluded.client_answered_at,
                  received_at = now();
  end loop;
  update public.exam_sessions
     set status = 'submitted', submitted_at = coalesce(submitted_at, u.received_at),
         client_elapsed_ms = u.client_elapsed_ms
   where id = s.id;
  perform public.grade_exam_session(s.id);
  update public.exam_offline_uploads
     set accepted_by = auth.uid(), accepted_at = now(), accept_reason = btrim(p_reason)
   where id = u.id;
  select * into s from public.exam_sessions where id = s.id;
  return jsonb_build_object('status', s.status, 'score', s.score, 'total', s.total);
end $$;

drop function if exists public.exam_offline_status(uuid);
create or replace function public.exam_offline_status(p_assessment uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare a public.assessments;
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  select * into a from public.assessments where id = p_assessment;
  if a.id is null then raise exception 'exam_not_available' using errcode = 'P0002'; end if;
  if not public.teaches_class_subject_now(a.class_id, a.subject_id) then
    raise exception 'not_your_class' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'session_id', s.id, 'delivery', s.delivery,
             'client_elapsed_ms', s.client_elapsed_ms,
             'upload_id', u.id, 'verdict', u.verdict, 'received_at', u.received_at,
             'accepted_at', u.accepted_at, 'accept_reason', u.accept_reason,
             'client_flags', u.client_flags,
             'answers', (select count(*) from jsonb_each(u.answers) x
                          where x.value not in ('null'::jsonb, '""'::jsonb))))
      from public.exam_sessions s
      left join lateral (
        select * from public.exam_offline_uploads x
         where x.session_id = s.id order by x.received_at desc limit 1) u on true
     where s.assessment_id = a.id), '[]'::jsonb);
end $$;


-- ============================================================
--  PART 5 — Student: which offline exams
-- ============================================================
drop function if exists public.my_offline_exams();
create or replace function public.my_offline_exams()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'assessment_id', a.id, 'title', a.title, 'subject_name', sj.name,
           'duration_seconds', a.duration_seconds, 'opens_at', a.opens_at,
           'closes_at', a.closes_at, 'session_id', s.id, 'session_status', s.status,
           'score', case when s.status = 'submitted' then s.score end,
           'total', case when s.status = 'submitted' then s.total end)
         order by a.closes_at), '[]'::jsonb)
    from public.assessments a
    join public.enrollments e
      on e.class_id = a.class_id and e.year_id = a.year_id and e.status = 'active'
     and e.student_id = public.my_student_id()
    left join public.subjects sj on sj.id = a.subject_id
    left join public.exam_sessions s on s.assessment_id = a.id and s.learner_id = auth.uid()
   where a.mode = 'offline_exam' and a.status in ('published', 'closed')
     and (a.opens_at is null or a.opens_at <= now())
     and (a.closes_at > now() or (s.id is not null and a.closes_at > now() - interval '14 days'))
$$;

revoke all on function public.exam_schedule_offline(uuid, timestamptz, timestamptz, int) from public, anon;
revoke all on function public.exam_offline_download(uuid) from public, anon;
revoke all on function public.exam_offline_submit(uuid, uuid, jsonb, bigint, timestamptz, timestamptz, text, jsonb) from public, anon;
revoke all on function public.exam_offline_accept(uuid, text) from public, anon;
revoke all on function public.exam_offline_status(uuid) from public, anon;
revoke all on function public.my_offline_exams() from public, anon;
grant execute on function public.exam_schedule_offline(uuid, timestamptz, timestamptz, int) to authenticated;
grant execute on function public.exam_offline_download(uuid) to authenticated;
grant execute on function public.exam_offline_submit(uuid, uuid, jsonb, bigint, timestamptz, timestamptz, text, jsonb) to authenticated;
grant execute on function public.exam_offline_accept(uuid, text) to authenticated;
grant execute on function public.exam_offline_status(uuid) to authenticated;
grant execute on function public.my_offline_exams() to authenticated;
