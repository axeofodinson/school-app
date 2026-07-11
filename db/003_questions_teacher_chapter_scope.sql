-- ============================================================
--  003 — Scope teacher question-authoring to their own classes
--
--  Additive migration. SAFE to run on a live database (no drops of data,
--  no data loss) and idempotent (safe to run more than once).
--
--  setup.sql lets ANY teacher insert into `questions`
--  (p_questions_teacher_write: `is_teacher() or is_staff()`), with no link
--  back to what that teacher actually teaches. The teacher authoring screen
--  only ever offers chapters inside a teacher's assigned classes, but the UI
--  is not the security boundary (CLAUDE.md rule 4) — a teacher hitting the
--  API directly could still write a question into a class they don't teach.
--
--  This ties the write policy to teacher_assignments via the chapter's class:
--
--    * a helper `teaches_chapter(chapter_id)` that walks chapter -> subject
--      -> class and reuses `teaches_class` (which checks teacher_assignments);
--    * INSERT is allowed only for staff, or a teacher who teaches the class
--      the chapter belongs to;
--    * UPDATE still requires ownership (created_by = auth.uid()) AND that the
--      teacher still teaches the chapter's class, so a question can't be moved
--      into a class they don't teach.
--
--  Staff (developer/admin) keep full access through p_questions_staff_all.
--
--  Run it once in the Supabase SQL Editor after setup.sql.
-- ============================================================

-- True when the current user teaches the class that owns the given chapter.
-- security definer so the chapter/subject lookup isn't itself blocked by RLS;
-- it only exposes a boolean, never rows.
create or replace function public.teaches_chapter(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.chapters ch
    join public.subjects s on s.id = ch.subject_id
    where ch.id = cid and public.teaches_class(s.class_id)
  )
$$;

-- Tighten INSERT: a teacher may only author into a chapter of a class they teach.
drop policy if exists p_questions_teacher_write on public.questions;
create policy p_questions_teacher_write on public.questions
  for insert with check (
    public.is_staff()
    or (public.is_teacher() and public.teaches_chapter(chapter_id))
  );

-- Tighten UPDATE: still owner-scoped, and the resulting row must stay inside a
-- class the teacher teaches (blocks re-homing a question into a foreign class).
drop policy if exists p_questions_owner_update on public.questions;
create policy p_questions_owner_update on public.questions
  for update using (created_by = auth.uid() or public.is_staff())
  with check (
    public.is_staff()
    or (created_by = auth.uid() and public.teaches_chapter(chapter_id))
  );
