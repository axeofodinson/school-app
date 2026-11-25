-- ============================================================
--  033 — LESSON REVIEW + STUDENT LESSON READS (prompt 30)
--  DRAFT — NOT YET RUN
-- ============================================================
--  RUN ORDER: after db/017 and db/023 (refuses without 017). After db/031 and
--  db/032 on a project that has them; works without them, and with or without
--  018, 028, 029, 030. Dev first, then production on a day the nightly backup
--  succeeded (like 017).
--
--  Additive + idempotent: functions dropped-then-created, one policy
--  dropped-then-created. No table or column is dropped, no row is deleted or
--  changed by running it.
--
--  WHAT IT CHANGES
--  * review_lesson(content, version, decision, translation_ok, notes): the way
--    a teacher approves, sends back or retires a lesson (learning_content), the
--    lesson twin of 032's review_question. A teacher may decide only on topics
--    in a subject they teach this year (teaches_topic); staff on any.
--      approve          → one live 'learn' approval of exactly the current
--                          version (any older one is revoked), status approved
--      request_changes  → live approvals revoked, status draft, note required
--      reject           → live approvals revoked, status retired, note required
--    Every decision is logged in item_reviews (insert-only).
--    Without this, a project with 032 has no way to approve a lesson at all
--    (032 lets approvals be written only by its question RPCs).
--  * Students (and prep-only learners) read a lesson VERSION only while it
--    holds a live 'learn' approval and the lesson is approved. 017 let them
--    read every version of a lesson once any version had been approved, so an
--    unapproved edit (a new version) was readable straight from the table.
--
--  CHECK FIRST: nothing to check. It only adds a function and replaces one
--  read policy that 017 made.
-- ============================================================


-- ============================================================
--  PART 0 — Preflight
-- ============================================================
do $$
begin
  if to_regclass('public.learning_content') is null
     or to_regclass('public.learning_content_versions') is null
     or to_regclass('public.item_approvals') is null
     or to_regclass('public.item_reviews') is null then
    raise exception '033 needs db/017 (learning_content, item_approvals, item_reviews). Run 017 and 023 first.';
  end if;
end $$;


-- ============================================================
--  PART 1 — A student reads only the approved version of an approved lesson
-- ============================================================
drop policy if exists p_lcv_read on public.learning_content_versions;
create policy p_lcv_read on public.learning_content_versions for select
  using (public.is_staff() or public.is_teacher()
         or exists (select 1 from public.item_approvals a
                     join public.learning_content lc on lc.id = a.item_id
                    where a.item_kind = 'content'
                      and a.item_id = learning_content_versions.content_id
                      and a.version = learning_content_versions.version
                      and a.scope = 'learn' and a.revoked_at is null
                      and lc.status = 'approved'));


-- ============================================================
--  PART 2 — review_lesson()
-- ============================================================
drop function if exists public.review_lesson(uuid, int, text, boolean, text);
create or replace function public.review_lesson(
  p_content        uuid,
  p_version        int,
  p_decision       text,
  p_translation_ok boolean default null,
  p_notes          text    default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid   uuid := auth.uid();
  c     record;
  notes text := nullif(btrim(coalesce(p_notes, '')), '');
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

  select x.id, x.topic_id, x.current_version, x.status into c
    from public.learning_content x where x.id = p_content for update;
  if not found then
    raise exception 'review_not_found' using errcode = 'P0002';
  end if;
  if not (public.is_staff() or public.teaches_topic(c.topic_id)) then
    raise exception 'review_forbidden' using errcode = '42501';
  end if;
  if p_version is distinct from c.current_version then
    raise exception 'review_stale_version' using errcode = '40001';
  end if;
  if c.status = 'retired' then
    raise exception 'review_retired' using errcode = '22023';
  end if;
  if not exists (select 1 from public.learning_content_versions v
                  where v.content_id = c.id and v.version = c.current_version) then
    raise exception 'review_no_version' using errcode = '22023';
  end if;

  if p_decision = 'approve' then
    -- Older versions (and any non-learn scope) stop being live; the current one stays.
    update public.item_approvals
       set revoked_at = now(), revoked_by = uid,
           note = left(concat_ws(' · ', note, 'newer version approved'), 1000)
     where item_kind = 'content' and item_id = c.id and revoked_at is null
       and not (scope = 'learn' and version = c.current_version);
    insert into public.item_approvals (item_kind, item_id, version, scope, approved_by, note)
    select 'content', c.id, c.current_version, 'learn', uid, notes
     where not exists (select 1 from public.item_approvals a
                        where a.item_kind = 'content' and a.item_id = c.id
                          and a.scope = 'learn' and a.revoked_at is null);
    st := 'approved';
  else
    if notes is null then
      raise exception 'review_reason_required' using errcode = '23514';
    end if;
    update public.item_approvals
       set revoked_at = now(), revoked_by = uid,
           note = left(concat_ws(' · ', note, p_decision), 1000)
     where item_kind = 'content' and item_id = c.id and revoked_at is null;
    st := case when p_decision = 'reject' then 'retired' else 'draft' end;
  end if;

  update public.learning_content set status = st, updated_at = now()
   where id = c.id and status <> st;

  insert into public.item_reviews
    (item_kind, item_id, version, reviewer_id, decision, translation_ok, notes)
  values ('content', c.id, c.current_version, uid, p_decision, p_translation_ok, notes);

  return jsonb_build_object('content', c.id, 'version', c.current_version,
                            'decision', p_decision, 'status', st);
end $$;

revoke all on function public.review_lesson(uuid, int, text, boolean, text) from public;
grant execute on function public.review_lesson(uuid, int, text, boolean, text) to authenticated;
