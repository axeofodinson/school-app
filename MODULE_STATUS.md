# MODULE_STATUS.md

Last updated: 2026-11-23. Update at the end of every session. Session order and
prompts: `prompts/README.md`.

| Module | Phase | Status | Prompt(s) | Next step |
|---|---|---|---|---|
| Planning / audit / prompt library | — | ✅ done (all open questions answered) | [OPS update](prompts/OPS-update-prompts.md) | Merge planning branch to `main`; create dev Supabase project |
| Backups | — | ⏳ | [OPS backup](prompts/OPS-backup.md) | Ready: private GitHub repo |
| Visual identity + motion choreography | 0 | ✅ done: v0.2 "Mosaic" approved, §0 answered (DECISIONS #37) | [00](prompts/00-design-identity.md) | — |
| App scaffold (`apps/mobile`, `packages/core`) | 0 | ⏳ | [01](prompts/01-scaffold.md) | |
| Design system + motion tiers | 0 | ⏳ | [02](prompts/02-design-system-motion.md) | |
| Auth (PIN + QR, shared mode) | 0 | ⏳ | [03](prompts/03-auth.md) | |
| Seed script (656 students) | 0 | ⏳ | [04](prompts/04-seed-dev-data.md) | Hassan creates the dev Supabase project |
| Google sign-in + prep-only tier | 0 | ⏳ | [05](prompts/05-google-signin-prep-access.md) | Before the paid Play release |
| Parity: assessments, attempts, files, grading | 1 | ⏳ | [10](prompts/10-assessment-builder.md) [11](prompts/11-student-attempts-offline.md) [12](prompts/12-file-assessments-grading.md) | |
| Cut-over + close answer-key hole (018) | 1 | ⏳ | [13](prompts/13-cutover-close-answer-keys.md) | |
| Rebuild attendance, messaging + push, pre-reader | 1b | ⏳ | [14](prompts/14-attendance.md) [15](prompts/15-messaging-push.md) [16](prompts/16-prereader.md) | |
| Legacy removal (code + data) | any | as needed | [OPS remove legacy](prompts/OPS-remove-legacy.md) | Only after a same-day backup |
| DB foundation (017) | 2 | 📝 draft, dry-run verified | [20](prompts/20-curriculum-run-017.md) | Hassan runs it at Phase 2 start |
| Curriculum editors | 2 | ⏳ | [20](prompts/20-curriculum-run-017.md) | |
| Importer + review queue | 2 | ⏳ | [21](prompts/21-importer.md) [22](prompts/22-review-queue.md) | |
| Content (pilot: Class 9 Math/Science) | 2+ | ⏳ | [C1](prompts/C1-generate-topic-content.md) [C2](prompts/C2-review-urdu.md) | |
| Learn renderer + visual blocks + offline packs | 3 | ⏳ (visual block format specced in session 00) | [30](prompts/30-learn-renderer.md) [33](prompts/33-visual-blocks.md) [32](prompts/32-offline-learn-packs.md) | |
| Practice engine | 3 | ⏳ | [31](prompts/31-practice-engine.md) | |
| Mastery / follow-ups / gates / revision | 4 | ⏳ | [40](prompts/40-mastery-rpcs.md) [41](prompts/41-followups-gates-prepare.md) [42](prompts/42-spaced-revision.md) | |
| Online exams + live view | 5 | 🟡 RPCs drafted in 017 | [50](prompts/50-exam-launch-and-take.md) [51](prompts/51-live-view-results.md) | |
| Offline exams, sync + shared devices, load tests | 6 | ⏳ | [60](prompts/60-offline-exams.md) [61](prompts/61-sync-shared-devices.md) [62](prompts/62-load-tests.md) | |
| Worksheets + assignments | 7 | ⏳ | [70](prompts/70-worksheets.md) [71](prompts/71-assignments.md) | |
| STEM projects (rubrics, teams, evidence) | 7 | 📝 `db/022` draft, dry-run verified | [72](prompts/72-stem-projects.md) | |
| Dashboards | 8 | ⏳ | [80](prompts/80-dashboards.md) | |
| Parents, iOS | — | ⏸ deferred | [81](prompts/81-parents.md) [82](prompts/82-ios-release.md) | DECISIONS #24, #25 |
| Animated explainers, in-app AI | 9 | ⏳ | [90](prompts/90-animated-explainers.md) [91](prompts/91-ai-drafting.md) | |
| E1–E4 extensions | 10 | ⏳ | [E1](prompts/E1-teacher-training.md) [E2](prompts/E2-challenge-tier.md) [E3](prompts/E3-sdg-tags.md) [E4](prompts/E4-coding-evidence.md) | |

**Old app (`src/`):** frozen; its code and data may be removed via OPS-remove-legacy (DECISIONS #22).
