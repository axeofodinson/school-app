-- Spaced revision smoke (TEST_PLAN SR-1, prompt 42). Time travel: the test moves
-- concept_mastery.next_review_at into the past (as postgres) instead of waiting
-- 7 / 30 days, then sends revision attempts as the learner:
--   mastery → stage 1, due in 7 days; a revision before it is due is no check;
--   due + pass → stage 2 in 30 days; due + fail → stage 1 in 7 days and one
--   open 'revision' follow-up, the band stays mastered; too few items → no
--   check; 12 hours early counts; stage 2 pass → retained (stage 3, no date).
-- Then the nightly rollup counts the day's checks per subject and stage, and
-- RLS: own checks only, no writes, rollup for staff, never callable by a client.
-- Throwaway local Postgres only. Passes after 017 + 023 + 019 + 037.
\set ON_ERROR_STOP 1
reset role;
set request.jwt.claim.sub = '';
grant usage on schema public, auth to authenticated, anon;
grant select, insert, update, delete on all tables in schema public to authenticated, anon;
grant execute on function public.record_practice_attempt(jsonb) to authenticated;
-- The test grants above are broad (harness); the file's own revokes are re-applied.
revoke insert, update, delete on public.revision_checks, public.retention_daily from authenticated, anon;

update academic_years set is_current = false;
insert into academic_years(id, label, is_current) values ('37000000-0000-0000-0000-0000000000a0', 'SR-2026-27', true);
insert into classes(id, name, grade_level) values ('37000000-0000-0000-0000-0000000000c9', 'SR Class 9', 9);
insert into subjects(id, class_id, name) values
 ('37000000-0000-0000-0000-0000000000d1', '37000000-0000-0000-0000-0000000000c9', 'SR Maths');
insert into chapters(id, subject_id, title, sort_order) values
 ('37000000-0000-0000-0000-0000000000e1', '37000000-0000-0000-0000-0000000000d1', 'SR Algebra', 1);
insert into topics(id, chapter_id, title_en, sort_order) values
 ('37000000-0000-0000-0000-0000000000b1', '37000000-0000-0000-0000-0000000000e1', 'SR Equations', 1);
insert into concepts(id, topic_id, title_en) values
 ('37000000-0000-0000-0000-0000000000f1', '37000000-0000-0000-0000-0000000000b1', 'SR Balance');
insert into students(id, student_code, full_name) values
 ('37000000-0000-0000-0000-000000000051', 'SR-1', 'TEST- SR One'),
 ('37000000-0000-0000-0000-000000000052', 'SR-2', 'TEST- SR Two');
insert into enrollments(student_id, class_id, year_id, status) values
 ('37000000-0000-0000-0000-000000000051', '37000000-0000-0000-0000-0000000000c9', '37000000-0000-0000-0000-0000000000a0', 'active'),
 ('37000000-0000-0000-0000-000000000052', '37000000-0000-0000-0000-0000000000c9', '37000000-0000-0000-0000-0000000000a0', 'active');
insert into auth.users(id, email) values
 ('37000000-0000-0000-0000-000000000003', 'sr.admin@school.test'),
 ('37000000-0000-0000-0000-000000000011', 'sr1@students.school.invalid'),
 ('37000000-0000-0000-0000-000000000012', 'sr2@students.school.invalid');
update profiles set role = 'admin' where id = '37000000-0000-0000-0000-000000000003';
update profiles set role = 'student', student_id = '37000000-0000-0000-0000-000000000051' where id = '37000000-0000-0000-0000-000000000011';
update profiles set role = 'student', student_id = '37000000-0000-0000-0000-000000000052' where id = '37000000-0000-0000-0000-000000000012';
-- 10 questions (key A), difficulty 1 + n % 3 (q02, q05, q08 hard), approved for practice.
insert into questions(id, chapter_id, concept_id, type, cognitive_level, difficulty, body, answer, status, created_by, is_test_data)
select format('37000000-0000-0000-0000-0000000001%s', lpad(n::text, 2, '0'))::uuid,
       '37000000-0000-0000-0000-0000000000e1', '37000000-0000-0000-0000-0000000000f1',
       'mcq', 'apply', 1 + n % 3,
       format('{"stem":{"en":"SR %s"},"options":[{"key":"A","text":{"en":"a"}},{"key":"B","text":{"en":"b"}}]}', n)::jsonb,
       '{"correct":"A"}', 'approved', '37000000-0000-0000-0000-000000000003', true
  from generate_series(1, 10) n;
insert into item_approvals(item_kind, item_id, version, scope, approved_by)
select 'question', id, 1, 'practice', '37000000-0000-0000-0000-000000000003'
  from questions where id::text like '37000000-0000-0000-0000-0000000001%';

-- One attempt: p_nums answered p_ans ('A' right, 'B' wrong), started now.
create or replace function public._sr_try(p_id int, p_kind text, p_nums int[], p_ans text)
returns jsonb language sql as $$
  select public.record_practice_attempt(jsonb_build_object(
    'id', format('37000000-0000-0000-0000-00000000a%s', lpad(p_id::text, 3, '0')),
    'kind', p_kind, 'started_at', now()::text,
    'items', (select jsonb_agg(jsonb_build_object('q', format('37000000-0000-0000-0000-0000000001%s', lpad(n::text, 2, '0')),
                                                  'v', 1, 'a', p_ans, 'c', false, 'ms', 1000)) from unnest(p_nums) n)))
$$;
create or replace function public._sr_refused(p_sql text) returns boolean
language plpgsql as $$
begin execute p_sql; return false;
exception when others then return true; end $$;
-- The time machine: move the next check to now + p_hours (negative = overdue).
create or replace function public._sr_travel(p_hours numeric) returns void
language sql security definer as $$
  update public.concept_mastery set next_review_at = now() + make_interval(hours => p_hours::int)
   where concept_id = '37000000-0000-0000-0000-0000000000f1'
     and learner_id = '37000000-0000-0000-0000-000000000011'
$$;
grant execute on function public._sr_try(int, text, int[], text), public._sr_refused(text),
  public._sr_travel(numeric) to authenticated;

set role authenticated;
set request.jwt.claim.sub = '37000000-0000-0000-0000-000000000011';
do $$
declare m record; n int;
begin
  -- Mastery: 5 distinct, all right, one hard, first time → stage 1 in 7 days.
  perform public._sr_try(1, 'practice', array[1,2,3,4,5], 'A');
  select * into m from concept_mastery where concept_id = '37000000-0000-0000-0000-0000000000f1';
  if m.state <> 'mastered' or m.review_stage <> 1
     or abs(extract(epoch from m.next_review_at - (now() + interval '7 days'))) > 60 then
    raise exception 'SR_SCHEDULE_ON_MASTERY: % % %', m.state, m.review_stage, m.next_review_at;
  end if;

  -- Not due yet (7 days away): a revision is no check.
  perform public._sr_try(2, 'revision', array[6,7,8], 'A');
  if exists (select 1 from revision_checks) then raise exception 'SR_CHECKED_BEFORE_DUE'; end if;
  if (select review_stage from concept_mastery where concept_id = '37000000-0000-0000-0000-0000000000f1') <> 1 then
    raise exception 'SR_STAGE_MOVED_BEFORE_DUE';
  end if;

  -- Day 7 (overdue by a day): pass → stage 2, due in 30 days.
  perform public._sr_travel(-24);
  perform public._sr_try(3, 'revision', array[6,7,8], 'A');
  select * into m from concept_mastery where concept_id = '37000000-0000-0000-0000-0000000000f1';
  if m.review_stage <> 2 or abs(extract(epoch from m.next_review_at - (now() + interval '30 days'))) > 60 then
    raise exception 'SR_PASS_STAGE1: % %', m.review_stage, m.next_review_at;
  end if;
  if (select count(*) from revision_checks where stage = 1 and passed and n_items = 3) <> 1 then
    raise exception 'SR_CHECK_ROW_MISSING';
  end if;

  -- Day 37: fail → back to stage 1 in 7 days, a revision follow-up, still mastered.
  perform public._sr_travel(-2);
  perform public._sr_try(4, 'revision', array[9,10,1], 'B');
  select * into m from concept_mastery where concept_id = '37000000-0000-0000-0000-0000000000f1';
  if m.review_stage <> 1 or abs(extract(epoch from m.next_review_at - (now() + interval '7 days'))) > 60 then
    raise exception 'SR_FAIL_RESET: % %', m.review_stage, m.next_review_at;
  end if;
  if m.state <> 'mastered' then raise exception 'SR_FAIL_DROPPED_BAND: %', m.state; end if;
  if (select count(*) from follow_ups where kind = 'revision' and status = 'open') <> 1 then
    raise exception 'SR_FAIL_NO_FOLLOW_UP';
  end if;
  if not exists (select 1 from revision_checks where stage = 2 and not passed) then
    raise exception 'SR_FAIL_NOT_LOGGED';
  end if;

  -- Too few items of the concept: no check, nothing moves.
  perform public._sr_travel(-1);
  perform public._sr_try(5, 'revision', array[2,3], 'A');
  select count(*) into n from revision_checks;
  if n <> 2 or (select review_stage from concept_mastery where concept_id = '37000000-0000-0000-0000-0000000000f1') <> 1 then
    raise exception 'SR_TOO_FEW_COUNTED: %', n;
  end if;

  -- Plain practice on a due concept is not a check.
  perform public._sr_try(6, 'practice', array[4,5,6], 'A');
  if (select count(*) from revision_checks) <> 2 then raise exception 'SR_PRACTICE_COUNTED'; end if;

  -- Two days early: not due. Six hours early: due (the 12-hour window).
  perform public._sr_travel(48);
  perform public._sr_try(7, 'revision', array[7,8,9], 'A');
  if (select count(*) from revision_checks) <> 2 then raise exception 'SR_TOO_EARLY_COUNTED'; end if;
  perform public._sr_travel(6);
  perform public._sr_try(8, 'revision', array[7,8,9], 'A');
  if (select review_stage from concept_mastery where concept_id = '37000000-0000-0000-0000-0000000000f1') <> 2 then
    raise exception 'SR_EARLY_WINDOW';
  end if;

  -- Day 30 of stage 2: pass → retained, no more checks.
  perform public._sr_travel(-1);
  perform public._sr_try(9, 'revision', array[1,2,3,4], 'A');
  select * into m from concept_mastery where concept_id = '37000000-0000-0000-0000-0000000000f1';
  if m.review_stage <> 3 or m.next_review_at is not null then
    raise exception 'SR_RETAINED: % %', m.review_stage, m.next_review_at;
  end if;
  perform public._sr_try(10, 'revision', array[5,6,7], 'B');
  if (select count(*) from revision_checks) <> 4 then raise exception 'SR_CHECKED_AFTER_RETAINED'; end if;

  -- The same attempt synced again changes nothing.
  perform public._sr_try(9, 'revision', array[1,2,3,4], 'A');
  if (select count(*) from revision_checks) <> 4 then raise exception 'SR_DUPLICATE_SYNC'; end if;

  -- No writes from a client; the rollup isn't callable.
  if not public._sr_refused($q$insert into revision_checks(learner_id, concept_id, attempt_id, stage, due_at, n_items, n_correct, passed)
       select learner_id, concept_id, attempt_id, 1, now(), 9, 9, true from revision_checks limit 1$q$) then
    raise exception 'SR_CLIENT_WROTE_CHECK';
  end if;
  if not public._sr_refused($q$update revision_checks set passed = true$q$)
     and exists (select 1 from revision_checks where stage = 2 and passed and n_correct = 0) then
    raise exception 'SR_CLIENT_EDITED_CHECK';
  end if;
  if not public._sr_refused($q$select public.retention_rollup()$q$) then raise exception 'SR_CLIENT_RAN_ROLLUP'; end if;
end $$;

-- Another learner sees none of these checks.
set request.jwt.claim.sub = '37000000-0000-0000-0000-000000000012';
do $$ begin
  if exists (select 1 from revision_checks) then raise exception 'SR_OTHER_LEARNER_SAW_CHECKS'; end if;
end $$;

-- ---- Nightly rollup (as the cron job runs it) ---------------------------------------
reset role;
do $$
declare d date := (now() at time zone 'Asia/Karachi')::date; n int;
begin
  n := public.retention_rollup(d);
  if n <> 2 then raise exception 'SR_ROLLUP_ROWS: %', n; end if;
  if (select checks || '/' || passed from retention_daily where day = d and stage = 1) <> '2/2' then
    raise exception 'SR_ROLLUP_STAGE1: %', (select row_to_json(r) from retention_daily r where day = d and stage = 1);
  end if;
  if (select checks || '/' || passed from retention_daily where day = d and stage = 2) <> '2/1' then
    raise exception 'SR_ROLLUP_STAGE2';
  end if;
  -- Re-running a day replaces it.
  perform public.retention_rollup(d);
  if (select count(*) from retention_daily where day = d) <> 2 then raise exception 'SR_ROLLUP_NOT_IDEMPOTENT'; end if;
  raise notice 'SR-1 retention today: stage 1 2/2, stage 2 1/2';
end $$;

set role authenticated;
set request.jwt.claim.sub = '37000000-0000-0000-0000-000000000011';
do $$ begin
  if exists (select 1 from retention_daily) then raise exception 'SR_STUDENT_SAW_ROLLUP'; end if;
end $$;
set request.jwt.claim.sub = '37000000-0000-0000-0000-000000000003';
do $$ begin
  if (select count(*) from retention_daily) < 2 then raise exception 'SR_ADMIN_NO_ROLLUP'; end if;
  if (select count(*) from revision_checks) <> 4 then raise exception 'SR_ADMIN_NO_CHECKS'; end if;
end $$;

reset role;
drop function public._sr_try(int, text, int[], text), public._sr_refused(text), public._sr_travel(numeric);
\echo '037 smoke: all checks passed'
