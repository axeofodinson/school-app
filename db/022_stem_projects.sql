-- ============================================================
--  022 — STEM projects (rubric-assessed, team-capable)
--                                              *** DRAFT — NOT YET RUN ***
--
--  Status: DRAFT (STEMP21_COMPARISON.md §5, DATABASE_DESIGN.md §6). Requires
--  017. Dry-run only against a throwaway local Postgres (TEST_PLAN.md DB-1).
--  Additive + idempotent. Number reserved for Phase 7; renumber at run time if
--  other migrations land first.
--
--  WHY
--  ---
--  STEMP21 (and the school's own teachers) run hands-on STEM projects assessed
--  by rubric. Rather than a separate vendor app, projects live in the school's
--  LMS so their results sit next to grades, attendance and concept mastery.
--
--  DESIGN
--  * `projects` is generic: source = 'school' | 'stemp21' | 'other'. Third-party
--    content is only loaded with written permission (licence_note records it).
--  * Assigning a project = an `assessments` row with type 'project' and
--    project_id, so due dates, class scoping, publishing and the existing grade
--    pipeline (submissions + record_grade audit, db/013) are reused unchanged.
--  * Rubric scores live in `project_scores` (one row per student per criterion)
--    so per-criterion analysis and concept-mastery feeds are plain queries.
--    The total goes through record_grade(), so every change is audited.
--  * Team projects: one team per student per assignment; a teacher can score a
--    team once and apply it to every member, then adjust individuals.
--  * Evidence (photos / short video / documents) in a private Storage bucket,
--    path = {assessment_id}/{enrollment_id}/{filename}.
-- ============================================================


-- ============================================================
--  PART 1 — Project catalogue
-- ============================================================
create table if not exists public.projects (
  id            uuid primary key default gen_random_uuid(),
  title_en      text not null,
  title_ur      text,
  summary_en    text,
  summary_ur    text,
  grade_min     int  not null default 1,
  grade_max     int  not null default 10,
  subject_id    uuid references public.subjects(id),      -- optional home subject
  sdg_theme     smallint check (sdg_theme between 1 and 17), -- UN SDG number
  materials     jsonb not null default '[]'::jsonb,        -- [{name{en,ur}, qty, kit_item?}]
  blocks        jsonb not null default '[]'::jsonb,        -- steps, same block schema as Learn
  team_size_max smallint not null default 1 check (team_size_max between 1 and 10),
  source        text not null default 'school' check (source in ('school','stemp21','other')),
  licence_note  text,                                       -- required when source <> 'school'
  status        text not null default 'draft'
                check (status in ('draft','reviewed','approved','retired')),
  created_by    uuid references public.profiles(id),
  is_test_data  boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (grade_min <= grade_max),
  check (source = 'school' or licence_note is not null)
);
drop trigger if exists t_projects_touch on public.projects;
create trigger t_projects_touch before update on public.projects
  for each row execute function public.touch_updated_at();
create index if not exists ix_projects_grade on public.projects(grade_min, grade_max, status);

-- STEM concepts a project practises (feeds concept_mastery as "apply" evidence).
create table if not exists public.project_concepts (
  project_id uuid not null references public.projects(id),
  concept_id uuid not null references public.concepts(id),
  primary key (project_id, concept_id)
);

create table if not exists public.project_rubric_criteria (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id),
  sort_order  int  not null default 0,
  title_en    text not null,
  title_ur    text,
  concept_id  uuid references public.concepts(id),
  max_points  numeric(5,2) not null check (max_points > 0),
  levels      jsonb not null default '[]'::jsonb,   -- [{points, desc{en,ur}}]
  retired_at  timestamptz                            -- never delete: scores point here
);
create index if not exists ix_prc_project on public.project_rubric_criteria(project_id, sort_order);


-- ============================================================
--  PART 2 — Assigning a project (reuse assessments)
-- ============================================================
alter table public.assessments drop constraint if exists assessments_type_check;
alter table public.assessments
  add constraint assessments_type_check
  check (type in ('assignment','test','exam','quiz','file','project'));
alter table public.assessments
  add column if not exists project_id uuid references public.projects(id);
alter table public.assessments drop constraint if exists assessments_project_link_check;
alter table public.assessments
  add constraint assessments_project_link_check
  check ((type = 'project') = (project_id is not null));


-- ============================================================
--  PART 3 — Teams
-- ============================================================
create table if not exists public.project_teams (
  id            uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id),
  name          text not null,
  created_by    uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  unique (assessment_id, name)
);

create table if not exists public.project_team_members (
  team_id       uuid not null references public.project_teams(id),
  assessment_id uuid not null references public.assessments(id),
  enrollment_id uuid not null references public.enrollments(id),
  primary key (team_id, enrollment_id),
  unique (assessment_id, enrollment_id)          -- one team per student per assignment
);

-- Keep member.assessment_id consistent with its team.
create or replace function public.ptm_match_team()
returns trigger language plpgsql as $$
begin
  if new.assessment_id is distinct from
     (select assessment_id from public.project_teams where id = new.team_id) then
    raise exception 'team_assessment_mismatch';
  end if;
  return new;
end $$;
drop trigger if exists t_ptm_match_team on public.project_team_members;
create trigger t_ptm_match_team before insert or update on public.project_team_members
  for each row execute function public.ptm_match_team();


-- ============================================================
--  PART 4 — Rubric scores
-- ============================================================
create table if not exists public.project_scores (
  assessment_id uuid not null references public.assessments(id),
  enrollment_id uuid not null references public.enrollments(id),
  criterion_id  uuid not null references public.project_rubric_criteria(id),
  points        numeric(5,2) not null check (points >= 0),
  remark        text,
  scored_by     uuid references public.profiles(id),
  scored_at     timestamptz not null default now(),
  primary key (assessment_id, enrollment_id, criterion_id)
);
create index if not exists ix_pscores_enrollment on public.project_scores(enrollment_id);

-- Score one student (or their whole team) on the rubric, then write the total
-- through record_grade() so the existing audit trail captures it.
--   p_scores: {"<criterion_id>": points, ...}
--   p_reason: required by record_grade when correcting an existing grade.
create or replace function public.score_project(
  p_assessment  uuid,
  p_enrollment  uuid,
  p_scores      jsonb,
  p_remark      text default null,
  p_whole_team  boolean default false,
  p_reason      text default null
) returns int
language plpgsql security definer set search_path = public as $$
declare
  a        public.assessments;
  targets  uuid[];
  t        uuid;
  k        text;
  crit     public.project_rubric_criteria;
  total    numeric;
  n        int := 0;
begin
  select * into a from public.assessments where id = p_assessment;
  if a.id is null or a.type <> 'project' then raise exception 'assessment_not_found'; end if;
  if not (public.is_staff() or public.teaches_class(a.class_id)) then
    raise exception 'not_authorized';
  end if;

  if p_whole_team then
    select array_agg(m2.enrollment_id) into targets
      from public.project_team_members m1
      join public.project_team_members m2 on m2.team_id = m1.team_id
     where m1.assessment_id = p_assessment and m1.enrollment_id = p_enrollment;
  end if;
  targets := coalesce(targets, array[p_enrollment]);

  foreach t in array targets loop
    if not exists (select 1 from public.enrollments e
                    where e.id = t and e.class_id = a.class_id and e.year_id = a.year_id) then
      raise exception 'enrollment_class_mismatch';
    end if;
    for k in select jsonb_object_keys(p_scores) loop
      select * into crit from public.project_rubric_criteria
       where id = k::uuid and project_id = a.project_id and retired_at is null;
      if crit.id is null then raise exception 'criterion_not_in_rubric'; end if;
      if (p_scores->>k)::numeric > crit.max_points then raise exception 'score_out_of_range'; end if;
      insert into public.project_scores
        (assessment_id, enrollment_id, criterion_id, points, remark, scored_by)
      values (p_assessment, t, crit.id, (p_scores->>k)::numeric, p_remark, auth.uid())
      on conflict (assessment_id, enrollment_id, criterion_id)
      do update set points = excluded.points, remark = excluded.remark,
                    scored_by = excluded.scored_by, scored_at = now();
    end loop;

    select coalesce(sum(points), 0) into total
      from public.project_scores where assessment_id = p_assessment and enrollment_id = t;
    perform public.record_grade(t, p_assessment, total, coalesce(p_reason, 'Rubric score'));
    n := n + 1;
  end loop;
  return n;   -- number of students graded
end $$;


-- ============================================================
--  PART 5 — Evidence bucket (photos / video / documents)
-- ============================================================
insert into storage.buckets (id, name, public)
values ('project-evidence', 'project-evidence', false)
on conflict (id) do nothing;

drop policy if exists p_pevidence_staff on storage.objects;
create policy p_pevidence_staff on storage.objects for all
  using (bucket_id = 'project-evidence' and public.is_staff())
  with check (bucket_id = 'project-evidence' and public.is_staff());

drop policy if exists p_pevidence_teacher_read on storage.objects;
create policy p_pevidence_teacher_read on storage.objects for select
  using (bucket_id = 'project-evidence' and public.is_teacher() and exists (
    select 1 from public.assessments a
     where a.id::text = (storage.foldername(name))[1] and public.teaches_class(a.class_id)));

-- Student: read/upload only under their own enrollment folder, for a published
-- project in their class (teammates' evidence is visible via the team path in app).
drop policy if exists p_pevidence_student on storage.objects;
create policy p_pevidence_student on storage.objects for all
  using (bucket_id = 'project-evidence' and exists (
    select 1 from public.enrollments e
     where e.id::text = (storage.foldername(name))[2]
       and e.student_id = public.my_student_id()))
  with check (bucket_id = 'project-evidence' and exists (
    select 1 from public.enrollments e
      join public.assessments a on a.id::text = (storage.foldername(name))[1]
     where e.id::text = (storage.foldername(name))[2]
       and e.student_id = public.my_student_id()
       and a.type = 'project' and a.status = 'published'
       and a.class_id = e.class_id and a.year_id = e.year_id));


-- ============================================================
--  PART 6 — Row-level security
-- ============================================================
alter table public.projects                enable row level security;
alter table public.project_concepts        enable row level security;
alter table public.project_rubric_criteria enable row level security;
alter table public.project_teams           enable row level security;
alter table public.project_team_members    enable row level security;
alter table public.project_scores          enable row level security;

-- Catalogue: everyone signed in reads approved projects; staff/teachers read all.
drop policy if exists p_projects_read on public.projects;
create policy p_projects_read on public.projects for select
  using (status = 'approved' or public.is_staff() or public.is_teacher());
drop policy if exists p_projects_write on public.projects;
create policy p_projects_write on public.projects for all
  using (public.is_staff() or (public.is_teacher() and created_by = auth.uid()))
  with check (public.is_staff() or (public.is_teacher() and created_by = auth.uid()));

drop policy if exists p_pconcepts_read on public.project_concepts;
create policy p_pconcepts_read on public.project_concepts for select using (auth.uid() is not null);
drop policy if exists p_pconcepts_write on public.project_concepts;
create policy p_pconcepts_write on public.project_concepts for all
  using (public.is_staff() or exists (select 1 from public.projects p
          where p.id = project_id and p.created_by = auth.uid()))
  with check (public.is_staff() or exists (select 1 from public.projects p
          where p.id = project_id and p.created_by = auth.uid()));

drop policy if exists p_prc_read on public.project_rubric_criteria;
create policy p_prc_read on public.project_rubric_criteria for select using (auth.uid() is not null);
drop policy if exists p_prc_write on public.project_rubric_criteria;
create policy p_prc_write on public.project_rubric_criteria for all
  using (public.is_staff() or exists (select 1 from public.projects p
          where p.id = project_id and p.created_by = auth.uid()))
  with check (public.is_staff() or exists (select 1 from public.projects p
          where p.id = project_id and p.created_by = auth.uid()));

-- Teams: teacher of the class manages; students read teams of their own class.
drop policy if exists p_pteams_teacher on public.project_teams;
create policy p_pteams_teacher on public.project_teams for all
  using (public.is_staff() or exists (select 1 from public.assessments a
          where a.id = assessment_id and public.teaches_class(a.class_id)))
  with check (public.is_staff() or exists (select 1 from public.assessments a
          where a.id = assessment_id and public.teaches_class(a.class_id)));
drop policy if exists p_pteams_student on public.project_teams;
create policy p_pteams_student on public.project_teams for select
  using (exists (select 1 from public.assessments a
           join public.enrollments e on e.class_id = a.class_id and e.year_id = a.year_id
          where a.id = assessment_id and a.status = 'published'
            and e.student_id = public.my_student_id()));

drop policy if exists p_ptm_teacher on public.project_team_members;
create policy p_ptm_teacher on public.project_team_members for all
  using (public.is_staff() or exists (select 1 from public.assessments a
          where a.id = assessment_id and public.teaches_class(a.class_id)))
  with check (public.is_staff() or exists (select 1 from public.assessments a
          where a.id = assessment_id and public.teaches_class(a.class_id)));
drop policy if exists p_ptm_student on public.project_team_members;
create policy p_ptm_student on public.project_team_members for select
  using (exists (select 1 from public.assessments a
           join public.enrollments e on e.class_id = a.class_id and e.year_id = a.year_id
          where a.id = assessment_id and a.status = 'published'
            and e.student_id = public.my_student_id()));

-- Scores: written only through score_project(); read by own student / teacher.
drop policy if exists p_pscores_read on public.project_scores;
create policy p_pscores_read on public.project_scores for select
  using (public.is_staff()
         or exists (select 1 from public.enrollments e
                     where e.id = enrollment_id and e.student_id = public.my_student_id())
         or exists (select 1 from public.assessments a
                     where a.id = assessment_id and public.teaches_class(a.class_id)));
