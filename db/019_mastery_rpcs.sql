-- ============================================================
--  019 — MASTERY, FOLLOW-UPS, RELIEF AND DIAGNOSTICS (prompt 40)
--  DRAFT — NOT YET RUN
-- ============================================================
--  RUN ORDER: after db/017 and db/023 (refuses without 017). Best after 031,
--  032 and 033 on a project that has them; works with or without 018, 028,
--  029, 030. Dev first, then production on a day the nightly backup succeeded
--  (like 017).
--
--  Additive + idempotent: one new table (mastery_config, one row), functions
--  and triggers dropped-then-created, policies dropped-then-created. No table
--  or column is dropped, and running it changes no existing row.
--
--  WHAT IT DOES
--  * Every practice_attempts row is marked on the server as it arrives
--    (BEFORE INSERT): each item's `c` is recomputed from the raw answer `a`
--    with the key of the exact version answered (auto_mark_item, the exam
--    rule); items the server can't mark get "x": 1 and don't count. n_correct
--    / n_total are recomputed. A follow_up_id that isn't the learner's own is
--    dropped. The raw answers are kept as sent.
--  * Then (AFTER INSERT) concept_mastery is recomputed from ALL of the
--    learner's evidence for every concept the attempt touched (rule below), and
--    follow-ups are opened / counted / cleared / relieved. This works for the
--    app's existing direct insert (sync queue) and for the new RPC alike, so a
--    retried upload (same id) changes nothing: no row, no trigger.
--  * record_practice_attempt(attempt jsonb): the same insert as an RPC
--    (security INVOKER, so the 017/023 insert policies still apply), idempotent
--    on id, returning what changed (bands before → after, open follow-ups).
--  * diagnostic_items(topic, size?): ~30 approved practice items covering every
--    concept of a topic (topics.diagnostic_size or the configured default),
--    never-seen first. Returns ids + versions only, never keys.
--  * mastery_config: the thresholds, one row, staff may tune them.
--  * Questions retired → open follow-ups and bands on that concept are
--    re-evaluated; a prep account linked to a school login (023) → the school
--    login's mastery is recomputed from the moved attempts.
--
--  THE RULE (DECISIONS #26, #134–#138; same as packages/core/src/mastery.ts,
--  pinned by packages/core/test/fixtures/mastery-cases.json):
--    window   = latest answer of each of the last 5 distinct questions
--    mastered = 5 in the window, ≥ 80 % right, ≥ 1 hard (difficulty 3) right,
--               ≥ 1 right the first and only time it was seen. Never goes back.
--    weak     = ≥ 3 in the window and < 60 % right
--    carried_over (after relief) stays until weak or mastered; else learning.
--    Answers on a retired question, or that can't be marked, don't count.
--  FOLLOW-UPS (LMS_AUDIT §3.5):
--    diagnostic attempt → each weak concept gets one open 'diagnostic'
--    follow-up (merged into the open one if there is one); revision attempt →
--    'revision'. Plain practice never opens one (it only clears).
--    Any attempt that leaves a concept mastered clears its open follow-ups.
--    A 'followup' attempt is a round for every open follow-up on the concepts
--    it touched: ≥ 80 % right on ≥ 3 items of the concept clears it; otherwise
--    rounds + 1, and after 3 rounds, or when no unseen approved practice item
--    of the concept is left, it is RELIEVED: status relieved, concept
--    carried_over, back in 7 days for revision, a gate_overrides
--    'auto_relief' row (actor null). Nobody is trapped.
--  Rows flagged is_test_data (seed fixtures) are stored as given: the seed
--  writes its own mastery rows.
--
--  CHECK FIRST: nothing to check.
-- ============================================================


-- ============================================================
--  PART 0 — Preflight
-- ============================================================
do $$
begin
  if to_regclass('public.practice_attempts') is null
     or to_regclass('public.concept_mastery') is null
     or to_regclass('public.follow_ups') is null
     or to_regclass('public.gate_overrides') is null
     or to_regclass('public.question_versions') is null
     or to_regclass('public.item_approvals') is null then
    raise exception '019 needs db/017 (practice_attempts, concept_mastery, follow_ups, question_versions). Run 017 and 023 first.';
  end if;
end $$;


-- ============================================================
--  PART 1 — Thresholds (one row; DECISIONS #26: config table, not code)
-- ============================================================
create table if not exists public.mastery_config (
  id                 smallint primary key default 1 check (id = 1),
  window_size        smallint not null default 5  check (window_size between 3 and 20),
  mastered_pct       smallint not null default 80 check (mastered_pct between 50 and 100),
  hard_level         smallint not null default 3  check (hard_level between 1 and 3),
  need_hard          smallint not null default 1  check (need_hard between 0 and 5),
  need_fresh         smallint not null default 1  check (need_fresh between 0 and 5),
  weak_min           smallint not null default 3  check (weak_min between 1 and 20),
  weak_pct           smallint not null default 60 check (weak_pct between 0 and 100),
  round_min          smallint not null default 3  check (round_min between 1 and 20),
  relief_rounds      smallint not null default 3  check (relief_rounds between 1 and 10),
  diagnostic_default smallint not null default 30 check (diagnostic_default between 5 and 60),
  diagnostic_min     smallint not null default 5  check (diagnostic_min between 1 and 60),
  diagnostic_max     smallint not null default 60 check (diagnostic_max between 5 and 100),
  first_review_days  smallint not null default 7  check (first_review_days between 1 and 60),
  updated_by         uuid references public.profiles(id),
  updated_at         timestamptz not null default now()
);
insert into public.mastery_config (id) values (1) on conflict (id) do nothing;

alter table public.mastery_config enable row level security;
drop policy if exists p_mastery_config_read on public.mastery_config;
create policy p_mastery_config_read on public.mastery_config for select
  using (auth.uid() is not null);
drop policy if exists p_mastery_config_staff on public.mastery_config;
create policy p_mastery_config_staff on public.mastery_config for update
  using (public.is_staff()) with check (public.is_staff());
-- No insert/delete policy: the one row is made here and never removed.

-- The thresholds as the jsonb the pure functions take (same keys as core).
create or replace function public.mastery_cfg()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select jsonb_build_object(
           'window', window_size, 'masteredPct', mastered_pct, 'hardLevel', hard_level,
           'needHard', need_hard, 'needFresh', need_fresh, 'weakMin', weak_min,
           'weakPct', weak_pct, 'roundMin', round_min, 'reliefRounds', relief_rounds,
           'diagnosticDefault', diagnostic_default, 'diagnosticMin', diagnostic_min,
           'diagnosticMax', diagnostic_max, 'firstReviewDays', first_review_days)
           from public.mastery_config where id = 1),
         '{"window":5,"masteredPct":80,"hardLevel":3,"needHard":1,"needFresh":1,"weakMin":3,"weakPct":60,"roundMin":3,"reliefRounds":3,"diagnosticDefault":30,"diagnosticMin":5,"diagnosticMax":60,"firstReviewDays":7}'::jsonb)
$$;


-- ============================================================
--  PART 2 — The marking rule (identical copy of 018's; harmless either order)
-- ============================================================
-- 019 must work on a project without 018 (production gets 018 at the
-- cut-over). These are byte-for-byte the 018 definitions; whichever runs last
-- wins with the same body. 019_smoke re-runs the shared auto-mark vectors.
create or replace function public.answer_text_norm(p text)
returns text language sql immutable set search_path = public as $$
  select lower(regexp_replace(regexp_replace(
           translate(p, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'),
           '[[:space:] ]+', ' ', 'g'), '^ | $', '', 'g'))
$$;

create or replace function public.auto_mark_item(p_type text, p_value jsonb, p_answer jsonb)
returns boolean language plpgsql immutable set search_path = public as $$
declare
  k   jsonb := case when jsonb_typeof(p_answer) = 'object' then p_answer -> 'correct' end;
  v   text;
  key text;
begin
  if k is null or jsonb_typeof(k) = 'null' then
    return null;
  end if;

  if p_type in ('mcq', 'tap_image') then
    if jsonb_typeof(k) <> 'string' or k #>> '{}' = '' then return null; end if;
    return coalesce(jsonb_typeof(p_value) = 'string' and p_value = k, false);

  elsif p_type = 'true_false' then
    if jsonb_typeof(k) <> 'boolean' then return null; end if;
    return coalesce(jsonb_typeof(p_value) = 'boolean' and p_value = k, false);

  elsif p_type = 'numeric' then
    if jsonb_typeof(k) not in ('number', 'string') then return null; end if;
    key := btrim(k #>> '{}');
    if key !~ '^[+-]?([0-9]+\.?[0-9]*|\.[0-9]+)$' then return null; end if;
    if jsonb_typeof(p_value) <> 'string' then return false; end if;
    v := replace(replace(
           translate(p_value #>> '{}', '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹٫', '01234567890123456789.'),
           ' ', ''), E' ', '');
    if v !~ '^[+-]?([0-9]+\.?[0-9]*|\.[0-9]+)$' then return false; end if;
    return v::numeric = key::numeric;

  elsif p_type = 'short_text' then
    if jsonb_typeof(k) <> 'string' or public.answer_text_norm(k #>> '{}') = '' then
      return null;
    end if;
    if jsonb_typeof(p_value) <> 'string' then return false; end if;
    v := public.answer_text_norm(p_value #>> '{}');
    if v = '' then return false; end if;
    if v = public.answer_text_norm(k #>> '{}') then return true; end if;
    if jsonb_typeof(p_answer -> 'also') = 'array' then
      return exists (
        select 1 from jsonb_array_elements(p_answer -> 'also') x
         where jsonb_typeof(x) = 'string' and public.answer_text_norm(x #>> '{}') = v);
    end if;
    return false;
  end if;

  return null;  -- multi_select, match, anything new: the teacher marks it
end $$;


-- ============================================================
--  PART 3 — Pure rules (mirrored in packages/core/src/mastery.ts)
-- ============================================================
-- events: [{q, c, d, t, i, x?}] (t = ms, i = order inside the attempt).
-- Returns the same object as core masteryFromEvents().
create or replace function public.mastery_eval(p_events jsonb, p_cfg jsonb, p_prev text default null)
returns jsonb language plpgsql immutable set search_path = public as $$
declare
  w       int := coalesce((p_cfg->>'window')::int, 5);
  pct     int := coalesce((p_cfg->>'masteredPct')::int, 80);
  hard_lv int := coalesce((p_cfg->>'hardLevel')::int, 3);
  n_hard  int := coalesce((p_cfg->>'needHard')::int, 1);
  n_fresh int := coalesce((p_cfg->>'needFresh')::int, 1);
  w_min   int := coalesce((p_cfg->>'weakMin')::int, 3);
  w_pct   int := coalesce((p_cfg->>'weakPct')::int, 60);
  n_att int; n_cor int; n_dist int; n int; r int; h int; f int;
  needs text[] := '{}';
  now_m boolean;
  st text;
begin
  with ev as (
    select e->>'q' as q, coalesce((e->>'c')::boolean, false) as c,
           coalesce((e->>'d')::int, 0) as d,
           coalesce((e->>'t')::numeric, 0) as t, coalesce((e->>'i')::int, 0) as i
      from jsonb_array_elements(case when jsonb_typeof(p_events) = 'array'
                                     then p_events else '[]'::jsonb end) e
     where not coalesce((e->>'x')::boolean, false)
  ), per_q as (
    select q, count(*) as cnt from ev group by q
  ), lastq as (
    select distinct on (q) q, c, d, t, i from ev order by q, t desc, i desc
  ), win as (
    select l.c, l.d, p.cnt from lastq l join per_q p using (q)
     order by l.t desc, l.i desc limit w
  )
  select (select count(*) from ev), (select count(*) from ev where c),
         (select count(*) from per_q),
         count(*), count(*) filter (where c), count(*) filter (where c and d >= hard_lv),
         count(*) filter (where c and cnt = 1)
    into n_att, n_cor, n_dist, n, r, h, f
    from win;

  if n < w then needs := needs || 'more'::text; end if;
  if n = 0 or r * 100 < pct * n then needs := needs || 'accuracy'::text; end if;
  if h < n_hard then needs := needs || 'hard'::text; end if;
  if f < n_fresh then needs := needs || 'fresh'::text; end if;
  now_m := cardinality(needs) = 0;

  st := case
          when now_m or p_prev = 'mastered' then 'mastered'
          when n >= w_min and r * 100 < w_pct * n then 'weak'
          when p_prev = 'carried_over' then 'carried_over'
          else 'learning'
        end;

  return jsonb_build_object(
    'state', st, 'nAttempted', n_att, 'nCorrect', n_cor, 'nDistinct', n_dist,
    'window', jsonb_build_object('n', n, 'right', r, 'hard', h, 'fresh', f),
    'needs', to_jsonb(needs), 'masteredNow', now_m);
end $$;

-- pool: [{q, concept, order, d, seen (ms|null)}]. Returns the ordered q ids
-- (same as core pickDiagnostic()).
create or replace function public.diagnostic_pick(p_pool jsonb, p_n int)
returns jsonb language sql immutable set search_path = public as $$
  with p as (
    select e->>'q' as q, e->>'concept' as concept, coalesce((e->>'order')::int, 0) as ord,
           coalesce((e->>'d')::int, 0) as d, (e->>'seen')::numeric as seen
      from jsonb_array_elements(case when jsonb_typeof(p_pool) = 'array'
                                     then p_pool else '[]'::jsonb end) e
  ), k as (
    select p.*, (seen is not null)::int as sf,
           row_number() over (partition by concept, (seen is not null), d
                              order by coalesce(seen, -1), q collate "C") - 1 as k
      from p
  ), r as (
    select k.*, row_number() over (partition by concept
             order by sf, k, case d when 2 then 0 when 1 then 1 when 3 then 2 else 3 end,
                      coalesce(seen, -1), q collate "C") - 1 as r
      from k
  ), cut as (
    select q, r, ord, concept from r
     order by r, ord, concept collate "C"
     limit greatest(coalesce(p_n, 0), 0)
  )
  select coalesce(jsonb_agg(q order by r, ord, concept collate "C"), '[]'::jsonb) from cut
$$;


-- ============================================================
--  PART 4 — Evidence → concept_mastery
-- ============================================================
-- A learner's server-marked answers for some concepts, grouped by concept.
-- Excludes retired questions, unknown versions and items that can't be marked.
-- Re-marks from the raw answer every time, so rows stored before 019 (client
-- `c`) are judged by the server too.
create or replace function public.mastery_events(p_learner uuid, p_concepts uuid[])
returns table (concept_id uuid, events jsonb, last_at timestamptz)
language sql stable security definer set search_path = public as $$
  with it as (
    select pa.started_at, x.j, x.n
      from public.practice_attempts pa
      cross join lateral jsonb_array_elements(
             case when jsonb_typeof(pa.items) = 'array' then pa.items else '[]'::jsonb end
           ) with ordinality as x(j, n)
     where pa.learner_id = p_learner
       and jsonb_typeof(x.j) = 'object'
       and x.j->>'q' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and jsonb_typeof(x.j->'v') = 'number'
  ), marked as (
    select qv.concept_id, it.started_at, it.n, qv.question_id, qv.difficulty,
           public.auto_mark_item(qv.type, it.j->'a', qv.answer) as ok
      from it
      join public.question_versions qv
        on qv.question_id = (it.j->>'q')::uuid
       and qv.version = trunc((it.j->>'v')::numeric)::int
      join public.questions q on q.id = qv.question_id
     where qv.concept_id = any(p_concepts)
       and q.status is distinct from 'retired'
  )
  select m.concept_id,
         jsonb_agg(jsonb_build_object(
           'q', m.question_id, 'c', m.ok, 'd', m.difficulty,
           't', floor(extract(epoch from m.started_at) * 1000), 'i', m.n - 1)),
         max(m.started_at)
    from marked m
   where m.ok is not null
   group by m.concept_id
$$;

-- Recompute and store the bands for some concepts of one learner. Returns
-- [{concept_id, prev, state, needs, masteredNow}].
create or replace function public.recompute_mastery(p_learner uuid, p_concepts uuid[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  cfg   jsonb := public.mastery_cfg();
  cid   uuid;
  ev    jsonb;
  v_last timestamptz;
  cm    public.concept_mastery%rowtype;
  res   jsonb;
  st    text;
  v_out jsonb := '[]'::jsonb;
begin
  if p_learner is null or p_concepts is null then return v_out; end if;
  for cid in select distinct c from unnest(p_concepts) c where c is not null loop
    select e.events, e.last_at into ev, v_last
      from public.mastery_events(p_learner, array[cid]) e;
    select * into cm from public.concept_mastery
     where learner_id = p_learner and concept_id = cid for update;
    if not found and ev is null then
      continue;  -- never answered: no row
    end if;
    res := public.mastery_eval(coalesce(ev, '[]'::jsonb), cfg, cm.state);
    st  := res->>'state';

    insert into public.concept_mastery as m
      (learner_id, concept_id, state, n_attempted, n_correct, n_distinct_q, evidence,
       last_attempt_at, mastered_at, next_review_at, review_stage, updated_at)
    values
      (p_learner, cid, st, (res->>'nAttempted')::int, (res->>'nCorrect')::int,
       (res->>'nDistinct')::int, res || jsonb_build_object('rule', 'v1'),
       v_last,
       case when st = 'mastered' then now() end,
       case when st = 'mastered'
            then now() + make_interval(days => (cfg->>'firstReviewDays')::int) end,
       case when st = 'mastered' then 1 else 0 end,
       now())
    on conflict (learner_id, concept_id) do update set
      state           = excluded.state,
      n_attempted     = excluded.n_attempted,
      n_correct       = excluded.n_correct,
      n_distinct_q    = excluded.n_distinct_q,
      evidence        = excluded.evidence,
      last_attempt_at = coalesce(excluded.last_attempt_at, m.last_attempt_at),
      mastered_at     = coalesce(m.mastered_at, excluded.mastered_at),
      next_review_at  = coalesce(m.next_review_at, excluded.next_review_at),
      review_stage    = case when m.review_stage > 0 then m.review_stage
                             else excluded.review_stage end,
      updated_at      = now();

    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'concept_id', cid, 'prev', cm.state, 'state', st,
      'needs', res->'needs', 'masteredNow', res->'masteredNow'));
  end loop;
  return v_out;
end $$;

-- Every concept a learner has evidence for (after an account link, a repair).
create or replace function public.recompute_all_mastery(p_learner uuid)
returns jsonb language sql security definer set search_path = public as $$
  select public.recompute_mastery(p_learner, coalesce(array(
    select distinct qv.concept_id
      from public.practice_attempts pa
      cross join lateral jsonb_array_elements(
             case when jsonb_typeof(pa.items) = 'array' then pa.items else '[]'::jsonb end) x(j)
      join public.question_versions qv
        on jsonb_typeof(x.j) = 'object'
       and x.j->>'q' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and jsonb_typeof(x.j->'v') = 'number'
       and qv.question_id = (x.j->>'q')::uuid
       and qv.version = trunc((x.j->>'v')::numeric)::int
     where pa.learner_id = p_learner and qv.concept_id is not null
     union
    select concept_id from public.concept_mastery where learner_id = p_learner
  ), '{}'::uuid[]))
$$;


-- ============================================================
--  PART 5 — Follow-ups and relief
-- ============================================================
-- Unseen approved practice items left for this learner in a concept.
create or replace function public.fresh_items_left(p_learner uuid, p_concept uuid)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int
    from public.item_approvals ap
    join public.questions q on q.id = ap.item_id and q.current_version = ap.version
    join public.question_versions qv on qv.question_id = ap.item_id and qv.version = ap.version
   where ap.item_kind = 'question' and ap.scope = 'practice' and ap.revoked_at is null
     and q.status is distinct from 'retired'
     and qv.concept_id = p_concept
     and not exists (
       select 1 from public.practice_attempts pa
        where pa.learner_id = p_learner
          and pa.items @> jsonb_build_array(jsonb_build_object('q', ap.item_id::text)))
$$;

-- Relieve one open follow-up: never trap a student (LMS_AUDIT §3.5).
create or replace function public.relieve_follow_up(p_id uuid, p_why text)
returns void language plpgsql security definer set search_path = public as $$
declare
  fu  public.follow_ups%rowtype;
  cfg jsonb := public.mastery_cfg();
  tid uuid;
begin
  update public.follow_ups
     set status = 'relieved', closed_at = now(), updated_at = now(),
         close_reason = 'auto_relief: ' || p_why
   where id = p_id and status = 'open'
  returning * into fu;
  if not found then return; end if;

  select c.topic_id into tid from public.concepts c where c.id = fu.concept_id;
  insert into public.gate_overrides (learner_id, subject_id, topic_id, follow_up_id, action, actor_id, reason)
  values (fu.learner_id, fu.subject_id, tid, fu.id, 'auto_relief', null,
          case p_why when 'pool_exhausted' then 'No new questions left for this concept'
                     else format('Not cleared after %s rounds', fu.rounds) end);

  update public.concept_mastery
     set state = 'carried_over',
         next_review_at = coalesce(next_review_at,
                                   now() + make_interval(days => (cfg->>'firstReviewDays')::int)),
         review_stage = greatest(review_stage, 1),
         updated_at = now()
   where learner_id = fu.learner_id and concept_id = fu.concept_id and state <> 'mastered';
end $$;

-- Everything one stored attempt changes. Called once per inserted row.
create or replace function public.mastery_apply_attempt(p_attempt uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  a        public.practice_attempts%rowtype;
  cfg      jsonb := public.mastery_cfg();
  concepts uuid[];
  bands    jsonb;
  b        jsonb;
  cid      uuid;
  st       text;
  subj     uuid;
  fu       record;
  n_c      int;
  r_c      int;
  fu_kind  text;
begin
  select * into a from public.practice_attempts where id = p_attempt;
  if not found then return null; end if;

  -- Concepts this attempt touched (by the version answered).
  select coalesce(array_agg(distinct qv.concept_id), '{}') into concepts
    from jsonb_array_elements(case when jsonb_typeof(a.items) = 'array'
                                   then a.items else '[]'::jsonb end) x(j)
    join public.question_versions qv
      on jsonb_typeof(x.j) = 'object'
     and x.j->>'q' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     and jsonb_typeof(x.j->'v') = 'number'
     and qv.question_id = (x.j->>'q')::uuid
     and qv.version = trunc((x.j->>'v')::numeric)::int
   where qv.concept_id is not null;

  bands := public.recompute_mastery(a.learner_id, concepts);

  for b in select value from jsonb_array_elements(bands) loop
    cid := (b->>'concept_id')::uuid;
    st  := b->>'state';
    select ch.subject_id into subj
      from public.concepts c join public.topics t on t.id = c.topic_id
      join public.chapters ch on ch.id = t.chapter_id
     where c.id = cid;

    if st = 'mastered' then
      update public.follow_ups
         set status = 'cleared', closed_at = now(), updated_at = now(), close_reason = 'mastered'
       where learner_id = a.learner_id and concept_id = cid and status = 'open';
      continue;
    end if;

    -- A follow-up round: this attempt's own score on the concept.
    if a.kind = 'followup' then
      select count(*), count(*) filter (where (x.j->>'c')::boolean)
        into n_c, r_c
        from jsonb_array_elements(a.items) x(j)
        join public.question_versions qv
          on qv.question_id = (x.j->>'q')::uuid
         and qv.version = trunc((x.j->>'v')::numeric)::int
        join public.questions q on q.id = qv.question_id
       where qv.concept_id = cid and not (x.j ? 'x')
         and q.status is distinct from 'retired';

      for fu in select * from public.follow_ups
                 where learner_id = a.learner_id and concept_id = cid and status = 'open'
                 for update loop
        if n_c >= (cfg->>'roundMin')::int and r_c * 100 >= (cfg->>'masteredPct')::int * n_c then
          update public.follow_ups
             set status = 'cleared', closed_at = now(), updated_at = now(),
                 rounds = rounds + 1, close_reason = 'round_passed'
           where id = fu.id;
        else
          update public.follow_ups set rounds = rounds + 1, updated_at = now() where id = fu.id;
          if fu.rounds + 1 >= (cfg->>'reliefRounds')::int then
            perform public.relieve_follow_up(fu.id, 'rounds');
          elsif public.fresh_items_left(a.learner_id, cid) = 0 then
            perform public.relieve_follow_up(fu.id, 'pool_exhausted');
          end if;
        end if;
      end loop;
    end if;

    -- A weak concept found by a diagnostic or a revision gets one open follow-up.
    fu_kind := case a.kind when 'diagnostic' then 'diagnostic'
                           when 'revision'   then 'revision' end;
    if st = 'weak' and fu_kind is not null and subj is not null then
      insert into public.follow_ups (learner_id, concept_id, subject_id, kind, source_attempt_id)
      values (a.learner_id, cid, subj, fu_kind, a.id)
      on conflict (learner_id, concept_id, kind) where status = 'open'
      do update set updated_at = now();
    end if;
  end loop;

  return bands;
end $$;


-- ============================================================
--  PART 6 — Triggers on practice_attempts
-- ============================================================
create or replace function public.practice_attempts_mark()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  it     jsonb;
  clean  jsonb := '[]'::jsonb;
  seen   text[] := '{}';
  ok     boolean;
  qtype  text;
  qkey   jsonb;
  n      int := 0;
  nc     int := 0;
begin
  if new.is_test_data then return new; end if;  -- seed fixtures: stored as given
  for it in select value from jsonb_array_elements(
              case when jsonb_typeof(new.items) = 'array' then new.items else '[]'::jsonb end) loop
    exit when n >= 50;
    continue when jsonb_typeof(it) <> 'object'
      or coalesce(it->>'q', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or jsonb_typeof(it->'v') <> 'number'
      or lower(it->>'q') = any(seen);
    seen := seen || lower(it->>'q');
    qtype := null;
    select qv.type, qv.answer into qtype, qkey
      from public.question_versions qv
     where qv.question_id = (it->>'q')::uuid
       and qv.version = trunc((it->>'v')::numeric)::int;
    ok := case when qtype is not null then public.auto_mark_item(qtype, it->'a', qkey) end;
    if ok is null then
      it := jsonb_set(it, '{c}', 'false'::jsonb) || '{"x": 1}'::jsonb;
    else
      it := jsonb_set(it - 'x', '{c}', to_jsonb(ok));
      if ok then nc := nc + 1; end if;
    end if;
    clean := clean || jsonb_build_array(it);
    n := n + 1;
  end loop;
  new.items := clean;
  new.n_total := n;
  new.n_correct := nc;
  new.received_at := now();
  if new.follow_up_id is not null and not exists (
       select 1 from public.follow_ups f
        where f.id = new.follow_up_id and f.learner_id = new.learner_id) then
    new.follow_up_id := null;
  end if;
  return new;
end $$;

create or replace function public.practice_attempts_apply()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.mastery_apply_attempt(new.id);
  return null;
exception when others then
  -- Never lose an attempt over mastery: recompute_all_mastery() repairs later.
  raise warning 'practice_attempts_apply: % (%), attempt % stored without mastery update',
    sqlerrm, sqlstate, new.id;
  return null;
end $$;

drop trigger if exists t_practice_attempts_mark on public.practice_attempts;
create trigger t_practice_attempts_mark
  before insert on public.practice_attempts
  for each row execute function public.practice_attempts_mark();

drop trigger if exists t_practice_attempts_apply on public.practice_attempts;
create trigger t_practice_attempts_apply
  after insert on public.practice_attempts
  for each row when (not new.is_test_data)
  execute function public.practice_attempts_apply();

-- Attempts are evidence: never edited or deleted by an app session (017 gave
-- no update/delete policy; this makes it explicit for every client role).
-- The seed's remove script runs as postgres and is unaffected.
create or replace function public.practice_attempts_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') then
    raise exception 'practice attempts are append-only' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
drop trigger if exists t_practice_attempts_guard on public.practice_attempts;
create trigger t_practice_attempts_guard
  before update or delete on public.practice_attempts
  for each row execute function public.practice_attempts_guard();


-- ============================================================
--  PART 7 — The RPCs the app calls
-- ============================================================
-- Same insert as the sync queue's, as an RPC that reports what changed.
-- SECURITY INVOKER: 017's insert policy (learner_id = auth.uid()) and 023's
-- restrictive policies decide; the triggers above do the marking.
create or replace function public.record_practice_attempt(p_attempt jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  uid   uuid := auth.uid();
  aid   uuid;
  v_kind text := coalesce(p_attempt->>'kind', 'practice');
  ins   uuid;
  pa    public.practice_attempts%rowtype;
  concepts uuid[];
begin
  if uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if jsonb_typeof(p_attempt) <> 'object'
     or coalesce(p_attempt->>'id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'attempt_id_required' using errcode = '22023';
  end if;
  aid := (p_attempt->>'id')::uuid;
  if v_kind not in ('practice', 'diagnostic', 'followup', 'revision', 'worksheet') then
    raise exception 'attempt_kind_invalid' using errcode = '22023';
  end if;
  if jsonb_typeof(p_attempt->'items') is distinct from 'array'
     or p_attempt->>'started_at' is null then
    raise exception 'attempt_shape_invalid' using errcode = '22023';
  end if;

  insert into public.practice_attempts
    (id, learner_id, kind, topic_id, follow_up_id, started_at, finished_at, items, device_id)
  values
    (aid, uid, v_kind,
     nullif(p_attempt->>'topic_id', '')::uuid,
     nullif(p_attempt->>'follow_up_id', '')::uuid,
     (p_attempt->>'started_at')::timestamptz,
     nullif(p_attempt->>'finished_at', '')::timestamptz,
     p_attempt->'items',
     left(p_attempt->>'device_id', 120))
  on conflict (id) do nothing
  returning id into ins;

  select * into pa from public.practice_attempts where id = aid;  -- RLS: own rows only
  if not found then
    raise exception 'attempt_id_taken' using errcode = '23505';
  end if;

  select coalesce(array_agg(distinct qv.concept_id), '{}') into concepts
    from jsonb_array_elements(case when jsonb_typeof(pa.items) = 'array'
                                   then pa.items else '[]'::jsonb end) x(j)
    join public.question_versions qv
      on jsonb_typeof(x.j) = 'object'
     and x.j->>'q' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     and jsonb_typeof(x.j->'v') = 'number'
     and qv.question_id = (x.j->>'q')::uuid and qv.version = trunc((x.j->>'v')::numeric)::int
   where qv.concept_id is not null;

  return jsonb_build_object(
    'status', case when ins is null then 'duplicate' else 'recorded' end,
    'id', aid,
    'n_correct', pa.n_correct,
    'n_total', pa.n_total,
    'items', (select coalesce(jsonb_agg(jsonb_build_object('q', x.j->'q', 'c', x.j->'c')), '[]')
                from jsonb_array_elements(case when jsonb_typeof(pa.items) = 'array'
                                               then pa.items else '[]'::jsonb end) x(j)),
    'mastery', (select coalesce(jsonb_agg(jsonb_build_object(
                   'concept_id', m.concept_id, 'state', m.state,
                   'needs', m.evidence->'needs', 'window', m.evidence->'window')), '[]')
                  from public.concept_mastery m
                 where m.learner_id = uid and m.concept_id = any(concepts)),
    'follow_ups', (select coalesce(jsonb_agg(jsonb_build_object(
                     'id', f.id, 'concept_id', f.concept_id, 'kind', f.kind,
                     'status', f.status, 'rounds', f.rounds)), '[]')
                     from public.follow_ups f
                    where f.learner_id = uid and f.concept_id = any(concepts)
                      and (f.status = 'open' or f.closed_at >= now() - interval '1 minute')));
end $$;

-- A topic's diagnostic for the signed-in learner: ids + versions, never keys.
create or replace function public.diagnostic_items(p_topic uuid, p_size int default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  uid   uuid := auth.uid();
  cfg   jsonb := public.mastery_cfg();
  v_topic public.topics%rowtype;
  pool  jsonb;
  n_pool int;
  n_con  int;
  n      int;
  picked jsonb;
begin
  if uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  select * into v_topic from public.topics where id = p_topic and status = 'active';
  if not found then
    return jsonb_build_object('size', 0, 'items', '[]'::jsonb, 'reason', 'no_topic');
  end if;

  with items as (
    select ap.item_id as q, qv.version, qv.concept_id, c.sort_order, qv.difficulty
      from public.item_approvals ap
      join public.questions qq on qq.id = ap.item_id and qq.current_version = ap.version
      join public.question_versions qv on qv.question_id = ap.item_id and qv.version = ap.version
      join public.concepts c on c.id = qv.concept_id and c.topic_id = p_topic and c.status = 'active'
     where ap.item_kind = 'question' and ap.scope = 'practice' and ap.revoked_at is null
       and qq.status is distinct from 'retired'
       and qv.type in ('mcq', 'true_false', 'numeric', 'short_text')
  ), seen as (
    select x.j->>'q' as q, max(pa.started_at) as at
      from public.practice_attempts pa
      cross join lateral jsonb_array_elements(
             case when jsonb_typeof(pa.items) = 'array' then pa.items else '[]'::jsonb end) x(j)
     where pa.learner_id = uid and jsonb_typeof(x.j) = 'object'
     group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'q', i.q, 'v', i.version, 'concept', i.concept_id, 'order', i.sort_order,
           'd', i.difficulty,
           'seen', case when s.at is null then null
                        else floor(extract(epoch from s.at) * 1000) end)), '[]'::jsonb),
         count(*), count(distinct i.concept_id)
    into pool, n_pool, n_con
    from items i left join seen s on s.q = i.q::text;

  n := least(n_pool, greatest(n_con, least((cfg->>'diagnosticMax')::int,
         greatest((cfg->>'diagnosticMin')::int,
                  coalesce(p_size, v_topic.diagnostic_size, (cfg->>'diagnosticDefault')::int)))));
  picked := public.diagnostic_pick(pool, n);

  return jsonb_build_object(
    'size', n,
    'items', (select coalesce(jsonb_agg(jsonb_build_object(
                'question_id', p->>'q', 'version', (p->>'v')::int,
                'concept_id', p->>'concept', 'difficulty', (p->>'d')::int) order by o.n), '[]')
                from jsonb_array_elements_text(picked) with ordinality o(q, n)
                join jsonb_array_elements(pool) p on p->>'q' = o.q),
    'reason', case when n_pool = 0 then 'no_items' end);
end $$;


-- ============================================================
--  PART 8 — Re-evaluate when the evidence changes
-- ============================================================
-- A question retired → its answers stop counting: recompute every learner
-- with a band on that concept that isn't mastered (mastered never goes back).
create or replace function public.questions_retire_remaster()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  lid uuid;
begin
  if new.concept_id is null then return null; end if;
  for lid in select learner_id from public.concept_mastery
              where concept_id = new.concept_id and state <> 'mastered' loop
    perform public.recompute_mastery(lid, array[new.concept_id]);
  end loop;
  return null;
exception when others then
  raise warning 'questions_retire_remaster: % (%), question %', sqlerrm, sqlstate, new.id;
  return null;
end $$;

drop trigger if exists t_questions_retire_remaster on public.questions;
create trigger t_questions_retire_remaster
  after update of status on public.questions
  for each row
  when (new.status = 'retired' and old.status is distinct from 'retired')
  execute function public.questions_retire_remaster();

-- A prep account linked into a school login (023): recompute the school
-- login's mastery from the moved attempts (DECISIONS #59).
do $$
begin
  if to_regclass('public.account_links') is not null then
    execute $f$
      create or replace function public.account_links_remaster()
      returns trigger language plpgsql security definer set search_path = public as $b$
      begin
        perform public.recompute_all_mastery(new.school_profile_id);
        return null;
      exception when others then
        raise warning 'account_links_remaster: % (%)', sqlerrm, sqlstate;
        return null;
      end $b$;
    $f$;
    execute 'drop trigger if exists t_account_links_remaster on public.account_links';
    execute 'create trigger t_account_links_remaster after insert on public.account_links
               for each row execute function public.account_links_remaster()';
  end if;
end $$;


-- ============================================================
--  PART 9 — Who may call what
-- ============================================================
revoke all on function public.mastery_events(uuid, uuid[])        from public, anon, authenticated;
revoke all on function public.recompute_mastery(uuid, uuid[])     from public, anon, authenticated;
revoke all on function public.recompute_all_mastery(uuid)         from public, anon, authenticated;
revoke all on function public.fresh_items_left(uuid, uuid)        from public, anon, authenticated;
revoke all on function public.relieve_follow_up(uuid, text)       from public, anon, authenticated;
revoke all on function public.mastery_apply_attempt(uuid)         from public, anon, authenticated;
revoke all on function public.practice_attempts_mark()            from public, anon, authenticated;
revoke all on function public.practice_attempts_apply()           from public, anon, authenticated;
revoke all on function public.questions_retire_remaster()         from public, anon, authenticated;
do $$
begin
  if to_regprocedure('public.account_links_remaster()') is not null then
    execute 'revoke all on function public.account_links_remaster() from public, anon, authenticated';
  end if;
end $$;
revoke all on function public.record_practice_attempt(jsonb)      from public, anon;
revoke all on function public.diagnostic_items(uuid, int)         from public, anon;
grant execute on function public.record_practice_attempt(jsonb)   to authenticated;
grant execute on function public.diagnostic_items(uuid, int)      to authenticated;
grant execute on function public.mastery_cfg()                    to authenticated;
grant execute on function public.mastery_eval(jsonb, jsonb, text) to authenticated;
grant execute on function public.diagnostic_pick(jsonb, int)      to authenticated;
