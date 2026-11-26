-- ============================================================
--  037 — SPACED REVISION (7 / 30 days) + NIGHTLY RETENTION ROLLUP (prompt 42)
--  DRAFT — NOT YET RUN
-- ============================================================
--  RUN ORDER: after db/019 (refuses without it). Dev first, then production
--  like 017, on a day the nightly backup succeeded. For the nightly rollup,
--  pg_cron must be on (020 already asks for it); without it everything else
--  works and the rollup can be run by hand.
--
--  Additive + idempotent: two new tables (if not exists), functions and one
--  trigger dropped-then-created, one cron job (re)scheduled. No existing row,
--  column or policy is changed.
--
--  THE SCHEDULE (DECISIONS #160; same as packages/core/src/revision.ts,
--  time-travel tested in packages/core/test/revision.test.ts):
--    concept_mastery.review_stage  0 not scheduled · 1 the 7-day check is next
--                                  2 the 30-day check is next · 3 retained (done)
--    019 already sets stage 1, next_review_at = mastery (or relief) + 7 days.
--    A 'revision' attempt (Prepare's "Due for revision", or Smart review) is a
--    CHECK for each concept it touched that is due: stage 1 or 2 and
--    next_review_at ≤ the attempt's time + 12 hours (a little early is fine).
--      ≥ roundMin (3) items of the concept, ≥ masteredPct (80 %) right → PASS:
--        stage 1 → 2, next = now + 30 days; stage 2 → 3, next = null.
--      ≥ roundMin items, below 80 % → FAIL: back to stage 1, next = now +
--        7 days, and one open 'revision' follow-up (merged into an open one).
--        Revision follow-ups never block new topics and come last on Prepare
--        (core FOLLOW_UP_ORDER, BLOCKING_KINDS): "lower priority".
--      fewer items → not a check; nothing changes.
--    The band never goes back from mastered (019's rule); a failed check only
--    brings the concept back into revision.
--  Each check is one revision_checks row (append-only evidence, a few per
--  learner per month: free tier). retention_rollup() turns a day's checks into
--  retention_daily per subject and stage (the 7- and 30-day retention measures,
--  LMS_AUDIT §5.12); pg_cron runs it nightly at 02:10 PKT for yesterday.
--
--  CHECK FIRST: nothing to check.
-- ============================================================

do $$
begin
  if to_regprocedure('public.mastery_apply_attempt(uuid)') is null
     or to_regprocedure('public.mastery_cfg()') is null then
    raise exception '037 needs db/019 (mastery, follow-ups). Run 019 first.';
  end if;
end $$;


-- ============================================================
--  PART 1 — Tables
-- ============================================================
-- One retention check: a revision attempt's score on one due concept.
create table if not exists public.revision_checks (
  id           uuid primary key default gen_random_uuid(),
  learner_id   uuid not null references public.profiles(id),
  concept_id   uuid not null references public.concepts(id),
  subject_id   uuid references public.subjects(id),
  attempt_id   uuid not null references public.practice_attempts(id),
  stage        smallint not null check (stage in (1, 2)),
  due_at       timestamptz not null,
  n_items      smallint not null,
  n_correct    smallint not null,
  passed       boolean not null,
  checked_at   timestamptz not null default now(),
  is_test_data boolean not null default false,
  unique (attempt_id, concept_id)
);
create index if not exists ix_rc_learner on public.revision_checks(learner_id, checked_at desc);
create index if not exists ix_rc_checked on public.revision_checks(checked_at);

alter table public.revision_checks enable row level security;
drop policy if exists p_rc_read on public.revision_checks;
create policy p_rc_read on public.revision_checks for select
  using (learner_id = auth.uid() or public.is_staff() or public.teaches_learner(learner_id));
-- No insert / update / delete policy: only the trigger below writes (definer).
revoke insert, update, delete on public.revision_checks from authenticated, anon;
grant select on public.revision_checks to authenticated;

-- The nightly rollup: one row per day (PKT), subject and stage. No names.
create table if not exists public.retention_daily (
  day          date not null,
  subject_id   uuid not null references public.subjects(id),
  stage        smallint not null check (stage in (1, 2)),
  checks       int not null default 0,
  passed       int not null default 0,
  learners     int not null default 0,
  -- Snapshot when the rollup ran: concepts due now, and due for over a week.
  due_now      int not null default 0,
  overdue      int not null default 0,
  computed_at  timestamptz not null default now(),
  primary key (day, subject_id, stage)
);
create index if not exists ix_rd_subject on public.retention_daily(subject_id, day desc);

alter table public.retention_daily enable row level security;
drop policy if exists p_rd_read on public.retention_daily;
create policy p_rd_read on public.retention_daily for select
  using (public.is_staff() or exists (
    select 1
      from public.subjects s
      join public.teacher_assignments ta
        on ta.class_id = s.class_id and (ta.subject_id is null or ta.subject_id = s.id)
      join public.academic_years y on y.id = ta.year_id and y.is_current
     where s.id = retention_daily.subject_id and ta.teacher_id = auth.uid()));
revoke insert, update, delete on public.retention_daily from authenticated, anon;
grant select on public.retention_daily to authenticated;


-- ============================================================
--  PART 2 — Checks on revision attempts
-- ============================================================
create or replace function public.revision_apply_attempt(p_attempt uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  a      public.practice_attempts%rowtype;
  cfg    jsonb := public.mastery_cfg();
  at_    timestamptz;
  r      record;
  subj   uuid;
  pass   boolean;
  v_out  jsonb := '[]'::jsonb;
  first_days  int := coalesce((cfg->>'firstReviewDays')::int, 7);
  second_days int := coalesce((cfg->>'secondReviewDays')::int, 30);
  min_n  int := coalesce((cfg->>'roundMin')::int, 3);
  pct    int := coalesce((cfg->>'masteredPct')::int, 80);
begin
  select * into a from public.practice_attempts where id = p_attempt;
  if not found or a.kind <> 'revision' then return v_out; end if;
  at_ := least(a.started_at, now());

  -- This attempt's score on each concept it touched (marked, live questions).
  for r in
    select qv.concept_id as cid,
           count(*)::int as n,
           count(*) filter (where (x.j->>'c')::boolean)::int as nc
      from jsonb_array_elements(case when jsonb_typeof(a.items) = 'array'
                                     then a.items else '[]'::jsonb end) x(j)
      join public.question_versions qv
        on jsonb_typeof(x.j) = 'object'
       and x.j->>'q' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and jsonb_typeof(x.j->'v') = 'number'
       and qv.question_id = (x.j->>'q')::uuid
       and qv.version = trunc((x.j->>'v')::numeric)::int
      join public.questions q on q.id = qv.question_id
     where qv.concept_id is not null and not (x.j ? 'x')
       and q.status is distinct from 'retired'
     group by qv.concept_id
  loop
    continue when r.n < min_n;
    -- Due? (row locked: two syncs of the same attempt can't both count)
    perform 1 from public.concept_mastery m
     where m.learner_id = a.learner_id and m.concept_id = r.cid
       and m.review_stage in (1, 2) and m.next_review_at is not null
       and m.next_review_at <= at_ + interval '12 hours'
       for update;
    continue when not found;
    continue when exists (select 1 from public.revision_checks c
                           where c.attempt_id = a.id and c.concept_id = r.cid);

    pass := r.nc * 100 >= pct * r.n;
    select ch.subject_id into subj
      from public.concepts c join public.topics t on t.id = c.topic_id
      join public.chapters ch on ch.id = t.chapter_id
     where c.id = r.cid;

    insert into public.revision_checks
      (learner_id, concept_id, subject_id, attempt_id, stage, due_at, n_items, n_correct, passed)
    select a.learner_id, r.cid, subj, a.id, m.review_stage, m.next_review_at, r.n, r.nc, pass
      from public.concept_mastery m
     where m.learner_id = a.learner_id and m.concept_id = r.cid;

    if pass then
      update public.concept_mastery m
         set review_stage   = m.review_stage + 1,
             next_review_at = case when m.review_stage = 1
                                   then now() + make_interval(days => second_days) end,
             updated_at     = now()
       where m.learner_id = a.learner_id and m.concept_id = r.cid;
    else
      update public.concept_mastery m
         set review_stage   = 1,
             next_review_at = now() + make_interval(days => first_days),
             updated_at     = now()
       where m.learner_id = a.learner_id and m.concept_id = r.cid;
      if subj is not null then
        insert into public.follow_ups (learner_id, concept_id, subject_id, kind, source_attempt_id)
        values (a.learner_id, r.cid, subj, 'revision', a.id)
        on conflict (learner_id, concept_id, kind) where status = 'open'
        do update set updated_at = now();
      end if;
    end if;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'concept_id', r.cid, 'passed', pass, 'n', r.n, 'correct', r.nc));
  end loop;
  return v_out;
end $$;

create or replace function public.practice_attempts_revision()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.revision_apply_attempt(new.id);
  return null;
exception when others then
  -- Never lose an attempt over a revision check.
  raise warning 'practice_attempts_revision: % (%), attempt % stored without a revision check',
    sqlerrm, sqlstate, new.id;
  return null;
end $$;

-- Fires after 019's t_practice_attempts_apply (same event: name order), so the
-- band is already recomputed when the check runs.
drop trigger if exists t_practice_attempts_revision on public.practice_attempts;
create trigger t_practice_attempts_revision
  after insert on public.practice_attempts
  for each row when (new.kind = 'revision' and not new.is_test_data)
  execute function public.practice_attempts_revision();


-- ============================================================
--  PART 3 — Nightly retention rollup
-- ============================================================
-- One day's checks (PKT calendar day) → retention_daily. Re-running a day
-- replaces its rows. Returns the number of rows written.
create or replace function public.retention_rollup(
  p_day date default ((now() at time zone 'Asia/Karachi')::date - 1))
returns int language plpgsql security definer set search_path = public as $$
declare
  n int;
  t0 timestamptz := (p_day::timestamp) at time zone 'Asia/Karachi';
  t1 timestamptz := ((p_day + 1)::timestamp) at time zone 'Asia/Karachi';
begin
  delete from public.retention_daily where day = p_day;
  with chk as (
    select subject_id, stage, count(*)::int as checks,
           count(*) filter (where passed)::int as passed,
           count(distinct learner_id)::int as learners
      from public.revision_checks
     where checked_at >= t0 and checked_at < t1 and subject_id is not null
       and not is_test_data
     group by subject_id, stage
  ), due as (
    select ch.subject_id, m.review_stage::smallint as stage,
           count(*) filter (where m.next_review_at <= now())::int as due_now,
           count(*) filter (where m.next_review_at <= now() - interval '7 days')::int as overdue
      from public.concept_mastery m
      join public.concepts c on c.id = m.concept_id
      join public.topics t on t.id = c.topic_id
      join public.chapters ch on ch.id = t.chapter_id
     where m.review_stage in (1, 2) and m.next_review_at <= now()
     group by ch.subject_id, m.review_stage
  )
  insert into public.retention_daily (day, subject_id, stage, checks, passed, learners, due_now, overdue)
  select p_day, coalesce(chk.subject_id, due.subject_id), coalesce(chk.stage, due.stage),
         coalesce(chk.checks, 0), coalesce(chk.passed, 0), coalesce(chk.learners, 0),
         coalesce(due.due_now, 0), coalesce(due.overdue, 0)
    from chk full join due on due.subject_id = chk.subject_id and due.stage = chk.stage;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.revision_apply_attempt(uuid)   from public, anon, authenticated;
revoke all on function public.practice_attempts_revision()   from public, anon, authenticated;
revoke all on function public.retention_rollup(date)         from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- 21:10 UTC = 02:10 PKT, after the day has ended in Pakistan.
    perform cron.schedule('retention-rollup', '10 21 * * *', 'select public.retention_rollup()');
  else
    raise notice '037: pg_cron is off, so the nightly retention rollup is not scheduled. Turn it on and run 037 again.';
  end if;
end $$;
