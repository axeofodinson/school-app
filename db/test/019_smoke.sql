-- Mastery + follow-ups + diagnostics smoke (TEST_PLAN MA-1, prompt 40).
-- Replays, as signed-in learners, the practice upload (sync queue direct
-- insert and record_practice_attempt) and diagnostic_items(); checks the
-- server marking, bands, follow-up rounds, relief and idempotency. Also runs
-- the shared vectors from packages/core/test/fixtures (run from the repo root).
-- Throwaway local Postgres only. Passes after 017 + 023 (+ 031–033) + 019.
-- Without 019 it fails at once (no mastery_eval).
\set ON_ERROR_STOP 1
\set mcases `cat packages/core/test/fixtures/mastery-cases.json`
\set dcases `cat packages/core/test/fixtures/diagnostic-cases.json`
\set acases `cat packages/core/test/fixtures/auto-mark-cases.json`
reset role;
set request.jwt.claim.sub = '';
grant usage on schema public, auth to authenticated, anon;
grant select, insert, update, delete on all tables in schema public to authenticated, anon;
grant execute on all functions in schema public to authenticated;
-- 019 keeps its internals private; the blanket grant above must not hide that.
revoke execute on function public.recompute_mastery(uuid, uuid[]), public.mastery_apply_attempt(uuid),
  public.relieve_follow_up(uuid, text), public.recompute_all_mastery(uuid) from authenticated;

-- ---- Shared vectors: SQL and packages/core agree --------------------------------
create temp table ma_cases as select :'mcases'::jsonb as m, :'dcases'::jsonb as d, :'acases'::jsonb as a;
do $$
declare c jsonb; got jsonb; bad text := ''; cfg jsonb; b boolean;
begin
  for c in select jsonb_array_elements(m) from ma_cases loop
    cfg := public.mastery_cfg();
    if c ? 'cfg' then
      cfg := cfg || c->'cfg';
    end if;
    got := public.mastery_eval(c->'events', cfg, c->>'prev');
    if got <> c->'expect' then bad := bad || format(E'\n  mastery %s: got %s', c->>'note', got); end if;
  end loop;
  for c in select jsonb_array_elements(d) from ma_cases loop
    got := public.diagnostic_pick(c->'pool', (c->>'n')::int);
    if got <> c->'expect' then bad := bad || format(E'\n  diagnostic %s: got %s', c->>'note', got); end if;
  end loop;
  for c in select jsonb_array_elements(a) from ma_cases loop
    b := public.auto_mark_item(c->>'type', c->'value', c->'answer');
    if b is distinct from (case when jsonb_typeof(c->'expect') = 'null' then null
                                else (c->>'expect')::boolean end) then
      bad := bad || format(E'\n  auto-mark %s: got %s', c->>'note', coalesce(b::text, 'null'));
    end if;
  end loop;
  if bad <> '' then raise exception 'SQL_DIFFERS_FROM_CORE:%', bad; end if;
end $$;
drop table ma_cases;

-- ---- Fixtures ----------------------------------------------------------------------
-- Class 9 Maths, topic "Linear equations": concept K1 (12 questions, q01–q12)
-- and K2 (4 questions, q21–q24), all mcq, key A, approved for practice.
-- S1, S2 students of 9; T1 teaches 9 Maths; AD admin.
update academic_years set is_current = false;
insert into academic_years(id, label, is_current) values
 ('09000000-0000-0000-0000-0000000000a0', 'MA-2026-27', true);
insert into classes(id, name, grade_level) values ('09000000-0000-0000-0000-0000000000c9', 'MA Class 9', 9);
insert into subjects(id, class_id, name) values
 ('09000000-0000-0000-0000-0000000000d1', '09000000-0000-0000-0000-0000000000c9', 'MA Maths');
insert into chapters(id, subject_id, title, sort_order) values
 ('09000000-0000-0000-0000-0000000000e1', '09000000-0000-0000-0000-0000000000d1', 'MA Algebra', 1);
insert into topics(id, chapter_id, title_en) values
 ('09000000-0000-0000-0000-0000000000b1', '09000000-0000-0000-0000-0000000000e1', 'MA Linear equations');
insert into concepts(id, topic_id, title_en, sort_order) values
 ('09000000-0000-0000-0000-0000000000f1', '09000000-0000-0000-0000-0000000000b1', 'MA Balance', 0),
 ('09000000-0000-0000-0000-0000000000f2', '09000000-0000-0000-0000-0000000000b1', 'MA Both sides', 1);
insert into students(id, student_code, full_name) values
 ('09000000-0000-0000-0000-000000000051', 'MA-1', 'TEST- MA One'),
 ('09000000-0000-0000-0000-000000000052', 'MA-2', 'TEST- MA Two');
insert into enrollments(student_id, class_id, year_id, status) values
 ('09000000-0000-0000-0000-000000000051', '09000000-0000-0000-0000-0000000000c9', '09000000-0000-0000-0000-0000000000a0', 'active'),
 ('09000000-0000-0000-0000-000000000052', '09000000-0000-0000-0000-0000000000c9', '09000000-0000-0000-0000-0000000000a0', 'active');
insert into auth.users(id, email) values
 ('09000000-0000-0000-0000-000000000001', 'ma.t1@school.test'),
 ('09000000-0000-0000-0000-000000000003', 'ma.admin@school.test'),
 ('09000000-0000-0000-0000-000000000011', 'ma1@students.school.invalid'),
 ('09000000-0000-0000-0000-000000000012', 'ma2@students.school.invalid');
update profiles set role = 'teacher' where id = '09000000-0000-0000-0000-000000000001';
update profiles set role = 'admin' where id = '09000000-0000-0000-0000-000000000003';
update profiles set role = 'student', student_id = '09000000-0000-0000-0000-000000000051'
 where id = '09000000-0000-0000-0000-000000000011';
update profiles set role = 'student', student_id = '09000000-0000-0000-0000-000000000052'
 where id = '09000000-0000-0000-0000-000000000012';
insert into teacher_assignments(teacher_id, class_id, subject_id, year_id) values
 ('09000000-0000-0000-0000-000000000001', '09000000-0000-0000-0000-0000000000c9',
  '09000000-0000-0000-0000-0000000000d1', '09000000-0000-0000-0000-0000000000a0');

insert into questions(id, chapter_id, concept_id, type, cognitive_level, difficulty, body, answer,
                      status, created_by, is_test_data)
select format('09000000-0000-0000-0000-0000000001%s', lpad(n::text, 2, '0'))::uuid,
       '09000000-0000-0000-0000-0000000000e1',
       case when n <= 12 then '09000000-0000-0000-0000-0000000000f1'
            else '09000000-0000-0000-0000-0000000000f2' end::uuid,
       'mcq', 'apply',
       case when n in (4, 9, 22) then 3 when n % 2 = 0 then 2 else 1 end,
       format('{"stem":{"en":"MA question %s"},"options":[{"key":"A","text":{"en":"a"}},{"key":"B","text":{"en":"b"}}]}', n)::jsonb,
       '{"correct":"A"}', 'approved', '09000000-0000-0000-0000-000000000003', true
  from (select generate_series(1, 12) as n union all select generate_series(21, 24)) s;
insert into item_approvals(item_kind, item_id, version, scope, approved_by)
select 'question', id, 1, 'practice', '09000000-0000-0000-0000-000000000003'
  from questions where id::text like '09000000-0000-0000-0000-0000000001%';

-- Helpers (q(n) = question n's id; items(json) builds attempt items).
create or replace function public._ma_q(n int) returns text language sql immutable as
$$ select format('09000000-0000-0000-0000-0000000001%s', lpad(n::text, 2, '0')) $$;
create or replace function public._ma_items(p_nums int[], p_ans text, p_claim boolean default true)
returns jsonb language sql immutable as $$
  select jsonb_agg(jsonb_build_object('q', public._ma_q(n), 'v', 1, 'a', p_ans, 'c', p_claim, 'ms', 4000) order by o)
    from unnest(p_nums) with ordinality u(n, o)
$$;
create or replace function public._ma_attempt(p_id text, p_kind text, p_nums int[], p_ans text,
                                              p_at text, p_fu uuid default null)
returns jsonb language sql as $$
  select public.record_practice_attempt(jsonb_build_object(
    'id', p_id, 'kind', p_kind, 'topic_id', '09000000-0000-0000-0000-0000000000b1',
    'follow_up_id', p_fu, 'started_at', p_at, 'finished_at', p_at,
    'items', public._ma_items(p_nums, p_ans), 'device_id', 'smoke'))
$$;
create or replace function public._ma_refused(p_sql text, p_like text default '%') returns boolean
language plpgsql as $$
begin
  execute p_sql;
  return false;
exception when others then
  return sqlerrm like p_like;
end $$;
create or replace function public._ma_state(p_learner text, p_concept text) returns text
language sql security definer as $$
  select state from public.concept_mastery where learner_id = p_learner::uuid and concept_id = p_concept::uuid
$$;
create or replace function public._ma_snapshot() returns text language sql security definer as $$
  select md5(coalesce((select string_agg(t::text, '|' order by t::text) from public.concept_mastery t), '') ||
             coalesce((select string_agg(t::text, '|' order by t::text) from public.follow_ups t), '') ||
             coalesce((select string_agg(t::text, '|' order by t::text) from public.gate_overrides t), '') ||
             coalesce((select string_agg(t::text, '|' order by t::text) from public.practice_attempts t), ''))
$$;
grant execute on function public._ma_q(int), public._ma_items(int[], text, boolean),
  public._ma_attempt(text, text, int[], text, text, uuid), public._ma_refused(text, text),
  public._ma_state(text, text), public._ma_snapshot() to authenticated;

-- ---- S1: a diagnostic finds K1 weak (the device claimed every answer right) --------
set role authenticated;
set request.jwt.claim.sub = '09000000-0000-0000-0000-000000000011';
do $$
declare r jsonb; snap text; r2 jsonb;
begin
  r := public._ma_attempt('09000000-0000-0000-0000-00000000a001', 'diagnostic', array[1,2,3], 'B',
                          '2026-11-20T09:00:00Z');
  if r->>'status' <> 'recorded' then raise exception 'NOT_RECORDED: %', r; end if;
  if (r->>'n_correct')::int <> 0 or (r->>'n_total')::int <> 3 then
    raise exception 'CLIENT_MARKING_TRUSTED: %', r;
  end if;
  if public._ma_state('09000000-0000-0000-0000-000000000011', '09000000-0000-0000-0000-0000000000f1') <> 'weak' then
    raise exception 'WEAK_NOT_FOUND: %', r;
  end if;
  if jsonb_array_length(r->'follow_ups') <> 1 or r->'follow_ups'->0->>'kind' <> 'diagnostic'
     or r->'follow_ups'->0->>'status' <> 'open' then
    raise exception 'NO_DIAGNOSTIC_FOLLOW_UP: %', r;
  end if;
  if exists (select 1 from practice_attempts where id = '09000000-0000-0000-0000-00000000a001'
              and items->0->>'a' <> 'B') then
    raise exception 'RAW_ANSWER_CHANGED';
  end if;

  -- The same attempt again (a retried upload) changes nothing.
  snap := public._ma_snapshot();
  r2 := public._ma_attempt('09000000-0000-0000-0000-00000000a001', 'diagnostic', array[1,2,3], 'A',
                           '2026-11-20T09:00:00Z');
  if r2->>'status' <> 'duplicate' or (r2->>'n_correct')::int <> 0 then
    raise exception 'DUPLICATE_NOT_IDEMPOTENT: %', r2;
  end if;
  if public._ma_snapshot() <> snap then raise exception 'DUPLICATE_CHANGED_STATE'; end if;
  -- The sync queue's direct insert with the same id: refused, nothing changes.
  if not public._ma_refused($q$insert into practice_attempts(id, learner_id, kind, started_at, items)
        values ('09000000-0000-0000-0000-00000000a001', '09000000-0000-0000-0000-000000000011',
                'diagnostic', now(), '[]')$q$, '%duplicate key%') then
    raise exception 'DIRECT_DUPLICATE_ACCEPTED';
  end if;
  if public._ma_snapshot() <> snap then raise exception 'DIRECT_DUPLICATE_CHANGED_STATE'; end if;

  -- Evidence is append-only; bands and follow-ups are the server's.
  -- (no update/delete policy: 0 rows; the guard trigger backs it up for any policy added later)
  perform public._ma_refused($q$update practice_attempts set n_correct = 3$q$);
  perform public._ma_refused($q$delete from practice_attempts$q$);
  if (select n_correct from practice_attempts where id = '09000000-0000-0000-0000-00000000a001') is distinct from 0::smallint then
    raise exception 'ATTEMPT_EDITED_OR_DELETED';
  end if;
  if not public._ma_refused($q$insert into concept_mastery(learner_id, concept_id, state)
        values ('09000000-0000-0000-0000-000000000011', '09000000-0000-0000-0000-0000000000f2', 'mastered')$q$) then
    raise exception 'STUDENT_WROTE_MASTERY';
  end if;
  if not public._ma_refused($q$update follow_ups set status = 'cleared'$q$) then
    -- no update policy: 0 rows is also a refusal
    if exists (select 1 from follow_ups where status = 'cleared') then raise exception 'STUDENT_CLEARED_FOLLOW_UP'; end if;
  end if;
  if not public._ma_refused($q$select public.recompute_mastery('09000000-0000-0000-0000-000000000011', null)$q$, '%permission denied%') then
    raise exception 'INTERNAL_CALLABLE';
  end if;
  if not public._ma_refused($q$update mastery_config set window_size = 3$q$) then
    if (select window_size from mastery_config) <> 5 then raise exception 'STUDENT_TUNED_CONFIG'; end if;
  end if;
end $$;

-- ---- S1: follow-up rounds on K1 without clearing → relieved after 3 ----------------
do $$
declare fu uuid; r jsonb; i int;
begin
  select id into fu from follow_ups where learner_id = '09000000-0000-0000-0000-000000000011'
     and concept_id = '09000000-0000-0000-0000-0000000000f1' and status = 'open';
  for i in 1..3 loop
    r := public._ma_attempt(format('09000000-0000-0000-0000-00000000b00%s', i), 'followup',
                            array[1,2,3], 'B', format('2026-11-2%sT09:00:00Z', i), fu);
    if i < 3 and (select status from follow_ups where id = fu) <> 'open' then
      raise exception 'RELIEVED_TOO_EARLY round %', i;
    end if;
  end loop;
  if (select status || '/' || rounds from follow_ups where id = fu) <> 'relieved/3' then
    raise exception 'NOT_RELIEVED_AFTER_3_ROUNDS: %', (select row_to_json(f) from follow_ups f where id = fu);
  end if;
  if not exists (select 1 from gate_overrides where follow_up_id = fu and action = 'auto_relief'
                   and actor_id is null and topic_id = '09000000-0000-0000-0000-0000000000b1') then
    raise exception 'NO_AUTO_RELIEF_LOG';
  end if;
  if (select state from concept_mastery where learner_id = '09000000-0000-0000-0000-000000000011'
        and concept_id = '09000000-0000-0000-0000-0000000000f1') <> 'carried_over'
     or (select next_review_at from concept_mastery where learner_id = '09000000-0000-0000-0000-000000000011'
           and concept_id = '09000000-0000-0000-0000-0000000000f1') is null then
    raise exception 'RELIEF_DID_NOT_CARRY_OVER';
  end if;
  -- A later follow-up attempt opens nothing new on its own (no re-trap).
  if exists (select 1 from follow_ups where learner_id = '09000000-0000-0000-0000-000000000011'
               and concept_id = '09000000-0000-0000-0000-0000000000f1' and status = 'open') then
    raise exception 'RETRAPPED_AFTER_RELIEF';
  end if;
end $$;

-- ---- S1: K2 runs out of fresh questions → relieved on the first round --------------
do $$
declare fu uuid;
begin
  perform public._ma_attempt('09000000-0000-0000-0000-00000000c001', 'diagnostic', array[21,22,23], 'B', '2026-11-24T09:00:00Z');
  select id into fu from follow_ups where learner_id = '09000000-0000-0000-0000-000000000011'
     and concept_id = '09000000-0000-0000-0000-0000000000f2' and status = 'open';
  if fu is null then raise exception 'K2_NO_FOLLOW_UP'; end if;
  perform public._ma_attempt('09000000-0000-0000-0000-00000000c002', 'followup', array[24,21,22], 'B', '2026-11-24T10:00:00Z', fu);
  if (select status || ':' || close_reason from follow_ups where id = fu) <> 'relieved:auto_relief: pool_exhausted' then
    raise exception 'POOL_EXHAUSTED_NOT_RELIEVED: %', (select row_to_json(f) from follow_ups f where id = fu);
  end if;
end $$;

-- ---- S1: someone else's follow-up id is dropped; S2 can't reuse S1's id ------------
do $$
begin
  perform public._ma_attempt('09000000-0000-0000-0000-00000000c003', 'practice', array[5], 'A',
                             '2026-11-24T11:00:00Z', '09000000-0000-0000-0000-00000000ffff');
  if (select follow_up_id from practice_attempts where id = '09000000-0000-0000-0000-00000000c003') is not null then
    raise exception 'FOREIGN_FOLLOW_UP_KEPT';
  end if;
end $$;

set request.jwt.claim.sub = '09000000-0000-0000-0000-000000000012';
do $$
declare fu uuid; r jsonb; t0 timestamptz;
begin
  if not public._ma_refused($q$select public._ma_attempt('09000000-0000-0000-0000-00000000a001', 'practice',
        array[1], 'A', '2026-11-25T09:00:00Z')$q$, '%attempt_id_taken%') then
    raise exception 'OTHER_LEARNERS_ID_REUSED';
  end if;
  if exists (select 1 from practice_attempts) then raise exception 'S2_SAW_S1_ATTEMPTS'; end if;
  if exists (select 1 from concept_mastery) or exists (select 1 from follow_ups) then
    raise exception 'S2_SAW_S1_MASTERY';
  end if;
  if not public._ma_refused($q$select public.record_practice_attempt('{"id":"x","items":[]}')$q$, '%attempt_id_required%')
     or not public._ma_refused($q$select public.record_practice_attempt('{"id":"09000000-0000-0000-0000-00000000dddd","kind":"exam","items":[],"started_at":"2026-11-25T09:00:00Z"}')$q$, '%attempt_kind_invalid%') then
    raise exception 'BAD_SHAPE_ACCEPTED';
  end if;

  -- A round of 3 right clears the diagnostic follow-up.
  perform public._ma_attempt('09000000-0000-0000-0000-00000000d001', 'diagnostic', array[1,2,3], 'B', '2026-11-20T09:00:00Z');
  select id into fu from follow_ups where concept_id = '09000000-0000-0000-0000-0000000000f1' and status = 'open';
  -- The sync queue path (direct insert, as features/practice does) behaves the same.
  insert into practice_attempts(id, learner_id, kind, topic_id, follow_up_id, started_at, finished_at, items, n_correct, n_total)
  values ('09000000-0000-0000-0000-00000000d002', '09000000-0000-0000-0000-000000000012', 'followup',
          '09000000-0000-0000-0000-0000000000b1', fu, '2026-11-21T09:00:00Z', '2026-11-21T09:05:00Z',
          public._ma_items(array[4,5,6], 'A', false), 0, 3);
  if (select n_correct from practice_attempts where id = '09000000-0000-0000-0000-00000000d002') <> 3 then
    raise exception 'DIRECT_INSERT_NOT_MARKED';
  end if;
  if (select status || ':' || close_reason from follow_ups where id = fu) <> 'cleared:round_passed' then
    raise exception 'ROUND_DID_NOT_CLEAR: %', (select row_to_json(f) from follow_ups f where id = fu);
  end if;

  -- Two more fresh right answers → the last 5 distinct are q4–q8, all right, q4 hard: mastered.
  r := public._ma_attempt('09000000-0000-0000-0000-00000000d003', 'practice', array[7,8], 'A', '2026-11-22T09:00:00Z');
  if r->'mastery'->0->>'state' <> 'mastered' then raise exception 'NOT_MASTERED: %', r; end if;
  if (select mastered_at is null or next_review_at is null or review_stage <> 1 from concept_mastery
       where concept_id = '09000000-0000-0000-0000-0000000000f1') then
    raise exception 'MASTERY_DATES_MISSING';
  end if;
  select mastered_at into t0 from concept_mastery where concept_id = '09000000-0000-0000-0000-0000000000f1';
  -- Mastered stays (tile never removed), and its date doesn't move.
  perform public._ma_attempt('09000000-0000-0000-0000-00000000d004', 'practice', array[9,10,11], 'B', '2026-11-23T09:00:00Z');
  if (select state from concept_mastery where concept_id = '09000000-0000-0000-0000-0000000000f1') <> 'mastered'
     or (select mastered_at from concept_mastery where concept_id = '09000000-0000-0000-0000-0000000000f1') <> t0 then
    raise exception 'MASTERY_TAKEN_BACK';
  end if;

  -- Plain practice finds K2 weak but opens no follow-up (only diagnostics/revision do).
  perform public._ma_attempt('09000000-0000-0000-0000-00000000d005', 'practice', array[21,22,23], 'B', '2026-11-24T09:00:00Z');
  if (select state from concept_mastery where concept_id = '09000000-0000-0000-0000-0000000000f2') <> 'weak' then
    raise exception 'K2_NOT_WEAK';
  end if;
  if exists (select 1 from follow_ups where concept_id = '09000000-0000-0000-0000-0000000000f2') then
    raise exception 'PRACTICE_OPENED_FOLLOW_UP';
  end if;

  -- Diagnostic for this learner: every approved item, K1 first-seen first, no keys.
  r := public.diagnostic_items('09000000-0000-0000-0000-0000000000b1');
  if (r->>'size')::int <> 16 or jsonb_array_length(r->'items') <> 16 then raise exception 'DIAG_SIZE: %', r; end if;
  if r::text like '%correct%' then raise exception 'DIAG_LEAKED_KEY'; end if;
  if r->'items'->0->>'question_id' <> public._ma_q(12) then
    raise exception 'DIAG_NOT_UNSEEN_FIRST: %', r->'items'->0;  -- q12 is K1's only never-seen item
  end if;
  if r->'items'->1->>'concept_id' <> '09000000-0000-0000-0000-0000000000f2' then
    raise exception 'DIAG_CONCEPTS_NOT_ALTERNATING: %', r->'items';
  end if;
  r := public.diagnostic_items('09000000-0000-0000-0000-0000000000b1', 1);
  if (r->>'size')::int <> 5 then raise exception 'DIAG_MIN_SIZE: %', r; end if;
  r := public.diagnostic_items('09000000-0000-0000-0000-0000000000a0');
  if r->>'reason' <> 'no_topic' then raise exception 'DIAG_NO_TOPIC: %', r; end if;
end $$;

-- ---- Teacher reads the learners they teach; admin tunes the config ------------------
set request.jwt.claim.sub = '09000000-0000-0000-0000-000000000001';
do $$
begin
  if (select count(*) from concept_mastery where learner_id::text like '09000000-%') <> 4 then
    raise exception 'TEACHER_CANT_READ_BANDS: %', (select count(*) from concept_mastery);
  end if;
  if not public._ma_refused($q$update mastery_config set window_size = 3$q$) then
    if (select window_size from mastery_config) <> 5 then raise exception 'TEACHER_TUNED_CONFIG'; end if;
  end if;
end $$;
set request.jwt.claim.sub = '09000000-0000-0000-0000-000000000003';
update mastery_config set weak_pct = 50, updated_by = '09000000-0000-0000-0000-000000000003';
do $$ begin
  if (select weak_pct from mastery_config) <> 50 then raise exception 'ADMIN_CANT_TUNE'; end if;
end $$;
update mastery_config set weak_pct = 60;

-- ---- Retiring questions re-evaluates the band; seed rows are stored as given --------
reset role;
set request.jwt.claim.sub = '';
update questions set status = 'retired' where id in (public._ma_q(21)::uuid, public._ma_q(22)::uuid);
do $$ begin
  if public._ma_state('09000000-0000-0000-0000-000000000012', '09000000-0000-0000-0000-0000000000f2') <> 'learning' then
    raise exception 'RETIRED_ANSWERS_STILL_COUNT: %',
      public._ma_state('09000000-0000-0000-0000-000000000012', '09000000-0000-0000-0000-0000000000f2');
  end if;
end $$;
insert into practice_attempts(id, learner_id, kind, started_at, items, n_correct, n_total, is_test_data)
values ('09000000-0000-0000-0000-00000000e001', '09000000-0000-0000-0000-000000000012', 'practice', now(),
        '[{"q":"not-a-question","v":1,"a":"A","c":true,"ms":1}]', 1, 1, true);
do $$ begin
  if (select n_correct from practice_attempts where id = '09000000-0000-0000-0000-00000000e001') <> 1 then
    raise exception 'SEED_ROW_CHANGED';
  end if;
end $$;

-- ---- Clean up (throwaway DB, but keep later smokes independent) ---------------------
drop function public._ma_attempt(text, text, int[], text, text, uuid), public._ma_items(int[], text, boolean),
  public._ma_q(int), public._ma_refused(text, text), public._ma_state(text, text), public._ma_snapshot();
\echo '019 smoke: all checks passed'
