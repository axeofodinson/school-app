-- ============================================================
--  018 — Close the answer-key read; papers and marking go through the server
--
--  DRAFT — NOT YET RUN. Additive and idempotent (functions are CREATE OR
--  REPLACE, the policy and trigger are dropped then recreated; no table, column
--  or data changes). Needs setup.sql + 002–016 (uses my_student_id() from 004,
--  submission_grade_edits from 013). Works with or without 024–027 and 017.
--  Numbered 018 as planned in 2026-11 (LMS_AUDIT §2.2 item 1), but it runs
--  AFTER 026 on dev and production. Smoke: db/test/018_smoke.sql (TEST_PLAN
--  CO-1).
--
--  RUN IT AT THE CUT-OVER, NOT BEFORE. The OLD app's student test screen
--  (src/screens/student/AssessmentAttemptScreen.js) reads `questions`
--  directly; after this file it shows an empty paper. Students must be on the
--  new app (prompt 13 build) first. The old app's teacher and admin screens
--  keep working (teachers and staff still read `questions`).
--
--  WHY
--  ---
--  setup.sql's p_questions_read is `using (auth.uid() is not null)`: any
--  signed-in student can run
--      select body, answer from questions
--  with the anon key from the app and read every answer key (and the worked
--  solutions some keys carry). The app never selects `answer`, but the app is
--  not the security boundary (CLAUDE.md rule 4). Column grants can't fix it
--  (teachers and students share the `authenticated` role), so students lose
--  direct read of the table and get what they need from definer functions
--  that never return `answer`.
--
--  WHAT
--  ----
--  1. p_questions_read: staff and teachers only (017 Part 10's plan). Students,
--     parents, pending and prep-only users read 0 rows of `questions`.
--  2. student_paper(assessment): the paper for one PUBLISHED assessment of the
--     caller's class + year: question id, type, body, marks, order, thinking
--     level. Never the answer. Same visibility as db/005 p_aq_student_read.
--  3. student_paper_levels(assessments[]): marks + thinking level per question
--     for the report card (published or closed tests of the caller's class +
--     year; no bodies, no answers).
--  4. Server-side marking. auto_mark_item(type, value, answer) is the pure
--     rule (same as packages/core autoMark.ts, pinned by the same cases).
--     An AFTER INSERT trigger on submissions marks a new, ungraded attempt
--     when EVERY question in its paper is auto-markable (mcq, true_false,
--     numeric, short_text, tap_image with an answer key): score = sum of the
--     marks of the correct answers, graded_at = now(), graded_by = null
--     (system), plus one submission_grade_edits row ("Auto-marked"), so the
--     history shows it and a teacher's later change needs a reason via
--     record_grade(). Papers with anything else (multi_select, match, a
--     question without a key, file worksheets) stay "not marked" for the
--     teacher, as today. Marking never refuses the student's submission: on
--     any error it logs a warning and leaves the attempt ungraded.
--     The app keeps its plain insert (offline queue, client UUID, duplicate =
--     done), so the old app's submissions are marked too.
--
--  The marking function is a trigger function (it can't be called through
--  the API) and runs as its owner, so it can read answer keys and pass the
--  026 grade guard; nobody else gains that.
--
--  RUN ORDER (Hassan, Supabase SQL Editor): dev first, then production, after
--  the new build is installed for students. Paste this whole file, Run.
--  Check:  select policyname, qual from pg_policies
--           where tablename = 'questions' and policyname = 'p_questions_read';
--  → qual mentions is_staff() OR is_teacher().
-- ============================================================


-- ============================================================
--  PART 1 — Students lose direct read of questions (answer keys)
-- ============================================================
drop policy if exists p_questions_read on public.questions;
create policy p_questions_read on public.questions
  for select using (public.is_staff() or public.is_teacher());


-- ============================================================
--  PART 2 — A student's paper, without answers
-- ============================================================
-- Mirrors db/005 p_aq_student_read: the assessment is published and the caller
-- has an enrollment (any status, like the read policy) in its class + year.
-- my_student_id() is null for anyone who isn't a linked school student, so
-- teachers, staff, parents and prep-only users get 0 rows (they have their own
-- paths). Returns rows rather than raising, like RLS would.
create or replace function public.student_paper(p_assessment_id uuid)
returns table (
  question_id     uuid,
  type            text,
  body            jsonb,
  marks           int,
  sort_order      int,
  cognitive_level text
)
language sql stable security definer set search_path = public as $$
  select q.id, q.type, q.body, aq.marks, aq.sort_order, q.cognitive_level
    from public.assessment_questions aq
    join public.assessments a on a.id = aq.assessment_id
    join public.questions   q on q.id = aq.question_id
   where aq.assessment_id = p_assessment_id
     and a.status = 'published'
     and exists (
       select 1 from public.enrollments e
        where e.student_id = public.my_student_id()
          and e.class_id = a.class_id
          and e.year_id  = a.year_id)
   order by aq.sort_order, q.id
$$;

revoke all on function public.student_paper(uuid) from public, anon;
grant execute on function public.student_paper(uuid) to authenticated;


-- ============================================================
--  PART 3 — Report card: marks + thinking level per question
-- ============================================================
-- Published OR closed tests of the caller's class + year (the report card
-- covers closed tests too). No bodies, no answers. At most 500 ids per call.
create or replace function public.student_paper_levels(p_assessment_ids uuid[])
returns table (
  assessment_id   uuid,
  marks           int,
  cognitive_level text
)
language sql stable security definer set search_path = public as $$
  select aq.assessment_id, aq.marks, q.cognitive_level
    from public.assessment_questions aq
    join public.assessments a on a.id = aq.assessment_id
    join public.questions   q on q.id = aq.question_id
   where aq.assessment_id = any (p_assessment_ids[1:500])
     and a.status in ('published', 'closed')
     and exists (
       select 1 from public.enrollments e
        where e.student_id = public.my_student_id()
          and e.class_id = a.class_id
          and e.year_id  = a.year_id)
   order by aq.assessment_id, aq.sort_order
$$;

revoke all on function public.student_paper_levels(uuid[]) from public, anon;
grant execute on function public.student_paper_levels(uuid[]) to authenticated;


-- ============================================================
--  PART 4 — Marking rules (pure; same as packages/core/src/autoMark.ts)
-- ============================================================
-- Text as short_text compares it: Urdu/Arabic digits to Latin, spaces
-- collapsed and trimmed, lower case.
create or replace function public.answer_text_norm(p text)
returns text language sql immutable set search_path = public as $$
  select lower(regexp_replace(regexp_replace(
           translate(p, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'),
           '[[:space:]\u00a0]+', ' ', 'g'), '^ | $', '', 'g'))
$$;

-- true = correct, false = wrong or blank, null = can't be auto-marked (type
-- not supported, or the key has no usable `correct`).
--   mcq / tap_image  value is the option key / choice id; equal to correct
--   true_false       value and correct are booleans
--   numeric          value is typed text: Latin or Urdu digits, optional sign
--                    and one decimal point (. or ٫); numerically equal
--   short_text       normalised text equals correct or one of `also`
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
           ' ', ''), E'\u00a0', '');
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
--  PART 5 — Mark a new attempt on insert (server side)
-- ============================================================
create or replace function public.submissions_auto_mark()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_total   int;
  v_items   int;
  v_unknown int;
  v_score   numeric;
begin
  if new.score is not null or new.graded_at is not null
     or jsonb_typeof(new.responses -> 'answers') is distinct from 'array' then
    return null;
  end if;

  select a.total_marks into v_total from public.assessments a where a.id = new.assessment_id;

  with given as (
    -- First answer per question wins (the app sends one per question).
    select distinct on (x ->> 'question_id') x ->> 'question_id' as qid, x -> 'value' as value
      from jsonb_array_elements(new.responses -> 'answers') with ordinality as t(x, n)
     where jsonb_typeof(x) = 'object'
     order by x ->> 'question_id', n
  ), marked as (
    select aq.marks,
           public.auto_mark_item(q.type, g.value, q.answer) as ok
      from public.assessment_questions aq
      join public.questions q on q.id = aq.question_id
      left join given g on g.qid = aq.question_id::text
     where aq.assessment_id = new.assessment_id
  )
  select count(*), count(*) filter (where ok is null),
         coalesce(sum(marks) filter (where ok), 0)
    into v_items, v_unknown, v_score
    from marked;

  -- Nothing to mark, something only a teacher can mark, or a score the
  -- assessment's total can't hold (record_grade would refuse it too).
  if v_items = 0 or v_unknown > 0 or (v_total is not null and v_score > v_total) then
    return null;
  end if;

  update public.submissions
     set score = v_score, graded_by = null, graded_at = now()
   where id = new.id and score is null;
  if found then
    insert into public.submission_grade_edits
      (submission_id, prev_score, new_score, reason, edited_by)
    values (new.id, null, v_score, 'Auto-marked', null);
  end if;
  return null;
exception when others then
  -- Never lose a student's attempt over marking: it stays for the teacher.
  raise warning 'submissions_auto_mark: % (%), submission % left unmarked',
    sqlerrm, sqlstate, new.id;
  return null;
end $$;

revoke all on function public.submissions_auto_mark() from public, anon, authenticated;

drop trigger if exists t_submissions_auto_mark on public.submissions;
create trigger t_submissions_auto_mark
  after insert on public.submissions
  for each row
  when (new.responses is not null and new.score is null)
  execute function public.submissions_auto_mark();
