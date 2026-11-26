-- ============================================================
--  034 — TEACHER RELAX / RESTORE + STUCK STUDENTS (prompt 41)
--  DRAFT — NOT YET RUN
-- ============================================================
--  RUN ORDER: after db/019 (refuses without it). Dev first, then production
--  like 017, on a day the nightly backup succeeded.
--
--  Additive + idempotent: functions dropped-then-created. No table, column,
--  policy or row is changed by running it.
--
--  WHAT IT ADDS (LMS_AUDIT §3.5: every gate has a logged human override)
--  * gate_relax(follow_up, reason): a teacher of that subject for the learner's
--    class this year (or staff) lets the learner move on. The open follow-up
--    becomes 'relieved' (close_reason 'teacher_relax'), the concept is
--    carried over into revision, and a gate_overrides 'relax' row records
--    who and why. Reason required.
--  * gate_restore(follow_up, reason): undo a relax (or an automatic relief):
--    the follow-up is open again with rounds back to 0 (a fresh start, so
--    automatic relief can't fire at once), logged as 'restore'. Refused if
--    the learner already has an open one of that kind for the concept.
--  * class_follow_ups(class): the teacher's "stuck students" view: every open
--    follow-up of the class's active students this year, plus those closed in
--    the last 14 days, with names, concept, topic, rounds and who relieved it.
--    Teachers see their subjects only; staff see all.
--  Nothing is deleted: the follow-up row and the override log keep the history.
-- ============================================================

do $$
begin
  if to_regprocedure('public.mastery_apply_attempt(uuid)') is null then
    raise exception '034 needs db/019 (mastery, follow-ups). Run 019 first.';
  end if;
end $$;

-- May the caller decide on this learner's follow-ups in this subject?
create or replace function public.can_override_follow_up(p_learner uuid, p_subject uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_staff() or exists (
    select 1
      from public.profiles p
      join public.enrollments e on e.student_id = p.student_id and e.status = 'active'
      join public.academic_years y on y.id = e.year_id and y.is_current
      join public.teacher_assignments ta
        on ta.class_id = e.class_id and ta.year_id = e.year_id
       and (ta.subject_id is null or ta.subject_id = p_subject)
     where p.id = p_learner and ta.teacher_id = auth.uid()
  )
$$;

create or replace function public.gate_relax(p_follow_up uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  fu  public.follow_ups%rowtype;
  cfg jsonb := public.mastery_cfg();
  tid uuid;
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  select * into fu from public.follow_ups where id = p_follow_up for update;
  if not found then raise exception 'follow_up_not_found' using errcode = 'P0002'; end if;
  if not public.can_override_follow_up(fu.learner_id, fu.subject_id) then
    raise exception 'not_your_student' using errcode = '42501';
  end if;
  if fu.status <> 'open' then
    raise exception 'follow_up_not_open' using errcode = '22023';
  end if;

  update public.follow_ups
     set status = 'relieved', closed_at = now(), updated_at = now(), close_reason = 'teacher_relax'
   where id = fu.id
  returning * into fu;
  select c.topic_id into tid from public.concepts c where c.id = fu.concept_id;
  insert into public.gate_overrides (learner_id, subject_id, topic_id, follow_up_id, action, actor_id, reason)
  values (fu.learner_id, fu.subject_id, tid, fu.id, 'relax', auth.uid(), btrim(p_reason));
  update public.concept_mastery
     set state = 'carried_over',
         next_review_at = coalesce(next_review_at,
                                   now() + make_interval(days => (cfg->>'firstReviewDays')::int)),
         review_stage = greatest(review_stage, 1),
         updated_at = now()
   where learner_id = fu.learner_id and concept_id = fu.concept_id and state <> 'mastered';
  return jsonb_build_object('id', fu.id, 'status', fu.status);
end $$;

create or replace function public.gate_restore(p_follow_up uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  fu  public.follow_ups%rowtype;
  tid uuid;
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  select * into fu from public.follow_ups where id = p_follow_up for update;
  if not found then raise exception 'follow_up_not_found' using errcode = 'P0002'; end if;
  if not public.can_override_follow_up(fu.learner_id, fu.subject_id) then
    raise exception 'not_your_student' using errcode = '42501';
  end if;
  if fu.status <> 'relieved' then
    raise exception 'follow_up_not_relieved' using errcode = '22023';
  end if;
  if exists (select 1 from public.follow_ups o
              where o.learner_id = fu.learner_id and o.concept_id = fu.concept_id
                and o.kind = fu.kind and o.status = 'open') then
    raise exception 'follow_up_already_open' using errcode = '23505';
  end if;

  update public.follow_ups
     set status = 'open', closed_at = null, close_reason = null, rounds = 0, updated_at = now()
   where id = fu.id
  returning * into fu;
  select c.topic_id into tid from public.concepts c where c.id = fu.concept_id;
  insert into public.gate_overrides (learner_id, subject_id, topic_id, follow_up_id, action, actor_id, reason)
  values (fu.learner_id, fu.subject_id, tid, fu.id, 'restore', auth.uid(), btrim(p_reason));
  -- The band goes back to what the evidence says (carried_over was the relief's).
  update public.concept_mastery set state = 'learning', updated_at = now()
   where learner_id = fu.learner_id and concept_id = fu.concept_id and state = 'carried_over';
  perform public.recompute_mastery(fu.learner_id, array[fu.concept_id]);
  return jsonb_build_object('id', fu.id, 'status', fu.status);
end $$;

-- The teacher's "stuck students" view for one class.
create or replace function public.class_follow_ups(p_class uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  staff boolean := public.is_staff();
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if not staff and not public.teaches_class(p_class) then
    raise exception 'not_your_class' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(row_to_json(r) order by r.status <> 'open', r.rounds desc, r.created_at)
      from (
        select f.id, f.learner_id, st.full_name as student_name, st.student_code,
               f.concept_id, c.title_en as concept_en, c.title_ur as concept_ur,
               t.id as topic_id, t.title_en as topic_en, t.title_ur as topic_ur,
               f.subject_id, s.name as subject_name,
               f.kind, f.status, f.rounds, f.created_at, f.closed_at, f.close_reason,
               cm.state as band,
               (select pr.full_name from public.gate_overrides g
                  left join public.profiles pr on pr.id = g.actor_id
                 where g.follow_up_id = f.id order by g.created_at desc limit 1) as last_actor
          from public.enrollments e
          join public.academic_years y on y.id = e.year_id and y.is_current
          join public.students st on st.id = e.student_id
          join public.profiles p on p.student_id = st.id
          join public.follow_ups f on f.learner_id = p.id
          join public.concepts c on c.id = f.concept_id
          join public.topics t on t.id = c.topic_id
          join public.subjects s on s.id = f.subject_id
          left join public.concept_mastery cm
            on cm.learner_id = f.learner_id and cm.concept_id = f.concept_id
         where e.class_id = p_class and e.status = 'active'
           and (f.status = 'open' or f.closed_at >= now() - interval '14 days')
           and (staff or exists (
                 select 1 from public.teacher_assignments ta
                  where ta.teacher_id = auth.uid() and ta.class_id = p_class
                    and ta.year_id = e.year_id
                    and (ta.subject_id is null or ta.subject_id = f.subject_id)))
      ) r), '[]'::jsonb);
end $$;

revoke all on function public.can_override_follow_up(uuid, uuid) from public, anon, authenticated;
revoke all on function public.gate_relax(uuid, text)    from public, anon;
revoke all on function public.gate_restore(uuid, text)  from public, anon;
revoke all on function public.class_follow_ups(uuid)    from public, anon;
grant execute on function public.gate_relax(uuid, text)   to authenticated;
grant execute on function public.gate_restore(uuid, text) to authenticated;
grant execute on function public.class_follow_ups(uuid)   to authenticated;
