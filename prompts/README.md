# Session prompts

Ready-to-paste prompts for every Claude session that builds the Al-Syed app
remake. Each file is one session: a small, verifiable slice with its own
"done when" checks.

## How to use
1. **One-time, before the first session:** merge the planning branch
   (`claude/stoic-bell-ji53ka`) into `main`. New sessions start from `main`
   and won't see `CLAUDE.md`, the docs or these prompts otherwise.
2. Pick the **next unticked prompt** below whose dependencies are ticked and whose
   blocker is cleared.
3. Start a new Claude Code session on this repo with the **model** the prompt
   names (Opus for all build sessions; session 90 runs in Claude Code on your PC). Read  first.
4. Open the prompt file and paste everything **below the line**.
5. At the end the session ticks its box here, updates `MODULE_STATUS.md`, and
   pushes to its own branch. **Merge that branch into `main`** before starting
   the next session (or ask the session to open a PR).
6. If a session runs out of room, start a new session with the same prompt plus
   "Continue: see MODULE_STATUS notes for what's left".

Prompts that don't build features:
- [C1 Generate topic content](C1-generate-topic-content.md): Claude chat, textbook chapter → import JSON.
- [C2 Urdu review](C2-review-urdu.md): second-opinion Urdu check for a topic file (subject teachers do the real review).
- [OPS backup](OPS-backup.md): nightly encrypted `pg_dump` to a private GitHub repo. Do this early.
- [OPS remove legacy](OPS-remove-legacy.md): remove old-app code/data that gets in the way (after a backup).
- [OPS update prompts](OPS-update-prompts.md): give Claude your new notes and decisions; it updates the plan and these prompts.

## Things only Hassan can do
| What | Needed by |
|---|---|
| Merge planning branch into `main` | every session |
| Create the dev Supabase project + add its keys (`docs/environment.md`) | 04, 62, testing from 03 on (done: project exists) |
| Paste `scripts/seed/sql/seed-dev.sql` into the dev project's SQL Editor and Run | 03 testing, 10 onward |
| Backups setup: age key (offline), private `school-app-backups` repo, token + 3 settings, merge to `main`, run once (`docs/backup-restore.md`) | OPS-backup (built), before OPS-remove-legacy |
| Run migrations in the Supabase SQL Editor when a session hands them over | 05, 11 (`db/025`), 12 (`db/026`), 13 (`db/018`, at the cut-over), 14 (`db/028`), 20 onward |
| Google OAuth credentials (Google Cloud console) | 05 |

All open questions from `LMS_AUDIT.md` §7 are answered (DECISIONS #22–29).
Deferred: parents (81) and iOS (82).

## Order

### Phase 0 — Foundations

| ✓ | Prompt | Model | Depends on | Blocked by | Notes |
|---|---|---|---|---|---|
| [x] | [00 Visual identity and motion choreography](00-design-identity.md) | Opus | — | — | 2026-11-23: DESIGN_SYSTEM.md v0.2 "Mosaic" + docs/design/tokens.draft.ts (AA-verified); wireframe canvas redrawn after Hassan found v0.1 plain; approved, Q1–Q5 answered (DECISIONS #37) |
| [x] | [01 App scaffold: Expo + TypeScript + expo-router + web](01-scaffold.md) | Opus | 00 (tokens can follow later) | — | 2026-11-23: SDK 58 monorepo (old app untouched at root), route groups + empty states, core + 34 tests, db-types from harness, typed i18n/RTL, CI; Android dev build unverified; Moti vs Reanimated 4 left to 02 (DECISIONS #38) |
| [x] | [02 Design system and motion foundation](02-design-system-motion.md) | Opus | 00, 01 | — | 2026-11-23: tokens moved to `packages/core/src/design` (+87 tests), providers + 20 `ui/` primitives, tier detection + `<ExamMode>`, `/dev/gallery`; Moti dropped (DECISIONS #41–46); web verified, Android unverified |
| [x] | [03 Login: students (admission no + PIN, QR) and staff](03-auth.md) | Opus | 01, 02 | — | 2026-11-24: core auth module (+23 tests), PIN/staff login, role guards, QR scan + A4 card sheet, shared mode (memory session, idle 10 min, Switch student, namespace wipe), Settings; web verified with mocked Supabase (A-2); dev-project + Android login **unverified** (no dev project yet) |
| [x] | [04 Synthetic data at school scale (656 students)](04-seed-dev-data.md) | Opus | 01 | Dev project exists. | Done 2026-11-24: `scripts/seed` (seed/remove, local dry-run verified, 0 dups, 0 left after remove); dev project: Hassan pastes `scripts/seed/sql/seed-dev.sql` into its SQL Editor. |
| [x] | [05 Google sign-in and access tiers (prep-only vs school)](05-google-signin-prep-access.md) | Opus | 03 | Must ship before the paid Play Store release | Done 2026-11-24: `db/023` (draft, needs 017; dry-run + DB-4 smoke pass), Google PKCE sign-in, `(prep)` surface, admin `/link-prep`; web verified with mocks (A-4); dev project + Android unverified (A-5) |

### Phase 1 — Parity (retire the old app's core flows)

| ✓ | Prompt | Model | Depends on | Blocked by | Notes |
|---|---|---|---|---|---|
| [x] | [10 Parity: teacher/admin assessment builder](10-assessment-builder.md) | Opus | 03 | — | Done 2026-11-24: `features/questions` + `features/assessments` (+ shared `features/scope`), core `questions.ts`/`assessments.ts` (+35 tests), `(staff)` routes; RLS smoke AB-1 pass (prod + full order), web e2e AB-2 41/41 with mocks; Android + dev project **unverified** |
| [x] | [11 Parity: student takes assessments, offline-safe](11-student-attempts-offline.md) | Opus | 03, 10 | — | Done 2026-11-24: core `sync/` queue + `attempts.ts` + `tapImage.ts` (+88 tests), `features/attempts` (home, tests, attempt, results), `db/025` draft (student submits only for own class + year); AT-1 smoke pass, AT-2 web e2e 41/41 incl. airplane test; Android + dev project **unverified** (AT-3) |
| [x] | [12 Parity: file assessments and grading with audit](12-file-assessments-grading.md) | Opus | 10, 11 | — | Done 2026-11-24: `features/files` (worksheet upload + viewer), `features/grading` (grid via `record_grade`, reason + history, overdue, report card), core `reporting/` + `markdown` + `files` with parity tests vs the old modules (R-1); `db/026` draft (no direct score writes/deletes; GR-1 pass); GR-2 web e2e 62/62; Android + dev project **unverified** (GR-3) |
| [x] | [13 Cut-over: retire old flows and close the answer-key hole](13-cutover-close-answer-keys.md) | Opus | 10, 11, 12 | Hassan's go-ahead to publish the new build | Code done 2026-11-25: `db/018` (draft; runs after 026) closes students' `questions` read, `student_paper()`/`student_paper_levels()`, server auto-marking on insert; app switched; CO-1 + CO-2 pass. **Release pending (TEST_PLAN CO-3):** 018 on dev → preview build + test → production build (go-ahead) → 018 on production after students switch |

### Phase 1b — Rebuild the remaining old features

| ✓ | Prompt | Model | Depends on | Blocked by | Notes |
|---|---|---|---|---|---|
| [x] | [14 Rebuild: attendance](14-attendance.md) | Opus | 13 | — | Code done 2026-11-25: `features/attendance` (teacher marks a class in one save, offline queue, past days with reason + history; admin day/class summaries; student calendar + %), core `attendance.ts` (+29 tests), `db/028` draft (`record_attendance`, audit history, guard; independent of 017/018); AD-1 SQL pass, AD-2 web e2e 68/68; **dev project + Android unverified (AD-3): Hassan runs 028 on dev first** |
| [x] | [15 Rebuild: messaging and push notifications](15-messaging-push.md) | Opus | 13 | — | Code done 2026-11-25: `features/messages` (student inbox with server read state, Realtime toast while foregrounded, Android push + tap → inbox; teacher/admin compose to class / student / whole school with reach count and "Read by N"), core `messages.ts` (+9 tests) + Edge Function logic tests (+5), `db/029` draft (read state, shared-device token hand-over, once-only push, messages immutable; independent of 017/018); hardened `send-message-push` (reads the message from the DB). MS-1 SQL pass, MS-2 web e2e 43/43 (toast in ~150 ms); AD-2/AT-2/GR-2/AB-2/A-2 still pass. **Unverified:** dev project with 029, real push on Android (needs Firebase setup, docs/environment.md), MS-3 |
| [x] | [16 Rebuild: pre-reader tap-image questions (PG / young kids)](16-prereader.md) | Opus | 11 | — | Code done 2026-11-25: `features/prereader` (paged tap-the-picture paper, speaker button, offline clip cache, full-tier finish burst; teacher clip preview), core `readAloudPlan` + clip planning (+13 tests), `db/030` draft (private `question-audio` bucket + RLS), `scripts/audio/generate-prereader-audio.mjs` (ElevenLabs, dry run / sample / write). PR-1 SQL pass, PR-2 web e2e 32/32. **Unverified:** ElevenLabs run, Urdu quality, size/cost per clip, Android (PR-3): Hassan runs 030 on dev, then the generator in the `school-app` environment |
| [x] | UI remake to the Mosaic wireframes (no prompt file; UI thread) | Opus | 16 | — | 2026-11-25, PR open: student hero/Home/tabs, kid presentation, exam-calm attempt, pre-reader restyle, branded sign-in, staff sidebar + homes, tile-burst celebrations, sounds + voice-line manifest (DECISIONS #94–95). Hassan records the voice clips in `docs/audio-scripts.md`. UI-1 tour on web; Android frame rate unverified |

### Phase 2 — Curriculum and question bank

| ✓ | Prompt | Model | Depends on | Blocked by | Notes |
|---|---|---|---|---|---|
| [x] | [20 Curriculum: apply 017 and build topic/concept editors](20-curriculum-run-017.md) | Opus | 13 | — | 2026-11-25: 017 + 023 final (hand-made table check, no-delete curriculum, loop-proof prerequisites, subject-level teacher scope; CU-1 RLS matrix), `/curriculum` editors + editions + backfill helper (CU-2 63/63). Hassan: run 017 then 023 on dev; production after a working same-day backup |
| [x] | [21 Content importer (JSON → draft) with validation report](21-importer.md) | Opus | 20 | — | 2026-11-25: core importer + visuals checks, `db/031` (draft), `/importer` screen (report → drafts, retire a batch). Needs 017 + 023 + 031 on dev (IM-3) |
| [x] | [22 Teacher review queue: approve / edit / reject](22-review-queue.md) | Opus | 21 | —  (decided: each subject's teachers review Urdu, DECISIONS #28) | Code done 2026-11-25: `db/032` (draft, after 031: RPC-only approvals scoped to concepts a teacher teaches, edit/retire revokes, version-checked decisions), `/review` two-pane queue (keyboard A/E/R/C/J/K/1–4/V/U/X, bilingual side by side, maths, edit → new version, send back, reject, bulk), core `review.ts` (+24 tests). RQ-1 SQL pass, RQ-2 web e2e 50/50. Hassan: run 017 → 023 → 031 → 032 on dev |

### Phase 3 — Learn and Practice

| ✓ | Prompt | Model | Depends on | Blocked by | Notes |
|---|---|---|---|---|---|
| [x] | [30 Learn: lesson reader](30-learn-renderer.md) | Opus | 22 | — | Done (own PR). Draft `db/033` runs on dev after 017 → 023 → 031 → 032. LS-1 SQL + LS-2 web e2e pass; LS-3 (Android/Chromebook) unverified. Scenes/charts/widgets show placeholders until 33 |
| [x] | [31 Practice engine (port prep.html ideas)](31-practice-engine.md) | Opus | 22 | — | Code done 2026-11-25 (PR #55): core `practice` (+31 tests), `/lesson/<topic>/practice` + `/topic/<topic>/practice` (4 modes, feedback, summary, sync queue). No new migration. PE-2 web e2e 50/50; PE-3 (dev + devices) unverified |
| [x] | [33 Visual blocks: scenes, charts, widgets](33-visual-blocks.md) | Opus | 30 | — | Code done 2026-11-25 (stacked on 30's PR): scene/chart/widget renderers, 4 widgets, sample Physics topic, gallery entries, no migration. LS-2 web e2e 74/74. **Unverified:** V-1 on the reference Chromebook |
| [x] | [32 Offline Learn and question packs](32-offline-learn-packs.md) | Opus | 30, 31, 33 | — | **Done 2026-11-26:** draft `db/036_learn_packs.sql` (`learn_pack(chapter, have)` under the learner's RLS, delta by version; smoke OP-1), core `packs.ts` (+5 tests), `features/downloads` (Save for offline per chapter, Downloads screen, quiet daily refresh), lesson + practice read from a pack offline, IndexedDB / Android files store, web app shell service worker precaching the build; e2e OP-2; sizes in TEST_PLAN. Dev: run 036 after 017 + 023. |

### Phase 4 — Mastery loop

| ✓ | Prompt | Model | Depends on | Blocked by | Notes |
|---|---|---|---|---|---|
| [x] | [40 Mastery, diagnostics and follow-up RPCs (migration 019)](40-mastery-rpcs.md) | Opus | 31 | — (thresholds decided: DECISIONS #26) | Code done 2026-11-26: draft `db/019` (server marks every practice row, bands from all evidence, follow-up rounds + auto relief, `record_practice_attempt`, `diagnostic_items`, `mastery_config`), core `mastery.ts` + shared vectors (SQL = TS). MA-1 pass; no app change (the practice upload already feeds it). Hassan: run 019 on dev after 033 |
| [x] | [41 Follow-ups, gates, relief and the Prepare tab](41-followups-gates-prepare.md) | Opus | 40 | — | Done 2026-11-26: core `followups.ts` (gates, Prepare model, round preview, subject mosaics; +13 tests), practice modes `diagnose` + `followup` (`follow_up_id` on the row), Prepare follow-ups first + paused lessons, Home next-up + concept mosaics, teacher "Who's stuck" (`/stuck`) with relax/restore; draft `db/034` (gate_relax / gate_restore / class_follow_ups, smoke F-2/F-3 pass); web e2e in `learn-web.cjs` (LS-2 + FG-1). Runs on dev after 019. |
| [x] | [42 Spaced revision (7 / 30 days)](42-spaced-revision.md) | Opus | 41 | — | **Done 2026-11-26:** draft `db/037_spaced_revision.sql` (revision checks move the 7 → 30-day ladder, a fail reopens a `revision` follow-up; `revision_checks`; nightly `retention_daily` rollup via pg_cron), core `revision.ts` (fake-clock tests), Prepare "Due for revision" + Revise sets. SR-1, SR-2, SR-3 pass. Hassan: run 037 on dev after 019. |

### Phase 5 — Teacher exams

| ✓ | Prompt | Model | Depends on | Blocked by | Notes |
|---|---|---|---|---|---|
| [x] | [50 Quick-generate assessments (3 clicks) + student exam screen](50-exam-launch-and-take.md) | Opus | 22, 41 | — | Scope widened 2026-11-24: random draw from a blueprint for every assessment type, not only live exams (DECISIONS #67) **Done 2026-11-26:** core `exams.ts` (draw, clock, join codes, save bookkeeping; +14 tests), draft `db/020_exam_launch.sql` (draw pool, per-student option shuffle, launch/join/end, sweep via pg_cron; smoke EX-1 + 40 parallel students 0 lost), quick create + builder swap + live panel, student exam screen + Tests section (web e2e EX-2). Left for 51/60: live view, item analysis, offline acceptance. |
| [x] | [51 Live exam view, item analysis, exam follow-ups, confirm to grades](51-live-view-results.md) | Opus | 50 | — | **Done 2026-11-26:** draft `db/035_exam_results.sql` (Realtime on exam_sessions, `exam_live`, `exam_item_analysis`, void with reason, `exam_confirm` → record_grade 'Exam result' + exam follow-ups, once; smoke EX-3), core `examResults.ts` (+8 tests), teacher screen `/exams/[id]` (live roster, Realtime throttled refetch, void, End, results + item analysis, confirm), linked from the builder; web e2e EX-4. Dev: run 035 after 020. |

### Phase 6 — Offline, shared devices, scale

| ✓ | Prompt | Model | Depends on | Blocked by | Notes |
|---|---|---|---|---|---|
| [x] | [60 Offline (pre-downloaded) exams](60-offline-exams.md) | Opus | 50 | — | **Done 2026-11-26:** draft `db/038_offline_exams.sql` (schedule, download, one idempotent upload with server verdicts, teacher accept with a reason), core `offlineExam.ts` (monotonic device clock, verdict rule), student offline exam screen + Tests list, teacher offline option + live view flags. OX-1, OX-2, OX-3 pass; OX-4 unverified. Hassan: run 038 on dev after 020 (and 035). |
| [x] | [61 Sync hardening and shared-device hardening](61-sync-shared-devices.md) | Opus | 11, 32, 60 | — | **Done 2026-11-26:** per-learner sealed queue namespace on web (core `sealedStore` + IndexedDB AES-GCM key), sign-out sends first then warns "not sent yet" (keeps it locked to that student), sync pill counts all unsent work incl. offline exams, staff sidebar pill. O-1..O-6 automated parts pass, S-2 pass; S-1 on a Chromebook unverified. No migration. |
| [ ] | [62 Scale and free-tier tests](62-load-tests.md) | Opus | 04, 50 | Dev Supabase project created by Hassan (DECISIONS #27) | |

### Phase 7 — Worksheets, assignments, projects

| ✓ | Prompt | Model | Depends on | Blocked by | Notes |
|---|---|---|---|---|---|
| [ ] | [70 Worksheets: printable A4 + interactive](70-worksheets.md) | Opus | 22, 31 | — | |
| [ ] | [71 Assignments: typed, file and photo submissions](71-assignments.md) | Opus | 12 | — | |
| [ ] | [72 STEM projects (draft migration 022)](72-stem-projects.md) | Opus | 71 | — | |

### Phase 8 — Dashboards, parents, iOS

| ✓ | Prompt | Model | Depends on | Blocked by | Notes |
|---|---|---|---|---|---|
| [ ] | [80 Dashboards: student, teacher, admin](80-dashboards.md) | Opus | 42, 51 | — | |
| [ ] | [81 Parent role](81-parents.md) | Opus | 80 | DEFERRED: parent features will be redesigned later (DECISIONS #25) | |
| [ ] | [82 iOS release](82-ios-release.md) | Opus | 13 | DEFERRED: no iOS for now (DECISIONS #24) | |

### Phase 9 — Media and AI

| ✓ | Prompt | Model | Depends on | Blocked by | Notes |
|---|---|---|---|---|---|
| [ ] | [90 Animated explainer pipeline (Blender)](90-animated-explainers.md) | Opus (local session with Blender MCP) | 30 | Must run in Claude Code on Hassan's PC with Blender + Blender MCP (GUIDE.md §2) | |
| [ ] | [91 In-app AI drafting (optional)](91-ai-drafting.md) | Opus | 21, 22 | Hassan's budget approval | |

### Phase 10 — Extensions (last)

| ✓ | Prompt | Model | Depends on | Blocked by | Notes |
|---|---|---|---|---|---|
| [ ] | [E1 Extension: teacher training track](E1-teacher-training.md) | Opus | 30, 31, 41 | — | |
| [ ] | [E2 Extension: challenge tier after mastery](E2-challenge-tier.md) | Opus | 41 | — | |
| [ ] | [E3 Extension: real-world / SDG tags](E3-sdg-tags.md) | Opus | 30 | — | |
| [ ] | [E4 Extension: coding and project evidence in assignments](E4-coding-evidence.md) | Opus | 71 | — | |

### Anytime

| ✓ | Prompt | Model | When |
|---|---|---|---|
| [x] | [OPS backup](OPS-backup.md) | Opus | Before real LMS data (Phase 0–1). Done 2026-11-24: Hassan finishes setup in `docs/backup-restore.md` |
| — | [OPS remove legacy](OPS-remove-legacy.md) | Opus | Whenever old code/data gets in the way (repeatable) |
| — | [C1 Generate topic content](C1-generate-topic-content.md) | Opus (claude.ai chat) | From Phase 2 on, one topic at a time (pilot: Class 9 Math/Science) |

## Changelog
- 2026-11-25: 33 code done, stacked on 30 (PR #54); no migration. Sample topic to try on dev: import `packages/core/samples/class9-physics-motion.json` in `/importer`, approve the lesson in `/lessons`. Next: 32 (offline packs) or 31 once merged.
- 2026-11-25: 16 code done. `db/030_question_audio.sql` is independent (dev first, production any time). The ElevenLabs step needs the `school-app` environment (key + network to api.elevenlabs.io); this session's environment had neither, so no clips exist yet. Android needs a new build (`expo-audio`).
- 2026-11-25: Android size fix (DECISIONS #82): `expo-build-properties` adds three ABIs, compressed native libs, R8 + resource shrinking. New native config: the next Android build (preview or dev client) picks it up; check its size and smoke-test every screen once, since R8 is new.
- 2026-11-25: 13 code done. `db/018_close_answer_key_read.sql` runs AFTER 026 (dev first; production only once students have the new app, TEST_PLAN CO-3). The server now auto-marks fully auto-markable attempts (DECISIONS #79), so 14–16 and 50 can rely on scores appearing without a teacher; 50/51 should add a "hold results" setting if teachers want it (DECISIONS #81). 025 + 026 are applied on both databases.
- 2026-11-24: 11 done. `db/025_student_attempts_own_class.sql` is a draft for Hassan to run (dev, then production, after 024). New native module `expo-speech`: rebuild the dev client. Prompt 61 inherits the logout "N not sent" warning; 12 should show attempts that a grade-first `record_grade` turned into duplicates.
- 2026-11-24: OPS-backup done (DECISIONS #63). Before OPS-remove-legacy, run the backup workflow by hand with `keep_label` so that backup is never pruned. Storage file contents aren't in the dump yet.
- 2026-11-24: `db/024_profiles_self_update_guard.sql` added as a standalone production fix (DECISIONS #62); Hassan runs it now, ahead of 017.
- 2026-11-24: 05 done. `db/023_access_tiers.sql` needs 017 first, so it runs at Phase 2 start (or on dev whenever). It also closes a self-promote hole that is live in production today (DECISIONS #60). Prompt 40 must recompute mastery after `link_prep_account()`, and prompts 30–42 should gate features with `canUse(tier, …)`.
- 2026-11-23: 02 done. Tokens now live in `packages/core/src/design/` (draft file and verify script removed); 01 no longer installs Moti.
- 2026-11-23: design questions answered (DECISIONS #37); 16 now includes ElevenLabs read-aloud audio for junior maths.
- 2026-11-23: visual-first lessons (DECISIONS #36): new prompt 33 (scenes, charts, widgets); 30, 32, 21, C1, 90 updated to the visual block format.
- 2026-11-23: 00 done (pending review). 02 now reads tokens from `docs/design/tokens.draft.ts` and ports `scripts/verify-design-tokens.mjs` checks into `packages/core` tests.
- 2026-11-23: Fable dropped (all Opus). Every prompt now lists the skills/MCPs to use. 90 switched to Blender via the Blender MCP (local). Added GUIDE.md.
- 2026-11-23: library created (35 build prompts + C1, C2, OPS-backup, OPS-update-prompts) from LMS_AUDIT build order + Phase 10 extensions + motion system.
- 2026-11-23: open questions answered (DECISIONS #22–29). Added 05 Google sign-in/prep-only tier, Phase 1b (14 attendance, 15 messaging + push, 16 pre-reader), OPS-remove-legacy; OPS-backup → private GitHub repo; 22/40/62 unblocked; 81 parents and 82 iOS deferred.
