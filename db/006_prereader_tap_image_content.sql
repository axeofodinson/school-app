-- ============================================================
--  006 — PRE-READER tap_image CONTENT (additive, content-only)
-- ============================================================
--  No schema changes. This migration only upgrades/INSERTs question DATA for
--  the pre-reader (PG–2) experience — content is data, not code (rule 1) —
--  and publishes one small PG quiz so the flow is checkable end to end.
--
--  The tap_image body shape it writes (defined in src/prereader/tapImage.js):
--    body.prompt        {en, ur}  — human-written, casual, kid register
--    body.prompt_audio  {en, ur}  — optional recorded audio (URL or a path in
--                                   the `question-media` storage bucket); the
--                                   app falls back to on-device TTS of the
--                                   prompt when absent, so none is seeded
--    body.choices[]     {id, emoji, count?, label{en,ur}} — emoji render
--                                   offline with no asset pipeline; `image`
--                                   URLs are also supported by the app
--    body.seed          a stable key so this migration is idempotent
--    answer.correct     the winning choice id (students never fetch answer)
--
--  Every question carries a cognitive_level (rule 6).
--
--  Safe to run once, after 001–005, on a database with real data: every
--  statement is guarded (update-by-legacy-shape / insert-if-absent).

-- ------------------------------------------------------------
-- 1. Upgrade the setup.sql starter tap_image question from its legacy
--    single-language body (prompt_text + image paths that were never
--    uploaded) to the bilingual emoji shape. Matched by its exact legacy
--    prompt so a re-run (or an already-edited question) is untouched.
-- ------------------------------------------------------------
update public.questions
set
  body = '{
    "seed": "pg_more_apples",
    "prompt": {
      "en": "Tap the box with MORE apples",
      "ur": "جس ڈبے میں زیادہ سیب ہیں اُس پر ہاتھ لگاؤ"
    },
    "choices": [
      { "id": "a", "emoji": "🍎", "count": 2, "label": { "en": "2 apples", "ur": "2 سیب" } },
      { "id": "b", "emoji": "🍎", "count": 5, "label": { "en": "5 apples", "ur": "5 سیب" } }
    ]
  }'::jsonb,
  answer = '{ "correct": "b" }'::jsonb
where type = 'tap_image'
  and body->>'prompt_text' = 'Tap the box with MORE apples';

-- ------------------------------------------------------------
-- 2. A second PG chapter for the non-counting questions.
-- ------------------------------------------------------------
insert into public.chapters (subject_id, title, sort_order)
select s.id, 'Colours, Shapes & Sounds', 1
from public.subjects s
where s.name = 'Early Numeracy'
  and not exists (
    select 1 from public.chapters ch
    where ch.subject_id = s.id and ch.title = 'Colours, Shapes & Sounds');

-- ------------------------------------------------------------
-- 3. Five more pre-reader questions (all guarded by body.seed).
-- ------------------------------------------------------------

-- Counting & Grouping ----------------------------------------

-- Number recognition by counting groups: hear "three", find the group of 3.
insert into public.questions (chapter_id, type, cognitive_level, body, answer, default_marks)
select ch.id, 'tap_image', 'apply',
  '{
    "seed": "pg_count_ducks",
    "prompt": {
      "en": "Where are THREE ducks? Tap them!",
      "ur": "تین بطخیں کہاں ہیں؟ اُن پر ہاتھ لگاؤ!"
    },
    "choices": [
      { "id": "a", "emoji": "🦆", "count": 1, "label": { "en": "1 duck", "ur": "1 بطخ" } },
      { "id": "b", "emoji": "🦆", "count": 3, "label": { "en": "3 ducks", "ur": "3 بطخیں" } },
      { "id": "c", "emoji": "🦆", "count": 5, "label": { "en": "5 ducks", "ur": "5 بطخیں" } }
    ]
  }'::jsonb,
  '{ "correct": "b" }'::jsonb, 1
from public.chapters ch
join public.subjects s on s.id = ch.subject_id
where s.name = 'Early Numeracy' and ch.title = 'Counting & Grouping'
  and not exists (select 1 from public.questions q where q.body->>'seed' = 'pg_count_ducks');

-- Size comparison.
insert into public.questions (chapter_id, type, cognitive_level, body, answer, default_marks)
select ch.id, 'tap_image', 'understand',
  '{
    "seed": "pg_biggest_animal",
    "prompt": {
      "en": "Tap the BIGGEST animal",
      "ur": "سب سے بڑے جانور پر ہاتھ لگاؤ"
    },
    "choices": [
      { "id": "a", "emoji": "🐭", "label": { "en": "Mouse", "ur": "چوہا" } },
      { "id": "b", "emoji": "🐕", "label": { "en": "Dog", "ur": "کتا" } },
      { "id": "c", "emoji": "🐘", "label": { "en": "Elephant", "ur": "ہاتھی" } }
    ]
  }'::jsonb,
  '{ "correct": "c" }'::jsonb, 1
from public.chapters ch
join public.subjects s on s.id = ch.subject_id
where s.name = 'Early Numeracy' and ch.title = 'Counting & Grouping'
  and not exists (select 1 from public.questions q where q.body->>'seed' = 'pg_biggest_animal');

-- Colours, Shapes & Sounds -----------------------------------

-- Colour recognition.
insert into public.questions (chapter_id, type, cognitive_level, body, answer, default_marks)
select ch.id, 'tap_image', 'recall',
  '{
    "seed": "pg_find_red",
    "prompt": {
      "en": "Tap the RED one",
      "ur": "جو چیز لال ہے اُس پر ہاتھ لگاؤ"
    },
    "choices": [
      { "id": "a", "emoji": "🍌", "label": { "en": "Banana", "ur": "کیلا" } },
      { "id": "b", "emoji": "🍎", "label": { "en": "Apple", "ur": "سیب" } },
      { "id": "c", "emoji": "🍃", "label": { "en": "Leaf", "ur": "پتّا" } }
    ]
  }'::jsonb,
  '{ "correct": "b" }'::jsonb, 1
from public.chapters ch
join public.subjects s on s.id = ch.subject_id
where s.name = 'Early Numeracy' and ch.title = 'Colours, Shapes & Sounds'
  and not exists (select 1 from public.questions q where q.body->>'seed' = 'pg_find_red');

-- Shape recognition.
insert into public.questions (chapter_id, type, cognitive_level, body, answer, default_marks)
select ch.id, 'tap_image', 'recall',
  '{
    "seed": "pg_find_circle",
    "prompt": {
      "en": "Tap the circle",
      "ur": "گول شکل پر ہاتھ لگاؤ"
    },
    "choices": [
      { "id": "a", "emoji": "🔺", "label": { "en": "Triangle", "ur": "تکون" } },
      { "id": "b", "emoji": "🟥", "label": { "en": "Square", "ur": "چوکور" } },
      { "id": "c", "emoji": "🔵", "label": { "en": "Circle", "ur": "گول" } }
    ]
  }'::jsonb,
  '{ "correct": "c" }'::jsonb, 1
from public.chapters ch
join public.subjects s on s.id = ch.subject_id
where s.name = 'Early Numeracy' and ch.title = 'Colours, Shapes & Sounds'
  and not exists (select 1 from public.questions q where q.body->>'seed' = 'pg_find_circle');

-- Animal sounds — the audio-first question (the prompt IS the sound cue).
insert into public.questions (chapter_id, type, cognitive_level, body, answer, default_marks)
select ch.id, 'tap_image', 'understand',
  '{
    "seed": "pg_who_meows",
    "prompt": {
      "en": "Who says meow? Tap them!",
      "ur": "میاؤں میاؤں کون کرتا ہے؟ اُس پر ہاتھ لگاؤ!"
    },
    "choices": [
      { "id": "a", "emoji": "🐄", "label": { "en": "Cow", "ur": "گائے" } },
      { "id": "b", "emoji": "🐈", "label": { "en": "Cat", "ur": "بلّی" } },
      { "id": "c", "emoji": "🐕", "label": { "en": "Dog", "ur": "کتا" } }
    ]
  }'::jsonb,
  '{ "correct": "b" }'::jsonb, 1
from public.chapters ch
join public.subjects s on s.id = ch.subject_id
where s.name = 'Early Numeracy' and ch.title = 'Colours, Shapes & Sounds'
  and not exists (select 1 from public.questions q where q.body->>'seed' = 'pg_who_meows');

-- ------------------------------------------------------------
-- 4. One published PG quiz holding all six, so a logged-in PG student
--    (db/004 login + an active enrolment) sees it immediately.
--    weightage 0: a fun first quiz that doesn't move the annual aggregate.
-- ------------------------------------------------------------
insert into public.assessments
  (year_id, class_id, subject_id, title, type, weightage, total_marks, status)
select y.id, c.id, s.id, 'Tap & Learn 1', 'quiz', 0, 6, 'published'
from public.academic_years y
cross join public.classes c
join public.subjects s on s.class_id = c.id and s.name = 'Early Numeracy'
where y.is_current and c.name = 'PG'
  and not exists (
    select 1 from public.assessments a
    where a.title = 'Tap & Learn 1' and a.class_id = c.id and a.year_id = y.id);

insert into public.assessment_questions (assessment_id, question_id, marks, sort_order)
select a.id, q.id, 1, ord.sort_order
from public.assessments a
join public.classes c on c.id = a.class_id and c.name = 'PG'
cross join (values
  ('pg_more_apples',    0),
  ('pg_count_ducks',    1),
  ('pg_biggest_animal', 2),
  ('pg_find_red',       3),
  ('pg_find_circle',    4),
  ('pg_who_meows',      5)
) as ord(seed, sort_order)
join public.questions q on q.body->>'seed' = ord.seed
where a.title = 'Tap & Learn 1'
on conflict (assessment_id, question_id) do nothing;
