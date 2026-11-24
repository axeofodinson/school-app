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
| Create the dev Supabase project + add its keys (`docs/environment.md`) | 04, 62, testing from 03 on |
| Create a private repo for backups + add secrets | OPS-backup |
| Run migrations in the Supabase SQL Editor when a session hands them over | 05, 13, 20 onward |
| Google OAuth credentials (Google Cloud console) | 05 |

All open questions from `LMS_AUDIT.md` §7 are answered (DECISIONS #22–29).
Deferred: parents (81) and iOS (82).

## Order

### Phase 0 — Foundations

| ✓ | Prompt | Model | Depends on | Blocked by | Notes |
|---|---|---|---|---|---|
| [x] | [00 Visual identity and motion choreography](00-design-identity.md) | Opus | — | — | 2026-11-23: DESIGN_SYSTEM.md v0.2 "Mosaic" + docs/design/tokens.draft.ts (AA-verified); wireframe canvas redrawn after Hassan found v0.1 plain; approved, Q1–Q5 answered (DECISIONS #37) |
| [x] | [01 App scaffold: Expo + TypeScript + expo-router + web](01-scaffold.md) | Opus | 00 (tokens can follow later) | — | 2026-11-23: SDK 58 monorepo (old app untouched at root), route groups + empty states, core + 34 tests, db-types from harness, typed i18n/RTL, CI; Android dev build unverified; Moti vs Reanimated 4 left to 02 (DECISIONS #38) |
| [x] | [02 Design system and motion foundation](02-design-system-motion.md) | Opus | 00, 01 | — | 2026-11-23: tokens moved to `packages/core/src/design` (+87 tests), providers + 20 `ui/` primitives, tier detection + `<ExamMode>`, `/dev/gallery`; Moti dropped (DECISIONS #41–46); web + Android phone verified (2026-11-24); patterns drift per tier (DECISIONS #47) |
| [ ] | [03 Login: students (admission no + PIN, QR) and staff](03-auth.md) | Opus | 01, 02 | — | |
| [ ] | [04 Synthetic data at school scale (656 students)](04-seed-dev-data.md) | Opus | 01 | Hassan creating the dev Supabase project + adding its URL/anon/service keys to the environment (decided: DECISIONS #27). Until then, seed the local harness DB only. | |
| [ ] | [05 Google sign-in and access tiers (prep-only vs school)](05-google-signin-prep-access.md) | Opus | 03 | Must ship before the paid Play Store release | |

### Phase 1 — Parity (retire the old app's core flows)

| ✓ | Prompt | Model | Depends on | Blocked by | Notes |
|---|---|---|---|---|---|
| [ ] | [10 Parity: teacher/admin assessment builder](10-assessment-builder.md) | Opus | 03 | — | |
| [ ] | [11 Parity: student takes assessments, offline-safe](11-student-attempts-offline.md) | Opus | 03, 10 | — | |
| [ ] | [12 Parity: file assessments and grading with audit](12-file-assessments-grading.md) | Opus | 10, 11 | — | |
| [ ] | [13 Cut-over: retire old flows and close the answer-key hole](13-cutover-close-answer-keys.md) | Opus | 10, 11, 12 | Hassan's go-ahead to publish the new build | |

### Phase 1b — Rebuild the remaining old features

| ✓ | Prompt | Model | Depends on | Blocked by | Notes |
|---|---|---|---|---|---|
| [ ] | [14 Rebuild: attendance](14-attendance.md) | Opus | 13 | — | |
| [ ] | [15 Rebuild: messaging and push notifications](15-messaging-push.md) | Opus | 13 | — | |
| [ ] | [16 Rebuild: pre-reader tap-image questions (PG / young kids)](16-prereader.md) | Opus | 11 | — | |

### Phase 2 — Curriculum and question bank

| ✓ | Prompt | Model | Depends on | Blocked by | Notes |
|---|---|---|---|---|---|
| [ ] | [20 Curriculum: apply 017 and build topic/concept editors](20-curriculum-run-017.md) | Opus | 13 | Hassan runs 017 on Supabase | |
| [ ] | [21 Content importer (JSON → draft) with validation report](21-importer.md) | Opus | 20 | — | |
| [ ] | [22 Teacher review queue: approve / edit / reject](22-review-queue.md) | Opus | 21 | —  (decided: each subject's teachers review Urdu, DECISIONS #28) | |

### Phase 3 — Learn and Practice

| ✓ | Prompt | Model | Depends on | Blocked by | Notes |
|---|---|---|---|---|---|
| [ ] | [30 Learn: lesson reader](30-learn-renderer.md) | Opus | 22 | — | |
| [ ] | [31 Practice engine (port prep.html ideas)](31-practice-engine.md) | Opus | 22 | — | |
| [ ] | [33 Visual blocks: scenes, charts, widgets](33-visual-blocks.md) | Opus | 30 | — | Visual-first lessons (DECISIONS #36) |
| [ ] | [32 Offline Learn and question packs](32-offline-learn-packs.md) | Opus | 30, 31, 33 | — | |

### Phase 4 — Mastery loop

| ✓ | Prompt | Model | Depends on | Blocked by | Notes |
|---|---|---|---|---|---|
| [ ] | [40 Mastery, diagnostics and follow-up RPCs (migration 019)](40-mastery-rpcs.md) | Opus | 31 | — (thresholds decided: DECISIONS #26) | |
| [ ] | [41 Follow-ups, gates, relief and the Prepare tab](41-followups-gates-prepare.md) | Opus | 40 | — | |
| [ ] | [42 Spaced revision (7 / 30 days)](42-spaced-revision.md) | Opus | 41 | — | |

### Phase 5 — Teacher exams

| ✓ | Prompt | Model | Depends on | Blocked by | Notes |
|---|---|---|---|---|---|
| [ ] | [50 Teacher surprise exam + student exam screen](50-exam-launch-and-take.md) | Opus | 22, 41 | — | |
| [ ] | [51 Live exam view, item analysis, exam follow-ups, confirm to grades](51-live-view-results.md) | Opus | 50 | — | |

### Phase 6 — Offline, shared devices, scale

| ✓ | Prompt | Model | Depends on | Blocked by | Notes |
|---|---|---|---|---|---|
| [ ] | [60 Offline (pre-downloaded) exams](60-offline-exams.md) | Opus | 50 | — | |
| [ ] | [61 Sync hardening and shared-device hardening](61-sync-shared-devices.md) | Opus | 11, 32, 60 | — | |
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
| [ ] | [OPS backup](OPS-backup.md) | Opus | Before real LMS data (Phase 0–1) |
| — | [OPS remove legacy](OPS-remove-legacy.md) | Opus | Whenever old code/data gets in the way (repeatable) |
| — | [C1 Generate topic content](C1-generate-topic-content.md) | Opus (claude.ai chat) | From Phase 2 on, one topic at a time (pilot: Class 9 Math/Science) |

## Changelog
- 2026-11-23: 02 done. Tokens now live in `packages/core/src/design/` (draft file and verify script removed); 01 no longer installs Moti.
- 2026-11-23: design questions answered (DECISIONS #37); 16 now includes ElevenLabs read-aloud audio for junior maths.
- 2026-11-23: visual-first lessons (DECISIONS #36): new prompt 33 (scenes, charts, widgets); 30, 32, 21, C1, 90 updated to the visual block format.
- 2026-11-23: 00 done (pending review). 02 now reads tokens from `docs/design/tokens.draft.ts` and ports `scripts/verify-design-tokens.mjs` checks into `packages/core` tests.
- 2026-11-23: Fable dropped (all Opus). Every prompt now lists the skills/MCPs to use. 90 switched to Blender via the Blender MCP (local). Added GUIDE.md.
- 2026-11-23: library created (35 build prompts + C1, C2, OPS-backup, OPS-update-prompts) from LMS_AUDIT build order + Phase 10 extensions + motion system.
- 2026-11-23: open questions answered (DECISIONS #22–29). Added 05 Google sign-in/prep-only tier, Phase 1b (14 attendance, 15 messaging + push, 16 pre-reader), OPS-remove-legacy; OPS-backup → private GitHub repo; 22/40/62 unblocked; 81 parents and 82 iOS deferred.
