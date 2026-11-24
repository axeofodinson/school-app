# scripts/seed — synthetic school data (prompt 04)

A fake school at real scale, so every phase is built and tested without real
student data. **It runs only against local Postgres or the dev Supabase
project. It refuses production.**

## Easiest: paste into the Supabase SQL Editor (dev project)

1. Open the **dev** project in Supabase (never the real school one) → SQL Editor.
2. Paste all of [`sql/seed-dev.sql`](sql/seed-dev.sql) → **Run**. The last result
   shows `656 | 22 | 687` (students, classes, logins). Running it again adds nothing.
3. To undo: paste [`sql/remove-dev.sql`](sql/remove-dev.sql) → **Run**. The last
   result shows all zeros.

Both files stop with "STOP: this database has real students" if pasted into a
database with more than 50 real students. They hold the school part only; the
LMS part (question bank + history) needs `npm run seed:dev` once 017 is applied.
They are generated: after changing the generators run `npm run seed:sql`
(a test fails while they are stale).

## From a terminal

| Command (from the repo root)             | What it does                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------------ |
| `npm run seed:dev`                       | Seed (idempotent: a second run inserts nothing)                                |
| `npm run seed:dev -- --plan`             | Print the row counts the generators would produce; touches no database         |
| `npm run seed:dev -- --no-lms` / `--lms` | Skip the LMS part / require it (fail if 017 isn't applied)                     |
| `npm run seed:remove`                    | Delete every seed row, child-first, in one transaction; then check zero remain |
| `npm run seed:remove -- --dry-run`       | Count what would be deleted                                                    |

## What it creates

**Always (tables from `setup.sql` + 002–016):** academic year `TEST 2026-27`
(made current), 22 sections `TEST PG-A` … `TEST Class 10-B`, 134 subjects,
**656 students** (`TEST-0001` …, names like "Ayesha Khan (TEST)") with
enrollments (25–35 per section), 30 teachers + 1 admin
(`teacherNN@seed.school.invalid`, `admin@seed.school.invalid`), 156 teacher
assignments (a class teacher and a subject teacher for every subject of every
section), and a student login for every student via the real
`provision_student_login()` (run as the seed admin).

**Only if `db/017` is applied (the LMS part):** curriculum `TEST-PTB` on
`TEST Class 9-A`: Mathematics, Physics, Chemistry × 6 chapters × 4 topics × 4
concepts = 72 topics, 288 concepts (chained prerequisites); 90 questions per
topic = 6,480 (mcq / true-false / numeric, en + ur placeholders, 10 % with
`math_svg`, ~5 % with an inline `figure` diagram, all approved for practice +
exam); one placeholder lesson per topic (figure, per-concept text, quick check,
summary; one has a YouTube video block); then **90 days of history** for the
~60 Class 9 learners: ~2,100 practice/diagnostic/follow-up/revision attempts,
concept mastery rows, ~670 follow-ups (open and cleared), and 10 past live
exams per Class 9 section with sessions, answers and a few integrity events.

Logins (dev only): students sign in with their admission number and PIN
`1234`; staff with their email and `test-password-2026`. Override with
`SEED_STUDENT_PIN` / `SEED_STAFF_PASSWORD` before the first run.

## Pointing it at a database

The scripts talk to Postgres directly (node-postgres), not through the REST
API: they need to create auth users and run the provisioning function.

```bash
# local harness Postgres (TEST_PLAN DB-1)
SEED_DATABASE_URL=postgresql://postgres@localhost:54329/t npm run seed:dev
```

**Dev Supabase project** (from your PC; the cloud container cannot reach
Postgres ports). Dashboard of the **dev** project → Connect → _Session pooler_
(port 5432; the transaction pooler on 6543 breaks the temp tables the scripts use).
In PowerShell:

```powershell
$env:DEV_SUPABASE_URL = "https://<dev-ref>.supabase.co"
$env:SEED_DATABASE_URL = "postgresql://postgres.<dev-ref>:<db password>@aws-0-<region>.pooler.supabase.com:5432/postgres"
npm run seed:dev
```

### Safety checks (`src/target.ts`, `src/guard.ts`)

1. The production ref (`docs/environment.md`) anywhere in the URL → refused,
   even if someone allow-lists it.
2. Allowed: `localhost` / `127.0.0.1` / `::1` / a unix socket, or a Supabase
   host whose project ref is in `SEED_ALLOWED_REFS` (comma list) or is the ref of
   `DEV_SUPABASE_URL`. Anything else → refused.
3. After connecting: more than 50 students without a `TEST-` admission number
   → refused ("looks like a real school").

## How seed rows are recognised and removed

Ids are uuid v5 from `SEED_STRING` (default `alsyed-dev-seed-v1`) plus a stable
name (`student:42`), and inserts are `on conflict do nothing`, so re-running
never duplicates. The history uses a fixed "now" (`SEED_ANCHOR`, default
`2026-11-24T12:00:00Z`) so it is deterministic too.

Tables that have `is_test_data` (017+) get `true`. Older tables have no such
column, so `src/inventory.ts` finds seed rows by marker (year label `TEST %`,
class name `TEST %`, admission no `TEST-%`, staff email `@seed.school.invalid`,
curriculum code `TEST-%`) or by a flagged parent (enrollments of TEST students,
subjects of TEST classes …). `remove.ts` deletes in the order listed there.
That includes anything the app wrote against seed rows (attendance, submissions,
messages to TEST classes). Append-only tables (`question_versions`,
`learning_content_versions`, `gate_overrides`) have their forbid-mutation
trigger disabled **only for that delete, inside the transaction**
(DECISIONS #53). If the TEST year was current, the newest remaining year becomes
current again.

## Files

- `src/generate-core.ts`, `src/generate-lms.ts`: pure generators (no DB), tested in `test/`
- `src/seed.ts`, `src/remove.ts`: entry points; `src/inventory.ts`: what counts as seed data
- `src/target.ts`, `src/guard.ts`: refuse unsafe targets; `src/markers.ts`: the TEST markers
