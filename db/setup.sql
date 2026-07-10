-- ============================================================
--  SCHOOL PLATFORM — ONE-SHOT SETUP  (Postgres / Supabase)
--
--  Paste this WHOLE file into a blank Supabase SQL query and Run.
--  It does everything in one go and is SAFE TO RE-RUN: it wipes any
--  previous half-built state first, then rebuilds cleanly. If you
--  ever get into a mess again, just run this file again.
--
--  You will see two safety popups — both are expected here:
--    * "destructive operations"  -> Run query   (it's the reset)
--    * "without RLS"             -> Run without RLS (policies are below)
-- ============================================================


-- ============================================================
--  PART 0 — RESET (clears any earlier partial/broken state)
-- ============================================================
drop trigger if exists t_on_auth_user_created on auth.users;
drop table if exists
  public.attendance, public.submissions, public.assessment_questions,
  public.assessments, public.teacher_assignments, public.enrollments,
  public.students, public.questions, public.chapters, public.subjects,
  public.classes, public.academic_years, public.profiles cascade;
drop function if exists public.handle_new_user cascade;
drop function if exists public.touch_updated_at cascade;
drop function if exists public.my_role cascade;
drop function if exists public.is_staff cascade;
drop function if exists public.is_teacher cascade;
drop function if exists public.teaches_class cascade;


-- ============================================================
--  PART 1 — SCHEMA
-- ============================================================
create extension if not exists pgcrypto;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  role        text not null default 'pending'
              check (role in ('developer','admin','teacher','student','parent','pending')),
  full_name   text,
  phone       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger t_profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end $$;
create trigger t_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.academic_years (
  id          uuid primary key default gen_random_uuid(),
  label       text not null unique,
  starts_on   date,
  ends_on     date,
  is_current  boolean not null default false
);

create table public.classes (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  grade_level int  not null,
  sort_order  int  not null default 0,
  unique (name)
);

create table public.subjects (
  id          uuid primary key default gen_random_uuid(),
  class_id    uuid not null references public.classes(id) on delete cascade,
  name        text not null,
  sort_order  int  not null default 0,
  unique (class_id, name)
);

create table public.chapters (
  id          uuid primary key default gen_random_uuid(),
  subject_id  uuid not null references public.subjects(id) on delete cascade,
  title       text not null,
  sort_order  int  not null default 0
);

create table public.questions (
  id             uuid primary key default gen_random_uuid(),
  chapter_id     uuid not null references public.chapters(id) on delete cascade,
  type           text not null default 'mcq'
                 check (type in ('mcq','multi_select','numeric','short_text',
                                 'true_false','tap_image','match')),
  cognitive_level text not null default 'recall'
                 check (cognitive_level in ('recall','understand','apply','analyze')),
  body           jsonb not null,
  answer         jsonb,
  default_marks  int not null default 1,
  created_by     uuid references public.profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger t_questions_touch before update on public.questions
  for each row execute function public.touch_updated_at();

create table public.students (
  id             uuid primary key default gen_random_uuid(),
  student_code   text not null unique,
  full_name      text not null,
  date_of_birth  date,
  admission_date date not null default current_date,
  guardian_name  text,
  guardian_phone text,
  created_at     timestamptz not null default now()
);

create table public.enrollments (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.students(id) on delete cascade,
  class_id    uuid not null references public.classes(id),
  year_id     uuid not null references public.academic_years(id),
  roll_number int,
  status      text not null default 'active'
              check (status in ('active','transferred','graduated','withdrawn')),
  created_at  timestamptz not null default now(),
  unique (student_id, year_id)
);

create table public.teacher_assignments (
  id          uuid primary key default gen_random_uuid(),
  teacher_id  uuid not null references public.profiles(id) on delete cascade,
  class_id    uuid not null references public.classes(id) on delete cascade,
  subject_id  uuid references public.subjects(id) on delete cascade,
  year_id     uuid not null references public.academic_years(id) on delete cascade,
  unique (teacher_id, class_id, subject_id, year_id)
);

create table public.assessments (
  id          uuid primary key default gen_random_uuid(),
  year_id     uuid not null references public.academic_years(id),
  class_id    uuid not null references public.classes(id),
  subject_id  uuid not null references public.subjects(id),
  title       text not null,
  type        text not null default 'assignment'
              check (type in ('assignment','test','exam','quiz')),
  weightage   numeric(5,2) not null default 0,
  total_marks int,
  scheduled_on date,
  status      text not null default 'draft'
              check (status in ('draft','published','closed')),
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now()
);

create table public.assessment_questions (
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  question_id   uuid not null references public.questions(id) on delete cascade,
  marks         int not null default 1,
  sort_order    int not null default 0,
  primary key (assessment_id, question_id)
);

create table public.submissions (
  id            uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  score         numeric(6,2),
  responses     jsonb,
  graded_by     uuid references public.profiles(id),
  submitted_at  timestamptz,
  graded_at     timestamptz,
  unique (enrollment_id, assessment_id)
);

create table public.attendance (
  id            uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  on_date       date not null default current_date,
  status        text not null default 'present'
                check (status in ('present','absent','late','leave')),
  marked_by     uuid references public.profiles(id),
  unique (enrollment_id, on_date)
);

create index ix_subjects_class      on public.subjects(class_id);
create index ix_chapters_subject    on public.chapters(subject_id);
create index ix_questions_chapter   on public.questions(chapter_id);
create index ix_questions_cog       on public.questions(cognitive_level);
create index ix_enroll_student      on public.enrollments(student_id);
create index ix_enroll_class_year   on public.enrollments(class_id, year_id);
create index ix_ta_teacher          on public.teacher_assignments(teacher_id);
create index ix_assess_class_year   on public.assessments(class_id, year_id);
create index ix_subs_assessment     on public.submissions(assessment_id);
create index ix_subs_enrollment     on public.submissions(enrollment_id);
create index ix_att_enroll_date     on public.attendance(enrollment_id, on_date);


-- ============================================================
--  PART 2 — ROW-LEVEL SECURITY
-- ============================================================
create or replace function public.my_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_staff()
returns boolean language sql stable as $$
  select public.my_role() in ('developer','admin')
$$;

create or replace function public.is_teacher()
returns boolean language sql stable as $$
  select public.my_role() = 'teacher'
$$;

create or replace function public.teaches_class(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.teacher_assignments ta
    where ta.teacher_id = auth.uid() and ta.class_id = cid
  )
$$;

alter table public.profiles             enable row level security;
alter table public.academic_years       enable row level security;
alter table public.classes              enable row level security;
alter table public.subjects             enable row level security;
alter table public.chapters             enable row level security;
alter table public.questions            enable row level security;
alter table public.students             enable row level security;
alter table public.enrollments          enable row level security;
alter table public.teacher_assignments  enable row level security;
alter table public.assessments          enable row level security;
alter table public.assessment_questions enable row level security;
alter table public.submissions          enable row level security;
alter table public.attendance           enable row level security;

create policy p_profiles_self_read on public.profiles
  for select using (id = auth.uid() or public.is_staff());
create policy p_profiles_self_update on public.profiles
  for update using (id = auth.uid());
create policy p_profiles_staff_all on public.profiles
  for all using (public.is_staff()) with check (public.is_staff());

do $$
declare t text;
begin
  foreach t in array array['academic_years','classes','subjects','chapters'] loop
    execute format(
      'create policy p_%1$s_read on public.%1$s for select using (auth.uid() is not null)', t);
    execute format(
      'create policy p_%1$s_staff on public.%1$s for all using (public.is_staff()) with check (public.is_staff())', t);
  end loop;
end $$;

create policy p_questions_read on public.questions
  for select using (auth.uid() is not null);
create policy p_questions_teacher_write on public.questions
  for insert with check (public.is_teacher() or public.is_staff());
create policy p_questions_owner_update on public.questions
  for update using (created_by = auth.uid() or public.is_staff());
create policy p_questions_staff_all on public.questions
  for all using (public.is_staff()) with check (public.is_staff());

create policy p_students_staff on public.students
  for all using (public.is_staff()) with check (public.is_staff());
create policy p_students_teacher_read on public.students
  for select using (
    public.is_teacher() and exists (
      select 1 from public.enrollments e
      where e.student_id = students.id and public.teaches_class(e.class_id)
    )
  );

create policy p_enroll_staff on public.enrollments
  for all using (public.is_staff()) with check (public.is_staff());
create policy p_enroll_teacher_read on public.enrollments
  for select using (public.is_teacher() and public.teaches_class(class_id));

create policy p_ta_self_read on public.teacher_assignments
  for select using (teacher_id = auth.uid() or public.is_staff());
create policy p_ta_staff on public.teacher_assignments
  for all using (public.is_staff()) with check (public.is_staff());

create policy p_assess_staff on public.assessments
  for all using (public.is_staff()) with check (public.is_staff());
create policy p_assess_teacher_read on public.assessments
  for select using (public.is_teacher() and public.teaches_class(class_id));
create policy p_assess_teacher_write on public.assessments
  for insert with check (public.is_teacher() and public.teaches_class(class_id));
create policy p_assess_teacher_update on public.assessments
  for update using (public.is_teacher() and public.teaches_class(class_id));

create policy p_aq_staff on public.assessment_questions
  for all using (public.is_staff()) with check (public.is_staff());
create policy p_aq_teacher on public.assessment_questions
  for all using (
    public.is_teacher() and exists (
      select 1 from public.assessments a
      where a.id = assessment_questions.assessment_id and public.teaches_class(a.class_id))
  ) with check (
    public.is_teacher() and exists (
      select 1 from public.assessments a
      where a.id = assessment_questions.assessment_id and public.teaches_class(a.class_id))
  );

create policy p_subs_staff on public.submissions
  for all using (public.is_staff()) with check (public.is_staff());
create policy p_subs_teacher on public.submissions
  for all using (
    public.is_teacher() and exists (
      select 1 from public.enrollments e
      where e.id = submissions.enrollment_id and public.teaches_class(e.class_id))
  ) with check (
    public.is_teacher() and exists (
      select 1 from public.enrollments e
      where e.id = submissions.enrollment_id and public.teaches_class(e.class_id))
  );

create policy p_att_staff on public.attendance
  for all using (public.is_staff()) with check (public.is_staff());
create policy p_att_teacher on public.attendance
  for all using (
    public.is_teacher() and exists (
      select 1 from public.enrollments e
      where e.id = attendance.enrollment_id and public.teaches_class(e.class_id))
  ) with check (
    public.is_teacher() and exists (
      select 1 from public.enrollments e
      where e.id = attendance.enrollment_id and public.teaches_class(e.class_id))
  );


-- ============================================================
--  PART 3 — SEED (starter data; safe if already present)
-- ============================================================
insert into public.academic_years (label, starts_on, ends_on, is_current)
values ('2025-26', '2025-04-01', '2026-03-31', true)
on conflict (label) do nothing;

insert into public.classes (name, grade_level, sort_order) values
  ('PG', -2, 0),
  ('Class 9', 9, 11)
on conflict (name) do nothing;

insert into public.subjects (class_id, name, sort_order)
select (select id from public.classes where name = 'PG'), 'Early Numeracy', 0
on conflict (class_id, name) do nothing;
insert into public.subjects (class_id, name, sort_order)
select (select id from public.classes where name = 'Class 9'), 'Physics', 0
on conflict (class_id, name) do nothing;

insert into public.chapters (subject_id, title, sort_order)
select id, 'Counting & Grouping', 0 from public.subjects where name = 'Early Numeracy';
insert into public.chapters (subject_id, title, sort_order)
select id, 'Motion', 0 from public.subjects where name = 'Physics';

insert into public.questions (chapter_id, type, cognitive_level, body, answer, default_marks)
select id, 'mcq', 'apply',
  jsonb_build_object(
    'stem', 'A car accelerates uniformly from rest to 20 m/s in 8 s. How far does it travel?',
    'options', jsonb_build_array(
      jsonb_build_object('key','A','text','80 m'),
      jsonb_build_object('key','B','text','160 m'),
      jsonb_build_object('key','C','text','320 m'),
      jsonb_build_object('key','D','text','40 m'))),
  jsonb_build_object('correct','A','worked','s = ½(u+v)t = ½(0+20)(8) = 80 m'),
  2
from public.chapters where title = 'Motion';

insert into public.questions (chapter_id, type, cognitive_level, body, answer, default_marks)
select id, 'tap_image', 'understand',
  jsonb_build_object(
    'prompt_audio', 'audio/which-has-more.mp3',
    'prompt_text', 'Tap the box with MORE apples',
    'choices', jsonb_build_array(
      jsonb_build_object('id','left','image','img/apples-2.png','count',2),
      jsonb_build_object('id','right','image','img/apples-5.png','count',5))),
  jsonb_build_object('correct','right'),
  1
from public.chapters where title = 'Counting & Grouping';


-- ============================================================
--  PART 4 — MAKE YOURSELF THE DEVELOPER
--  (Your auth user already exists; this gives it a profile row
--   set to 'developer'. Change the email if you use a different one.)
-- ============================================================
insert into public.profiles (id, role)
select id, 'developer' from auth.users
where email = 'axeofodinson@gmail.com'
on conflict (id) do update set role = 'developer';
