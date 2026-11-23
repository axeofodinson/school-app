# DECISIONS.md

Newest first. Each: decision — reason — who/when.

## 2026-11-23 — STEMP21 offer

18. **Absorb STEM projects into our own LMS; use STEMP21 for content, kits and training.** One student platform keeps logins, grades and data in one place; STEMP21 is Grades 1–8 STEM only (per public material), while our LMS covers PG–10 and every subject. Projects are a generic module; STEMP21 content is loaded only with written permission (DB enforces `licence_note`). Rubric scores live in their own table (not `submissions.responses`) so per-criterion and concept analysis is a plain query; totals still go through `record_grade()`. See `STEMP21_COMPARISON.md`.

## 2026-11-23 — planning session (Hassan + Claude Code)

1. **Full remake of app and UI; backend kept.** Existing data, RLS, student login and grade audit are sound and hold real school records; the UI/navigation are phone-only and untyped.
2. **One Expo + TypeScript + expo-router codebase** for Android, iOS, web/PWA. Least duplicated work; Android APK covers Chromebooks (Play Store allowed), web covers Windows teachers.
3. **Clean calm UI, light gamification; quest/pixel style dropped.** Cheap Chromebooks and "measure learning, not activity".
4. **Parity first (assessments, file uploads, grading), then LMS.** Lets the old app be retired flow by flow.
5. **New code in `apps/mobile` + `packages/core` in this repo.** Keeps migration history; old `src/` until cut-over.
6. **Supabase free tier.** Drives compact attempts, rollups, caching, YouTube for video, scheduled `pg_dump` backups.
7. **Automatic gate relief for no-class users** (and as a safety net for everyone). Never trap a student.
8. **Pilot content: Class 9 Math/Science.** Board-exam year; exercises math rendering early.
9. **Offline exams supported,** with lower integrity and results after sync (answer keys never on device).
10. **Parents and iOS in scope** (Phase 8).
11. **Learner identity = `profiles.id`,** not `students.id`, so non-enrolled Play Store users use the same tables.
12. **Exams reuse `assessments`** (`mode` column) so results flow into existing `submissions` + `record_grade` audit after teacher confirmation.
13. **Versions by trigger** (`question_versions`), approvals per use and per version.
14. **Compact `practice_attempts`** (one row per attempt), no per-answer table for practice.
15. **Math pre-rendered to SVG at import;** no runtime KaTeX WebViews.
16. **QR card holds admission number only;** PIN always typed.
17. **Exam integrity = monitoring only** (Chromebooks unmanaged; no kiosk mode).

## Carried over from LMS_PLAN.md (confirmed earlier)
Port prep.html, don't embed · themes dropped · gate within subject for diagnostics · exam follow-ups block Prepare only · results to grades only after teacher confirms · YouTube unlisted for video · teachers create content too · worksheets v1 = printable + interactive.
