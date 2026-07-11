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

## Additive migrations (run after `setup.sql`, in order)

Numbered files are **additive** changes for a database that already holds real
data — run each once in the SQL Editor, in order, after `setup.sql`. They never
drop or reset anything.

`004_student_login.sql` adds the student sign-in backend the staff flow never
had: a `profiles.student_id` link to `students`, two read-only RPCs the pre-auth
login screen calls (`login_classes`, `student_login_email`), student self-read
RLS, and a synthesized-email handle so a child signs in with **class + roll
number + PIN** instead of an email account. **Part 5 (provisioning) creates
Supabase Auth accounts by writing to `auth.users` directly** — review it against
your GoTrue version before using it, and prefer the Auth Admin API from an Edge
Function in production. Until students are provisioned there is nobody to sign in
with, but the login screen and its empty states work regardless.

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
