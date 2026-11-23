# DECISIONS.md

Newest first. Each: decision — reason — who/when.

## 2026-11-23 — visual identity (session 00, pending Hassan's review of the wireframes)

32. **Identity v0.2 "Mosaic"** (replaces v0.1 "calm notebook", which Hassan found boring and empty). Ink + indigo + saffron, a bright hue per subject (assigned from data), Lahore-tile patterns on headers and cards, chunky "sticker" buttons with a hard ink shadow, Baloo 2 headings over Nunito body, Urdu in Noto Nastaliq at ~12 % larger size and line-height ≥ 1.9×. Clay (not red) for wrong answers, no streaks or mascot, exams stay calm. Why: fun and local-feeling without being babyish; every colour pair passes WCAG AA (script-verified). Spec: `DESIGN_SYSTEM.md`.
33. **Mastery progress is a mosaic of tiles** (one per concept, set when mastered, never removed; a finished chapter completes a pattern). It replaces the v0.1 ring, so the "transform and opacity only" rule has **no exceptions**; follow-up rows don't reflow-animate (they dim to "Done" and leave on the next visit). Parallax and shared-element transitions from ARCHITECTURE §6b are not used (no meaning on study screens).
34. **Three presentations of the same components:** `kid` (PG–5, from `classes.grade_level ≤ 5`), `student` (6–10, and no-class users), `staff` (teacher/admin, defaults to lite motion). They change sizes, copy length, illustration and celebration size, not the component set.
37. **Answers to the design questions (Hassan, 2026-11-23):** Mosaic look approved; **Western 0–9 digits** in both languages; mastery as **tiles** (no ring or percentage); **one bundled celebration burst** (chapter complete, full tier only); read-aloud for PG–5 uses device speech English-first (Urdu only where the voice test passes), plus **ElevenLabs audio made once per item** for junior maths questions, for natural pronunciation. The key stays server-side, clips are stored with the item version, and they ship in offline packs (prompt 16). Why ElevenLabs: device Urdu voices are missing or poor on Chromebooks/Windows, and maths terms need correct pronunciation for young children.
36. **Lessons are visual-first, for every age.** Each lesson section is a visual on a stage with a short caption; long text sits under "Explain more". Visuals are lesson data (jsonb blocks): `figure` (hotspots), `scene` (step-through animation: SVG layers moved by transform + opacity, authorable by Claude in C1), `chart`, `widget` (a fixed catalogue of simulations configured by params), `compare`, and `video` (Blender on YouTube, online only, with a scene fallback). Why: Hassan wants concepts explained with charts and animation, not plain text; this keeps content as data, works offline and on 4 GB Chromebooks, and stays bilingual and accessible (alt + captions required, "Text version" toggle). Lottie is optional (no authoring tool yet). Exam items stay static (figure/chart only). Spec: DESIGN_SYSTEM.md §7b; build: prompt 33.
35. **Draft tokens live in `docs/design/tokens.draft.ts`** (not inside DESIGN_SYSTEM.md) because `apps/mobile` doesn't exist yet and a real TS file can be type-checked and tested (`scripts/verify-design-tokens.mjs`). Session 02 moves it to `apps/mobile/ui/`.

## 2026-11-23 — tooling

30. **No Fable; every session runs on Opus with skills and MCPs.** Design work uses `frontend-design`, `design:*` and the Expo skills (`expo-design-system`, `expo-animation`), with Figma optional. The Supabase MCP is connected to the **dev project only**. Context7 is used for current library docs. Workflow and setup: `GUIDE.md`.
31. **Animated explainers are made with Blender** through the Blender MCP in a local Claude Code session on Hassan's PC (replacing Remotion/Manim in #9-era plans). Blender doesn't shape Urdu text correctly, so Urdu captions are rendered as images with a real text engine (Chromium + bundled Nastaliq) and imported, or overlaid with ffmpeg. Verify on day one.

## 2026-11-23 — answers to the open questions (LMS_AUDIT §7)

22. **Old features are rebuilt right after parity (Phase 1b: attendance, messaging + push, pre-reader), and new features have priority. Legacy code AND legacy data may be hard-deleted** whenever they cause trouble. This is a scoped exception to rule 3. It applies only to old-app code and to data created by the old app. It goes through an explicit migration (prompt OPS-remove-legacy), only after a same-day verified backup, logged here. Data written by the new app keeps the no-hard-delete rule.
23. **Two access tiers.** School login (admission no + PIN, or staff email) unlocks everything. **Google sign-in unlocks Preparation only** (Learn/Practice/Diagnose/Follow-ups with automatic relief): no enrollments, exams, assignments, grades, attendance or messages. It is enforced by RLS through `profiles.access_tier` (prompt 05). Google sign-in is not a child-created email/password account, so it fits the auth rule.
24. **No iOS for now.** Android (phones + Chromebooks) and web (Windows) are the priority. This supersedes the iOS part of #10; prompt 82 is deferred.
25. **Parent features deferred.** They will be redesigned later with the rest; no decisions on parent logins yet (prompt 81 deferred).
26. **Mastery starting values:** mastered = ≥ 80 % on the last 5 distinct questions, including ≥ 1 difficulty-3 and ≥ 1 never-seen question. Automatic relief after 3 failed follow-up rounds or an exhausted pool. Tune on pilot data; store in a config table, not code.
27. **A second free Supabase project for development** (seed, scale tests, real logins/realtime with fake data). Hassan creates it and adds its keys to the cloud environment; production is never used for testing.
28. **Urdu review by each subject's teachers** (who also review content accuracy), assisted by prompt C2.
29. **Backups:** nightly `pg_dump`, encrypted with `age`, stored as release assets in a separate private GitHub repo (prompt OPS-backup).

## 2026-11-23 — extensions and motion

20. **Four extensions adopted, built last (Phase 10):** teacher training track, challenge tier after mastery, real-world/SDG tags, coding and project evidence in assignments. They reuse existing modules, so the core rebuild comes first. Details: `LMS_AUDIT.md` §10.
21. **High-polish, motion-rich UI** (this replaces the "light gamification / no decorative animation" part of decision 3). It uses **Reanimated 3 + Moti** because they work on Android, iOS and web. Motion and anime.js are DOM-only, so they can't animate the Android app that students use on Chromebooks. Motion is allowed only in web-only teacher screens, and anime.js is not used. The cheap-Chromebook budget is protected by full/lite/off motion tiers and minimal motion in exams. Spec: `ARCHITECTURE.md` §6b. Visual identity design runs in prompt 00 (see #30).

## 2026-11-23 — STEMP21 offer

19. **No STEMP21 integration planned; original build order stands.** STEMP21's software appears to be teacher-facing (Training LMS + project grading), with Scratch-based content; it does not overlap the student LMS. `db/022` stays as an optional Phase 7 module for the school's own projects. Revisit if Hassan shares more (demo, contract terms).

18. **Absorb STEM projects into our own LMS; use STEMP21 for content, kits and training.** One student platform keeps logins, grades and data in one place; STEMP21 is Grades 1–8 STEM only (per public material), while our LMS covers PG–10 and every subject. Projects are a generic module; STEMP21 content is loaded only with written permission (DB enforces `licence_note`). Rubric scores live in their own table (not `submissions.responses`) so per-criterion and concept analysis is a plain query; totals still go through `record_grade()`. See `STEMP21_COMPARISON.md`.

## 2026-11-23 — planning session (Hassan + Claude Code)

1. **Full remake of app and UI; backend kept.** Existing data, RLS, student login and grade audit are sound and hold real school records; the UI/navigation are phone-only and untyped.
2. **One Expo + TypeScript + expo-router codebase** for Android, iOS, web/PWA. Least duplicated work; Android APK covers Chromebooks (Play Store allowed), web covers Windows teachers.
3. **Clean calm UI, light gamification; quest/pixel style dropped.** *(Motion part superseded by #21.)* Cheap Chromebooks and "measure learning, not activity".
4. **Parity first (assessments, file uploads, grading), then LMS.** Lets the old app be retired flow by flow.
5. **New code in `apps/mobile` + `packages/core` in this repo.** Keeps migration history; old `src/` until cut-over.
6. **Supabase free tier.** Drives compact attempts, rollups, caching, YouTube for video, scheduled `pg_dump` backups.
7. **Automatic gate relief for no-class users** (and as a safety net for everyone). Never trap a student.
8. **Pilot content: Class 9 Math/Science.** Board-exam year; exercises math rendering early.
9. **Offline exams supported,** with lower integrity and results after sync (answer keys never on device).
10. **Parents and iOS in scope** (Phase 8). *(Superseded: iOS dropped for now (#24), parents deferred (#25).)*
11. **Learner identity = `profiles.id`,** not `students.id`, so non-enrolled Play Store users use the same tables.
12. **Exams reuse `assessments`** (`mode` column) so results flow into existing `submissions` + `record_grade` audit after teacher confirmation.
13. **Versions by trigger** (`question_versions`), approvals per use and per version.
14. **Compact `practice_attempts`** (one row per attempt), no per-answer table for practice.
15. **Math pre-rendered to SVG at import;** no runtime KaTeX WebViews.
16. **QR card holds admission number only;** PIN always typed.
17. **Exam integrity = monitoring only** (Chromebooks unmanaged; no kiosk mode).

## Carried over from LMS_PLAN.md (confirmed earlier)
Port prep.html, don't embed · themes dropped · gate within subject for diagnostics · exam follow-ups block Prepare only · results to grades only after teacher confirms · YouTube unlisted for video · teachers create content too · worksheets v1 = printable + interactive.
