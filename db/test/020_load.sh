#!/bin/bash
# TEST_PLAN L-1 (local stand-in): 40 students take one live exam AT THE SAME
# TIME, each as its own database connection: start → 20 saves at random
# moments (often changing an answer) → submit. Pass: every final answer is the
# one stored (0 lost), every session submitted and graded, p95 save time shown.
# Run after db/test/020_exam_smoke.sql on the throwaway harness database:
#   bash db/test/020_load.sh "psql -h /var/lib/postgresql/smoke -p 54329 -U postgres -d t"
set -u
P="$1 -v ON_ERROR_STOP=1 -q"
N=${N:-40}

$P <<'SQL'
reset role;
insert into students(id, student_code, full_name)
select format('0e100000-0000-0000-0000-%s', lpad(i::text, 12, '0'))::uuid, 'EXL-' || i, 'TEST- Load ' || i
  from generate_series(1, 40) i on conflict do nothing;
insert into enrollments(student_id, class_id, year_id, status)
select format('0e100000-0000-0000-0000-%s', lpad(i::text, 12, '0'))::uuid,
       '0e000000-0000-0000-0000-0000000000c9', '0e000000-0000-0000-0000-0000000000a0', 'active'
  from generate_series(1, 40) i on conflict do nothing;
insert into auth.users(id, email)
select format('0e200000-0000-0000-0000-%s', lpad(i::text, 12, '0'))::uuid, format('exl%s@students.school.invalid', i)
  from generate_series(1, 40) i on conflict do nothing;
update profiles p set role = 'student',
       student_id = format('0e100000-0000-0000-0000-%s', right(p.id::text, 12))::uuid
 where p.id::text like '0e200000-%';
insert into assessments(id, year_id, class_id, subject_id, title, type, status, created_by)
values ('0e000000-0000-0000-0000-00000000aa03', '0e000000-0000-0000-0000-0000000000a0', '0e000000-0000-0000-0000-0000000000c9',
        '0e000000-0000-0000-0000-0000000000d1', 'EX load', 'exam', 'draft', '0e000000-0000-0000-0000-000000000001')
on conflict do nothing;
insert into assessment_questions(assessment_id, question_id, marks, sort_order)
select '0e000000-0000-0000-0000-00000000aa03', format('0e000000-0000-0000-0000-0000000001%s', lpad(n::text, 2, '0'))::uuid, 1, n
  from generate_series(1, 8) n on conflict do nothing;
create table if not exists public._load_log (learner uuid, q uuid, val text, at timestamptz, ms numeric, accepted boolean);
grant insert, select on public._load_log to authenticated;
set role authenticated;
set request.jwt.claim.sub = '0e000000-0000-0000-0000-000000000001';
select public.exam_launch('0e000000-0000-0000-0000-00000000aa03', 30);
SQL

start=$(date +%s%N)
for i in $(seq 1 "$N"); do
  uid=$(printf '0e200000-0000-0000-0000-%012d' "$i")
  $P >/dev/null 2>/tmp/load_err_$i <<SQL &
set role authenticated;
set request.jwt.claim.sub = '$uid';
do \$\$
declare p jsonb; sid uuid; qs uuid[]; q uuid; v text; t0 timestamptz; r jsonb; k int;
begin
  p := public.start_exam_session('0e000000-0000-0000-0000-00000000aa03');
  sid := (p->>'session_id')::uuid;
  select array_agg((x->>'q')::uuid) into qs from jsonb_array_elements(p->'questions') x;
  for k in 1..20 loop
    perform pg_sleep(random() * 0.15);
    q := qs[1 + floor(random() * array_length(qs, 1))::int];
    v := (array['A','B','C','D'])[1 + floor(random() * 4)::int];
    t0 := clock_timestamp();
    r := public.save_exam_answer(sid, q, to_jsonb(v), t0);
    insert into public._load_log values (auth.uid(), q, v, t0,
      extract(epoch from clock_timestamp() - t0) * 1000, (r->>'accepted')::boolean);
  end loop;
  perform public.submit_exam_session(sid);
end \$\$;
SQL
done
wait
end=$(date +%s%N)
cat /tmp/load_err_* 2>/dev/null | grep -v '^$' | head -5
rm -f /tmp/load_err_*

$P <<'SQL'
reset role;
do $$
declare sessions int; graded int; lost int; rejected int; p95 numeric; logged int;
begin
  select count(*), count(score) into sessions, graded
    from exam_sessions where assessment_id = '0e000000-0000-0000-0000-00000000aa03' and status = 'submitted';
  select count(*) into logged from public._load_log;
  select count(*) filter (where not accepted) into rejected from public._load_log;
  -- The last tap per learner + question must be what the server holds.
  select count(*) into lost from (
    select distinct on (l.learner, l.q) l.learner, l.q, l.val
      from public._load_log l order by l.learner, l.q, l.at desc) last
    join exam_sessions s on s.learner_id = last.learner
                        and s.assessment_id = '0e000000-0000-0000-0000-00000000aa03'
    left join exam_session_answers a on a.session_id = s.id and a.question_id = last.q
   where a.answer is distinct from to_jsonb(last.val);
  select percentile_cont(0.95) within group (order by ms) into p95 from public._load_log;
  raise notice 'L-1 local: % sessions submitted, % graded, % saves (% refused), % lost, p95 save % ms',
    sessions, graded, logged, rejected, lost, round(p95, 1);
  if sessions <> 40 or graded <> 40 or lost <> 0 or rejected <> 0 or logged <> 800 then
    raise exception 'L-1 FAILED';
  end if;
end $$;
drop table public._load_log;
SQL
echo "L-1 local: 40 students in parallel, wall time $(( (end - start) / 1000000 )) ms"
