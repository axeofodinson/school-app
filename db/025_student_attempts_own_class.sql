-- ============================================================
--  025 — Student attempts: only for my own class (closes a db/005 gap)
--
--  DRAFT — NOT YET RUN. Additive and idempotent (each policy is dropped, then
--  recreated; no table or data changes). Safe on a live database. Run once in
--  the Supabase SQL Editor after 024. Smoke: db/test/025_smoke.sql (TEST_PLAN AT-1).
--
--  WHY
--  ---
--  db/005's p_subs_student_insert checks that the enrollment is the student's
--  own and that the assessment is published (and readable to them), but never
--  ties the two together. A student can read the assessments of EVERY class they
--  were ever enrolled in, so a promoted student could file this year's
--  enrollment against last year's class's test (a wrong-class row in this
--  year's marks), and a struck-off/withdrawn enrollment could still submit.
--  RLS is the security boundary (CLAUDE.md rule 4); the app's filtering is not.
--
--  WHAT
--  ----
--  1. Insert: the assessment must be published AND for the same class + year as
--     the enrollment, and the enrollment must be active (a struck-off or
--     withdrawn enrollment can't take new tests; db/009 statuses). Score and
--     graded_* must still be null (no self-grading). Unique (enrollment_id,
--     assessment_id) still allows one row per test; the app sends a client UUID
--     as the id, so a retried send comes back as a duplicate, never a second row.
--  2. Read: a student may also read CLOSED assessments of their class (not
--     drafts), so the results list can name a test after the teacher closes it.
--     Its questions stay hidden (p_aq_student_read still requires published).
-- ============================================================

drop policy if exists p_subs_student_insert on public.submissions;
create policy p_subs_student_insert on public.submissions
  for insert with check (
    score is null
    and graded_by is null
    and graded_at is null
    and exists (
      select 1
      from public.enrollments e
      join public.assessments a
        on a.id = submissions.assessment_id
       and a.class_id = e.class_id
       and a.year_id  = e.year_id
      where e.id = submissions.enrollment_id
        and e.student_id = public.my_student_id()
        and e.status = 'active'
        and a.status = 'published'
    )
  );

drop policy if exists p_assess_student_read on public.assessments;
create policy p_assess_student_read on public.assessments
  for select using (
    status in ('published', 'closed') and exists (
      select 1 from public.enrollments e
      where e.student_id = public.my_student_id()
        and e.class_id = assessments.class_id
        and e.year_id  = assessments.year_id
    )
  );
