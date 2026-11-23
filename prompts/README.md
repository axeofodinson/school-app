# Session prompts

Ready-to-paste prompts for every Claude session that builds the Al-Syed app
remake. Each file is one session: a small, verifiable slice with its own
"done when" checks.

## How to use
1. **One-time, before the first session:** merge the planning branch
   (`claude/stoic-bell-ji53ka`) into `main`. New sessions start from `main`
   and won't see `CLAUDE.md`, the docs or these prompts otherwise.
2. Pick the **next unticked prompt** below whose dependencies are ticked and whose
   blocker is resolved.
3. Start a new Claude Code session on this repo with the **model** the prompt
   names (Fable for design/pedagogy, Opus for engineering).
4. Open the prompt file and paste everything **below the line**.
5. At the end the session ticks its box here, updates `MODULE_STATUS.md`, and
   pushes to its own branch. **Merge that branch into `main`** before starting
   the next session (or ask the session to open a PR).
6. If a session runs out of room, start a new session with the same prompt plus
   "Continue: see MODULE_STATUS notes for what's left".

Prompts that don't build code:
- [C1 Generate topic content](C1-generate-topic-content.md): Claude chat, textbook chapter → import JSON.
- [C2 Urdu review](C2-review-urdu.md): second-opinion Urdu check for a topic file.
- [OPS backup](OPS-backup.md): nightly encrypted `pg_dump`. Do this early.
- [OPS update prompts](OPS-update-prompts.md): give Claude your new notes and decisions; it updates the plan and these prompts.

## Open blockers (from `LMS_AUDIT.md` §7)
| Q | Question | Blocks |
|---|---|---|
| 1 | Old app's attendance, messaging, pre-reader: keep or rebuild, when? | 13 |
| 2 | How do Play Store (non-enrolled) users sign in? | Play Store paid release |
| 3 | Apple Developer account + iOS pricing | 82 |
| 4 | Parent logins: who issues, what parents see | 81 |
| 5 | Where backups go | OPS-backup |
| 6 | Mastery threshold and relief N | 40 (defaults used if unanswered) |
| 7 | Second (dev) Supabase project for seed/scale tests | 04, 62 |
| 8 | Which teachers review Urdu | 22 |
| 9 | STEMP21 licence and data terms (only if their content is used) | 72 content |

## Order

### Phase 0 — Foundations

| ✓ | Prompt | Model | Depends on | Blocked by | Notes |
|---|---|---|---|---|---|
| [ ] | [00 Visual identity and motion choreography](00-design-identity.md) | Fable | — | — | |
| [ ] | [01 App scaffold: Expo + TypeScript + expo-router + web](01-scaffold.md) | Opus | 00 (tokens can follow later) | — | |
| [ ] | [02 Design system and motion foundation](02-design-system-motion.md) | Opus | 00, 01 | — | |
| [ ] | [03 Login: students (admission no + PIN, QR) and staff](03-auth.md) | Opus | 01, 02 | — | |
| [ ] | [04 Synthetic data at school scale (656 students)](04-seed-dev-data.md) | Opus | 01 | LMS_AUDIT §7 Q7 (dev Supabase project). Without it, seed the local harness DB only. | |

### Phase 1 — Parity (retire the old app's core flows)

| ✓ | Prompt | Model | Depends on | Blocked by | Notes |
|---|---|---|---|---|---|
| [ ] | [10 Parity: teacher/admin assessment builder](10-assessment-builder.md) | Opus | 03 | — | |
| [ ] | [11 Parity: student takes assessments, offline-safe](11-student-attempts-offline.md) | Opus | 03, 10 | — | |
| [ ] | [12 Parity: file assessments and grading with audit](12-file-assessments-grading.md) | Opus | 10, 11 | — | |
| [ ] | [13 Cut-over: retire old flows and close the answer-key hole](13-cutover-close-answer-keys.md) | Opus | 10, 11, 12 | Hassan's go-ahead to publish the new build | |

### Phase 2 — Curriculum and question bank

| ✓ | Prompt | Model | Depends on | Blocked by | Notes |
|---|---|---|---|---|---|
| [ ] | [20 Curriculum: apply 017 and build topic/concept editors](20-curriculum-run-017.md) | Opus | 13 | Hassan runs 017 on Supabase | |
| [ ] | [21 Content importer (JSON → draft) with validation report](21-importer.md) | Opus | 20 | — | |
| [ ] | [22 Teacher review queue: approve / edit / reject](22-review-queue.md) | Opus | 21 | LMS_AUDIT §7 Q8 (who reviews Urdu) | |

### Phase 3 — Learn and Practice

| ✓ | Prompt | Model | Depends on | Blocked by | Notes |
|---|---|---|---|---|---|
| [ ] | [30 Learn: lesson reader](30-learn-renderer.md) | Opus (Fable for the reading experience polish) | 22 | — | |
| [ ] | [31 Practice engine (port prep.html ideas)](31-practice-engine.md) | Opus | 22 | — | |
| [ ] | [32 Offline Learn and question packs](32-offline-learn-packs.md) | Opus | 30, 31 | — | |

### Phase 4 — Mastery loop

| ✓ | Prompt | Model | Depends on | Blocked by | Notes |
|---|---|---|---|---|---|
| [ ] | [40 Mastery, diagnostics and follow-up RPCs (migration 019)](40-mastery-rpcs.md) | Opus | 31 | LMS_AUDIT §7 Q6 (thresholds) – use proposed defaults if unanswered | |
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
| [ ] | [62 Scale and free-tier tests](62-load-tests.md) | Opus | 04, 50 | Dev project (LMS_AUDIT §7 Q7) | |

### Phase 7 — Worksheets, assignments, projects

| ✓ | Prompt | Model | Depends on | Blocked by | Notes |
|---|---|---|---|---|---|
| [ ] | [70 Worksheets: printable A4 + interactive](70-worksheets.md) | Opus | 22, 31 | — | |
| [ ] | [71 Assignments: typed, file and photo submissions](71-assignments.md) | Opus | 12 | — | |
| [ ] | [72 STEM projects (draft migration 022)](72-stem-projects.md) | Opus | 71 | — | |

### Phase 8 — Dashboards, parents, iOS

| ✓ | Prompt | Model | Depends on | Blocked by | Notes |
|---|---|---|---|---|---|
| [ ] | [80 Dashboards: student, teacher, admin](80-dashboards.md) | Opus (Fable for student dashboard feel) | 42, 51 | — | |
| [ ] | [81 Parent role](81-parents.md) | Opus | 80 | LMS_AUDIT §7 Q4 (who issues parent logins, what they see) | |
| [ ] | [82 iOS release](82-ios-release.md) | Opus | 13 | LMS_AUDIT §7 Q3 (Apple account, pricing) | |

### Phase 9 — Media and AI

| ✓ | Prompt | Model | Depends on | Blocked by | Notes |
|---|---|---|---|---|---|
| [ ] | [90 Animated explainer pipeline (Remotion / Manim)](90-animated-explainers.md) | Fable (pedagogy) + Opus (pipeline) | 30 | — | |
| [ ] | [91 In-app AI drafting (optional)](91-ai-drafting.md) | Opus | 21, 22 | Hassan's budget approval | |

### Phase 10 — Extensions (last)

| ✓ | Prompt | Model | Depends on | Blocked by | Notes |
|---|---|---|---|---|---|
| [ ] | [E1 Extension: teacher training track](E1-teacher-training.md) | Opus (Fable for lesson content) | 30, 31, 41 | — | |
| [ ] | [E2 Extension: challenge tier after mastery](E2-challenge-tier.md) | Opus | 41 | — | |
| [ ] | [E3 Extension: real-world / SDG tags](E3-sdg-tags.md) | Opus | 30 | — | |
| [ ] | [E4 Extension: coding and project evidence in assignments](E4-coding-evidence.md) | Opus | 71 | — | |
### Anytime (recommended early)

| ✓ | Prompt | Model | When |
|---|---|---|---|
| [ ] | [OPS backup](OPS-backup.md) | Opus | Before real LMS data (Phase 0–1) |
| [ ] | [C1 Generate topic content](C1-generate-topic-content.md) | Fable/Opus (chat) | From Phase 2 on, one topic at a time (pilot: Class 9 Math/Science) |

## Changelog
- 2026-11-23: library created (35 build prompts + C1, C2, OPS-backup, OPS-update-prompts) from LMS_AUDIT build order + Phase 10 extensions + motion system.
