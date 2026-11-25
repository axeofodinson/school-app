-- ============================================================
--  017 — LMS foundation (curriculum, concepts, versioned bank, learner state,
--        exams)                                  *** DRAFT — NOT YET RUN ***
--
--  Status: DRAFT for review (LMS_AUDIT.md §5, DATABASE_DESIGN.md). Do not run
--  against the Supabase project until Phase 2 of the build order is approved.
--  It has only been dry-run against a throwaway local Postgres with stubbed
--  auth/storage schemas (see TEST_PLAN.md §DB-1).
--
--  Additive + idempotent: no drops of tables/columns, no data loss. Every
--  CREATE uses IF NOT EXISTS; every policy is dropped-then-created. Safe to
--  re-run. Never touches db/setup.sql.
--
--  KEY DESIGN CHOICES (reasons in DECISIONS.md)
--  * Builds on the existing tree: classes → subjects → chapters, then adds
--    topics → concepts underneath. Questions gain a concept_id.
--  * Learner identity = profiles.id (auth.uid()). Every learning-state table
--    keys on learner_id, so Play Store users with NO students/enrollment row
--    work the same as enrolled students. Exams additionally require an
--    enrollment (teachers launch them for a class).
--  * History is never rewritten: question/lesson content is snapshotted into
--    immutable *_versions rows by trigger; attempts and exam answers point at
--    (question_id, version).
--  * Approval is per use (practice / exam / worksheet / learn) and per version.
--    Editing a question creates a new version that needs re-approval.
--  * Free-tier storage budget: practice attempts are ONE compact row per
--    attempt (items jsonb), not one row per answer. Mastery is rolled up in
--    concept_mastery so dashboards never scan raw attempts.
--  * Exams reuse `assessments` (mode = live_exam | offline_exam) so results
--    flow into the existing submissions + grade audit (record_grade, 013)
--    only when the teacher confirms.
-- ============================================================


-- ============================================================
--  PART 1 — Curriculum: versions, topics, concepts, prerequisites
-- ============================================================
create table if not exists public.curricula (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,             -- e.g. 'PTB-2024'
  board          text not null,                    -- e.g. 'Punjab Textbook Board'
  name           text not null,
  effective_from date,
  status         text not null default 'active'
                 check (status in ('active','retired')),
  created_at     timestamptz not null default now()
);

-- Chapters belong to a curriculum version (nullable: existing chapters predate
-- this; backfill later once a PTB curriculum row exists).
alter table public.chapters
  add column if not exists curriculum_id uuid references public.curricula(id),
  add column if not exists title_ur      text,
  add column if not exists textbook_ref  text,
  add column if not exists status        text not null default 'active';
alter table public.chapters drop constraint if exists chapters_status_check;
alter table public.chapters
  add constraint chapters_status_check check (status in ('active','retired'));

create table if not exists public.topics (
  id          uuid primary key default gen_random_uuid(),
  chapter_id  uuid not null references public.chapters(id),
  title_en    text not null,
  title_ur    text,
  sort_order  int  not null default 0,
  status      text not null default 'active' check (status in ('active','retired')),
  diagnostic_size smallint,                        -- null = engine default (~30)
  created_at  timestamptz not null default now()
);
create index if not exists ix_topics_chapter on public.topics(chapter_id, sort_order);

create table if not exists public.concepts (
  id          uuid primary key default gen_random_uuid(),
  topic_id    uuid not null references public.topics(id),
  title_en    text not null,
  title_ur    text,
  summary_en  text,
  summary_ur  text,
  sort_order  int  not null default 0,
  status      text not null default 'active' check (status in ('active','retired')),
  created_at  timestamptz not null default now()
);
create index if not exists ix_concepts_topic on public.concepts(topic_id, sort_order);

create table if not exists public.concept_prerequisites (
  concept_id          uuid not null references public.concepts(id),
  requires_concept_id uuid not null references public.concepts(id),
  primary key (concept_id, requires_concept_id),
  check (concept_id <> requires_concept_id)
);
create index if not exists ix_cprereq_requires
  on public.concept_prerequisites(requires_concept_id);


-- ============================================================
--  PART 2 — Question bank: tags, lifecycle, immutable versions, approvals
-- ============================================================
-- Existing questions were authored by teachers for live assessments, so they
-- are backfilled as 'approved' (status default 'approved' at ADD time), then
-- the default flips to 'draft' for everything inserted afterwards.
alter table public.questions
  add column if not exists concept_id        uuid references public.concepts(id),
  add column if not exists difficulty        smallint not null default 2,
  add column if not exists status            text not null default 'approved',
  add column if not exists current_version   int  not null default 1,
  add column if not exists origin            text not null default 'human',
  add column if not exists source            jsonb,      -- {book, page, ref}
  add column if not exists explanation       jsonb,      -- {en, ur}
  add column if not exists language_complete boolean not null default false,
  add column if not exists scope_class_id    uuid references public.classes(id),
  add column if not exists is_test_data      boolean not null default false;
alter table public.questions alter column status set default 'draft';

alter table public.questions drop constraint if exists questions_difficulty_check;
alter table public.questions
  add constraint questions_difficulty_check check (difficulty between 1 and 3);
alter table public.questions drop constraint if exists questions_status_check;
alter table public.questions
  add constraint questions_status_check
  check (status in ('draft','reviewed','approved','retired'));
alter table public.questions drop constraint if exists questions_origin_check;
alter table public.questions
  add constraint questions_origin_check check (origin in ('human','ai','ai_edited'));

create index if not exists ix_questions_concept on public.questions(concept_id, status);

-- Immutable snapshot of every content-bearing state of a question.
create table if not exists public.question_versions (
  question_id     uuid not null references public.questions(id),
  version         int  not null,
  type            text not null,
  cognitive_level text not null,
  difficulty      smallint not null,
  concept_id      uuid references public.concepts(id),
  body            jsonb not null,
  answer          jsonb,
  explanation     jsonb,
  created_by      uuid references public.profiles(id),
  created_at      timestamptz not null default now(),
  primary key (question_id, version)
);

-- BEFORE UPDATE: bump current_version when content changes.
create or replace function public.question_bump_version()
returns trigger language plpgsql as $$
begin
  if (new.body, new.answer, new.explanation, new.type, new.cognitive_level,
      new.difficulty, new.concept_id)
     is distinct from
     (old.body, old.answer, old.explanation, old.type, old.cognitive_level,
      old.difficulty, old.concept_id) then
    new.current_version := old.current_version + 1;
  end if;
  return new;
end $$;
drop trigger if exists t_questions_bump_version on public.questions;
create trigger t_questions_bump_version before update on public.questions
  for each row execute function public.question_bump_version();

-- AFTER INSERT/UPDATE: snapshot the current version (no-op if it exists).
create or replace function public.question_snapshot()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.question_versions
    (question_id, version, type, cognitive_level, difficulty, concept_id,
     body, answer, explanation, created_by)
  values
    (new.id, new.current_version, new.type, new.cognitive_level, new.difficulty,
     new.concept_id, new.body, new.answer, new.explanation, auth.uid())
  on conflict (question_id, version) do nothing;
  return new;
end $$;
drop trigger if exists t_questions_snapshot on public.questions;
create trigger t_questions_snapshot after insert or update on public.questions
  for each row execute function public.question_snapshot();

-- Versions are append-only.
create or replace function public.forbid_mutation()
returns trigger language plpgsql as $$
begin
  raise exception '% is append-only', tg_table_name;
end $$;
drop trigger if exists t_qv_immutable on public.question_versions;
create trigger t_qv_immutable before update or delete on public.question_versions
  for each row execute function public.forbid_mutation();

-- Backfill version 1 for questions that existed before this migration.
insert into public.question_versions
  (question_id, version, type, cognitive_level, difficulty, concept_id,
   body, answer, explanation, created_by, created_at)
select id, current_version, type, cognitive_level, difficulty, concept_id,
       body, answer, explanation, created_by, created_at
from public.questions
on conflict (question_id, version) do nothing;

-- Per-use, per-version approval. Approving for practice ≠ approving for exams.
create table if not exists public.item_approvals (
  id          uuid primary key default gen_random_uuid(),
  item_kind   text not null check (item_kind in ('question','content')),
  item_id     uuid not null,
  version     int  not null,
  scope       text not null check (scope in ('learn','practice','exam','worksheet')),
  approved_by uuid not null references public.profiles(id),
  approved_at timestamptz not null default now(),
  revoked_by  uuid references public.profiles(id),
  revoked_at  timestamptz,
  note        text
);
create unique index if not exists ux_item_approvals_live
  on public.item_approvals(item_kind, item_id, scope) where revoked_at is null;

-- Review log (insert-only): every approve / request-changes / reject decision,
-- including the separate translation check.
create table if not exists public.item_reviews (
  id             uuid primary key default gen_random_uuid(),
  item_kind      text not null check (item_kind in ('question','content')),
  item_id        uuid not null,
  version        int  not null,
  reviewer_id    uuid not null references public.profiles(id),
  decision       text not null check (decision in ('approve','request_changes','reject')),
  translation_ok boolean,
  notes          text,
  created_at     timestamptz not null default now()
);
create index if not exists ix_item_reviews_item on public.item_reviews(item_kind, item_id);

-- Import batches (AI or teacher bulk import) so a bad batch can be found and
-- retired as a unit.
create table if not exists public.import_batches (
  id           uuid primary key default gen_random_uuid(),
  imported_by  uuid not null references public.profiles(id),
  origin       text not null check (origin in ('human','ai')),
  source_note  text,
  report       jsonb,           -- validator output: counts, duplicates, errors
  created_at   timestamptz not null default now()
);
alter table public.questions
  add column if not exists import_batch_id uuid references public.import_batches(id);


-- ============================================================
--  PART 3 — Learn content (typed JSON blocks, versioned)
-- ============================================================
create table if not exists public.learning_content (
  id              uuid primary key default gen_random_uuid(),
  topic_id        uuid not null references public.topics(id),
  concept_id      uuid references public.concepts(id),  -- set for alternatives
  kind            text not null default 'lesson'
                  check (kind in ('lesson','alternative')),
  current_version int  not null default 1,
  status          text not null default 'draft'
                  check (status in ('draft','reviewed','approved','retired')),
  origin          text not null default 'human' check (origin in ('human','ai','ai_edited')),
  scope_class_id  uuid references public.classes(id),
  created_by      uuid references public.profiles(id),
  is_test_data    boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists ix_lc_topic on public.learning_content(topic_id, kind, status);

create table if not exists public.learning_content_versions (
  content_id  uuid not null references public.learning_content(id),
  version     int  not null,
  blocks      jsonb not null,   -- [{type, concept_id?, en, ur, ...}] see DATABASE_DESIGN.md
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now(),
  primary key (content_id, version)
);
drop trigger if exists t_lcv_immutable on public.learning_content_versions;
create trigger t_lcv_immutable before update or delete on public.learning_content_versions
  for each row execute function public.forbid_mutation();


-- ============================================================
--  PART 4 — Learner state (keyed on profiles.id)
-- ============================================================
-- One compact row per practice/diagnostic/follow-up/revision attempt.
-- id is CLIENT-generated (uuid) so offline retries are idempotent.
-- items: [{q: question_id, v: version, a: answer, c: correct, ms: time}]
create table if not exists public.practice_attempts (
  id            uuid primary key,
  learner_id    uuid not null references public.profiles(id),
  kind          text not null
                check (kind in ('practice','diagnostic','followup','revision','worksheet')),
  topic_id      uuid references public.topics(id),
  follow_up_id  uuid,
  started_at    timestamptz not null,
  finished_at   timestamptz,
  items         jsonb not null,
  n_correct     smallint not null default 0,
  n_total       smallint not null default 0,
  device_id     text,
  received_at   timestamptz not null default now(),
  is_test_data  boolean not null default false
);
create index if not exists ix_pa_learner on public.practice_attempts(learner_id, started_at desc);
create index if not exists ix_pa_topic   on public.practice_attempts(topic_id);

create table if not exists public.concept_mastery (
  learner_id      uuid not null references public.profiles(id),
  concept_id      uuid not null references public.concepts(id),
  state           text not null default 'learning'
                  check (state in ('learning','weak','mastered','carried_over')),
  n_attempted     int  not null default 0,
  n_correct       int  not null default 0,
  n_distinct_q    int  not null default 0,
  evidence        jsonb not null default '{}'::jsonb,  -- per-difficulty, recent window
  last_attempt_at timestamptz,
  mastered_at     timestamptz,
  next_review_at  timestamptz,
  review_stage    smallint not null default 0,          -- 0 none, 1 = 7d, 2 = 30d
  updated_at      timestamptz not null default now(),
  primary key (learner_id, concept_id)
);
create index if not exists ix_cm_concept on public.concept_mastery(concept_id, state);
create index if not exists ix_cm_review  on public.concept_mastery(learner_id, next_review_at)
  where next_review_at is not null;

create table if not exists public.follow_ups (
  id              uuid primary key default gen_random_uuid(),
  learner_id      uuid not null references public.profiles(id),
  concept_id      uuid not null references public.concepts(id),
  subject_id      uuid not null references public.subjects(id),  -- gate scope
  kind            text not null check (kind in ('diagnostic','exam','revision','teacher')),
  status          text not null default 'open'
                  check (status in ('open','cleared','relieved','cancelled')),
  source_attempt_id uuid,
  source_exam_session_id uuid,
  assigned_by     uuid references public.profiles(id),
  rounds          smallint not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  closed_at       timestamptz,
  close_reason    text
);
-- One OPEN follow-up per (learner, concept, kind): repeated mistakes and
-- stacked exams merge instead of piling up.
create unique index if not exists ux_followups_open
  on public.follow_ups(learner_id, concept_id, kind) where status = 'open';
create index if not exists ix_followups_learner_open
  on public.follow_ups(learner_id, kind) where status = 'open';

-- Every gate relax/restore and every automatic relief is logged (insert-only).
create table if not exists public.gate_overrides (
  id          uuid primary key default gen_random_uuid(),
  learner_id  uuid not null references public.profiles(id),
  subject_id  uuid references public.subjects(id),
  topic_id    uuid references public.topics(id),
  follow_up_id uuid references public.follow_ups(id),
  action      text not null check (action in ('relax','restore','auto_relief')),
  actor_id    uuid references public.profiles(id),  -- null = system (auto relief)
  reason      text not null,
  created_at  timestamptz not null default now()
);
create index if not exists ix_gate_overrides_learner on public.gate_overrides(learner_id);
drop trigger if exists t_gate_overrides_immutable on public.gate_overrides;
create trigger t_gate_overrides_immutable before update or delete on public.gate_overrides
  for each row execute function public.forbid_mutation();


-- ============================================================
--  PART 5 — Exams (reuse assessments; server-authoritative sessions)
-- ============================================================
alter table public.assessments
  add column if not exists mode              text not null default 'standard',
  add column if not exists duration_seconds  int,
  add column if not exists opens_at          timestamptz,
  add column if not exists closes_at         timestamptz,
  add column if not exists join_code         text,
  add column if not exists settings          jsonb not null default '{}'::jsonb,
  add column if not exists blueprint         jsonb,   -- topics, count, difficulty mix
  add column if not exists results_confirmed_at timestamptz,
  add column if not exists results_confirmed_by uuid references public.profiles(id);
alter table public.assessments drop constraint if exists assessments_mode_check;
alter table public.assessments
  add constraint assessments_mode_check
  check (mode in ('standard','live_exam','offline_exam'));
create unique index if not exists ux_assessments_join_code
  on public.assessments(join_code) where join_code is not null and status = 'published';

-- Pin the exact question version an assessment uses.
alter table public.assessment_questions
  add column if not exists question_version int;

create table if not exists public.exam_sessions (
  id             uuid primary key default gen_random_uuid(),
  assessment_id  uuid not null references public.assessments(id),
  enrollment_id  uuid not null references public.enrollments(id),
  learner_id     uuid not null references public.profiles(id),
  delivery       text not null default 'online' check (delivery in ('online','offline')),
  status         text not null default 'in_progress'
                 check (status in ('in_progress','submitted','auto_submitted','void')),
  paper          jsonb not null,          -- per-student order + option permutation
  started_at     timestamptz not null default now(),   -- server clock
  deadline_at    timestamptz not null,                 -- server clock
  submitted_at   timestamptz,
  client_elapsed_ms bigint,               -- offline delivery only
  score          numeric(6,2),
  total          numeric(6,2),
  last_seen_at   timestamptz,
  created_at     timestamptz not null default now(),
  unique (assessment_id, learner_id)
);
create index if not exists ix_exam_sessions_assessment on public.exam_sessions(assessment_id, status);

create table if not exists public.exam_session_answers (
  session_id       uuid not null references public.exam_sessions(id),
  question_id      uuid not null,
  question_version int  not null,
  answer           jsonb,
  is_correct       boolean,
  client_answered_at timestamptz,
  received_at      timestamptz not null default now(),
  late             boolean not null default false,
  primary key (session_id, question_id),
  foreign key (question_id, question_version)
    references public.question_versions(question_id, version)
);

create table if not exists public.exam_events (
  id          bigint generated always as identity primary key,
  session_id  uuid not null references public.exam_sessions(id),
  kind        text not null
              check (kind in ('blur','hidden','fullscreen_exit','reconnect','resume','late_answer')),
  at          timestamptz not null default now(),
  detail      jsonb
);
create index if not exists ix_exam_events_session on public.exam_events(session_id);


-- ============================================================
--  PART 6 — Test-data markers for the synthetic seed (TEST_PLAN.md §Seed)
-- ============================================================
alter table public.students   add column if not exists is_test_data boolean not null default false;
alter table public.profiles   add column if not exists is_test_data boolean not null default false;
alter table public.topics     add column if not exists is_test_data boolean not null default false;
alter table public.concepts   add column if not exists is_test_data boolean not null default false;


-- ============================================================
--  PART 7 — Helper functions
-- ============================================================
create or replace function public.teaches_topic(tid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.topics t
                 where t.id = tid and public.teaches_chapter(t.chapter_id))
$$;

create or replace function public.teaches_concept(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.concepts c
                 where c.id = cid and public.teaches_topic(c.topic_id))
$$;

-- Does the current teacher teach this learner (any active enrollment)?
create or replace function public.teaches_learner(lid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    join public.enrollments e on e.student_id = p.student_id and e.status = 'active'
    where p.id = lid and public.teaches_class(e.class_id)
  )
$$;

create or replace function public.is_approved(kind text, iid uuid, sc text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.item_approvals a
                 where a.item_kind = kind and a.item_id = iid
                   and a.scope = sc and a.revoked_at is null)
$$;


-- ============================================================
--  PART 8 — Exam RPCs (the ONLY student write path for exams)
-- ============================================================
-- Start (or resume) my session. Server sets started_at/deadline_at. The paper
-- returned to the client never contains answers or explanations.
create or replace function public.start_exam_session(p_assessment uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  a public.assessments;
  enr uuid;
  s public.exam_sessions;
begin
  select * into a from public.assessments where id = p_assessment;
  if a.id is null or a.status <> 'published' or a.mode not in ('live_exam','offline_exam') then
    raise exception 'exam not available';
  end if;
  if a.opens_at is not null and now() < a.opens_at then raise exception 'exam not open'; end if;
  if a.closes_at is not null and now() > a.closes_at then raise exception 'exam closed'; end if;

  select e.id into enr from public.enrollments e
   where e.student_id = public.my_student_id() and e.class_id = a.class_id
     and e.year_id = a.year_id and e.status = 'active';
  if enr is null then raise exception 'not enrolled for this exam'; end if;

  select * into s from public.exam_sessions
   where assessment_id = a.id and learner_id = auth.uid();
  if s.id is null then
    insert into public.exam_sessions
      (assessment_id, enrollment_id, learner_id, delivery, paper, deadline_at)
    values
      (a.id, enr, auth.uid(),
       case when a.mode = 'offline_exam' then 'offline' else 'online' end,
       (select jsonb_agg(jsonb_build_object('q', aq.question_id,
                                            'v', coalesce(aq.question_version, q.current_version))
                         order by random())
          from public.assessment_questions aq
          join public.questions q on q.id = aq.question_id
         where aq.assessment_id = a.id),
       least(coalesce(a.closes_at, 'infinity'::timestamptz),
             now() + make_interval(secs => coalesce(a.duration_seconds, 3600))))
    returning * into s;
  end if;

  return jsonb_build_object(
    'session_id', s.id, 'status', s.status, 'started_at', s.started_at,
    'deadline_at', s.deadline_at, 'server_now', now(),
    'questions', (
      select jsonb_agg(jsonb_build_object(
               'q', qv.question_id, 'v', qv.version, 'type', qv.type, 'body', qv.body)
             order by ord)
        from jsonb_array_elements(s.paper) with ordinality as p(item, ord)
        join public.question_versions qv
          on qv.question_id = (p.item->>'q')::uuid and qv.version = (p.item->>'v')::int),
    'answers', (select coalesce(jsonb_object_agg(question_id, answer), '{}'::jsonb)
                  from public.exam_session_answers where session_id = s.id));
end $$;

-- Idempotent per-answer save. Late answers are stored (audit) but flagged and
-- not graded. Grace window comes from assessments.settings.grace_seconds.
create or replace function public.save_exam_answer(
  p_session uuid, p_question uuid, p_answer jsonb, p_client_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s public.exam_sessions;
  grace int;
  v int;
  is_late boolean;
begin
  select * into s from public.exam_sessions where id = p_session and learner_id = auth.uid();
  if s.id is null then raise exception 'no such session'; end if;
  select coalesce((settings->>'grace_seconds')::int, 30) into grace
    from public.assessments where id = s.assessment_id;
  select (item->>'v')::int into v
    from jsonb_array_elements(s.paper) item where (item->>'q')::uuid = p_question;
  if v is null then raise exception 'question not in paper'; end if;

  is_late := s.status <> 'in_progress' or now() > s.deadline_at + make_interval(secs => grace);
  if is_late then
    insert into public.exam_events (session_id, kind, detail)
    values (s.id, 'late_answer', jsonb_build_object('q', p_question, 'answer', p_answer));
    return jsonb_build_object('accepted', false, 'reason', 'deadline_passed');
  end if;

  insert into public.exam_session_answers
    (session_id, question_id, question_version, answer, client_answered_at)
  values (s.id, p_question, v, p_answer, p_client_at)
  on conflict (session_id, question_id)
  do update set answer = excluded.answer,
                client_answered_at = excluded.client_answered_at,
                received_at = now();
  update public.exam_sessions set last_seen_at = now() where id = s.id;
  return jsonb_build_object('accepted', true);
end $$;

-- Grade a session server-side (auto-gradable types: exact match on answer.correct).
create or replace function public.grade_exam_session(p_session uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.exam_session_answers sa
     set is_correct = (qv.answer->'correct') = (sa.answer->'correct')
    from public.question_versions qv
   where sa.session_id = p_session
     and qv.question_id = sa.question_id and qv.version = sa.question_version
     and qv.type in ('mcq','true_false','numeric');
  update public.exam_sessions s
     set score = (select count(*) from public.exam_session_answers
                   where session_id = s.id and is_correct),
         total = jsonb_array_length(s.paper)
   where s.id = p_session;
end $$;

-- Submit is final and idempotent: a second call returns the same result.
create or replace function public.submit_exam_session(p_session uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.exam_sessions;
begin
  select * into s from public.exam_sessions where id = p_session and learner_id = auth.uid();
  if s.id is null then raise exception 'no such session'; end if;
  if s.status = 'in_progress' then
    update public.exam_sessions
       set status = case when now() > deadline_at then 'auto_submitted' else 'submitted' end,
           submitted_at = now()
     where id = s.id;
    perform public.grade_exam_session(s.id);
  end if;
  select * into s from public.exam_sessions where id = p_session;
  return jsonb_build_object('status', s.status, 'score', s.score, 'total', s.total);
end $$;

-- Integrity signal from the client (blur / tab hidden / fullscreen exit).
create or replace function public.log_exam_event(p_session uuid, p_kind text, p_detail jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.exam_sessions where id = p_session and learner_id = auth.uid()) then
    raise exception 'no such session';
  end if;
  insert into public.exam_events (session_id, kind, detail) values (p_session, p_kind, p_detail);
end $$;
-- NOTE: auto-submit of abandoned sessions at deadline+grace runs from a
-- scheduled job (pg_cron is available on the free tier) calling
-- grade_exam_session for sessions past deadline — see ARCHITECTURE.md §Exams.
-- Offline-exam acceptance (client_elapsed_ms ≤ duration + grace, received
-- before closes_at) is a separate RPC added in Phase 6.


-- ============================================================
--  PART 9 — Row-level security
-- ============================================================
alter table public.curricula                 enable row level security;
alter table public.topics                    enable row level security;
alter table public.concepts                  enable row level security;
alter table public.concept_prerequisites     enable row level security;
alter table public.question_versions         enable row level security;
alter table public.item_approvals            enable row level security;
alter table public.item_reviews              enable row level security;
alter table public.import_batches            enable row level security;
alter table public.learning_content          enable row level security;
alter table public.learning_content_versions enable row level security;
alter table public.practice_attempts         enable row level security;
alter table public.concept_mastery           enable row level security;
alter table public.follow_ups                enable row level security;
alter table public.gate_overrides            enable row level security;
alter table public.exam_sessions             enable row level security;
alter table public.exam_session_answers      enable row level security;
alter table public.exam_events               enable row level security;

-- Curriculum: readable by any signed-in user; staff write; teachers write
-- topics/concepts under chapters they teach.
drop policy if exists p_curricula_read  on public.curricula;
create policy p_curricula_read  on public.curricula  for select using (auth.uid() is not null);
drop policy if exists p_curricula_staff on public.curricula;
create policy p_curricula_staff on public.curricula  for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists p_topics_read on public.topics;
create policy p_topics_read on public.topics for select using (auth.uid() is not null);
drop policy if exists p_topics_write on public.topics;
create policy p_topics_write on public.topics for all
  using (public.is_staff() or (public.is_teacher() and public.teaches_chapter(chapter_id)))
  with check (public.is_staff() or (public.is_teacher() and public.teaches_chapter(chapter_id)));

drop policy if exists p_concepts_read on public.concepts;
create policy p_concepts_read on public.concepts for select using (auth.uid() is not null);
drop policy if exists p_concepts_write on public.concepts;
create policy p_concepts_write on public.concepts for all
  using (public.is_staff() or (public.is_teacher() and public.teaches_topic(topic_id)))
  with check (public.is_staff() or (public.is_teacher() and public.teaches_topic(topic_id)));

drop policy if exists p_cprereq_read on public.concept_prerequisites;
create policy p_cprereq_read on public.concept_prerequisites for select using (auth.uid() is not null);
drop policy if exists p_cprereq_write on public.concept_prerequisites;
create policy p_cprereq_write on public.concept_prerequisites for all
  using (public.is_staff() or (public.is_teacher() and public.teaches_concept(concept_id)))
  with check (public.is_staff() or (public.is_teacher() and public.teaches_concept(concept_id)));

-- Question versions: staff + teachers read all; students read ONLY versions
-- approved for practice/worksheet (they need answers for instant feedback).
-- Exam papers reach students only through start_exam_session (no answers).
drop policy if exists p_qv_staff_read on public.question_versions;
create policy p_qv_staff_read on public.question_versions for select
  using (public.is_staff() or public.is_teacher());
drop policy if exists p_qv_student_read on public.question_versions;
create policy p_qv_student_read on public.question_versions for select
  using (exists (select 1 from public.item_approvals a
                  where a.item_kind = 'question' and a.item_id = question_versions.question_id
                    and a.version = question_versions.version
                    and a.scope in ('practice','worksheet') and a.revoked_at is null));

-- Approvals / reviews / imports: staff all; teachers for concepts they teach.
drop policy if exists p_approvals_read on public.item_approvals;
create policy p_approvals_read on public.item_approvals for select using (auth.uid() is not null);
drop policy if exists p_approvals_write on public.item_approvals;
create policy p_approvals_write on public.item_approvals for all
  using (public.is_staff() or public.is_teacher())
  with check (public.is_staff() or (public.is_teacher() and approved_by = auth.uid()));
-- NOTE: teacher approval is limited to their own concepts in the review RPC
-- (Phase 2); this policy is intentionally coarse until then.

drop policy if exists p_reviews_staff on public.item_reviews;
create policy p_reviews_staff on public.item_reviews for all
  using (public.is_staff() or public.is_teacher())
  with check (reviewer_id = auth.uid());

drop policy if exists p_imports_staff on public.import_batches;
create policy p_imports_staff on public.import_batches for all
  using (public.is_staff() or imported_by = auth.uid())
  with check (imported_by = auth.uid());

-- Learn content: students read approved; staff/teachers manage.
drop policy if exists p_lc_read on public.learning_content;
create policy p_lc_read on public.learning_content for select
  using (public.is_staff() or public.is_teacher() or status = 'approved');
drop policy if exists p_lc_write on public.learning_content;
create policy p_lc_write on public.learning_content for all
  using (public.is_staff() or (public.is_teacher() and public.teaches_topic(topic_id)))
  with check (public.is_staff() or (public.is_teacher() and public.teaches_topic(topic_id)));

drop policy if exists p_lcv_read on public.learning_content_versions;
create policy p_lcv_read on public.learning_content_versions for select
  using (public.is_staff() or public.is_teacher()
         or public.is_approved('content', content_id, 'learn'));
drop policy if exists p_lcv_insert on public.learning_content_versions;
create policy p_lcv_insert on public.learning_content_versions for insert
  with check (public.is_staff() or public.is_teacher());

-- Learner state: a learner reads/writes their own; teachers read learners they
-- teach; staff all. No student UPDATE on attempts (append-only from client).
drop policy if exists p_pa_own on public.practice_attempts;
create policy p_pa_own on public.practice_attempts for select
  using (learner_id = auth.uid() or public.is_staff() or public.teaches_learner(learner_id));
drop policy if exists p_pa_insert on public.practice_attempts;
create policy p_pa_insert on public.practice_attempts for insert
  with check (learner_id = auth.uid());

-- concept_mastery and follow_ups are written by server RPCs (Phase 4), not
-- directly by clients; read access only here.
drop policy if exists p_cm_read on public.concept_mastery;
create policy p_cm_read on public.concept_mastery for select
  using (learner_id = auth.uid() or public.is_staff() or public.teaches_learner(learner_id));
drop policy if exists p_fu_read on public.follow_ups;
create policy p_fu_read on public.follow_ups for select
  using (learner_id = auth.uid() or public.is_staff() or public.teaches_learner(learner_id));
drop policy if exists p_fu_teacher_assign on public.follow_ups;
create policy p_fu_teacher_assign on public.follow_ups for insert
  with check ((public.is_staff() or public.teaches_learner(learner_id))
              and kind = 'teacher' and assigned_by = auth.uid());

drop policy if exists p_go_read on public.gate_overrides;
create policy p_go_read on public.gate_overrides for select
  using (learner_id = auth.uid() or public.is_staff() or public.teaches_learner(learner_id));
drop policy if exists p_go_insert on public.gate_overrides;
create policy p_go_insert on public.gate_overrides for insert
  with check ((public.is_staff() or public.teaches_learner(learner_id))
              and actor_id = auth.uid() and action in ('relax','restore'));

-- Exams: students read their own session (writes only via RPCs above);
-- teachers read sessions of classes they teach (live view).
drop policy if exists p_es_read on public.exam_sessions;
create policy p_es_read on public.exam_sessions for select
  using (learner_id = auth.uid() or public.is_staff()
         or exists (select 1 from public.assessments a
                     where a.id = exam_sessions.assessment_id and public.teaches_class(a.class_id)));
drop policy if exists p_esa_read on public.exam_session_answers;
create policy p_esa_read on public.exam_session_answers for select
  using (exists (select 1 from public.exam_sessions s
                  where s.id = exam_session_answers.session_id
                    and (s.learner_id = auth.uid() or public.is_staff()
                         or exists (select 1 from public.assessments a
                                     where a.id = s.assessment_id and public.teaches_class(a.class_id)))));
drop policy if exists p_ee_read on public.exam_events;
create policy p_ee_read on public.exam_events for select
  using (exists (select 1 from public.exam_sessions s
                  where s.id = exam_events.session_id
                    and (public.is_staff()
                         or exists (select 1 from public.assessments a
                                     where a.id = s.assessment_id and public.teaches_class(a.class_id)))));


-- ============================================================
--  PART 10 — Pre-existing hole, fixed at Phase 1 cut-over (COMMENTED OUT)
-- ============================================================
-- db/setup.sql p_questions_read lets ANY signed-in user (students included)
-- read every question WITH its answer key. Exams are meaningless until this is
-- closed. It is left commented because the OLD app's AssessmentAttemptScreen
-- reads `questions` directly; enable it together with the cut-over that moves
-- students onto question_versions / RPCs.
-- DONE in db/018_close_answer_key_read.sql (prompt 13); keep this commented.
--
-- drop policy if exists p_questions_read on public.questions;
-- create policy p_questions_read on public.questions
--   for select using (public.is_staff() or public.is_teacher());
