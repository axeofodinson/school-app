-- Follow-up gates smoke (TEST_PLAN F-2, F-3 server side, FG-1; prompt 41).
-- As signed-in users: repeated weak diagnostics merge into one open follow-up
-- per concept and kind (F-2); a teacher relaxes and restores a gate with a
-- logged reason (F-3); only the subject's teacher (or staff) may; the stuck
-- students view is scoped to the class and the teacher's subjects.
-- Throwaway local Postgres only. Passes after 017 + 023 + 019 + 034.
\set ON_ERROR_STOP 1
reset role;
set request.jwt.claim.sub = '';
grant usage on schema public, auth to authenticated, anon;
grant select, insert, update, delete on all tables in schema public to authenticated, anon;
grant execute on all functions in schema public to authenticated;
revoke execute on function public.can_override_follow_up(uuid, uuid) from authenticated;

-- Class 9 (Maths taught by TM, Science by TS); Class 8 taught by T8. S1, S2 in 9.
update academic_years set is_current = false;
insert into academic_years(id, label, is_current) values ('0a000000-0000-0000-0000-0000000000a0', 'FG-2026-27', true);
insert into classes(id, name, grade_level) values
 ('0a000000-0000-0000-0000-0000000000c9', 'FG Class 9', 9), ('0a000000-0000-0000-0000-0000000000c8', 'FG Class 8', 8);
insert into subjects(id, class_id, name) values
 ('0a000000-0000-0000-0000-0000000000d1', '0a000000-0000-0000-0000-0000000000c9', 'FG Maths'),
 ('0a000000-0000-0000-0000-0000000000d2', '0a000000-0000-0000-0000-0000000000c9', 'FG Science');
insert into chapters(id, subject_id, title, sort_order) values
 ('0a000000-0000-0000-0000-0000000000e1', '0a000000-0000-0000-0000-0000000000d1', 'FG Algebra', 1),
 ('0a000000-0000-0000-0000-0000000000e2', '0a000000-0000-0000-0000-0000000000d2', 'FG Cells', 1);
insert into topics(id, chapter_id, title_en, sort_order) values
 ('0a000000-0000-0000-0000-0000000000b1', '0a000000-0000-0000-0000-0000000000e1', 'FG Equations', 1),
 ('0a000000-0000-0000-0000-0000000000b2', '0a000000-0000-0000-0000-0000000000e2', 'FG Parts', 1);
insert into concepts(id, topic_id, title_en) values
 ('0a000000-0000-0000-0000-0000000000f1', '0a000000-0000-0000-0000-0000000000b1', 'FG Balance'),
 ('0a000000-0000-0000-0000-0000000000f2', '0a000000-0000-0000-0000-0000000000b2', 'FG Nucleus');
insert into students(id, student_code, full_name) values
 ('0a000000-0000-0000-0000-000000000051', 'FG-1', 'TEST- FG One'),
 ('0a000000-0000-0000-0000-000000000052', 'FG-2', 'TEST- FG Two');
insert into enrollments(student_id, class_id, year_id, status) values
 ('0a000000-0000-0000-0000-000000000051', '0a000000-0000-0000-0000-0000000000c9', '0a000000-0000-0000-0000-0000000000a0', 'active'),
 ('0a000000-0000-0000-0000-000000000052', '0a000000-0000-0000-0000-0000000000c9', '0a000000-0000-0000-0000-0000000000a0', 'active');
insert into auth.users(id, email) values
 ('0a000000-0000-0000-0000-000000000001', 'fg.tm@school.test'),
 ('0a000000-0000-0000-0000-000000000002', 'fg.ts@school.test'),
 ('0a000000-0000-0000-0000-000000000004', 'fg.t8@school.test'),
 ('0a000000-0000-0000-0000-000000000003', 'fg.admin@school.test'),
 ('0a000000-0000-0000-0000-000000000011', 'fg1@students.school.invalid'),
 ('0a000000-0000-0000-0000-000000000012', 'fg2@students.school.invalid');
update profiles set role = 'teacher', full_name = 'FG Maths Teacher' where id = '0a000000-0000-0000-0000-000000000001';
update profiles set role = 'teacher' where id in ('0a000000-0000-0000-0000-000000000002', '0a000000-0000-0000-0000-000000000004');
update profiles set role = 'admin' where id = '0a000000-0000-0000-0000-000000000003';
update profiles set role = 'student', student_id = '0a000000-0000-0000-0000-000000000051' where id = '0a000000-0000-0000-0000-000000000011';
update profiles set role = 'student', student_id = '0a000000-0000-0000-0000-000000000052' where id = '0a000000-0000-0000-0000-000000000012';
insert into teacher_assignments(teacher_id, class_id, subject_id, year_id) values
 ('0a000000-0000-0000-0000-000000000001', '0a000000-0000-0000-0000-0000000000c9', '0a000000-0000-0000-0000-0000000000d1', '0a000000-0000-0000-0000-0000000000a0'),
 ('0a000000-0000-0000-0000-000000000002', '0a000000-0000-0000-0000-0000000000c9', '0a000000-0000-0000-0000-0000000000d2', '0a000000-0000-0000-0000-0000000000a0'),
 ('0a000000-0000-0000-0000-000000000004', '0a000000-0000-0000-0000-0000000000c8', null, '0a000000-0000-0000-0000-0000000000a0');
-- 10 Maths questions (q01–q10, key A) + 4 Science (q21–q24), approved for practice.
insert into questions(id, chapter_id, concept_id, type, cognitive_level, difficulty, body, answer, status, created_by, is_test_data)
select format('0a000000-0000-0000-0000-0000000001%s', lpad(n::text, 2, '0'))::uuid,
       case when n <= 10 then '0a000000-0000-0000-0000-0000000000e1' else '0a000000-0000-0000-0000-0000000000e2' end::uuid,
       case when n <= 10 then '0a000000-0000-0000-0000-0000000000f1' else '0a000000-0000-0000-0000-0000000000f2' end::uuid,
       'mcq', 'apply', 1 + n % 3,
       format('{"stem":{"en":"FG %s"},"options":[{"key":"A","text":{"en":"a"}},{"key":"B","text":{"en":"b"}}]}', n)::jsonb,
       '{"correct":"A"}', 'approved', '0a000000-0000-0000-0000-000000000003', true
  from (select generate_series(1, 10) n union all select generate_series(21, 24)) s;
insert into item_approvals(item_kind, item_id, version, scope, approved_by)
select 'question', id, 1, 'practice', '0a000000-0000-0000-0000-000000000003'
  from questions where id::text like '0a000000-0000-0000-0000-0000000001%';

create or replace function public._fg_diag(p_id text, p_nums int[], p_ans text, p_at text, p_kind text default 'diagnostic')
returns jsonb language sql as $$
  select public.record_practice_attempt(jsonb_build_object(
    'id', p_id, 'kind', p_kind, 'started_at', p_at,
    'items', (select jsonb_agg(jsonb_build_object('q', format('0a000000-0000-0000-0000-0000000001%s', lpad(n::text, 2, '0')),
                                                  'v', 1, 'a', p_ans, 'c', false, 'ms', 1000)) from unnest(p_nums) n)))
$$;
create or replace function public._fg_refused(p_sql text, p_like text default '%') returns boolean
language plpgsql as $$
begin execute p_sql; return false;
exception when others then return sqlerrm like p_like; end $$;
grant execute on function public._fg_diag(text, int[], text, text, text), public._fg_refused(text, text) to authenticated;

-- ---- F-2: repeated mistakes merge into one open follow-up per concept + kind -------
set role authenticated;
set request.jwt.claim.sub = '0a000000-0000-0000-0000-000000000011';
do $$ begin
  perform public._fg_diag('0a000000-0000-0000-0000-00000000a001', array[1,2,3], 'B', '2026-11-20T09:00:00Z');
  perform public._fg_diag('0a000000-0000-0000-0000-00000000a002', array[4,5,6], 'B', '2026-11-21T09:00:00Z');
  perform public._fg_diag('0a000000-0000-0000-0000-00000000a003', array[21,22,23], 'B', '2026-11-21T10:00:00Z');
  if (select count(*) from follow_ups where concept_id = '0a000000-0000-0000-0000-0000000000f1') <> 1 then
    raise exception 'F2_NOT_MERGED: %', (select count(*) from follow_ups where concept_id = '0a000000-0000-0000-0000-0000000000f1');
  end if;
  if (select count(*) from follow_ups where status = 'open') <> 2 then raise exception 'F2_EXPECTED_TWO_OPEN'; end if;
  -- A learner can't relax their own gate, nor log an override.
  if not public._fg_refused($q$select public.gate_relax((select id from follow_ups limit 1), 'me')$q$, '%not_your_student%') then
    raise exception 'STUDENT_RELAXED_OWN_GATE';
  end if;
  if not public._fg_refused($q$insert into gate_overrides(learner_id, action, actor_id, reason)
       values ('0a000000-0000-0000-0000-000000000011', 'relax', '0a000000-0000-0000-0000-000000000011', 'x')$q$) then
    raise exception 'STUDENT_LOGGED_OVERRIDE';
  end if;
  if not public._fg_refused($q$select public.class_follow_ups('0a000000-0000-0000-0000-0000000000c9')$q$, '%not_your_class%') then
    raise exception 'STUDENT_SAW_CLASS_VIEW';
  end if;
end $$;

-- ---- F-3: only the subject's teacher relaxes / restores, with a reason, logged ------
set request.jwt.claim.sub = '0a000000-0000-0000-0000-000000000002';  -- Science teacher of 9
do $$
declare maths uuid; sci uuid; v jsonb;
begin
  select id into maths from follow_ups where concept_id = '0a000000-0000-0000-0000-0000000000f1' and status = 'open';
  select id into sci   from follow_ups where concept_id = '0a000000-0000-0000-0000-0000000000f2' and status = 'open';
  if not public._fg_refused(format('select public.gate_relax(%L, %L)', maths, 'help'), '%not_your_student%') then
    raise exception 'OTHER_SUBJECT_TEACHER_RELAXED';
  end if;
  v := public.class_follow_ups('0a000000-0000-0000-0000-0000000000c9');
  if jsonb_array_length(v) <> 1 or v->0->>'subject_name' <> 'FG Science' then
    raise exception 'VIEW_NOT_SUBJECT_SCOPED: %', v;
  end if;
  if not public._fg_refused(format('select public.gate_relax(%L, %L)', sci, '  '), '%reason_required%') then
    raise exception 'RELAX_WITHOUT_REASON';
  end if;
  perform public.gate_relax(sci, 'Did it on paper with me');
  if (select status || ':' || close_reason from follow_ups where id = sci) <> 'relieved:teacher_relax' then
    raise exception 'NOT_RELAXED';
  end if;
  if not exists (select 1 from gate_overrides where follow_up_id = sci and action = 'relax'
                   and actor_id = '0a000000-0000-0000-0000-000000000002' and reason = 'Did it on paper with me') then
    raise exception 'RELAX_NOT_LOGGED';
  end if;
  if (select state from concept_mastery where concept_id = '0a000000-0000-0000-0000-0000000000f2') <> 'carried_over' then
    raise exception 'RELAX_DID_NOT_CARRY_OVER';
  end if;
  if not public._fg_refused(format('select public.gate_relax(%L, %L)', sci, 'again'), '%follow_up_not_open%') then
    raise exception 'RELAXED_TWICE';
  end if;
  perform public.gate_restore(sci, 'Needs one more go');
  if (select status || ':' || rounds from follow_ups where id = sci) <> 'open:0' then raise exception 'NOT_RESTORED'; end if;
  if (select count(*) from gate_overrides where follow_up_id = sci) <> 2 then raise exception 'RESTORE_NOT_LOGGED'; end if;
  if (select state from concept_mastery where concept_id = '0a000000-0000-0000-0000-0000000000f2') <> 'weak' then
    raise exception 'RESTORE_BAND_NOT_RECOMPUTED';
  end if;
  -- History stays: overrides can't be edited or deleted.
  if not public._fg_refused($q$update gate_overrides set reason = 'x'$q$)
     and exists (select 1 from gate_overrides where reason = 'x') then
    raise exception 'OVERRIDE_EDITED';
  end if;
end $$;

-- A teacher of another class sees and changes nothing.
set request.jwt.claim.sub = '0a000000-0000-0000-0000-000000000004';
do $$ begin
  if not public._fg_refused($q$select public.class_follow_ups('0a000000-0000-0000-0000-0000000000c9')$q$, '%not_your_class%') then
    raise exception 'OTHER_CLASS_TEACHER_SAW_VIEW';
  end if;
  if not public._fg_refused($q$select public.gate_relax((select id from follow_ups f where f.concept_id = '0a000000-0000-0000-0000-0000000000f1' limit 1), 'x')$q$) then
    raise exception 'OTHER_CLASS_TEACHER_RELAXED';
  end if;
end $$;

-- Restore refuses when the learner already has an open one again; admin sees all.
set request.jwt.claim.sub = '0a000000-0000-0000-0000-000000000001';  -- Maths teacher
do $$
declare maths uuid; v jsonb;
begin
  select id into maths from follow_ups where concept_id = '0a000000-0000-0000-0000-0000000000f1' and status = 'open';
  perform public.gate_relax(maths, 'Moving on, we revise next week');
end $$;
set request.jwt.claim.sub = '0a000000-0000-0000-0000-000000000011';
do $$ begin
  perform public._fg_diag('0a000000-0000-0000-0000-00000000a004', array[7,8,9], 'B', '2026-11-22T09:00:00Z');
  if (select count(*) from follow_ups where concept_id = '0a000000-0000-0000-0000-0000000000f1' and status = 'open') <> 1 then
    raise exception 'NEW_DIAGNOSTIC_DID_NOT_REOPEN';
  end if;
end $$;
set request.jwt.claim.sub = '0a000000-0000-0000-0000-000000000001';
do $$
declare old uuid;
begin
  select id into old from follow_ups where concept_id = '0a000000-0000-0000-0000-0000000000f1' and status = 'relieved';
  if not public._fg_refused(format('select public.gate_restore(%L, %L)', old, 'x'), '%follow_up_already_open%') then
    raise exception 'RESTORE_MADE_TWO_OPEN';
  end if;
end $$;
set request.jwt.claim.sub = '0a000000-0000-0000-0000-000000000003';
do $$
declare v jsonb := public.class_follow_ups('0a000000-0000-0000-0000-0000000000c9');
begin
  if jsonb_array_length(v) <> 3 then raise exception 'ADMIN_VIEW: %', v; end if;
  if v->0->>'status' <> 'open' or v->0->>'student_name' <> 'TEST- FG One' then raise exception 'ADMIN_VIEW_ORDER: %', v->0; end if;
  if not exists (select 1 from jsonb_array_elements(v) x where x->>'last_actor' = 'FG Maths Teacher') then
    raise exception 'VIEW_NO_ACTOR: %', v;
  end if;
end $$;

reset role;
drop function public._fg_diag(text, int[], text, text, text), public._fg_refused(text, text);
\echo '034 smoke: all checks passed'
