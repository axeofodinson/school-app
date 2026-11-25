-- ============================================================
--  032 — TEACHER REVIEW QUEUE (prompt 22)
--  DRAFT — NOT YET RUN
-- ============================================================
--  RUN ORDER: after db/017 and db/023 (refuses without 017); after db/031 on
--  a project that has it. Works with or without 018, 028, 029, 030. Dev first,
--  then production on a day the nightly backup succeeded (like 017).
--
--  Additive + idempotent: functions and triggers are dropped-then-created,
--  policies dropped-then-created. No table or column is dropped and no row is
--  deleted. The only data it may change is revoking approvals that already
--  point at an old version or a retired question (Part 3, a no-op on a fresh
--  017).
--
--  WHAT IT CHANGES
--  * Approvals and the review log are written ONLY by the review RPCs below
--    (017 let any teacher insert an approval for any question). A teacher can
--    approve, edit, send back or reject only questions whose concept sits in a
--    subject they teach this year (teaches_concept); staff any question.
--  * An approval can only ever be revoked, once (a trigger refuses any other
--    change and every delete). Reviews stay insert-only.
--  * Editing a question (any path: review edit, question bank, SQL) makes a new
--    version; the old version's approvals are revoked at once, an approved
--    question goes back to 'draft' and an AI draft becomes 'ai_edited'. So
--    students never see an edit nobody approved (they read a version only while
--    it holds a live practice/worksheet approval: 017's p_qv_student_read).
--  * Retiring a question (reject, or retire_import_batch from 031) revokes its
--    approvals too.
--  * is_approved('question', …) only counts an approval of the CURRENT version.
--
--  RPCs
--  * review_queue(subject, chapter, topic, status, batch, limit): the queue,
--    with each item's live scopes, its last review on this version and whether
--    the caller may decide on it. Runs as the caller (RLS decides what it reads).
--  * review_counts(subject, chapter, topic, batch): to_review / changes /
--    approved / retired, for the tabs and the progress counter.
--  * review_question(question, version, decision, scopes, translation_ok, notes)
--  * review_approve_many(items [{id, version}], scopes, translation_ok)
--  * review_edit_question(question, version, patch): one new version.
--
--  CHECK FIRST: nothing to check. It only replaces functions, triggers and
--  policies that 017 made.
-- ============================================================


-- ============================================================
--  PART 0 — Preflight
-- ============================================================
do $$
begin
  if to_regclass('public.item_approvals') is null
     or to_regclass('public.item_reviews') is null
     or to_regclass('public.question_versions') is null then
    raise exception '032 needs db/017 (item_approvals, item_reviews, question_versions). Run 017 and 023 first.';
  end if;
end $$;


-- ============================================================
--  PART 1 — Approvals and reviews: written only through the RPCs
-- ============================================================
drop policy if exists p_approvals_write  on public.item_approvals;
drop policy if exists p_approvals_insert on public.item_approvals;
drop policy if exists p_approvals_revoke on public.item_approvals;
drop policy if exists p_reviews_insert   on public.item_reviews;
drop policy if exists p_reviews_staff    on public.item_reviews;
-- Reads stay as in 017: approvals readable by every signed-in user (students
-- need to know what is approved), reviews by staff and teachers.

-- An approval row changes once, from live to revoked, and nothing else moves.
create or replace function public.item_approval_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'item_approvals is never deleted (revoke instead)';
  end if;
  if old.revoked_at is not null then
    raise exception 'item_approvals: a revoked approval cannot change';
  end if;
  if (new.id, new.item_kind, new.item_id, new.version, new.scope, new.approved_by, new.approved_at)
     is distinct from
     (old.id, old.item_kind, old.item_id, old.version, old.scope, old.approved_by, old.approved_at) then
    raise exception 'item_approvals: only revoked_at, revoked_by and note may change';
  end if;
  if new.revoked_at is null then
    raise exception 'item_approvals: an update must revoke';
  end if;
  return new;
end $$;
drop trigger if exists t_item_approvals_guard on public.item_approvals;
create trigger t_item_approvals_guard before update or delete on public.item_approvals
  for each row execute function public.item_approval_guard();

drop trigger if exists t_item_reviews_immutable on public.item_reviews;
create trigger t_item_reviews_immutable before update or delete on public.item_reviews
  for each row execute function public.forbid_mutation();


-- ============================================================
--  PART 2 — "Approved" means approved at the current version
-- ============================================================
create or replace function public.is_approved(kind text, iid uuid, sc text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.item_approvals a
     where a.item_kind = kind and a.item_id = iid
       and a.scope = sc and a.revoked_at is null
       and (kind <> 'question'
            or a.version = (select q.current_version from public.questions q where q.id = iid)))
$$;


-- ============================================================
--  PART 3 — An edit drops the approval; retiring drops it too
-- ============================================================
-- BEFORE UPDATE, after t_questions_bump_version (triggers fire by name):
-- a new version of an approved question is a draft again, and an AI draft a
-- person changed is 'ai_edited'.
create or replace function public.question_review_reset()
returns trigger language plpgsql as $$
begin
  if new.current_version <> old.current_version then
    if old.status in ('approved', 'reviewed') and new.status = old.status then
      new.status := 'draft';
    end if;
    if old.origin = 'ai' and new.origin = 'ai' then
      new.origin := 'ai_edited';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists t_questions_review_reset on public.questions;
create trigger t_questions_review_reset before update on public.questions
  for each row execute function public.question_review_reset();

-- AFTER UPDATE: revoke what no longer applies. Definer, because the person who
-- edits is usually not the person who approved.
create or replace function public.question_review_revoke()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.current_version <> old.current_version then
    update public.item_approvals
       set revoked_at = now(), revoked_by = auth.uid(),
           note = left(concat_ws(' · ', note, 'edited to version ' || new.current_version), 1000)
     where item_kind = 'question' and item_id = new.id and revoked_at is null
       and version <> new.current_version;
  end if;
  if new.status = 'retired' and old.status <> 'retired' then
    update public.item_approvals
       set revoked_at = now(), revoked_by = auth.uid(),
           note = left(concat_ws(' · ', note, 'retired'), 1000)
     where item_kind = 'question' and item_id = new.id and revoked_at is null;
  end if;
  return null;
end $$;
drop trigger if exists t_questions_review_revoke on public.questions;
create trigger t_questions_review_revoke after update on public.questions
  for each row execute function public.question_review_revoke();

-- Tidy anything 017 let through before this file: approvals of an old version
-- or of a retired question (normally none).
update public.item_approvals a
   set revoked_at = now(), note = left(concat_ws(' · ', a.note, 'revoked by 032'), 1000)
  from public.questions q
 where a.item_kind = 'question' and a.item_id = q.id and a.revoked_at is null
   and (a.version <> q.current_version or q.status = 'retired');


-- ============================================================
--  PART 4 — Who may decide on a question
-- ============================================================
-- Staff: any question. Teachers: a question tagged with a concept in a subject
-- they teach this year (017's teaches_concept). Untagged questions can be
-- tagged (edited) by staff only; they can't be approved by anyone until tagged.
create or replace function public.can_review_question(p_concept uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_staff()
      or (public.is_teacher() and p_concept is not null and public.teaches_concept(p_concept))
$$;


-- ============================================================
--  PART 5 — The queue (runs as the caller)
-- ============================================================
create or replace function public.review_queue(
  p_subject uuid,
  p_chapter uuid default null,
  p_topic   uuid default null,
  p_status  text default 'to_review',
  p_batch   uuid default null,
  p_limit   int  default 400)
returns table (
  id               uuid,
  version          int,
  status           text,
  origin           text,
  type             text,
  cognitive_level  text,
  difficulty       smallint,
  chapter_id       uuid,
  concept_id       uuid,
  topic_id         uuid,
  body             jsonb,
  answer           jsonb,
  explanation      jsonb,
  source           jsonb,
  import_batch_id  uuid,
  created_at       timestamptz,
  scopes           text[],
  last_decision    text,
  last_notes       text,
  last_translation boolean,
  last_reviewed_at timestamptz,
  can_review       boolean,
  in_use           boolean)
language sql stable security invoker set search_path = public as $$
  with base as (
    select q.*, c.topic_id as c_topic
      from public.questions q
      join public.chapters ch on ch.id = q.chapter_id
      left join public.concepts c on c.id = q.concept_id
     where ch.subject_id = p_subject
       and (p_chapter is null or q.chapter_id = p_chapter)
       and (p_topic is null or c.topic_id = p_topic)
       and (p_batch is null or q.import_batch_id = p_batch)
  ), rich as (
    select b.*,
           (select r.decision from public.item_reviews r
             where r.item_kind = 'question' and r.item_id = b.id and r.version = b.current_version
             order by r.created_at desc, r.id desc limit 1) as last_dec
      from base b
  )
  select r.id, r.current_version, r.status, r.origin, r.type, r.cognitive_level, r.difficulty,
         r.chapter_id, r.concept_id, r.c_topic, r.body, r.answer, r.explanation, r.source,
         r.import_batch_id, r.created_at,
         coalesce((select array_agg(a.scope order by a.scope) from public.item_approvals a
                    where a.item_kind = 'question' and a.item_id = r.id
                      and a.revoked_at is null and a.version = r.current_version), '{}'),
         lr.decision, lr.notes, lr.translation_ok, lr.created_at,
         public.can_review_question(r.concept_id),
         exists (select 1 from public.assessment_questions aq
                   join public.assessments s on s.id = aq.assessment_id
                  where aq.question_id = r.id and s.status <> 'draft')
    from rich r
    left join lateral (
      select x.decision, x.notes, x.translation_ok, x.created_at from public.item_reviews x
       where x.item_kind = 'question' and x.item_id = r.id and x.version = r.current_version
       order by x.created_at desc, x.id desc limit 1) lr on true
   where case coalesce(p_status, 'to_review')
           when 'to_review' then r.status in ('draft', 'reviewed')
                                 and r.last_dec is distinct from 'request_changes'
           when 'changes'   then r.status in ('draft', 'reviewed') and r.last_dec = 'request_changes'
           when 'approved'  then r.status = 'approved'
           when 'retired'   then r.status = 'retired'
           else true
         end
   order by r.created_at, r.id
   limit least(greatest(coalesce(p_limit, 400), 1), 1000)
$$;

create or replace function public.review_counts(
  p_subject uuid,
  p_chapter uuid default null,
  p_topic   uuid default null,
  p_batch   uuid default null)
returns jsonb
language sql stable security invoker set search_path = public as $$
  with base as (
    select q.status,
           (select r.decision from public.item_reviews r
             where r.item_kind = 'question' and r.item_id = q.id and r.version = q.current_version
             order by r.created_at desc, r.id desc limit 1) as last_dec
      from public.questions q
      join public.chapters ch on ch.id = q.chapter_id
      left join public.concepts c on c.id = q.concept_id
     where ch.subject_id = p_subject
       and (p_chapter is null or q.chapter_id = p_chapter)
       and (p_topic is null or c.topic_id = p_topic)
       and (p_batch is null or q.import_batch_id = p_batch)
  )
  select jsonb_build_object(
    'to_review', count(*) filter (where status in ('draft','reviewed')
                                    and last_dec is distinct from 'request_changes'),
    'changes',   count(*) filter (where status in ('draft','reviewed')
                                    and last_dec = 'request_changes'),
    'approved',  count(*) filter (where status = 'approved'),
    'retired',   count(*) filter (where status = 'retired'))
  from base
$$;


-- ============================================================
--  PART 6 — Decide: approve for scopes / request changes / reject
-- ============================================================
-- p_version must be the version on the reviewer's screen: if someone edited
-- the question meanwhile, nothing is decided ('review_stale_version').
-- Approve sets the live scopes to exactly p_scopes (a scope not chosen is
-- revoked). Request changes and reject need a note; both revoke every scope;
-- reject retires the question (kept, never deleted). translation_ok is the
-- separate "Urdu reads naturally" check, logged with the decision.
create or replace function public.review_question(
  p_question       uuid,
  p_version        int,
  p_decision       text,
  p_scopes         text[]  default null,
  p_translation_ok boolean default null,
  p_notes          text    default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid   uuid := auth.uid();
  q     record;
  notes text := nullif(btrim(coalesce(p_notes, '')), '');
  sc    text[];
  st    text;
begin
  if uid is null or not (public.is_staff() or public.is_teacher()) then
    raise exception 'review_forbidden' using errcode = '42501';
  end if;
  if p_decision is null or p_decision not in ('approve', 'request_changes', 'reject') then
    raise exception 'review_bad_decision' using errcode = '22023';
  end if;
  if length(coalesce(notes, '')) > 1000 then
    raise exception 'review_notes_too_long' using errcode = '22023';
  end if;

  select x.id, x.current_version, x.status, x.concept_id into q
    from public.questions x where x.id = p_question for update;
  if not found then
    raise exception 'review_not_found' using errcode = 'P0002';
  end if;
  if not public.can_review_question(q.concept_id) then
    raise exception 'review_forbidden' using errcode = '42501';
  end if;
  if p_version is distinct from q.current_version then
    raise exception 'review_stale_version' using errcode = '40001';
  end if;
  if q.status = 'retired' then
    raise exception 'review_retired' using errcode = '22023';
  end if;

  if p_decision = 'approve' then
    if q.concept_id is null then
      raise exception 'review_concept_required' using errcode = '23514';
    end if;
    select array_agg(distinct s order by s) into sc from unnest(p_scopes) s where s is not null;
    if sc is null or not (sc <@ array['learn','practice','exam','worksheet']) then
      raise exception 'review_scopes' using errcode = '22023';
    end if;
    update public.item_approvals
       set revoked_at = now(), revoked_by = uid,
           note = left(concat_ws(' · ', note, 'scope removed'), 1000)
     where item_kind = 'question' and item_id = q.id and revoked_at is null
       and not (scope = any (sc));
    insert into public.item_approvals (item_kind, item_id, version, scope, approved_by, note)
    select 'question', q.id, q.current_version, s, uid, notes from unnest(sc) s
    on conflict do nothing;
    st := 'approved';
  else
    if notes is null then
      raise exception 'review_reason_required' using errcode = '23514';
    end if;
    update public.item_approvals
       set revoked_at = now(), revoked_by = uid,
           note = left(concat_ws(' · ', note, p_decision), 1000)
     where item_kind = 'question' and item_id = q.id and revoked_at is null;
    st := case when p_decision = 'reject' then 'retired' else 'draft' end;
  end if;

  update public.questions set status = st where id = q.id and status <> st;

  insert into public.item_reviews
    (item_kind, item_id, version, reviewer_id, decision, translation_ok, notes)
  values ('question', q.id, q.current_version, uid, p_decision, p_translation_ok, notes);

  return jsonb_build_object(
    'question', q.id, 'version', q.current_version, 'decision', p_decision, 'status', st,
    'scopes', coalesce((select to_jsonb(array_agg(a.scope order by a.scope))
                          from public.item_approvals a
                         where a.item_kind = 'question' and a.item_id = q.id
                           and a.revoked_at is null), '[]'::jsonb));
end $$;

-- Bulk approve (wireframe 7.9 "Approve 12"): each item goes through
-- review_question on its own, so every rule above still applies. Items that
-- can't be approved are skipped and reported, never half-done.
create or replace function public.review_approve_many(
  p_items          jsonb,
  p_scopes         text[],
  p_translation_ok boolean default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  it      record;
  done    int := 0;
  skipped jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) > 200 then
    raise exception 'review_bad_items' using errcode = '22023';
  end if;
  for it in select * from jsonb_to_recordset(p_items) as x(id uuid, version int) loop
    begin
      perform public.review_question(it.id, it.version, 'approve', p_scopes, p_translation_ok, null);
      done := done + 1;
    exception when others then
      if sqlerrm = 'review_scopes' then raise; end if;
      skipped := skipped || jsonb_build_object('id', it.id, 'reason', sqlerrm);
    end;
  end loop;
  return jsonb_build_object('approved', done, 'skipped', skipped);
end $$;


-- ============================================================
--  PART 7 — Edit from the queue: one new version, approval dropped
-- ============================================================
-- p_patch may carry body, answer, explanation, cognitive_level, difficulty,
-- concept_id, source. The new concept must sit in the question's chapter and
-- be one the caller may review. A question on a published (non-draft) paper
-- is not edited here: the old papers read questions by id, not by version.
create or replace function public.review_edit_question(
  p_question uuid,
  p_version  int,
  p_patch    jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid  uuid := auth.uid();
  q    public.questions%rowtype;
  newc uuid;
  v    int;
begin
  if uid is null or not (public.is_staff() or public.is_teacher()) then
    raise exception 'review_forbidden' using errcode = '42501';
  end if;
  if jsonb_typeof(p_patch) is distinct from 'object'
     or exists (select 1 from jsonb_object_keys(p_patch) k
                 where k not in ('body','answer','explanation','cognitive_level',
                                 'difficulty','concept_id','source')) then
    raise exception 'review_bad_patch' using errcode = '22023';
  end if;
  if p_patch ? 'body' and jsonb_typeof(p_patch->'body') is distinct from 'object' then
    raise exception 'review_bad_patch' using errcode = '22023';
  end if;
  if length(p_patch::text) > 200000 then
    raise exception 'review_bad_patch' using errcode = '22023';
  end if;

  select * into q from public.questions where id = p_question for update;
  if not found then
    raise exception 'review_not_found' using errcode = 'P0002';
  end if;
  -- Untagged: staff only. Tagged: whoever may review it.
  if not public.can_review_question(q.concept_id) then
    raise exception 'review_forbidden' using errcode = '42501';
  end if;
  if p_version is distinct from q.current_version then
    raise exception 'review_stale_version' using errcode = '40001';
  end if;
  if q.status = 'retired' then
    raise exception 'review_retired' using errcode = '22023';
  end if;
  if exists (select 1 from public.assessment_questions aq
               join public.assessments s on s.id = aq.assessment_id
              where aq.question_id = q.id and s.status <> 'draft') then
    raise exception 'review_in_use' using errcode = '23514';
  end if;

  newc := case when p_patch ? 'concept_id' then (p_patch->>'concept_id')::uuid else q.concept_id end;
  if newc is distinct from q.concept_id then
    if newc is null
       or not exists (select 1 from public.concepts c join public.topics t on t.id = c.topic_id
                       where c.id = newc and t.chapter_id = q.chapter_id
                         and c.status = 'active')
       or not public.can_review_question(newc) then
      raise exception 'review_bad_concept' using errcode = '23514';
    end if;
  end if;

  update public.questions set
    body            = coalesce(p_patch->'body', body),
    answer          = case when p_patch ? 'answer' then p_patch->'answer' else answer end,
    explanation     = case when p_patch ? 'explanation' then p_patch->'explanation' else explanation end,
    cognitive_level = coalesce(p_patch->>'cognitive_level', cognitive_level),
    difficulty      = coalesce((p_patch->>'difficulty')::smallint, difficulty),
    concept_id      = newc,
    source          = case when p_patch ? 'source' then p_patch->'source' else source end
  where id = q.id
  returning current_version into v;

  return jsonb_build_object('question', q.id, 'version', v, 'changed', v <> q.current_version,
                            'status', (select status from public.questions where id = q.id));
end $$;


-- ============================================================
--  PART 8 — Grants
-- ============================================================
revoke all on function public.review_question(uuid, int, text, text[], boolean, text) from public, anon;
revoke all on function public.review_approve_many(jsonb, text[], boolean) from public, anon;
revoke all on function public.review_edit_question(uuid, int, jsonb) from public, anon;
revoke all on function public.review_queue(uuid, uuid, uuid, text, uuid, int) from public, anon;
revoke all on function public.review_counts(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.review_question(uuid, int, text, text[], boolean, text) to authenticated;
grant execute on function public.review_approve_many(jsonb, text[], boolean) to authenticated;
grant execute on function public.review_edit_question(uuid, int, jsonb) to authenticated;
grant execute on function public.review_queue(uuid, uuid, uuid, text, uuid, int) to authenticated;
grant execute on function public.review_counts(uuid, uuid, uuid, uuid) to authenticated;
grant execute on function public.can_review_question(uuid) to authenticated;

-- Queue lookups by version (the last-review lateral) stay index-backed.
create index if not exists ix_item_reviews_item_version
  on public.item_reviews(item_kind, item_id, version, created_at desc);
create index if not exists ix_item_approvals_item
  on public.item_approvals(item_kind, item_id) where revoked_at is null;
