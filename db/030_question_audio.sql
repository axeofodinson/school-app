-- ============================================================
--  030 — QUESTION AUDIO BUCKET (prompt 16, pre-reader read-aloud)
--  DRAFT — NOT YET RUN
-- ============================================================
--  Additive + idempotent. Independent of 017 / 018 / 023 / 028 / 029: safe on
--  dev (with 018) and on production (without it), in any order after 014.
--
--  A private Storage bucket for pre-made read-aloud clips (ElevenLabs or
--  recorded). questions.body.audio = { en?: path, ur?: path } points here
--  (DATABASE_DESIGN §4). Paths are "{question_id}/{fingerprint}.{locale}.mp3"
--  (packages/core/src/prereaderAudio.ts), so the question that owns a clip is
--  split_part(name, '/', 1).
--
--  Clips are written by scripts/audio/generate-prereader-audio.mjs with the
--  service role (bypasses RLS) or by staff. Nobody else writes.
--  Read access mirrors who can see the question:
--    * staff (admin / developer): everything.
--    * teachers: read every clip (they review question audio before approval;
--      the clip is only the spoken prompt, never the answer).
--    * students: only clips of questions on a PUBLISHED assessment of
--      a class + year they are actively enrolled in — the same gate as the
--      paper itself, so a clip can't leak a test's prompts before it opens.
--  Signed URLs can only be minted by someone a select policy allows.
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('question-audio', 'question-audio', false, 204800,
        array['audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/opus', 'audio/webm'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists p_qaudio_staff on storage.objects;
create policy p_qaudio_staff on storage.objects
  for all
  using (bucket_id = 'question-audio' and public.is_staff())
  with check (bucket_id = 'question-audio' and public.is_staff());

drop policy if exists p_qaudio_teacher_read on storage.objects;
create policy p_qaudio_teacher_read on storage.objects
  for select
  using (bucket_id = 'question-audio' and public.is_teacher());

-- Text comparison (no ::uuid cast) so a stray object name can never make the
-- policy raise for every row of a listing.
drop policy if exists p_qaudio_student_read on storage.objects;
create policy p_qaudio_student_read on storage.objects
  for select
  using (
    bucket_id = 'question-audio' and exists (
      select 1
      from public.assessment_questions aq
      join public.assessments a  on a.id = aq.assessment_id
      join public.enrollments e  on e.class_id = a.class_id and e.year_id = a.year_id
      where aq.question_id::text = split_part(objects.name, '/', 1)
        and a.status = 'published'
        and e.status = 'active'
        and e.student_id = public.my_student_id()
    )
  );
