# db/ — database source of truth

`setup.sql` is the **actual script run against Supabase** and the source of
truth for the backend. It is a single, idempotent, from-empty setup: it resets
any prior state, then rebuilds schema + Row-Level Security + starter seed in one
run.

| File | Purpose |
| --- | --- |
| `setup.sql` | One-shot Postgres/Supabase setup: reset → schema → RLS → seed → make yourself `developer`. |
| `002_academic_years_single_current.sql` | Additive: enforce at most one current academic year. |
| `003_questions_teacher_chapter_scope.sql` | Additive: scope teacher question-writing to their own classes. |
| `004_student_login.sql` | Additive: student login (roll number + PIN) — see note below. |
| `005_student_assessment_attempts.sql` | Additive: let a signed-in student read their class's published assessments and submit an attempt. |
| `006_prereader_tap_image_content.sql` | Additive, content-only (no schema change): bilingual pre-reader `tap_image` questions for PG + one published "Tap & Learn 1" quiz. |
| `007_fix_provision_signature.sql` | Corrective: capture the drifted enrollment-keyed student-login functions (superseded by 008). |
| `008_revert_login_to_admission_number.sql` | Corrective: revert student login to the admission-number design (immutable identity). |
| `009_enrollment_status_soft_delete.sql` | Additive: enrollment lifecycle — `struck_off` status + `end_date`/`reason`, soft-remove instead of delete, and auth-layer login revocation when a student's last active enrollment closes. |
| `010_push_notifications_messaging.sql` | Additive: `push_tokens` (per-device Expo tokens, soft-disabled when dead) + `messages` (school/class/student broadcasts) + `my_student_id()` helper + RLS. Paired with the `send-message-push` Edge Function. |
| `011_dev_role_hard_delete.sql` | Additive: `is_dev()` helper + `dev_hard_delete_student()` — a dev-only, irreversible cascade (attempts → attendance → push_tokens → enrollments → student + login). Includes a one-time block to promote a dedicated dev account. |
| `012_messages_realtime.sql` | Additive: adds `public.messages` to the `supabase_realtime` publication so the in-app toast can fire the moment a message lands while the app is open. RLS (from 010) still filters which rows each subscriber receives. |
| `013_grade_editing_versioned.sql` | Additive: editable grades. `submission_grade_edits` history table + audit columns on `submissions`, and the `record_grade()` RPC (the single SECURITY DEFINER write path — enters a first grade, requires a reason to correct one, archives every change). History readable by staff + teacher-of-class only; students never see it. |
| `014_assessment_files.sql` | Additive: file-upload assessments. Adds `'file'` to `assessments.type` + `file_path/file_name/file_mime`, a private `assessment-files` Storage bucket, and storage RLS scoped by class enrolment (teacher-of-class writes; enrolled student reads published only). |
| `015_pg_grade_level_zero.sql` | Additive, data-only: standardise the PG class on `grade_level = 0` (was the legacy `-2`), the lowest level. Paired with `src/lib/gradeLevels.js` which labels level 0 as “PG”. |

## Additive migrations (run after `setup.sql`, in order)

Numbered files are **additive** changes for a database that already holds real
data — run each once in the SQL Editor, in order, after `setup.sql`. They never
drop or reset anything.

`004_student_login.sql` adds the student sign-in backend the staff flow never
had: a `profiles.student_id` link to `students`, a read-only RPC the pre-auth
login screen calls (`student_login_email`), student self-read RLS, and a
synthesized-email handle so a child signs in with **admission number + PIN**
(the globally-unique, stable `students.student_code`) instead of an email
account. **Part 5 (provisioning) creates Supabase Auth accounts by writing to
`auth.users` directly** — review it against your GoTrue version before using it,
and prefer the Auth Admin API from an Edge Function in production.

To create a student login end to end: run `setup.sql` then this migration, sign
in as staff, open **Register students**, and use **Give login / set PIN** on a
student who is enrolled for the current year — it calls
`provision_student_login(p_student_id, p_pin)` (login is keyed on the student's
immutable admission number, per `008`). That student can then sign in on the
student screen with their admission number and that PIN.

`009_enrollment_status_soft_delete.sql` makes removing a student a **soft close**
on their enrollment, never a delete (CLAUDE.md rule 3). It widens
`enrollments.status` with `struck_off` and adds `end_date` + `reason`. The office
uses **Manage enrollments → Class roster → Remove** (a reason picker) to close an
enrollment; struck-off students drop off active rosters (attendance marking, class
views) but their full history stays queryable by staff. A DB trigger
(`enrollment_login_sync`) revokes the student's login the moment their last active
enrollment closes — it **bans the Supabase auth account and kills live sessions
without deleting credentials**, so access is restored automatically if they're
re-enrolled (or **Restore**d).

`010_push_notifications_messaging.sql` adds push + in-app messaging. `push_tokens`
holds the Expo push token for each student device (the student app upserts it on
launch); a token Expo reports as dead is **soft-disabled** (`disabled_at`), never
deleted. `messages` is a broadcast to the whole school, one class, or one student
— the durable record that backs the in-app inbox, with push as best-effort
delivery on top. RLS scopes a student's reads to messages addressed to them
(school-wide / their current-year active class / them by id); staff send anything,
teachers only to classes/students they own. Delivery is done by the
**`send-message-push` Edge Function** (`supabase/functions/send-message-push/`),
wired to an INSERT webhook on `public.messages` — see that folder's README for the
webhook + secrets setup.

`011_dev_role_hard_delete.sql` adds the one thing the platform otherwise refuses
to do: a **true hard delete**. Everything else is soft (rule 3) — this is the
escape hatch for a mistaken/duplicate/erasure-request record, and it is scoped to
the **dev role** and the **dev console** only. "dev" is the existing `developer`
role (not a new enum value — rule 4 fixes the role set); developer already has
full admin visibility (`is_staff()` = developer OR admin), and this gives it its
one extra power. `dev_hard_delete_student(p_student_id)` erases, in one
transaction (atomic — any error rolls it all back), **attempts (submissions) →
attendance → push_tokens → enrollments → the student row**, then the student's
login (`auth.users`, if provisioned). It **re-checks `is_dev()` itself and rejects
a non-dev caller** — hiding the button in the admin UI is convenience only; this
in-function check is the boundary (rule 4). It returns a jsonb summary of the row
counts removed. The admin console never renders a hard-delete anywhere; the dev
console (`src/screens/dev/DevConsoleScreen.js`) is reachable only from a
developer-only entry point on the console home. **PART 3** of the migration is a
one-time, edit-me block to promote a **dedicated dev account** (its own login,
separate from your admin/owner account): create the auth user + set its password
yourself (Dashboard → Authentication → Users → Add user, Auto Confirm), then set
the email in the block and run it.

## Run order (Supabase → SQL Editor)

There is **one** script. In your project's SQL Editor
(Dashboard → SQL Editor → New query), paste **all of `setup.sql`** and **Run**:

1. **`setup.sql`** — runs top to bottom in four parts:
   - **Part 0 — Reset:** drops the tables/functions/triggers so a re-run starts clean.
   - **Part 1 — Schema:** `profiles`, `academic_years`, `classes`, `subjects`,
     `chapters`, `questions`, `students`, `enrollments`, `teacher_assignments`,
     `assessments`, `assessment_questions`, `submissions`, `attendance`, plus a
     trigger that auto-creates a `profiles` row (`role = 'pending'`) for every new
     `auth.users` signup.
   - **Part 2 — RLS:** enables Row-Level Security on every table and installs the
     role-based policies (`developer`/`admin` = staff, teacher scoped to assigned
     classes, authenticated read on syllabus/questions).
   - **Part 3 — Seed:** starter academic year (`2025-26`), two classes (PG,
     Class 9), sample subjects/chapters, and two sample questions.
   - **Part 4 — Promote yourself:** upserts a `profiles` row set to `developer`
     for the `auth.users` row whose email is `axeofodinson@gmail.com`.

### Two expected Supabase safety popups

Both are expected — the script is written to trigger them:

- **"destructive operations"** → click **Run query** (that's Part 0, the reset).
- **"without RLS"** → click **Run without RLS** (the policies are installed in
  Part 2 of the same script).

### One-time: promote your account to `developer`

Part 4 handles this automatically **as long as your auth user already exists**.
So sign in through the app once (or create your user in
Dashboard → Authentication → Users) **before** running `setup.sql`, so
`auth.users` has your row for Part 4 to match. If you use a different email,
change it in Part 4. Verify afterward:

```sql
select p.role
from   public.profiles p
join   auth.users u on u.id = p.id
where  u.email = 'axeofodinson@gmail.com';
-- expect: developer
```

## ⚠️ Re-running is destructive

`setup.sql` **drops every table first** (Part 0), so re-running it **erases all
data** — students, submissions, attendance, grades. That's fine while
bootstrapping an empty project, but once real data exists, do **not** re-run it.
From that point, make schema changes with **new additive migration files**
(`db/002_*.sql`, `db/003_*.sql`, …), never by editing `setup.sql` or re-running it.
