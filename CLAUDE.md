# CLAUDE.md — project rules for Claude Code

Read this fully before doing anything. These rules are non-negotiable; when a
request conflicts with them, follow these and say so. Then read the session
prompt you were given (from `prompts/`) and `MODULE_STATUS.md`.

## What this is
**Al-Syed High School app + LMS**: a bilingual (English + Urdu) school
platform for a small private school in Punjab, Pakistan (classes PG–10,
~656 students, Punjab Textbook Board). One Supabase backend, one app with
three surfaces:
- **Student app**: Learn → Practice → Diagnose → Follow-ups, exams, worksheets,
  assignments, results. The product.
- **Teacher / admin console**: classes, content, review, exams, grading.
- **Parent view** (deferred; to be redesigned later).

The app is being **remade from scratch** (new code, new UI). The backend and its
data are **kept and extended**. The old app in `src/` + `App.js` is frozen.
Only critical fixes go there, until each flow is cut over to `apps/mobile`.

Devices: students use school **Chromebooks** (unmanaged, Play Store allowed,
Wi-Fi in the lab only) and their own Android phones; teachers use **Windows**
PCs. Internet is unreliable. Expect up to 40 students in one live exam.

## Stack
- **Backend:** Supabase **free tier** (Postgres + Auth + RLS + Storage +
  Realtime + Edge Functions). Staying free is a requirement.
- **App:** Expo (latest stable SDK) + **TypeScript** + **expo-router**. One
  codebase → **Android** (phones + Chromebooks via Play Store) and **web/PWA**
  (Windows teachers, Chromebook fallback). **No iOS for now** (DECISIONS #24).
- **Motion:** Reanimated 3 + Moti (see Motion rules below).
- **No CDN dependencies.** The school network blocks some. Bundle fonts, math,
  Lottie files, everything.

## Repo map
```
apps/mobile/        new app (expo-router): app/ routes, features/<module>/, ui/
packages/core/      pure TS logic (scoring, mastery, gates, sync queue, importer
                    validation): no React, unit-tested in Node
db/                 setup.sql (bootstrap, NEVER re-run) + additive NNN_*.sql
db/test/            local dry-run harness: supabase_stubs.sql + *_smoke.sql
supabase/functions/ Edge Functions
prompts/            ready-to-paste session prompts (index: prompts/README.md)
src/, App.js        OLD app (frozen)
```

## Docs: what each is for (keep them current)
| Doc | Use | Update when |
|---|---|---|
| `LMS_PLAN.md` | Hassan's original brief | never (history) |
| `LMS_AUDIT.md` | feasibility, design proposals, build order, open questions | an open question is answered or a design changes |
| `ARCHITECTURE.md` | module boundaries, security, exams, offline, motion | a module's shape changes |
| `DATABASE_DESIGN.md` | tables, constraints, JSON shapes, migration plan | any schema change |
| `DECISIONS.md` | decisions + reasons, newest first | any non-trivial choice |
| `MODULE_STATUS.md` | progress per module | **end of every session** |
| `TEST_PLAN.md` | how things are verified | new test or harness |
| `STEMP21_COMPARISON.md` | vendor comparison (no integration planned) | Hassan shares more |
| `GUIDE.md` | Hassan's step-by-step guide: setup, skills, MCPs, workflow | tooling or workflow changes |
| `docs/environment.md` | cloud env, network, EAS, dev Supabase project | env changes |
| `prompts/README.md` | session order + status | **end of every session** |

## Non-negotiable architecture rules
1. **Content is data, not code.** Curriculum (classes → subjects → chapters →
   topics → concepts → questions/lessons) lives in the database. Adding content
   means INSERTs or imports, never a code change. Never hardcode subjects,
   questions or class lists.
2. **Time is modeled.** A student's class lives in `enrollments` scoped to an
   `academic_year`, never as a column on `students`. Scores and attendance
   attach to the enrollment.
3. **Never hard-delete anything with consequences.** Use status flags
   (`retired`, `withdrawn`, `void`…). Keep raw responses, not only scores. Audit
   anything touching marks or money (`record_grade()` is the only grade
   write path). **Legacy exception (DECISIONS #22):** old-app code and data
   created by the old app may be hard-deleted, but only through prompt
   `OPS-remove-legacy`: an explicit migration Hassan runs after a same-day
   verified backup, logged in DECISIONS. Never for data the new app writes.
4. **RLS is the security boundary.** Roles: developer / admin / teacher /
   student / parent / pending. App-side checks are convenience only. A teacher
   must be unable to read a class they don't teach even if the UI is wrong.
5. **One question table, all ages.** `questions.body` is jsonb; never split by
   age with new tables.
6. **Every question has `cognitive_level` and `concept_id`.** No inferred topics.
7. **History is never rewritten.** Questions and lessons are versioned
   (`question_versions`, `learning_content_versions`, append-only). Attempts and
   exams point at an exact version.
8. **Learner identity = `profiles.id`.** Learning tables key on `learner_id`
   so Play Store users with no class work the same. Exams additionally
   require an active enrollment.
9. **The server runs exams.** Start, deadline, acceptance and grading happen in
   RPCs. The client timer is display only. **Answer keys never reach students**
   for exam items.
10. **Live within the free tier.** One compact `practice_attempts` row per
    attempt (no per-answer table for practice). Dashboards read rollups, never
    raw attempts. Cache content. Video stays on YouTube (unlisted). Subscribe to
    Realtime only on screens that need it.

## Database rules
- **Never edit or run `db/setup.sql`** (Part 0 is a destructive reset). Never
  edit a migration that has been applied.
- Schema changes go in a **new additive, idempotent** `db/NNN_name.sql`
  (`if not exists`, drop-then-create policies). Drafts say `DRAFT — NOT YET RUN`
  in the header. `017` and `022` are drafts.
- Every new table: RLS enabled + policies + indexes in the same file.
- **Dry-run every migration locally** with the harness in `TEST_PLAN.md` DB-1:
  stubs → setup.sql → all migrations → the new one twice → smoke test. Run
  Postgres as the `postgres` user in `/var/lib/postgresql/smoke` (the Claude
  scratchpad's permissions get reset) and delete it afterwards.
- **Claude never runs SQL against the production Supabase project.** Hassan runs
  it in the SQL Editor. The Supabase MCP may be connected to the **dev project
  only** (full access there); never connect it to production, or only with
  `--read-only` if Hassan explicitly sets that up. Say exactly which file to run and in what order. Update
  `db/README.md` when adding a migration.
- Tests and seeds use **synthetic data only** (`is_test_data = true`), on a dev
  project or local Postgres, never production.

## Frontend conventions
- **No hardcoded user-facing text.** All strings in i18n files (en + ur). A new
  English key gets an Urdu key too, or `// TODO: ur`.
- **Urdu is casual and human-written.** Never machine-translate Urdu strings.
  Use a kid-friendly register and keep loanwords kids use ("homework", "test").
- **RTL from day one.** Use logical props (start/end). Direction comes from JS
  locale state; never use sticky `I18nManager.forceRTL` (see old `App.js`).
  Nastaliq font bundled (WOFF2 subset on web), with generous line-height.
- **Every screen has a real empty state** and handles a missing prerequisite
  (e.g. "No classes yet. Add one first").
- **Offline tolerance.** Never freeze on a dropped request; queue writes in the
  `packages/core` sync queue; show sync status.
- **Two access tiers (DECISIONS #23).** *School* tier: students log in with
  admission number + PIN (or a QR card that fills the admission number; the PIN
  is always typed); staff use email/password. It unlocks everything. *Prep-only*
  tier: **Google sign-in** (Play Store buyers) unlocks Preparation only, with
  RLS enforcing it via `profiles.access_tier`. Never let a child create an
  email/password account. Shared Chromebooks: fast
  "switch student", per-user storage namespaces, nothing leaks between students.
- Responsive from day one: phone, Chromebook window (resizable, landscape,
  keyboard + mouse), desktop browser. No `orientation: portrait` lock.
- Math is pre-rendered to SVG at import; no runtime KaTeX WebViews.

## Motion rules
- **Reanimated 3 + Moti** everywhere. Motion (motion.dev) only in web-only
  teacher screens (`*.web.tsx`) when Moti can't do it. **No anime.js.** Lottie only
  for a few bundled celebrations/empty states.
- Use only the tokens in `apps/mobile/ui/motion.ts` (durations and spring
  presets). Animate **transform and opacity only**.
- Three tiers, auto-picked and user-overridable: **full / lite / off**. Lite is
  the default on low-memory devices; off when the OS "reduce motion" is on.
- **Exams: nothing moves except the timer and save indicator.**
- Motion must mean something (feedback, progress, hierarchy, sync), and slide
  directions flip for RTL.

## Performance budget (cheap 4 GB Chromebook)
Cold start < 5 s · question switch < 150 ms · no dropped frames on screen
transitions in lite tier · virtualised long lists · images ≤ 100 KB WebP.

## Session protocol (every session)
1. Read this file, the session prompt, `MODULE_STATUS.md`, and the docs the
   prompt names. Inspect existing code before changing it; reuse before writing.
2. Do **one slice** from the prompt. If it is too big, finish a coherent part
   and say what's left.
3. Verify: `packages/core` tests, type-check, lint, the done-when checks in the
   prompt, and the DB harness for any SQL. Mark anything not verifiable as
   **unverified** and name the test that would verify it.
4. Update `MODULE_STATUS.md`, `prompts/README.md` (tick + notes), and
   `DECISIONS.md`/`TEST_PLAN.md`/`DATABASE_DESIGN.md` as needed. If you discover
   the prompt itself is wrong or outdated, fix the prompt file too.
5. Commit with clear messages and push to the session's branch. Don't open a
   PR unless asked.
6. End with a short report: what was done, how it was verified, anything Hassan
   must do (e.g. run a migration), and the next prompt.

## Model split
- **All sessions use Opus.** Taste-heavy work (visual identity, motion, kid UX,
  lesson design) uses design skills instead of a different model:
  `frontend-design`, `design:*`, `expo:expo-design-system`,
  `expo:expo-animation`, plus the Figma MCP if enabled. Each prompt lists its
  skills and MCPs; `GUIDE.md` explains them.
- Animated explainer videos run in a **local** Claude Code session on Hassan's
  PC with Blender + the Blender MCP (prompt 90).

## Do NOT
- Hardcode content, subjects, questions or UI text.
- Put a student's class on `students`.
- Hard-delete records with grades, money or history (only exception: legacy
  old-app code/data via `OPS-remove-legacy`, after a backup).
- Machine-translate Urdu.
- Rely on app-side role checks for security.
- Build a screen without its empty state.
- Run SQL on the Supabase project, or edit `setup.sql` / applied migrations.
- Use real student data in development or tests.
- Promise exam "lockdown". Integrity on unmanaged Chromebooks is monitoring only.
