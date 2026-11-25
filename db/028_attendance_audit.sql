-- ============================================================
--  028 — Attendance: one write path, every change kept (prompt 14)
--
--  DRAFT — NOT YET RUN. Additive and idempotent: new columns are guarded, the
--  new table is "if not exists", functions are CREATE OR REPLACE, triggers and
--  policies are dropped then recreated. No rows are changed or removed. Needs
--  setup.sql + 002–016 only (uses is_staff(), is_teacher(), teaches_class()).
--  Independent of 017, 018, 023, 024–027: safe on dev (018 applied) and on
--  production (018 not applied yet). Run DEV FIRST, then production, in the
--  Supabase SQL Editor. Smoke: db/test/028_smoke.sql (TEST_PLAN AD-1).
--
--  WHY
--  ---
--  setup.sql's attendance table keeps only the current status of each
--  (enrollment, day). Re-marking a day overwrote it: what it was, who changed it
--  and why were lost, and the p_att_* policies are FOR ALL, so a teacher (or
--  anyone with the app's key and a teacher login) could also delete rows.
--  Prompt 14 needs "edit past days with an audit reason" and an offline queue
--  that sends a whole class-day in one request.
--
--  WHAT
--  ----
--  1. attendance gets marked_at, edit_count, last_edited_at (+ an on_date index
--     for the office's whole-school day summary).
--  2. attendance_edits: append-only history (old status → new status, reason,
--     who, when). Staff and the class's teachers read it; students never do;
--     nobody writes it through the API (only the trigger below does).
--  3. Triggers on attendance:
--       * guard (runs as the caller): a client session (authenticated / anon)
--         can't delete attendance, can't move a row to another student or day.
--       * audit (SECURITY DEFINER): every status change bumps edit_count and
--         appends one attendance_edits row. Unchanged re-saves keep the row as
--         it was (no history noise, the first marker stays the marker).
--     They fire for every writer, so the OLD APP (src/screens/console/
--     AttendanceScreen.js, a plain upsert) keeps working and its changes are
--     recorded too, with the reason 'Changed in the old app'.
--  4. record_attendance(class, day, marks[], reason, taken_at): the new app's
--     single write path. Checks the caller teaches the class (or is staff), the
--     day isn't in the future (school time, Asia/Karachi), every enrollment is
--     in that class, and requires a reason when it changes a day that was
--     already over when the teacher pressed Save. All or nothing.
--  5. Two read functions for summaries (SECURITY INVOKER: RLS still decides
--     what each caller sees): attendance_day_summary (each class's counts for a
--     day) and attendance_student_summary (each student's counts over a range).
--
--  WHAT IT DOESN'T DO
--  ------------------
--  * It doesn't stop the old app's direct upsert (that would break attendance
--    for teachers still on it). Once nobody uses the old console, a later
--    migration can drop the client write policies so record_attendance() is the
--    only path (MODULE_STATUS follow-up).
--  * Old rows are kept as they are (marked_at stays null: unknown).
--
--  CHECK AFTERWARDS (read-only):
--    select count(*) as rows, count(marked_at) as with_time from public.attendance;
--    select proname from pg_proc where proname in
--      ('record_attendance','attendance_day_summary','attendance_student_summary');
-- ============================================================


-- ============================================================
--  PART 1 — Columns + index
-- ============================================================
alter table public.attendance
  add column if not exists marked_at      timestamptz,
  add column if not exists edit_count     int not null default 0,
  add column if not exists last_edited_at timestamptz;
alter table public.attendance alter column marked_at set default now();

-- The office's day summary reads one date across every class.
create index if not exists ix_att_date on public.attendance(on_date);


-- ============================================================
--  PART 2 — attendance_edits (append-only history)
-- ============================================================
create table if not exists public.attendance_edits (
  id            uuid primary key default gen_random_uuid(),
  attendance_id uuid not null references public.attendance(id) on delete cascade,
  prev_status   text not null,
  new_status    text not null,
  reason        text not null,
  edited_by     uuid references public.profiles(id),
  edited_at     timestamptz not null default now()
);
create index if not exists ix_att_edits_attendance on public.attendance_edits(attendance_id);

alter table public.attendance_edits enable row level security;

-- Read: staff, or a teacher of the row's class. No insert/update/delete
-- policies: the audit trigger (definer) is the only writer.
drop policy if exists p_att_edits_read on public.attendance_edits;
create policy p_att_edits_read on public.attendance_edits
  for select using (
    public.is_staff() or (
      public.is_teacher() and exists (
        select 1 from public.attendance a
        join public.enrollments e on e.id = a.enrollment_id
        where a.id = attendance_edits.attendance_id
          and public.teaches_class(e.class_id)))
  );

revoke insert, update, delete, truncate on public.attendance_edits from anon, authenticated;
revoke all on public.attendance_edits from anon;
grant select on public.attendance_edits to authenticated;


-- ============================================================
--  PART 3 — Triggers on attendance
-- ============================================================
-- 3a. Guard: runs as the caller, so current_user is the API role for app
-- sessions and the owner inside definer functions (record_attendance, 011's
-- dev_hard_delete_student) and in the SQL Editor.
create or replace function public.attendance_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    raise exception 'attendance_delete_forbidden'
      using errcode = '42501',
            hint = 'Attendance is never deleted from the app; mark the day again instead.';
  end if;
  if new.enrollment_id is distinct from old.enrollment_id
     or new.on_date is distinct from old.on_date then
    raise exception 'attendance_move_forbidden'
      using errcode = '42501', hint = 'A mark belongs to one student and one day.';
  end if;
  return new;
end $$;

drop trigger if exists trg_attendance_guard on public.attendance;
create trigger trg_attendance_guard
  before update or delete on public.attendance
  for each row execute function public.attendance_guard();

-- 3b. Audit: definer, so it can append to attendance_edits (no client insert
-- policy). The reason comes from record_attendance() through a transaction-local
-- setting; any other writer (the old app's upsert, the SQL Editor) gets a fixed
-- one. Trigger functions can't be called through the API.
create or replace function public.attendance_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text;
begin
  if tg_op = 'INSERT' then
    new.marked_at      := now();
    new.edit_count     := 0;
    new.last_edited_at := null;
    new.marked_by      := coalesce(auth.uid(), new.marked_by);
    return new;
  end if;

  -- UPDATE. Bookkeeping columns follow the status, never the caller.
  if new.status is not distinct from old.status then
    new.marked_by      := old.marked_by;
    new.marked_at      := old.marked_at;
    new.edit_count     := old.edit_count;
    new.last_edited_at := old.last_edited_at;
    return new;
  end if;

  v_reason := coalesce(nullif(btrim(current_setting('app.attendance_reason', true)), ''),
                       'Changed in the old app');
  insert into public.attendance_edits (attendance_id, prev_status, new_status, reason, edited_by)
  values (old.id, old.status, new.status, v_reason, auth.uid());

  new.marked_by      := coalesce(auth.uid(), new.marked_by, old.marked_by);
  new.marked_at      := old.marked_at;
  new.edit_count     := old.edit_count + 1;
  new.last_edited_at := now();
  return new;
end $$;

drop trigger if exists trg_attendance_audit on public.attendance;
create trigger trg_attendance_audit
  before insert or update on public.attendance
  for each row execute function public.attendance_audit();


-- ============================================================
--  PART 4 — record_attendance(): the new app's write path
-- ============================================================
-- p_marks: [{"enrollment_id": uuid, "status": "present|absent|late|leave"}, …]
-- p_taken_at: when the teacher pressed Save on the device (the offline queue
--   may send it later). Clamped to [p_on_date, now()]; older than 7 days = now().
--   It only decides whether the day was already over, i.e. whether a change
--   needs a reason.
-- Returns {"inserted": n, "changed": n, "unchanged": n}.
-- Stable error messages the app maps to words: not_authorized, date_required,
-- date_in_future, marks_required, too_many_marks, bad_mark, duplicate_enrollment,
-- enrollment_class_mismatch, enrollment_not_active, reason_required.
create or replace function public.record_attendance(
  p_class_id uuid,
  p_on_date  date,
  p_marks    jsonb,
  p_reason   text default null,
  p_taken_at timestamptz default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_today    date := (now() at time zone 'Asia/Karachi')::date;
  v_taken    date;
  v_reason   text := nullif(btrim(p_reason), '');
  v_item     jsonb;
  v_enr      uuid;
  v_status   text;
  v_estatus  text;
  v_eclass   uuid;
  v_old      text;
  v_seen     uuid[] := '{}';
  v_ins      int := 0;
  v_chg      int := 0;
  v_same     int := 0;
  v_rows     int;
begin
  if not (public.is_staff() or (public.is_teacher() and public.teaches_class(p_class_id))) then
    raise exception 'not_authorized';
  end if;
  if p_on_date is null then
    raise exception 'date_required';
  end if;
  if p_on_date > v_today then
    raise exception 'date_in_future';
  end if;
  if p_marks is null or jsonb_typeof(p_marks) <> 'array' or jsonb_array_length(p_marks) = 0 then
    raise exception 'marks_required';
  end if;
  if jsonb_array_length(p_marks) > 300 then
    raise exception 'too_many_marks';
  end if;

  -- taken_at only waives the reason for a day corrected on the day itself (a
  -- queued offline save sent later). Never later than now(); older than a week
  -- counts as now(), so a stale or set-back device clock can't skip the reason.
  v_taken := (case when p_taken_at is null or p_taken_at < now() - interval '7 days'
                   then now() else least(p_taken_at, now()) end
              at time zone 'Asia/Karachi')::date;
  if v_taken < p_on_date then
    v_taken := p_on_date;
  end if;

  -- Pass 1: check everything before writing anything.
  for v_item in select * from jsonb_array_elements(p_marks) loop
    begin
      v_enr    := (v_item ->> 'enrollment_id')::uuid;
      v_status := v_item ->> 'status';
    exception when others then
      raise exception 'bad_mark';
    end;
    if v_enr is null or v_status is null
       or v_status not in ('present', 'absent', 'late', 'leave') then
      raise exception 'bad_mark';
    end if;
    if v_enr = any (v_seen) then
      raise exception 'duplicate_enrollment';
    end if;
    v_seen := v_seen || v_enr;

    select e.class_id, e.status into v_eclass, v_estatus
      from public.enrollments e where e.id = v_enr;
    if v_eclass is distinct from p_class_id then
      raise exception 'enrollment_class_mismatch';
    end if;

    select a.status into v_old from public.attendance a
     where a.enrollment_id = v_enr and a.on_date = p_on_date;
    if not found then
      -- A new mark only for a student still in the class; a struck-off
      -- student's existing days can still be corrected.
      if v_estatus <> 'active' then
        raise exception 'enrollment_not_active';
      end if;
    elsif v_old <> v_status and p_on_date < v_taken and v_reason is null then
      raise exception 'reason_required';
    end if;
  end loop;

  -- Pass 2: write. The audit trigger reads the reason from this setting.
  perform set_config('app.attendance_reason', coalesce(v_reason, 'Changed the same day'), true);
  for v_item in select * from jsonb_array_elements(p_marks) loop
    v_enr    := (v_item ->> 'enrollment_id')::uuid;
    v_status := v_item ->> 'status';
    select a.status into v_old from public.attendance a
     where a.enrollment_id = v_enr and a.on_date = p_on_date;
    if not found then
      -- Another device (or the old app) may have marked this student-day since
      -- pass 1: then treat it as a change instead of failing the whole batch.
      insert into public.attendance (enrollment_id, on_date, status, marked_by)
      values (v_enr, p_on_date, v_status, auth.uid())
      on conflict (enrollment_id, on_date) do nothing;
      get diagnostics v_rows = row_count;
      if v_rows = 1 then
        v_ins := v_ins + 1;
      else
        select a.status into v_old from public.attendance a
         where a.enrollment_id = v_enr and a.on_date = p_on_date;
        if v_old <> v_status then
          update public.attendance set status = v_status
           where enrollment_id = v_enr and on_date = p_on_date;
          v_chg := v_chg + 1;
        else
          v_same := v_same + 1;
        end if;
      end if;
    elsif v_old <> v_status then
      update public.attendance set status = v_status
       where enrollment_id = v_enr and on_date = p_on_date;
      v_chg := v_chg + 1;
    else
      v_same := v_same + 1;
    end if;
  end loop;
  perform set_config('app.attendance_reason', '', true);

  return jsonb_build_object('inserted', v_ins, 'changed', v_chg, 'unchanged', v_same);
end $$;

revoke execute on function public.record_attendance(uuid, date, jsonb, text, timestamptz) from public, anon;
grant execute on function public.record_attendance(uuid, date, jsonb, text, timestamptz) to authenticated;


-- ============================================================
--  PART 5 — Summaries (SECURITY INVOKER: RLS decides what each caller sees)
-- ============================================================
-- Each class's counts for one day: active students, how many were marked, and
-- each status. Only classes the caller can see active students in (staff: all;
-- a teacher: the classes they teach). Dashboards read this, not raw rows.
create or replace function public.attendance_day_summary(p_year_id uuid, p_on_date date)
returns table (
  class_id    uuid,
  class_name  text,
  grade_level int,
  enrolled    int,
  marked      int,
  present     int,
  absent      int,
  late        int,
  on_leave    int
)
language sql stable security invoker set search_path = public as $$
  select c.id, c.name, c.grade_level,
         count(e.id)::int,
         count(a.id)::int,
         count(*) filter (where a.status = 'present')::int,
         count(*) filter (where a.status = 'absent')::int,
         count(*) filter (where a.status = 'late')::int,
         count(*) filter (where a.status = 'leave')::int
    from public.enrollments e
    join public.classes c on c.id = e.class_id
    left join public.attendance a on a.enrollment_id = e.id and a.on_date = p_on_date
   where e.year_id = p_year_id and e.status = 'active'
   group by c.id, c.name, c.grade_level
   order by c.grade_level, c.name
$$;

-- Each student's counts in one class over a date range (a month, a term), every
-- enrollment of the class for that year (struck-off students keep their days).
create or replace function public.attendance_student_summary(
  p_class_id uuid, p_year_id uuid, p_from date, p_to date
)
returns table (
  enrollment_id uuid,
  present       int,
  absent        int,
  late          int,
  on_leave      int
)
language sql stable security invoker set search_path = public as $$
  select e.id,
         count(*) filter (where a.status = 'present')::int,
         count(*) filter (where a.status = 'absent')::int,
         count(*) filter (where a.status = 'late')::int,
         count(*) filter (where a.status = 'leave')::int
    from public.enrollments e
    left join public.attendance a
      on a.enrollment_id = e.id and a.on_date between p_from and p_to
   where e.class_id = p_class_id and e.year_id = p_year_id
   group by e.id
$$;

revoke execute on function public.attendance_day_summary(uuid, date) from public, anon;
revoke execute on function public.attendance_student_summary(uuid, uuid, date, date) from public, anon;
grant execute on function public.attendance_day_summary(uuid, date) to authenticated;
grant execute on function public.attendance_student_summary(uuid, uuid, date, date) to authenticated;
