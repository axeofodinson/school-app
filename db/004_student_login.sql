-- ============================================================
--  004 — Student login (school-issued roll number + PIN)
--
--  Additive migration. The read-side pieces (Parts 1–4) are SAFE to run on a
--  live database (no drops, no data loss) and idempotent (safe to re-run).
--  Part 5 (provisioning) creates auth accounts and must be reviewed against
--  your project's GoTrue version before use — see its header.
--
--  WHY THIS EXISTS
--  ---------------
--  setup.sql models students as records (`students` + `enrollments`) but gives
--  them NO way to sign in: there is no credential store and no link from a
--  login account (`profiles`, keyed to `auth.users`) to a `students` row. RLS
--  is the security boundary (CLAUDE.md rule 4) and every policy keys on
--  `auth.uid()`, so a student needs a REAL Supabase session for RLS to scope
--  them to their own data.
--
--  THE APPROACH (kept separate from the staff email/password flow)
--  ---------------------------------------------------------------
--  A student never creates an email account (CLAUDE.md: "student auth is
--  school-issued ... never a child creating an email/password account"). The
--  school issues each enrolled student a PIN. Under the hood we reuse Supabase
--  Auth so the existing session plumbing (getSession, autoRefresh,
--  persistSession, onAuthStateChange, RLS via auth.uid()) works unchanged:
--
--    * The auth account's email is a SYNTHESIZED, non-routable address derived
--      from the student's enrollment id (see student_login_handle) — the child
--      never sees or types it. Its password is the school-issued PIN.
--    * The child signs in with three things they know: their CLASS (tapped from
--      a picker), their ROLL NUMBER, and their PIN.
--    * `student_login_email(class_id, roll)` maps the kid-friendly identity to
--      the synthesized email so the app can call signInWithPassword. Sign-in
--      still requires the PIN.
--    * A `profiles` row with role='student' and `student_id` set links the
--      session back to the student record; RLS uses that link (Part 4).
--
--  Roll numbers live on `enrollments` (per class, per year), so the login
--  identity is naturally scoped to the CURRENT academic year — re-issued each
--  year as part of enrollment, which matches how the rest of the app models
--  time (CLAUDE.md rule 2).
--
--  Run it once in the Supabase SQL Editor after setup.sql.
-- ============================================================


-- ============================================================
--  PART 1 — Link a login account to a student record
-- ============================================================
-- A student's `profiles` row points at their `students` row. Nullable because
-- staff/teacher/parent profiles have no student_id. Unique so one student maps
-- to at most one login account.
alter table public.profiles
  add column if not exists student_id uuid references public.students(id) on delete cascade;

create unique index if not exists ux_profiles_student
  on public.profiles(student_id) where student_id is not null;


-- ============================================================
--  PART 2 — Synthesized login handle (single source of truth)
-- ============================================================
-- The synthesized, non-routable email for a given enrollment. Both the login
-- lookup (Part 3) and provisioning (Part 5) derive the address from here, so
-- they can never drift. `.invalid` is a reserved TLD — the address can never
-- reach a real inbox, which is the point: it's an internal identifier, not a
-- contactable email.
create or replace function public.student_login_handle(p_enrollment_id uuid)
returns text
language sql immutable set search_path = public as $$
  select 's.' || replace(p_enrollment_id::text, '-', '') || '@students.school.invalid'
$$;


-- ============================================================
--  PART 3 — Read-side RPCs the (pre-auth) login screen calls
-- ============================================================
-- Before sign-in there is no session, so RLS hides `classes` and `enrollments`.
-- These two SECURITY DEFINER functions are the deliberate, minimal, read-only
-- public surface the login screen needs — nothing more is exposed to `anon`.

-- Class list for the login picker (keeps the picker data-driven, not a
-- hardcoded class list — CLAUDE.md rule 1). Exposes only id + name.
create or replace function public.login_classes()
returns table (id uuid, name text)
language sql stable security definer set search_path = public as $$
  select c.id, c.name
  from public.classes c
  order by c.sort_order, c.name
$$;

-- Resolve (class, roll number) in the CURRENT academic year to the synthesized
-- login email, or null when there is no matching active enrollment. Returns
-- only the derived handle — never student PII. Signing in still requires the
-- PIN, so at most this confirms a roll number exists in a class; that is
-- low-sensitivity for a school roster. If you want to remove even that signal,
-- move this lookup behind an Edge Function that also checks the PIN.
create or replace function public.student_login_email(p_class_id uuid, p_roll int)
returns text
language sql stable security definer set search_path = public as $$
  select public.student_login_handle(e.id)
  from public.enrollments e
  join public.academic_years y on y.id = e.year_id
  where e.class_id = p_class_id
    and e.roll_number = p_roll
    and e.status = 'active'
    and y.is_current
  limit 1
$$;

-- Only these two functions are reachable before sign-in.
revoke all on function public.login_classes() from public;
revoke all on function public.student_login_email(uuid, int) from public;
grant execute on function public.login_classes() to anon, authenticated;
grant execute on function public.student_login_email(uuid, int) to anon, authenticated;


-- ============================================================
--  PART 4 — Student self-read RLS
-- ============================================================
-- The signed-in student's own student_id, from their profile. SECURITY DEFINER
-- so the profile lookup isn't itself blocked by RLS; exposes only a uuid.
create or replace function public.my_student_id()
returns uuid
language sql stable security definer set search_path = public as $$
  select student_id from public.profiles where id = auth.uid()
$$;

-- These are additive `for select` policies. Postgres RLS is permissive (OR), so
-- they widen read access ONLY for the matching student and never weaken the
-- existing staff/teacher policies. A student can read their own student record,
-- their enrollments, and the submissions/attendance that hang off them.
-- (Syllabus, questions, classes and academic_years are already readable by any
-- authenticated user via setup.sql, so the student home can show them.)
drop policy if exists p_students_self_read on public.students;
create policy p_students_self_read on public.students
  for select using (id = public.my_student_id());

drop policy if exists p_enroll_student_read on public.enrollments;
create policy p_enroll_student_read on public.enrollments
  for select using (student_id = public.my_student_id());

drop policy if exists p_subs_student_read on public.submissions;
create policy p_subs_student_read on public.submissions
  for select using (exists (
    select 1 from public.enrollments e
    where e.id = submissions.enrollment_id
      and e.student_id = public.my_student_id()));

drop policy if exists p_att_student_read on public.attendance;
create policy p_att_student_read on public.attendance
  for select using (exists (
    select 1 from public.enrollments e
    where e.id = attendance.enrollment_id
      and e.student_id = public.my_student_id()));


-- ============================================================
--  PART 5 — Provisioning  (⚠️ REVIEW BEFORE USE)
-- ============================================================
--  This is the one privileged step: it creates the Supabase Auth account for a
--  student and links it to their record. It cannot run from the app (which
--  holds only the anon key) — it must be invoked by staff, e.g. from the admin
--  console via an RPC or an Edge Function, or run by hand in the SQL Editor.
--
--  ⚠️  It writes directly into auth.users / auth.identities. Those tables are
--      owned by GoTrue and their columns drift between Supabase versions (e.g.
--      NOT NULL token columns). The insert below sets the columns required by
--      current GoTrue and blanks the common NOT NULL token columns, but you
--      MUST verify it against YOUR project before trusting it for real
--      accounts. In production, prefer the GoTrue Admin API
--      (auth.admin.createUser with email_confirm:true) from an Edge Function —
--      it is the supported path — and keep this SQL as the reference for what
--      that call must produce.
--
--  Notes:
--    * Password = the raw PIN. Direct insert via crypt() bypasses GoTrue's
--      signup min-password-length check, so short PINs (e.g. 4 digits) work;
--      signInWithPassword does not re-check length. Still, longer PINs are
--      safer — rate-limit sign-ins at the edge for a kids' roster.
--    * Idempotent per enrollment: re-provisioning updates the PIN in place.
--    * The email is derived from student_login_handle(enrollment_id), so it
--      matches what student_login_email() returns at login time.
create or replace function public.provision_student_login(
  p_enrollment_id uuid,
  p_pin text
)
returns uuid
language plpgsql security definer set search_path = public, auth, extensions as $$
declare
  v_student_id uuid;
  v_full_name  text;
  v_email      text;
  v_uid        uuid;
begin
  if not public.is_staff() then
    raise exception 'only staff may provision student logins';
  end if;

  select e.student_id, s.full_name
    into v_student_id, v_full_name
  from public.enrollments e
  join public.students s on s.id = e.student_id
  where e.id = p_enrollment_id;

  if v_student_id is null then
    raise exception 'enrollment % not found', p_enrollment_id;
  end if;

  v_email := public.student_login_handle(p_enrollment_id);

  select id into v_uid from auth.users where email = v_email;

  if v_uid is null then
    v_uid := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
      v_email, crypt(p_pin, gen_salt('bf')),
      now(), now(), now(),
      jsonb_build_object('provider','email','providers', jsonb_build_array('email')),
      jsonb_build_object('full_name', v_full_name),
      '', '', '', ''
    );
    insert into auth.identities (
      id, user_id, provider_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), v_uid, v_uid::text,
      jsonb_build_object('sub', v_uid::text, 'email', v_email),
      'email', now(), now(), now()
    );
  else
    update auth.users
      set encrypted_password = crypt(p_pin, gen_salt('bf')),
          updated_at = now()
      where id = v_uid;
  end if;

  -- Link + promote the profile. The handle_new_user trigger already inserted a
  -- 'pending' row on the auth.users insert; upsert makes this safe either way.
  insert into public.profiles (id, role, full_name, student_id)
  values (v_uid, 'student', v_full_name, v_student_id)
  on conflict (id) do update
    set role = 'student', full_name = excluded.full_name, student_id = excluded.student_id;

  return v_uid;
end $$;

-- Callable only by authenticated staff (the body re-checks is_staff()).
revoke all on function public.provision_student_login(uuid, text) from public;
grant execute on function public.provision_student_login(uuid, text) to authenticated;
