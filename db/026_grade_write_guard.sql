-- ============================================================
--  026 — Grades change only through record_grade() (closes a setup.sql gap)
--
--  DRAFT — NOT YET RUN. Additive and idempotent (function is CREATE OR REPLACE,
--  the trigger is dropped then recreated; no table or data changes). Safe on a
--  live database. Run once in the Supabase SQL Editor after 013 (any time after
--  025 is fine; no 017 needed). Smoke: db/test/026_smoke.sql (TEST_PLAN GR-1).
--
--  WHY
--  ---
--  db/013 made record_grade() the audited write path for marks: every change
--  lands in submission_grade_edits with the old value, the new value and a
--  required reason. But setup.sql's p_subs_staff and p_subs_teacher policies are
--  FOR ALL, so a teacher (or an admin) can still
--      update submissions set score = 3 where …     -- no history, no reason
--      delete from submissions where …             -- the grade and the raw
--                                                   -- responses are gone
--  straight from the browser console with their own session. CLAUDE.md rule 3:
--  record_grade() is the only grade write path, raw responses are kept, and
--  nothing with marks is hard-deleted. RLS can't express "only via this
--  function", so a trigger does.
--
--  WHAT
--  ----
--  A BEFORE INSERT/UPDATE/DELETE trigger on submissions that applies only when
--  the statement runs as a client role (authenticated / anon, i.e. PostgREST
--  with a user's JWT):
--    * INSERT may not carry a score, graded_by, graded_at or edit counters
--      (students already can't; this stops a teacher inserting a graded row).
--    * UPDATE may not change score, graded_by, graded_at, edit_count,
--      last_edited_at, responses, submitted_at, enrollment_id or assessment_id.
--    * DELETE is refused.
--  record_grade() is SECURITY DEFINER, so inside it current_user is the
--  function owner (postgres), not 'authenticated': it keeps working unchanged.
--  So do the SQL Editor, the service role, db/011's developer hard-delete and
--  the 017 exam RPCs (all definer or server-side). Nothing in the old app or the
--  new app writes those columns directly (old: insert of an ungraded attempt
--  only; new: features/attempts insert + features/grading → record_grade()).
--  Side effect, intended: deleting an assessment or enrollment that already has
--  submissions, from a client, now fails instead of cascading the marks away.
--
--  Errors (stable, mapped to i18n by the app):
--    grade_write_via_record_grade / submission_delete_forbidden
-- ============================================================

create or replace function public.submissions_grade_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Definer functions (record_grade, 011, 017), the SQL Editor and the service
  -- role are trusted; only end-user sessions are guarded.
  if current_user not in ('authenticated', 'anon') then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    raise exception 'submission_delete_forbidden'
      using errcode = '42501',
            hint = 'Submissions keep grades and raw responses; they are never deleted from the app.';
  end if;

  if tg_op = 'INSERT' then
    if new.score is not null or new.graded_by is not null or new.graded_at is not null
       or coalesce(new.edit_count, 0) <> 0 or new.last_edited_at is not null then
      raise exception 'grade_write_via_record_grade'
        using errcode = '42501', hint = 'Use record_grade() to enter a grade.';
    end if;
    return new;
  end if;

  -- UPDATE
  if new.score          is distinct from old.score
     or new.graded_by      is distinct from old.graded_by
     or new.graded_at      is distinct from old.graded_at
     or new.edit_count     is distinct from old.edit_count
     or new.last_edited_at is distinct from old.last_edited_at
     or new.responses      is distinct from old.responses
     or new.submitted_at   is distinct from old.submitted_at
     or new.enrollment_id  is distinct from old.enrollment_id
     or new.assessment_id  is distinct from old.assessment_id then
    raise exception 'grade_write_via_record_grade'
      using errcode = '42501', hint = 'Use record_grade() to enter or correct a grade.';
  end if;
  return new;
end $$;

drop trigger if exists trg_submissions_grade_guard on public.submissions;
create trigger trg_submissions_grade_guard
  before insert or update or delete on public.submissions
  for each row execute function public.submissions_grade_guard();
