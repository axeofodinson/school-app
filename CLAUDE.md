# CLAUDE.md — project rules for Claude Code

Read this fully before writing any code. These rules are non-negotiable; when a
request conflicts with them, follow these and say so.

## What this is
A bilingual (English + Urdu) school platform for a matric-level school (classes
PG–10). **Two surfaces, one Supabase backend:**
- **Student app** — the product. Students take assessments, see scores/attendance.
- **Admin/teacher console** — the office and teachers run the school from here.

Students are the root users; this app will eventually ship to the Play Store and
App Store.

## Stack
- **Backend:** Supabase (Postgres + Auth + Row-Level Security + Storage).
- **Frontend:** Expo (React Native), one JS codebase for iOS + Android.
- **DB source of truth:** `db/01_schema.sql`, `db/02_policies.sql`. Never invent a
  new schema — build on these. Schema changes go through new migration files, never
  by editing applied ones. The tables are summarized below so you don't have to open
  those files to know the shape; open them only when you need exact column types.
- **No CDN dependencies for critical libs** — the target network blocks some CDNs.
  Bundle/vendor what the app needs.

## Data model (summary)
Full definitions in `db/01_schema.sql`; this is the shape you need day to day.

- **profiles** — one row per login account; `role` drives all access
  (developer / admin / teacher / student / parent / pending). New signups default
  to `pending` (no access) until promoted.
- **academic_years** — the time dimension everything is scoped to (`is_current`).
- **classes → subjects → chapters → questions** — the syllabus tree (content as
  data). `questions` carries `type`, `cognitive_level`, and jsonb `body` + `answer`.
- **students** — identity + admission record. **No class column** — class lives in
  enrollment.
- **enrollments** — links a student to a class for a given academic year. Scores
  and attendance attach here, not to the student.
- **teacher_assignments** — which teacher owns which class/subject/year; drives
  teacher-scoped RLS.
- **assessments** — a test/assignment/exam for a class+subject+year, with
  `weightage` toward the annual aggregate and a status.
- **assessment_questions** — join linking questions into an assessment, with marks.
- **submissions** — one score per student per assessment; keeps raw `responses`
  (jsonb), not just the score.
- **attendance** — one row per enrollment per day.

## Non-negotiable architecture rules
1. **Content is data, not code.** Syllabus (classes → subjects → chapters →
   questions) lives in the database. Adding academic content is INSERTs, never a
   code change. Never hardcode subjects, questions, or class lists.
2. **Time is modeled.** A student's class lives in `enrollments`, scoped to an
   `academic_year` — never as a column on `students`. Scores and attendance attach
   to the enrollment.
3. **Never hard-delete anything with consequences.** Use status flags
   (`archived`, `withdrawn`, etc.) and soft-deletes. `submissions` keeps raw
   responses, not just the score, so results can be recomputed. Keep an audit
   trail (who changed a grade/fee, when) for anything involving money or marks.
4. **Roles enforced by the DB, not app code.** developer / admin / teacher /
   student / parent / pending. RLS is the security boundary; app-side checks are
   convenience only. A teacher must be unable to read a class they don't teach even
   if the UI is wrong.
5. **One question table, all ages.** `questions.body` is jsonb: a Class 9 text MCQ
   and a PG tap-image question share the table. Never split by age with new tables.
6. **Cognitive level is always tagged.** Every question carries
   `cognitive_level` (recall/understand/apply/analyze). Never insert a question
   without it.

## Frontend conventions
- **No hardcoded user-facing text.** All strings live in i18n files
  (`locales/en.json`, `locales/ur.json`). A string added in English must have an
  Urdu key too (leave a clear TODO if the Urdu isn't written yet).
- **Urdu is casual and human-written.** Never machine-translate Urdu strings.
  Casual, kid-friendly register; keep common English loanwords kids use
  ("homework", "test", "class"). Mark untranslated keys with `// TODO: ur` — do
  not auto-fill them.
- **RTL from day one.** Layout must flip correctly for Urdu (right-to-left). Use
  logical layout props (start/end, not left/right). Test every screen in both
  directions. Use an Urdu-capable font (e.g. Noto Nastaliq Urdu).
- **Every screen has a real empty state.** The app starts with empty tables.
  "No students yet — add one", never a blank screen or a crash. Empty states are
  part of "done", not a follow-up.
- **Offline tolerance for core student flows.** Assume patchy mobile data. Cache
  what you can; sync when the connection returns; never freeze on a dropped request.
- **Student auth is school-issued.** Students log in with a school identity (roll
  number + PIN or parent-managed) — never a child creating an email/password
  account. Keep this flow separate from the teacher/admin flow.

## From-empty build order (dependencies)
Nothing works until its prerequisites exist. Build setup screens in this order:
**academic year → classes → subjects → chapters → students → enrollments →
questions → assessments → submissions/attendance.**
Each screen must handle its prerequisite being missing (prompt to create it first).

## Working style
- **Small, verifiable slices.** One screen/feature per task. After each, it must
  run and be checkable before moving on. Prefer finishing one thing fully over
  starting three.
- **Verify math.** For anything computing scores, aggregates, or fees, write a
  check (test or script) proving the numbers before calling it done.
- **Commit early and often.** Assume the machine can be wiped; nothing precious
  should live only on disk.

## Do NOT
- Do not hardcode content, subjects, questions, or UI text.
- Do not put a student's class on the `students` table.
- Do not hard-delete records with grades, money, or history attached.
- Do not machine-translate Urdu.
- Do not rely on app-side role checks for security.
- Do not build a screen without its empty state.

## Model note
Deterministic engineering (schema, RLS, CRUD, queries, aggregates, i18n/RTL
plumbing, empty states, bug fixes) runs on **Opus**. Reserve **Fable** for the
open-ended, taste-heavy work: the student app's visual identity and game-feel, the
young-kid conceptual question UX, engagement design, and pedagogical content
design. See `build-guide.md` for the per-task split.
