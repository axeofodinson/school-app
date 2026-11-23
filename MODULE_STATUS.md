# MODULE_STATUS.md

Last updated: 2026-11-23. Update at the end of every session.

| Module | Phase | Status | Depends on | Next step |
|---|---|---|---|---|
| Planning / audit | — | ✅ done | — | Hassan answers `LMS_AUDIT.md` §7 |
| DB foundation (017) | 2 | 📝 draft, dry-run verified | — | Review; run at Phase 2 start |
| App scaffold (`apps/mobile`, `packages/core`) | 0 | ⏳ not started | — | Expo + TS + router + web build on Windows |
| Design system (light/dark, RTL, Nastaliq web) | 0 | ⏳ | scaffold | Tokens + primitives |
| Auth (PIN + QR, shared mode) | 0 | ⏳ | scaffold | Port `db/004/008` flow |
| Seed script (656 students) | 0 | ⏳ | 017 on dev project | Open question §7.7 |
| Parity: assessments / files / grading | 1 | ⏳ | auth | |
| Close answer-key hole (018) | 1 | ⏳ | parity cut-over | |
| Curriculum + bank editors | 2 | ⏳ | 017 | |
| Importer + Review | 2 | ⏳ | 017 | |
| Learn renderer + offline packs | 3 | ⏳ | bank | |
| Practice engine | 3 | ⏳ | bank | |
| Mastery / follow-ups / gates / revision | 4 | ⏳ | practice | |
| Online exams + live view | 5 | 🟡 RPCs drafted in 017 | auth, bank | |
| Offline exams + sync hardening | 6 | ⏳ | exams | |
| Worksheets + assignments | 7 | ⏳ | bank | |
| STEM projects (rubrics, teams, evidence) | 7 | 📝 `db/022` draft, dry-run verified | assessments, 017 concepts | STEMP21 licence answer (`LMS_AUDIT.md` §7.9) |
| Dashboards, parents, iOS | 8 | ⏳ | mastery, exams | |
| Animated explainers, in-app AI | 9 | ⏳ | — | |

**Old app (`src/`) flows not yet scheduled for the remake:** attendance,
messaging/push, PG pre-reader — see `LMS_AUDIT.md` §7.1.
