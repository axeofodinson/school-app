-- ============================================================
--  005 — Student assessment attempts (read published tests, submit responses)
--
--  Additive migration. SAFE to run on a live database (no drops of data, no
--  column changes) and idempotent (safe to re-run — every policy is dropped
--  first, then recreated). Run once in the Supabase SQL Editor after 004.
--
--  WHY THIS EXISTS
--  ---------------
--  setup.sql scopes assessments / assessment_questions / submissions to staff
--  and teachers only; 004 gave a signed-in student read access to their own
--  student / enrollment / submission / attendance rows, but NOT to the tests
--  themselves. So today a student session can sign in and see their profile,
--  but the student app can neither list the assessments assigned to their class
--  nor record an attempt — every such query is denied by RLS (the security
--  boundary — CLAUDE.md rule 4).
--
--  This migration adds the minimal student-side policies the attempt flow needs:
--    * read the PUBLISHED assessments for the class they're enrolled in
--      (this year), and the questions inside those assessments;
--    * insert their OWN submission once, carrying raw responses.
--
--  Postgres RLS is permissive (policies OR together), so these widen access
--  only for the matching student and never weaken the staff/teacher policies
--  already in place. They lean on my_student_id() from 004.
--
--  Questions themselves are already readable by any authenticated user
--  (setup.sql: p_questions_read), which is what lets the syllabus and a test's
--  questions render. The student app deliberately never selects questions.answer
--  — grading is a separate, later step (a teacher/graded pass), and submissions
--  keep the raw responses so the score can be computed then (rule 3).
-- ============================================================


-- ============================================================
--  PART 1 — Read the published assessments for my class
-- ============================================================
-- A student may read an assessment when it is published AND it targets the
-- class + year they are enrolled in. The enrolment lookup reuses my_student_id()
-- so it keys on the signed-in student, and matches the assessment's own
-- class_id/year_id so a student only ever sees their own class's tests. Draft
-- and closed assessments stay hidden (status = 'published').
drop policy if exists p_assess_student_read on public.assessments;
create policy p_assess_student_read on public.assessments
  for select using (
    status = 'published' and exists (
      select 1 from public.enrollments e
      where e.student_id = public.my_student_id()
        and e.class_id = assessments.class_id
        and e.year_id  = assessments.year_id
    )
  );


-- ============================================================
--  PART 2 — Read the questions inside a readable assessment
-- ============================================================
-- The join rows (which questions are in a test, and their marks) are readable
-- exactly when the parent assessment is readable to the student under Part 1.
drop policy if exists p_aq_student_read on public.assessment_questions;
create policy p_aq_student_read on public.assessment_questions
  for select using (
    exists (
      select 1 from public.assessments a
      where a.id = assessment_questions.assessment_id
        and a.status = 'published'
        and exists (
          select 1 from public.enrollments e
          where e.student_id = public.my_student_id()
            and e.class_id = a.class_id
            and e.year_id  = a.year_id
        )
    )
  );


-- ============================================================
--  PART 3 — Submit my own attempt (insert only, once)
-- ============================================================
-- A student may insert a submission for one of THEIR OWN enrolments, against a
-- PUBLISHED assessment, and only as an ungraded attempt: score / graded_by /
-- graded_at must be null so a student can never self-grade. The unique
-- (enrollment_id, assessment_id) constraint (setup.sql) means this can happen at
-- most once per test; a retry after a successful submit surfaces as a duplicate,
-- which the app treats as "already submitted".
--
-- There is intentionally NO student UPDATE/DELETE policy: an attempt is final
-- from the student's side. Corrections and grading are a staff/teacher action
-- (their existing policies), keeping the marks audit trail intact (rule 3).
drop policy if exists p_subs_student_insert on public.submissions;
create policy p_subs_student_insert on public.submissions
  for insert with check (
    score is null
    and graded_by is null
    and graded_at is null
    and exists (
      select 1 from public.enrollments e
      where e.id = submissions.enrollment_id
        and e.student_id = public.my_student_id()
    )
    and exists (
      select 1 from public.assessments a
      where a.id = submissions.assessment_id
        and a.status = 'published'
    )
  );
