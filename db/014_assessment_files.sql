-- ============================================================
--  014 — File-upload assessments (image / markdown / document worksheets)
--
--  Additive migration. SAFE to run on a live database (no data drops) and
--  idempotent (guarded table/column/bucket changes; every policy is dropped
--  first). Run once in the Supabase SQL Editor after 013.
--
--  WHY THIS EXISTS
--  ---------------
--  Assessments are structured content-as-data (questions pulled from the bank).
--  Some things don't fit that shape — a scanned worksheet, a diagram, a written
--  prompt. This adds a 'file' assessment TYPE (not a parallel table — rule 1/2 fit
--  the existing assessments row) plus a place to point at the stored file, and a
--  private Storage bucket whose access is RLS-scoped by class enrolment, matching
--  how every other role-scoped read works (rule 4).
--
--  The file itself lives in Storage; the assessment row carries file_path /
--  file_name / file_mime. Students in the class see it exactly like any other
--  PUBLISHED assessment (p_assess_student_read from db/005 already covers it);
--  the storage policy below is what stops a student in another class from
--  fetching the file URL.
-- ============================================================


-- ============================================================
--  PART 1 — 'file' assessment type + where the file lives
-- ============================================================
-- Extend the type check to allow 'file'. The constraint is Postgres's
-- auto-generated single-column name (assessments_type_check); dropping it if
-- present and re-adding keeps this idempotent.
alter table public.assessments drop constraint if exists assessments_type_check;
alter table public.assessments
  add constraint assessments_type_check
  check (type in ('assignment','test','exam','quiz','file'));

alter table public.assessments
  add column if not exists file_path text,
  add column if not exists file_name text,
  add column if not exists file_mime text;


-- ============================================================
--  PART 2 — Private Storage bucket for the files
-- ============================================================
-- Private (public = false): access is only ever granted through the RLS policies
-- below, so a signed URL can only be minted by someone the policy allows.
insert into storage.buckets (id, name, public)
values ('assessment-files', 'assessment-files', false)
on conflict (id) do nothing;


-- ============================================================
--  PART 3 — Storage RLS, scoped by class enrolment
-- ============================================================
-- Path convention: "{assessment_id}/{uuid}.{ext}", so the assessment that owns an
-- object is split_part(name,'/',1). Access mirrors the assessment's own scoping:
--   * staff: everything.
--   * teacher: files of assessments for a class they teach (read + write).
--   * student: read-only, and only when they're actively enrolled in that
--     assessment's class+year AND the assessment is published — the same gate as
--     seeing the assessment at all. A student in another class can't mint a URL.
drop policy if exists p_afiles_staff on storage.objects;
create policy p_afiles_staff on storage.objects
  for all
  using (bucket_id = 'assessment-files' and public.is_staff())
  with check (bucket_id = 'assessment-files' and public.is_staff());

drop policy if exists p_afiles_teacher on storage.objects;
create policy p_afiles_teacher on storage.objects
  for all
  using (
    bucket_id = 'assessment-files' and public.is_teacher() and exists (
      select 1 from public.assessments a
      where a.id = split_part(objects.name, '/', 1)::uuid
        and public.teaches_class(a.class_id)
    )
  )
  with check (
    bucket_id = 'assessment-files' and public.is_teacher() and exists (
      select 1 from public.assessments a
      where a.id = split_part(objects.name, '/', 1)::uuid
        and public.teaches_class(a.class_id)
    )
  );

drop policy if exists p_afiles_student_read on storage.objects;
create policy p_afiles_student_read on storage.objects
  for select
  using (
    bucket_id = 'assessment-files' and exists (
      select 1
      from public.assessments a
      join public.enrollments e
        on e.class_id = a.class_id and e.year_id = a.year_id
      where a.id = split_part(objects.name, '/', 1)::uuid
        and a.status = 'published'
        and e.status = 'active'
        and e.student_id = public.my_student_id()
    )
  );
