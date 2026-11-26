-- ============================================================
--  036 — OFFLINE LEARN PACKS (prompt 32)
--  DRAFT — NOT YET RUN
-- ============================================================
--  RUN ORDER: after db/017 + db/023 (+ 031/032/033 when present: the pack
--  then follows their rules too). Refuses without 017's learn tables.
--  Dev first; production like 017, on a day the nightly backup succeeded.
--
--  Additive + idempotent: one function, dropped then created. No table, no
--  row changes.
--
--  WHAT IT ADDS (ARCHITECTURE §5, DECISIONS #156)
--  * learn_pack(chapter, have): everything a learner needs to use one chapter
--    without internet, in one request: the chapter, its active topics and
--    concepts, each approved lesson / alternative at its live `learn`
--    approval, and the practice items at the newest version this learner may
--    read. SECURITY INVOKER: it runs as the caller, so RLS decides exactly as
--    the online reader and practice screens do (a student gets only approved
--    versions; exam-only items never; a prep learner only what their tier
--    reads). Nothing here widens access.
--  * Delta: `have` maps "l:<content id>" / "q:<question id>" to the version
--    the device already holds. An entry at that same version comes back with
--    its version only (no blocks / body), so a refresh downloads only what
--    changed. Versions are immutable (017 triggers), so (id, version) is a
--    safe cache key. The full id + version list always comes back, so the
--    device also learns what was withdrawn.
--  * Maths SVGs are fetched by the client afterwards (it parses the keys).
-- ============================================================

do $$
begin
  if to_regclass('public.learning_content_versions') is null
     or to_regclass('public.question_versions') is null then
    raise exception '036 needs db/017 (learn content + question bank). Run 017 first.';
  end if;
end $$;

drop function if exists public.learn_pack(uuid, jsonb);
create or replace function public.learn_pack(p_chapter uuid, p_have jsonb default '{}'::jsonb)
returns jsonb language sql stable security invoker set search_path = public as $$
  with ch as (
    select c.id, c.title, c.title_ur, c.sort_order, s.id as subject_id, s.name as subject_name,
           cl.name as class_name
      from public.chapters c
      left join public.subjects s on s.id = c.subject_id
      left join public.classes cl on cl.id = s.class_id
     where c.id = p_chapter
  ), tp as (
    select t.id, t.title_en, t.title_ur, t.sort_order
      from public.topics t
     where t.chapter_id = p_chapter and t.status = 'active'
  ), co as (
    select k.id, k.topic_id, k.title_en, k.title_ur, k.sort_order
      from public.concepts k join tp on tp.id = k.topic_id
     where k.status = 'active'
  ), ls as (
    select lc.id, lc.topic_id, lc.kind, lc.concept_id, lc.updated_at, a.version
      from public.learning_content lc
      join tp on tp.id = lc.topic_id
      join public.item_approvals a
        on a.item_kind = 'content' and a.item_id = lc.id and a.scope = 'learn' and a.revoked_at is null
     where lc.status = 'approved'
  ), lv as (
    select ls.*, v.blocks
      from ls join public.learning_content_versions v
        on v.content_id = ls.id and v.version = ls.version
  ), qv as (
    select distinct on (v.question_id)
           v.question_id, v.version, v.type, v.difficulty, v.concept_id,
           v.body, v.answer, v.explanation
      from public.question_versions v join co on co.id = v.concept_id
     where v.type in ('mcq', 'true_false', 'numeric', 'short_text')
     order by v.question_id, v.version desc
  )
  select case when not exists (select 1 from ch) then null else jsonb_build_object(
    'chapter', (select jsonb_build_object(
                  'id', id, 'title', title, 'title_ur', title_ur, 'sort_order', sort_order,
                  'subject_id', subject_id, 'subject_name', subject_name, 'class_name', class_name)
                  from ch),
    'built_at', now(),
    'topics', coalesce((select jsonb_agg(jsonb_build_object(
                  'id', id, 'title_en', title_en, 'title_ur', title_ur, 'sort_order', sort_order)
                  order by sort_order, title_en) from tp), '[]'::jsonb),
    'concepts', coalesce((select jsonb_agg(jsonb_build_object(
                  'id', id, 'topic_id', topic_id, 'title_en', title_en, 'title_ur', title_ur,
                  'sort_order', sort_order) order by topic_id, sort_order) from co), '[]'::jsonb),
    'lessons', coalesce((select jsonb_agg(jsonb_build_object(
                  'id', id, 'topic_id', topic_id, 'kind', kind, 'concept_id', concept_id,
                  'version', version, 'updated_at', updated_at,
                  'blocks', case when (p_have->>('l:' || id::text)) = version::text then null else blocks end)
                  order by topic_id, kind, id) from lv), '[]'::jsonb),
    'questions', coalesce((select jsonb_agg(
                  jsonb_build_object('id', question_id, 'version', version, 'type', type,
                                     'difficulty', difficulty, 'concept_id', concept_id)
                  || case when (p_have->>('q:' || question_id::text)) = version::text then '{}'::jsonb
                          else jsonb_build_object('body', body, 'answer', answer, 'explanation', explanation) end
                  order by question_id) from qv), '[]'::jsonb)
  ) end
$$;
revoke all on function public.learn_pack(uuid, jsonb) from public, anon;
grant execute on function public.learn_pack(uuid, jsonb) to authenticated;
