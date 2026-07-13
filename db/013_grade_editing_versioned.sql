-- ============================================================
--  013 — Editable grades, versioned (grade entry + audited corrections)
--
--  Additive migration. SAFE to run on a live database (no drops of data, no
--  destructive column changes) and idempotent (safe to re-run — the table/columns
--  are guarded, the function is CREATE OR REPLACE, every policy is dropped first).
--  Run once in the Supabase SQL Editor after 012.
--
--  WHY THIS EXISTS
--  ---------------
--  A student's score lives in submissions.score (setup.sql), null until a graded
--  pass. There was no way to enter or correct a grade from the app, and a plain
--  UPDATE on the score would destroy the audit trail — what the grade was, who
--  changed it, when, and why (CLAUDE.md rule 3: keep an audit trail for anything
--  involving marks; never lose history).
--
--  submissions has unique(enrollment_id, assessment_id) — exactly one row per
--  student per assessment — so a "superseded new row" pattern would fight that
--  constraint. Instead we keep submissions.score as the CURRENT value (so every
--  existing read path — StudentResultsScreen, StudentReportCardScreen,
--  reporting/aggregate.js — reflects the corrected number automatically) and
--  archive every change in an append-only history table. The prior value is always
--  recoverable there; students never see the history (admin/teacher-visible only).
--
--  All writes go through one SECURITY DEFINER function, record_grade(), so the
--  history row and the reason are captured atomically and can't be bypassed by app
--  code. RLS is still the boundary (rule 4): the function re-checks the caller.
-- ============================================================


-- ============================================================
--  PART 1 — History table + audit columns
-- ============================================================
-- One row per grade change: the value before, the value after, a required reason,
-- and who/when. Append-only (no update/delete policies); rows cascade if the
-- submission is ever removed.
create table if not exists public.submission_grade_edits (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  prev_score    numeric(6,2),
  new_score     numeric(6,2),
  reason        text not null,
  edited_by     uuid references public.profiles(id),
  edited_at     timestamptz not null default now()
);
create index if not exists ix_sge_submission on public.submission_grade_edits(submission_id);

-- A cheap "last edited" indicator for the grading UI without a history join.
alter table public.submissions
  add column if not exists edit_count    int not null default 0,
  add column if not exists last_edited_at timestamptz;


-- ============================================================
--  PART 2 — record_grade(): the single write path
-- ============================================================
-- Enter OR correct a grade for one enrollment against one assessment.
--   * Creates the submission if none exists (covers file assessments and students
--     who never submitted a structured attempt).
--   * First grade: reason optional (defaults to 'Initial grade').
--   * Correction (score already set and changed): reason REQUIRED.
--   * No-op when the score is unchanged (no history noise).
-- Returns the current submissions row. Raises with a stable message the app maps
-- to an i18n key: not_authorized / assessment_not_found / enrollment_class_mismatch
-- / score_required / score_out_of_range / reason_required.
create or replace function public.record_grade(
  p_enrollment_id uuid,
  p_assessment_id uuid,
  p_score         numeric,
  p_reason        text
) returns public.submissions
language plpgsql security definer set search_path = public as $$
declare
  v_sub    public.submissions;
  v_class  uuid;
  v_total  int;
  v_reason text;
begin
  -- The assessment fixes the class (for the authz check) and the mark ceiling.
  select class_id, total_marks into v_class, v_total
  from public.assessments where id = p_assessment_id;
  if v_class is null then
    raise exception 'assessment_not_found';
  end if;

  -- Authorize: staff, or the teacher who teaches this class. RLS is the real
  -- boundary, but this function runs with elevated rights, so it re-checks.
  if not (public.is_staff() or public.teaches_class(v_class)) then
    raise exception 'not_authorized';
  end if;

  -- The enrollment must belong to the assessment's class — no grading a student
  -- against another class's test.
  perform 1 from public.enrollments e
   where e.id = p_enrollment_id and e.class_id = v_class;
  if not found then
    raise exception 'enrollment_class_mismatch';
  end if;

  -- A grade is a real number within [0, total_marks] (upper bound only when the
  -- assessment carries a total).
  if p_score is null then
    raise exception 'score_required';
  end if;
  if p_score < 0 or (v_total is not null and p_score > v_total) then
    raise exception 'score_out_of_range';
  end if;

  select * into v_sub from public.submissions
   where enrollment_id = p_enrollment_id and assessment_id = p_assessment_id;

  -- First grade — either no submission row yet, or one that's still ungraded.
  if v_sub.id is null then
    insert into public.submissions (enrollment_id, assessment_id, score, graded_by, graded_at)
    values (p_enrollment_id, p_assessment_id, p_score, auth.uid(), now())
    returning * into v_sub;
    insert into public.submission_grade_edits
      (submission_id, prev_score, new_score, reason, edited_by)
    values (v_sub.id, null, p_score,
            coalesce(nullif(btrim(p_reason), ''), 'Initial grade'), auth.uid());
    return v_sub;
  end if;

  if v_sub.score is null then
    update public.submissions
       set score = p_score, graded_by = auth.uid(), graded_at = now()
     where id = v_sub.id
     returning * into v_sub;
    insert into public.submission_grade_edits
      (submission_id, prev_score, new_score, reason, edited_by)
    values (v_sub.id, null, p_score,
            coalesce(nullif(btrim(p_reason), ''), 'Initial grade'), auth.uid());
    return v_sub;
  end if;

  -- Unchanged — nothing to record.
  if v_sub.score = p_score then
    return v_sub;
  end if;

  -- Correction of an existing grade: a reason is required.
  v_reason := nullif(btrim(p_reason), '');
  if v_reason is null then
    raise exception 'reason_required';
  end if;

  insert into public.submission_grade_edits
    (submission_id, prev_score, new_score, reason, edited_by)
  values (v_sub.id, v_sub.score, p_score, v_reason, auth.uid());

  update public.submissions
     set score = p_score,
         graded_by = auth.uid(),
         graded_at = now(),
         edit_count = edit_count + 1,
         last_edited_at = now()
   where id = v_sub.id
   returning * into v_sub;

  return v_sub;
end $$;

grant execute on function public.record_grade(uuid, uuid, numeric, text) to authenticated;


-- ============================================================
--  PART 3 — RLS on the history table (read: staff + teacher-of-class only)
-- ============================================================
-- Students get NO policy here, so they can never read the edit history — their
-- results view shows only the clean, current number (a corrected grade, with the
-- old value admin-visible only). Writes have no policy either: the only writer is
-- record_grade() above, which is SECURITY DEFINER and so bypasses RLS.
alter table public.submission_grade_edits enable row level security;

drop policy if exists p_sge_staff on public.submission_grade_edits;
create policy p_sge_staff on public.submission_grade_edits
  for select using (public.is_staff());

drop policy if exists p_sge_teacher on public.submission_grade_edits;
create policy p_sge_teacher on public.submission_grade_edits
  for select using (
    public.is_teacher() and exists (
      select 1
      from public.submissions s
      join public.enrollments e on e.id = s.enrollment_id
      where s.id = submission_grade_edits.submission_id
        and public.teaches_class(e.class_id)
    )
  );
