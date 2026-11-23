# ARCHITECTURE.md

System design for the remade Al-Syed school app + LMS. Decisions and reasons:
`DECISIONS.md`. Data: `DATABASE_DESIGN.md`. Audit: `LMS_AUDIT.md`.

## 1. Shape

```
school-app/
├── db/                  # Supabase SQL: setup.sql (never re-run) + additive 0NN_*.sql
│   └── test/            # local dry-run harness (stubs + smoke tests)
├── supabase/functions/  # Edge Functions (push; later AI drafting)
├── apps/mobile/         # NEW: Expo (latest SDK) + TypeScript + expo-router
│   ├── app/             #   routes: (auth) (student) (teacher) (admin) (parent)
│   ├── features/        #   one folder per module (below), UI + hooks only
│   └── ui/              #   design system: tokens, RTL-safe primitives
├── packages/core/       # NEW: pure TS, no React — engine logic + sync queue + types
└── src/, App.js         # OLD app — kept until each flow is cut over, then archived
```

Targets from one codebase:
- **Android APK/AAB** → phones and Chromebooks (Play Store).
- **iOS** → not planned for now (DECISIONS #24).
- **Web/PWA** → Windows teachers/admin, Chromebook fallback.

## 2. Modules (folders, not services)

| Module | `features/` | `packages/core/` | DB |
|---|---|---|---|
| Identity & Roster | auth, shared-device mode | session namespace | profiles, students, enrollments, teacher_assignments |
| Curriculum | editors | tree utils | curricula, chapters, topics, concepts, concept_prerequisites |
| Question Bank + Review | importer UI, review queue | importer validator, dedupe | questions, question_versions, item_approvals, item_reviews, import_batches |
| Learning | lesson reader, visual blocks (scene, chart, widget, figure, compare, video) | block schema, SVG sanitiser, safe maths parser (`packages/core/visuals`) | learning_content(+_versions) |
| Practice | practice/diagnostic screens | item selection, scoring | practice_attempts |
| Mastery | Prepare tab, follow-ups | mastery rule, relief rule, revision schedule | concept_mastery, follow_ups, gate_overrides |
| Examinations | teacher launch, live view, student exam | paper/shuffle, timer display | assessments, exam_sessions, exam_session_answers, exam_events |
| Worksheets & Assignments | print + interactive | A/B shuffle | assessments, submissions |
| STEM Projects | catalogue, teams, rubric scoring, evidence upload | rubric totals | projects, project_rubric_criteria, project_teams(+_members), project_scores; assessments type `project` |
| Analytics | dashboards | — | nightly rollups |
| Offline Sync | sync status UI | durable queue, storage adapters | idempotent keys only |

**Contract rule:** features talk to the DB only through typed functions in
`apps/mobile/features/*/api.ts` that use generated Supabase types. Logic that
decides anything (score, mastery, gate, relief) lives in `packages/core` and is
unit-tested in Node, the same habit as today's `scripts/verify-*.mjs`.

## 3. Security
- **Access tiers** (`profiles.access_tier`): `school` (admission no + PIN, or staff) gets everything their role allows; `prep_only` (Google sign-in, Play Store buyers) gets Preparation only. RLS enforces it; the UI hides the rest.
- RLS is the boundary (CLAUDE.md rule 4). Every new table has RLS on.
- Students never read answer keys for exam items: exam papers come from
  `start_exam_session()` (security definer, strips answers). Practice items are
  readable only when approved for practice.
- Derived state (mastery, follow-ups) is written only by server RPCs.
- No API keys in the app. AI calls (later) go through an Edge Function.

## 4. Exams
- Server owns `started_at` / `deadline_at`. Client timer = `deadline_at − server_now` offset.
- Each answer → `save_exam_answer` (idempotent upsert), plus a local copy.
- Submit → `submit_exam_session` (idempotent; grades auto-gradable types).
- A pg_cron job every minute closes sessions past deadline + grace and grades them.
- Integrity events (`log_exam_event`) → teacher live view via Realtime on `exam_sessions`/`exam_events`.
- Offline exams: Phase 6 RPC accepts uploaded answers with `client_elapsed_ms`; result after sync.

## 5. Offline
- `packages/core/sync`: durable queue (AsyncStorage on native, IndexedDB on web), per-user namespace, client UUIDs, exponential retry, visible status.
- Content cache: question bank and Learn packs keyed by `(id, version)`; delta fetch by `updated_at`.
- Rules for conflicts: `LMS_AUDIT.md` §3.3.

## 6. Rendering
- Math pre-rendered to SVG at import. `react-native-svg` everywhere.
- Urdu: Noto Nastaliq (TTF native, WOFF2 subset web). Direction from JS locale state (never sticky `I18nManager.forceRTL`, see `App.js`).
- Video: YouTube unlisted (iframe on web, WebView on native). Online only.
- Print: HTML → A4 (web print / `expo-print`).

## 6b. Motion system (decided 2026-11-23)

Goal: a distinctly polished, alive UI that stays fast on 4 GB Chromebooks.

**Libraries**
- **Reanimated 3 + Moti** for everything in the app. They run on Android, iOS and web, and animations run on the UI thread, not the JS thread. Reanimated is already a dependency (`react-native-reanimated ~3.10.1`). Gestures use `react-native-gesture-handler`.
- **Motion (motion.dev)**: allowed **only** in web-only teacher/admin screens (`*.web.tsx`), and only if Moti can't do the job.
- **anime.js: not used.** It is DOM-only and duplicates Motion.
- **Lottie** (bundled JSON, no CDN) only for a few celebration and empty-state illustrations.

**Rules**
1. **Tokens, not ad-hoc values.** A `ui/motion.ts` file defines durations (fast 120 ms / base 220 ms / slow 360 ms) and spring presets (gentle, snappy, bouncy). Components use only these.
2. **Animate only transform and opacity.** Never animate layout properties (width, height, top, margin) on lists.
3. **Three motion tiers,** chosen automatically from device RAM and frame-drop sampling, overridable in settings:
   - **full:** springs, sticker presses, mosaic tiles setting, one celebration burst. (Parallax and shared-element transitions are not used: DECISIONS #33. The per-moment choreography is `DESIGN_SYSTEM.md` §6.)
   - **lite:** short fades and slides only. This is the default on low-memory devices.
   - **off:** for users whose system has "reduce motion" switched on.
4. **Exams use minimal motion in every tier.** Nothing moves while a student is answering, apart from the timer and save indicator.
5. **Motion carries meaning.** Correct and incorrect feedback, mastery progress, follow-up cleared, sync status, screen hierarchy. No decorative loops on study screens.
6. **RTL-aware.** Slide directions flip with the language.
7. **Budget:** 60 fps on a mid-range phone, no dropped frames during screen transitions on the reference Chromebook in lite tier (TEST_PLAN P-4/P-6).

**Who does what:** the visual identity and motion choreography (how things look and feel) is taste-heavy work. It runs on Opus with design skills (`frontend-design`, `design:*`, `expo:expo-design-system`, `expo:expo-animation`) in a dedicated design session at the start of Phase 0 (prompt 00). The tokens, tiers and performance plumbing are engineering work.

## 7. Free-tier guardrails
Compact attempts, rollups for dashboards, cached content, Realtime only on screens that need it, upload size caps, scheduled `pg_dump` backup, yearly archive of raw attempts. Numbers in `LMS_AUDIT.md` §6b.
