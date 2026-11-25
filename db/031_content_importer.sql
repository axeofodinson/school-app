-- ============================================================
--  031 — CONTENT IMPORTER (prompt 21)
--  DRAFT — NOT YET RUN
-- ============================================================
--  RUN ORDER: after db/017 and db/023 (refuses without 017). Works with or
--  without 018, 028, 029, 030 (dev has them, production may not). Dev first,
--  then production on a day the nightly backup succeeded (like 017).
--
--  Additive + idempotent: IF NOT EXISTS everywhere, policies and functions
--  dropped-then-created. No drops of tables or columns, no data changes.
--
--  WHAT IT ADDS
--  * import_batches: status (importing / done / retired), file name, chapter,
--    topic, question count, test-data flag and who retired it, when and why.
--    learning_content.import_batch_id (a retired batch retires its lessons).
--  * math_svgs: one pre-rendered SVG per distinct TeX expression, bank-wide
--    (DECISIONS #103). Readable by every signed-in user (maths is not secret),
--    written by staff/teachers through the importer, never changed (first
--    render wins). A CHECK refuses scripts, links and embedded documents.
--  * pg_trgm + question_match_text(body) + a trigram index, so duplicate
--    lookups stay fast with thousands of questions per subject.
--  * import_find_matches(subject, texts[]): candidate duplicates for a file.
--  * import_content(chunk): writes one chunk of a planned import (batch,
--    topic, concepts, prerequisites, lessons, maths, up to 500 questions) in
--    one transaction, as the caller, under the 017 policies. Client ids make
--    every retry a no-op. Questions land as status 'draft', version 1.
--  * retire_import_batch(batch, note): retires a whole batch (questions +
--    lessons), reason required. Staff any batch; teachers their own.
--
--  CHECK FIRST on production (read-only, paste on its own). Zero rows is the
--  normal answer; a row means someone made math_svgs by hand: send it to Claude.
--    select table_name from information_schema.tables
--     where table_schema = 'public' and table_name = 'math_svgs';
-- ============================================================


-- ============================================================
--  PART 0 — Preflight
-- ============================================================
do $$
declare missing text;
begin
  if to_regclass('public.import_batches') is null
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'questions'
                       and column_name = 'import_batch_id') then
    raise exception '031 needs db/017 (import_batches, questions.import_batch_id). Run 017 and 023 first.';
  end if;
  if to_regclass('public.math_svgs') is not null then
    select string_agg(c, ', ') into missing
      from unnest(array['key','svg','renderer','created_by','created_at']) c
     where not exists (select 1 from information_schema.columns ic
                        where ic.table_schema = 'public' and ic.table_name = 'math_svgs'
                          and ic.column_name = c);
    if missing is not null then
      raise exception '031 stopped, nothing changed: public.math_svgs already exists but was not made by this file (missing: %). Send this message to Claude before going on.', missing;
    end if;
  end if;
end $$;

-- pg_trgm: Supabase keeps extensions in the `extensions` schema. If it is
-- already installed somewhere else this is a no-op; functions below search
-- both public and extensions.
create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;
-- Supabase already grants this; a local harness (and a self-hosted project)
-- needs it, or `similarity()` is invisible to a signed-in caller.
do $$
declare s text;
begin
  select n.nspname into s from pg_extension e join pg_namespace n on n.oid = e.extnamespace
   where e.extname = 'pg_trgm';
  if s is not null and s <> 'public' then
    execute format('grant usage on schema %I to authenticated, anon, service_role', s);
  end if;
end $$;


-- ============================================================
--  PART 1 — Batches
-- ============================================================
alter table public.import_batches
  add column if not exists status         text not null default 'done',
  add column if not exists file_name      text,
  add column if not exists chapter_id     uuid references public.chapters(id),
  add column if not exists topic_id       uuid references public.topics(id),
  add column if not exists question_count int  not null default 0,
  add column if not exists is_test_data   boolean not null default false,
  add column if not exists retired_at     timestamptz,
  add column if not exists retired_by     uuid references public.profiles(id),
  add column if not exists retire_note    text;
alter table public.import_batches drop constraint if exists import_batches_status_check;
alter table public.import_batches add constraint import_batches_status_check
  check (status in ('importing','done','retired'));
alter table public.import_batches drop constraint if exists import_batches_text_check;
alter table public.import_batches add constraint import_batches_text_check
  check (length(coalesce(file_name, '')) <= 200 and length(coalesce(source_note, '')) <= 500
         and length(coalesce(retire_note, '')) <= 500);
create index if not exists ix_import_batches_created on public.import_batches(created_at desc);
create index if not exists ix_import_batches_owner on public.import_batches(imported_by, created_at desc);

alter table public.learning_content
  add column if not exists import_batch_id uuid references public.import_batches(id);
create index if not exists ix_questions_import_batch
  on public.questions(import_batch_id) where import_batch_id is not null;
create index if not exists ix_lc_import_batch
  on public.learning_content(import_batch_id) where import_batch_id is not null;


-- ============================================================
--  PART 2 — Pre-rendered maths (one row per distinct expression)
-- ============================================================
create table if not exists public.math_svgs (
  key        text primary key,
  svg        text not null,
  renderer   text not null default 'mathjax-3.2.2-svg',
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now()
);
-- The key is the TeX (display maths prefixed "D:"); the SVG is MathJax output:
-- paths only. Anything that can run, link out or embed is refused here as well
-- as in the app (packages/core/src/visuals/svg.ts).
alter table public.math_svgs drop constraint if exists math_svgs_check;
alter table public.math_svgs add constraint math_svgs_check
  check (length(key) between 1 and 510
         and length(svg) <= 61440
         and svg ~ '^<svg[\s>]'
         and svg !~* '<(script|foreignobject|iframe|object|embed|image|a|animate|set|style)[\s>/]'
         and svg !~* '\son[a-z]+\s*='
         and svg !~* '(href|src)\s*='
         and svg !~* 'javascript:|data:|@import'
         and svg !~* 'url\(\s*[''"]?[^#''" ]');
alter table public.math_svgs enable row level security;

drop policy if exists p_math_read on public.math_svgs;
create policy p_math_read on public.math_svgs for select using (auth.uid() is not null);
drop policy if exists p_math_insert on public.math_svgs;
create policy p_math_insert on public.math_svgs for insert
  with check ((public.is_staff() or public.is_teacher()) and created_by = auth.uid());
-- No UPDATE / DELETE policy: a stored rendering never changes under a question.


-- ============================================================
--  PART 3 — Duplicate lookups
-- ============================================================
-- What a question "says", for trigram matching: stem (English, else Urdu, or
-- an older plain-string stem / pre-reader prompt) plus option texts. The app
-- makes the final call with its own normaliser (packages/core importer).
create or replace function public.question_match_text(body jsonb)
returns text language sql immutable parallel safe as $$
  select lower(btrim(regexp_replace(concat_ws(' ',
    case jsonb_typeof(body->'stem')
      when 'string' then body->>'stem'
      when 'object' then coalesce(nullif(btrim(body->'stem'->>'en'), ''), body->'stem'->>'ur')
    end,
    case jsonb_typeof(body->'prompt')
      when 'object' then coalesce(nullif(btrim(body->'prompt'->>'en'), ''), body->'prompt'->>'ur')
    end,
    (select string_agg(
              case jsonb_typeof(o->'text')
                when 'string' then o->>'text'
                when 'object' then coalesce(nullif(btrim(o->'text'->>'en'), ''), o->'text'->>'ur')
              end, ' ')
       from jsonb_array_elements(
              case when jsonb_typeof(body->'options') = 'array' then body->'options'
                   else '[]'::jsonb end) o)
  ), '\s+', ' ', 'g')))
$$;

-- The opclass lives wherever pg_trgm was installed; name it explicitly.
do $$
declare s text;
begin
  select n.nspname into s from pg_extension e join pg_namespace n on n.oid = e.extnamespace
   where e.extname = 'pg_trgm';
  execute format(
    'create index if not exists ix_questions_match_trgm on public.questions '
    'using gin (public.question_match_text(body) %I.gin_trgm_ops) where status <> ''retired''', s);
end $$;

-- Candidate duplicates for an import: for each text (already normalised by the
-- app), up to 3 live questions in the same subject at trigram similarity
-- >= 0.5. Runs as the caller, so RLS decides what can be matched.
drop function if exists public.import_find_matches(uuid, text[]);
create or replace function public.import_find_matches(p_subject uuid, p_texts text[])
returns table (idx int, question_id uuid, body jsonb, status text, similarity real)
language plpgsql volatile security invoker
set search_path = public, extensions, pg_catalog as $$
begin
  if auth.uid() is null or not (public.is_staff() or public.is_teacher()) then
    raise exception 'import_forbidden' using errcode = '42501';
  end if;
  if coalesce(array_length(p_texts, 1), 0) > 2000 then
    raise exception 'import_too_many' using errcode = '22023';
  end if;
  perform set_config('pg_trgm.similarity_threshold', '0.5', true);
  -- pg_trgm's schema is in search_path above; keep the call unqualified so the
  -- function works whether the extension sits in `extensions` or `public`.
  return query
    select (t.ord - 1)::int, m.id, m.body, m.status, m.sim
      from unnest(p_texts) with ordinality as t(txt, ord)
      cross join lateral (
        select q.id, q.body - 'math_svg' - 'audio' - 'visual' as body, q.status,
               similarity(public.question_match_text(q.body), t.txt) as sim
          from public.questions q
          join public.chapters ch on ch.id = q.chapter_id
         where ch.subject_id = p_subject
           and q.status <> 'retired'
           and public.question_match_text(q.body) % t.txt
         order by 4 desc
         limit 3) m
     where length(btrim(t.txt)) > 0;
end $$;


-- ============================================================
--  PART 4 — Write one chunk of an import
-- ============================================================
-- p_chunk = { batch: {id, origin, source_note, file_name, chapter_id, topic_id,
--             is_test_data}, topic: {id, title_en, title_ur, sort_order} | null,
--             concepts: [...], prereqs: [...], lessons: [...], math: [{key, svg}],
--             questions: [...], final: bool, report: {...} }
-- Shapes: packages/core/src/importer/plan.ts (planChunks). SECURITY INVOKER:
-- every row is checked by the 017 policies (a teacher writes only into a
-- subject they teach this year).
drop function if exists public.import_content(jsonb);
create or replace function public.import_content(p_chunk jsonb)
returns jsonb language plpgsql volatile security invoker
set search_path = public, pg_catalog as $$
declare
  uid     uuid := auth.uid();
  b       jsonb := p_chunk->'batch';
  bid     uuid;
  chap    uuid;
  topic   uuid;
  test    boolean;
  origin  text;
  cur     record;
  had     boolean;
  n_q     int := 0;
begin
  if uid is null or not (public.is_staff() or public.is_teacher()) then
    raise exception 'import_forbidden' using errcode = '42501';
  end if;
  if jsonb_typeof(b) <> 'object' then
    raise exception 'import_bad_chunk' using errcode = '22023';
  end if;
  if jsonb_array_length(coalesce(p_chunk->'questions', '[]')) > 500 then
    raise exception 'import_too_many' using errcode = '22023';
  end if;
  bid    := (b->>'id')::uuid;
  chap   := (b->>'chapter_id')::uuid;
  topic  := (b->>'topic_id')::uuid;
  test   := coalesce((b->>'is_test_data')::boolean, false);
  origin := coalesce(b->>'origin', 'human');

  select imported_by, status, topic_id into cur from public.import_batches where id = bid;
  had := found;
  if had then
    if cur.imported_by <> uid then
      raise exception 'import_batch_not_yours' using errcode = '42501';
    end if;
    if cur.status = 'retired' then
      raise exception 'import_batch_retired' using errcode = '22023';
    end if;
    if cur.topic_id is distinct from topic then
      raise exception 'import_bad_chunk' using errcode = '22023';
    end if;
  end if;

  -- Topic (new) or the existing one, which must sit in the chosen chapter.
  if jsonb_typeof(p_chunk->'topic') = 'object' then
    insert into public.topics (id, chapter_id, title_en, title_ur, sort_order)
    values (topic, chap, p_chunk->'topic'->>'title_en', nullif(p_chunk->'topic'->>'title_ur', ''),
            coalesce((p_chunk->'topic'->>'sort_order')::int, 0))
    on conflict (id) do nothing;
  end if;
  if not exists (select 1 from public.topics where id = topic and chapter_id = chap) then
    raise exception 'import_topic_mismatch' using errcode = '22023';
  end if;

  if not had then
    insert into public.import_batches
      (id, imported_by, origin, source_note, file_name, chapter_id, topic_id, status, is_test_data)
    values (bid, uid, origin, nullif(b->>'source_note', ''), nullif(b->>'file_name', ''),
            chap, topic, 'importing', test)
    on conflict (id) do nothing;
    -- Someone else's batch with this id (never by chance: ids are random).
    if not exists (select 1 from public.import_batches where id = bid and imported_by = uid) then
      raise exception 'import_batch_not_yours' using errcode = '42501';
    end if;
  end if;

  insert into public.concepts (id, topic_id, title_en, title_ur, sort_order)
  select x.id, topic, x.title_en, nullif(x.title_ur, ''), coalesce(x.sort_order, 0)
    from jsonb_to_recordset(coalesce(p_chunk->'concepts', '[]'))
         as x(id uuid, title_en text, title_ur text, sort_order int)
  on conflict (id) do nothing;

  insert into public.concept_prerequisites (concept_id, requires_concept_id)
  select x.concept_id, x.requires_concept_id
    from jsonb_to_recordset(coalesce(p_chunk->'prereqs', '[]'))
         as x(concept_id uuid, requires_concept_id uuid)
  on conflict do nothing;

  insert into public.math_svgs (key, svg, created_by)
  select x.key, x.svg, uid
    from jsonb_to_recordset(coalesce(p_chunk->'math', '[]')) as x(key text, svg text)
  on conflict (key) do nothing;

  -- Every question must hang on a concept of this topic.
  if exists (select 1 from jsonb_to_recordset(coalesce(p_chunk->'questions', '[]')) as x(concept_id uuid)
              where not exists (select 1 from public.concepts c
                                 where c.id = x.concept_id and c.topic_id = topic)) then
    raise exception 'import_concept_mismatch' using errcode = '22023';
  end if;

  insert into public.learning_content
    (id, topic_id, concept_id, kind, status, origin, created_by, is_test_data, import_batch_id)
  select x.id, topic, x.concept_id, x.kind, 'draft', origin, uid, test, bid
    from jsonb_to_recordset(coalesce(p_chunk->'lessons', '[]'))
         as x(id uuid, kind text, concept_id uuid)
  on conflict (id) do nothing;
  insert into public.learning_content_versions (content_id, version, blocks, created_by)
  select x.id, 1, x.blocks, uid
    from jsonb_to_recordset(coalesce(p_chunk->'lessons', '[]')) as x(id uuid, blocks jsonb)
  on conflict (content_id, version) do nothing;

  insert into public.questions
    (id, chapter_id, concept_id, type, cognitive_level, difficulty, default_marks, body, answer,
     explanation, source, language_complete, status, origin, created_by, is_test_data,
     import_batch_id)
  select x.id, chap, x.concept_id, x.type, x.cognitive_level, x.difficulty,
         coalesce(x.default_marks, 1), x.body, x.answer, x.explanation, x.source,
         coalesce(x.language_complete, false), 'draft', origin, uid, test, bid
    from jsonb_to_recordset(coalesce(p_chunk->'questions', '[]'))
         as x(id uuid, concept_id uuid, type text, cognitive_level text, difficulty smallint,
              default_marks int, body jsonb, answer jsonb, explanation jsonb, source jsonb,
              language_complete boolean)
  on conflict (id) do nothing;
  get diagnostics n_q = row_count;

  if coalesce((p_chunk->>'final')::boolean, false) then
    update public.import_batches
       set status = 'done',
           report = p_chunk->'report',
           question_count = (select count(*) from public.questions where import_batch_id = bid)
     where id = bid and status = 'importing';
  end if;

  return jsonb_build_object('batch', bid, 'inserted', n_q,
    'status', (select status from public.import_batches where id = bid));
end $$;


-- ============================================================
--  PART 5 — Retire a whole batch
-- ============================================================
-- Retiring keeps every row (CLAUDE.md rule 3): the batch's questions and
-- lessons get status 'retired', so nothing new draws them; papers that already
-- used a question keep their exact version. Topics/concepts the batch made stay
-- (they are curriculum, edited in /curriculum).
drop function if exists public.retire_import_batch(uuid, text);
create or replace function public.retire_import_batch(p_batch uuid, p_note text)
returns jsonb language plpgsql volatile security definer
set search_path = public, pg_catalog as $$
declare
  uid  uuid := auth.uid();
  bt   public.import_batches%rowtype;
  n_q  int := 0;
  n_l  int := 0;
begin
  if uid is null then
    raise exception 'import_forbidden' using errcode = '42501';
  end if;
  select * into bt from public.import_batches where id = p_batch for update;
  if not found then
    raise exception 'import_batch_not_found' using errcode = '22023';
  end if;
  if not (public.is_staff() or (public.is_teacher() and bt.imported_by = uid)) then
    raise exception 'import_forbidden' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_note, ''))) < 3 then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  if bt.status = 'retired' then
    return jsonb_build_object('batch', p_batch, 'questions', 0, 'lessons', 0, 'already', true);
  end if;

  update public.questions set status = 'retired'
   where import_batch_id = p_batch and status <> 'retired';
  get diagnostics n_q = row_count;
  update public.learning_content set status = 'retired', updated_at = now()
   where import_batch_id = p_batch and status <> 'retired';
  get diagnostics n_l = row_count;
  update public.import_batches
     set status = 'retired', retired_at = now(), retired_by = uid,
         retire_note = left(btrim(p_note), 500)
   where id = p_batch;
  return jsonb_build_object('batch', p_batch, 'questions', n_q, 'lessons', n_l, 'already', false);
end $$;


-- ============================================================
--  PART 6 — Grants
-- ============================================================
revoke all on function public.import_find_matches(uuid, text[]) from public, anon;
revoke all on function public.import_content(jsonb) from public, anon;
revoke all on function public.retire_import_batch(uuid, text) from public, anon;
grant execute on function public.import_find_matches(uuid, text[]) to authenticated;
grant execute on function public.import_content(jsonb) to authenticated;
grant execute on function public.retire_import_batch(uuid, text) to authenticated;
grant execute on function public.question_match_text(jsonb) to authenticated;
