# LMS_AUDIT.md — Al-Syed LMS feasibility audit

> Response to `LMS_PLAN.md` §9. Planning pass only: **no app code changed**.
> The only schema artefact is the **draft** `db/017_lms_foundation.sql` (not run
> against Supabase; dry-run on a throwaway local Postgres only, see §5.3).
> Anything not verifiable from the code is marked **unverified** with the test
> that would verify it.

## 0. Decisions taken in the planning session (2026-11-23)

These answers from Hassan change parts of `LMS_PLAN.md`; the rest of this doc assumes them.

| Topic | Decision |
|---|---|
| Scope | **Full remake of the app and its UI.** Backend kept. |
| Backend | Keep the existing Supabase project + data; extend with additive migrations (`db/017+`). |
| Stack | One **Expo (latest SDK) + TypeScript + expo-router** app → Android, iOS, and web/PWA. |
| UI | Clean, calm, light/dark, light gamification. Pixel "quest" style, sprites, SFX dropped. |
| Release | **Parity first, then LMS.** Parity = assessments + file uploads + grading with audit. |
| Code location | Same repo: `apps/mobile/` + `packages/core/`; old `src/` kept until cut-over. |
| Supabase | **Free tier, staying free.** |
| No-class Play Store users | **Automatic relief rules** for gates (no human override). |
| Pilot content | **Class 9 Math / Science.** |
| Offline exams | **Required** (pre-downloaded). |
| Audiences | Parents and iOS in scope (later phases). |
| Team | Hassan + Claude Code only. |

---

## 1. Feasibility table

Legend: ✅ works as planned · ⚠️ works with changes · ❌ won't work as written.

### 1.1 Platform (§3)

| Item | Verdict | Reason / evidence |
|---|---|---|
| Android app on Chromebooks | ⚠️ | Play Store apps run on ChromeOS (ARC). But `app.json` sets `"orientation": "portrait"`, so the app opens as a phone-shaped window; every current screen is phone-only layout. Fix: `orientation: default`, responsive layouts (2-pane ≥ 900 px), keyboard focus order, Enter-to-submit, mouse hover states. **Unverified** on real hardware — test: install preview APK on one school Chromebook, run the ChromeOS checklist in `TEST_PLAN.md` §P-2. |
| File pickers on ChromeOS (Android build) | ✅ | `expo-document-picker` uses Android SAF, which ChromeOS maps to its Files app. **Unverified** — test in P-2. |
| Push on ChromeOS (Android build) | ⚠️ | FCM works under ARC, but battery-optimisation prompts (`src/notifications/batteryOptimization.js`, `expo-intent-launcher`) are phone-specific and must be skipped on ChromeOS. |
| Web build (Windows + ChromeOS fallback) | ⚠️ | `package.json` has a `web` script but **no `react-dom`, `react-native-web`, `@expo/metro-runtime`**; never built for web. The remake starts web-ready, so this is solved by the new scaffold, not by retrofitting `src/`. |
| `expo-notifications` on web | ❌→⚠️ | Expo push tokens don't exist on web. Fallback: Realtime-driven in-app toasts while the tab is open (the existing `ToastProvider` pattern); optional Web Push later. |
| Secure storage on web | ⚠️ | No secure enclave on web. Supabase session goes to localStorage (standard for SPAs). Acceptable; mitigated by short sessions on shared devices (§3.4). |
| `expo-file-system` (downloads, offline packs) | ⚠️ | Native only. Web: Cache Storage / IndexedDB via a storage adapter in `packages/core`. |
| `expo-av` video/audio | ⚠️ | Deprecated in newer SDKs → `expo-video` / `expo-audio` (both support web). Lecture video is YouTube anyway. |
| `expo-speech` (pre-reader) | ⚠️ | Web uses SpeechSynthesis; **Urdu voice availability unverified** on ChromeOS/Windows — test: speak a fixed Urdu sentence on each target. |
| `expo-intent-launcher` | ⚠️ | Android-only; must be behind `Platform.OS === 'android'`. |
| Installable PWA + offline cache | ✅ | Expo static web export + a Workbox service worker. Offline shell, cached question packs (IndexedDB), queued writes. |
| Recommendation (routes) | ✅ | **Students:** Android app (phones + Chromebooks via Play Store — confirmed allowed). **Teachers/admin:** web/PWA on Windows. **Fallback:** same PWA on Chromebooks. One codebase. |
| Performance budget (4 GB Celeron) | ⚠️ | Feasible with rules: no per-option WebViews, no heavy animation, virtualised lists, Nastaliq as WOFF2 subset (2 × 530 KB TTF today: `assets/fonts/`), pre-rendered math SVG (§3.6). **Unverified** — test P-4 frame/latency budget on the cheapest Chromebook. |
| Offline behaviour | ⚠️ | Practice, downloaded Learn packs, and pre-downloaded exams work offline; YouTube video never does (confirmed). Protocol in §3.3. |
| YouTube unlisted embeds | ⚠️ | Web: iframe. Native: `react-native-webview` / `react-native-youtube-iframe`. Requires "Allow embedding" on each video. **Unverified** on school network (may be filtered) — test P-5 on lab Wi-Fi with each platform. |

### 1.2 Feature modules (§5)

| Item | Verdict | Reason / evidence |
|---|---|---|
| 5.1 Hierarchy year → curriculum → class → subject → chapter → topic → concept | ⚠️ | Existing tree is `classes → subjects → chapters` (`db/setup.sql`), year-independent. Adding `topics`, `concepts` beneath and a nullable `chapters.curriculum_id` is enough. Academic year should **not** be in the content tree — it scopes enrollments/assessments, not content. |
| 5.1 Concepts + prerequisites | ✅ | `concepts`, `concept_prerequisites` in 017. |
| 5.1 Curriculum versions | ✅ | `curricula` table; chapters point at one. PTB not hard-coded. |
| 5.1 One engine for all levels | ✅ | Already a rule (CLAUDE.md rule 5: one `questions` table, jsonb `body`). Presentation varies by `classes.grade_level`. |
| 5.1 States draft→reviewed→approved→retired, per-use approval | ✅ | `questions.status` + `item_approvals(scope)` per version. |
| 5.1 Versioning; attempts point to exact version | ✅ | `question_versions` populated by trigger, append-only (verified in smoke test). |
| 5.1 Structured lesson blocks | ✅ | `learning_content` + `learning_content_versions.blocks` (jsonb). |
| 5.1 MCQ field list | ⚠️ | Map onto the existing shape instead of new columns: `body.stem{en,ur}`, `body.options[{key,text{en,ur}}]`, `answer.correct` (as written today by `src/screens/teacher/QuestionAuthoringScreen.js:435-437`). `class/subject/chapter/topic` derive from `concept_id`; `times_used/percent_correct` are computed views, not stored counters. |
| 5.1 Item types for v1 | ⚠️ | **v1:** MCQ, true/false, numeric, fill-in-blank (exact/regex), short answer (teacher-marked). **Later:** matching, diagram labelling (need drag/drop UX on touch + mouse). `match`/`tap_image` already exist in the type check. |
| 5.1 KaTeX + SVG | ⚠️ | KaTeX in a WebView per item is too heavy on Celerons. Pre-render math to SVG at import time (stored in body), render with `react-native-svg` everywhere. |
| 5.2 External AI generation → Importer → draft | ✅ | Importer validates schema, single correct answer, both languages, duplicates (normalised-stem hash + trigram), concept refs. `import_batches` lets a bad batch be retired as a unit. |
| 5.2 In-app AI generation | ⚠️ later | Must go through an Edge Function holding the API key (never in the app). Cost is small (bulk drafting a chapter's ~400 MCQs is a few US dollars at current API prices — **verify against current pricing**), but it adds key management, rate limits and abuse risk. Not worth it before the review pipeline is proven. Phase 9. |
| 5.2 Separate translation review | ✅ | `item_reviews.translation_ok`; `language_complete` ≠ reviewed. |
| 5.3 Learn pages, 10-part structure | ✅ | Block types map 1:1 to the 10 parts; optional per subject. |
| 5.3 Video lectures (YouTube) | ⚠️ | See YouTube row above; online only. |
| 5.3 Animated explainers | ⚠️ later | **Remotion** (React → MP4, Chrome text shaping, so Nastaliq renders correctly) for most; **Manim** only for heavy math animation (Urdu via Pango text — **unverified**). Render locally (free CPU), upload to YouTube unlisted, 720p ≈ 2–4 MB/min. Phase 9; never a dependency of the core loop. |
| 5.3 Alternative explanations | ✅ | `learning_content.kind='alternative'` with `concept_id`. |
| 5.3 Bulk content format | ✅ | One JSON file per topic: `{topic, concepts[], blocks[], questions[]}` validated by the same Importer schema (DATABASE_DESIGN.md §4). |
| 5.4 Diagnostic ~30 Q | ✅ | `topics.diagnostic_size` override; engine default 30, capped by available approved items. |
| 5.4 Weakness → follow-up per concept | ✅ | `follow_ups` unique open per (learner, concept, kind). |
| 5.4 Gate within subject, teacher relax, audit | ✅ | `follow_ups.subject_id` scopes the gate; `gate_overrides` insert-only. |
| 5.4 Multi-signal mastery | ⚠️ | Keep v1 simple and explainable: mastered = ≥ 80 % on the last ≥ 5 distinct questions incl. ≥ 1 difficulty-3 and ≥ 1 unseen-before; displayed as 3 bands (learning / weak / mastered), not a percent. Tune on pilot data. |
| 5.4 Spaced revision 7 / 30 d | ✅ | `concept_mastery.next_review_at`, `review_stage`. |
| 5.4 Four task kinds | ✅ | `follow_ups.kind`. |
| 5.4 Bank size | ⚠️ | ~30 diagnostic + ~15 fresh per concept × ~4 concepts ≈ **90 questions/topic**, ≈ 300–400/chapter, ≈ **3,000–4,000 per subject**. The content pipeline, not the app, is the bottleneck. |
| 5.5 Teacher-only exams, own accounts, instant result | ✅ online · ⚠️ offline | Online: `start/save/submit_exam_session` RPCs (smoke-tested). Offline: result only after sync (answer keys never leave the server). |
| 5.5 Exam follow-ups block Prepare | ✅ | Prepare tab checks open `kind='exam'` follow-ups first. Relief rules apply (§3.5). |
| 5.5 Shuffled order + options per student | ✅ | `exam_sessions.paper` (order shuffled server-side; option permutation to add in Phase 5). |
| 5.5 Auto-submit, autosave, review after submit | ✅ | Server deadline + grace; abandoned sessions closed by pg_cron sweep. |
| 5.5 Integrity on Chromebooks | ⚠️ | **Monitoring only.** Fullscreen request + blur/visibility events (`exam_events`) shown live. A web app or an ordinary Android app **cannot** prevent another tab/app, screenshots, phones, or a second device. Real lockdown needs managed ChromeOS kiosk mode — **not available** (Chromebooks unmanaged, confirmed). |
| 5.5 "3 taps / 30 s" surprise exam | ⚠️ | Achievable only with a **saved default blueprint** per class/subject (last-used topics, 10 Q, mixed difficulty, 15 min). First-time setup is more taps. |
| 5.5 Results → grades only after teacher confirms | ✅ | `assessments.results_confirmed_*` then existing `record_grade()` (`db/013_grade_editing_versioned.sql`). |
| 5.6 Printable worksheets | ✅ | HTML → A4 print/PDF (web print on Windows; `expo-print` on native). Sets A/B by seeded shuffle, separate key page. |
| 5.6 Interactive worksheets | ⚠️ | Same renderer as practice; short answers go to teacher marking queue. Matching/labelling later. |
| 5.7 Assignments | ✅ | Reuse `assessments` type `file` + Storage bucket from `db/014_assessment_files.sql`. Photo upload via image picker. |
| 5.8 Dashboards | ✅ | Read from `concept_mastery` / `follow_ups` rollups, never raw attempts. |
| 5.9 Admission no + PIN | ✅ | Exists: `db/004`, `db/008` (`student_login_email`, synthesized email + PIN). |
| 5.9 QR card login | ⚠️ | QR encodes **admission number only**; PIN still typed. A QR containing the PIN is a printed password. |
| 5.10 Seed at 656 students | ✅ | Plan in `TEST_PLAN.md` §Seed; `is_test_data` markers in 017 Part 6. |
| 5.11 Offline sync | ⚠️ | Feasible; rules in §3.3. Needs one durable queue in `packages/core` (evolve `src/lib/attemptStore.js`). |
| 5.12 Learning outcome metrics | ✅ | All six derive from `practice_attempts` + `concept_mastery` + exam sessions; computed in nightly rollups. |
| 5.13 Module boundaries | ⚠️ | Good as **folders/interfaces**, not services. Several candidate tables merged (see §8). |

---

## 2. Codebase findings

### 2.1 Reuse (port to TypeScript in the remake)
- **DB + RLS** — everything in `db/setup.sql` + `002–016` (47 policies). Helper functions `my_role`, `is_staff`, `is_teacher`, `teaches_class`, `teaches_chapter`, `my_student_id`.
- **Student auth** — admission no + PIN via synthesized email (`db/004`, `db/008`), enrollment-driven login revoke (`db/009`).
- **Grades with audit** — `record_grade()` + `submission_grade_edits` (`db/013`).
- **File assessments** — private bucket + RLS (`db/014`).
- **Offline attempt store** — `src/lib/attemptStore.js` (draft/cache/pending queue with pure, testable helpers) → becomes the generic sync queue.
- **Pure logic** — `src/reporting/{aggregate,grading,overdue}.js`, `src/markdown/parse.js`, `src/engagement/engagement.js`.
- **i18n/RTL** — `locales/*.json`, `src/i18n/`, and the `forceRTL(false)` lesson in `App.js` (direction from JS state, never sticky native flag).
- **Fonts** — Noto Nastaliq Urdu bundled (`assets/fonts/`).
- **Verification habit** — `scripts/verify-*.mjs` (node scripts proving math) → keep as `packages/core` tests.
- **Push Edge Function** — `supabase/functions/send-message-push/`.

### 2.2 Blockers / problems found
1. **Security hole (pre-existing):** `p_questions_read` (`db/setup.sql:263`) is `using (auth.uid() is not null)` — any student can read **every question with its answer key** through the API. Confirmed in the dry-run (student role read all 9 questions incl. `answer`). Exams are meaningless until closed. Fix drafted in 017 Part 10 (commented: the old app's `AssessmentAttemptScreen` reads `questions` directly, so it must be enabled at the Phase 1 cut-over).
2. No web dependencies; never built for web.
3. `orientation: portrait` lock (`app.json`).
4. No navigation library (`src/navigation/RootNavigator.js` is a conditional render) — fine for today, not for a tabbed LMS with deep links. expo-router in the remake.
5. Plain JS, no type checks; data contracts between modules need TS types generated from the DB (`supabase gen types`).
6. Large single-file screens (`AssessmentBuilderScreen.js` 1,394 lines, `QuestionAuthoringScreen.js` 1,082) — rebuild, don't port.
7. `debug_logs` table (`db/016`) exists for Realtime diagnosis — keep but rate-limit; it eats free-tier DB space.

---

## 3. Design proposals

### 3.1 Practice: port, don't embed (confirmed)
Rebuild prep.html's flows as components over one engine in `packages/core/practice`: `selectItems(pool, history, rules)` → `score(attempt)` → `updateMastery(...)`. Modes are configs of the same engine: practice, topic drill, smart review (due revision + weak concepts), retry-wrong, diagnostic, follow-up. Flags and tips are per-item UI. Dashboard reads rollups. No `inferTopic()` — every item has `concept_id` (Importer rejects otherwise).

### 3.2 Exam integrity (honest)
- **Online lab exam (default):** server-owned clock, per-student paper, answers saved per tap, fullscreen request, blur/hidden/fullscreen-exit events streamed to the teacher's live view, teacher can void a session. Teacher physically present is the real control.
- **Offline exam:** lower integrity, labelled as such everywhere.
- Never claim "secure" or "locked" in UI copy.

### 3.3 Offline sync protocol
One durable queue per **user** (key-prefixed by `auth.uid()`), entries carry client UUIDs.

| Case | Rule |
|---|---|
| Same answer submitted twice | Upsert by primary key (`practice_attempts.id`, `(session_id, question_id)`); second write is a no-op/overwrite. |
| One student on two devices | Practice: both attempts kept (different ids); mastery recomputed server-side. Exam: one session per (assessment, learner); second device **resumes** the same session and gets saved answers back. |
| Device reconnects after long offline | Practice attempts accepted any time (they're history). Mastery recomputed in server order of `started_at`. Cached bank refreshed by version delta. |
| Newer server record vs local | Server wins for derived state (mastery, follow-ups); client never writes those directly (RLS has no client write policy). Local unsent attempts still upload. |
| Exam ends while device disconnected | Answers saved before deadline + grace are kept; later ones rejected and logged as `late_answer` (verified in smoke test). Session closed by the sweep and graded with what arrived. |
| Logout before sync finishes | Logout first tries to flush; if offline, warns "N answers not yet sent", and keeps that user's queue encrypted-at-rest in an isolated namespace that only that user's next login on this device flushes. The next student sees nothing of it. |

**Offline exam protocol:** teacher publishes `mode='offline_exam'` with `opens_at/closes_at`; device (logged in as the student, online once) calls `start_exam_session` → gets a paper **without answers**; app records monotonic elapsed time; on reconnect it uploads answers + `client_elapsed_ms`; a Phase 6 RPC accepts if received before `closes_at` and elapsed ≤ duration + grace, otherwise stores and flags. Result shown after sync.

### 3.4 Shared-device login
Admission no + PIN (exists) or scan QR card (fills admission no) + PIN. "Switch student" button always visible; idle timeout 10 min in lab. Per-user storage namespaces; logout wipes the namespace except an unsynced queue (above). No "remember me" on shared devices (device-level "shared mode" toggle set by admin).

### 3.5 Gates and relief (never trap a student)
- Enrolled: teacher relax/restore with reason (`gate_overrides`).
- Everyone, automatically: if a follow-up reaches **N rounds** (default 3) without clearing, or the fresh-item pool for that concept is exhausted, it is **relieved** (`status='relieved'`, `gate_overrides.action='auto_relief'`, `actor_id null`), the concept becomes `carried_over` and returns in spaced revision; the teacher (if any) is notified. This is the mechanism for no-class Play Store users.
- Retired/wrong question: answers on a retired version are excluded from mastery; open follow-ups re-evaluated.
- Exam follow-ups: still block Prepare by default; relief rule applies to them too, so a student is never stuck permanently.

### 3.6 Rendering: math, Urdu, media
- Math: pre-render LaTeX → SVG in the Importer; store in `body`. No runtime KaTeX on native.
- Urdu: Nastaliq WOFF2 subset for web; increased line-height tokens; Urdu text never in all-caps/letter-spaced styles.
- Images: WebP ≤ 100 KB in Storage; SVG diagrams inline in blocks.

### 3.7 Worksheets v1
Printable (A4, sets A/B, key) + interactive (same item renderer), both from approved items with `scope='worksheet'`. Short answers → teacher marking queue. Homework packs later.

---

## 4. Improved core principles (replaces §4)

1. **One bank, versioned.** Every item is written once, tagged to a concept, and versioned; every use points to an exact version.
2. **Understand → check → follow up → revisit.** Teach, diagnose, fix weak concepts, and re-check after 7 and 30 days.
3. **Follow-ups first, but never a trap.** Exam follow-ups lead the Prepare tab; every gate has a logged human override and an automatic relief path.
4. **Fast for the least-technical user.** Surprise exam from a saved blueprint in ≤ 3 taps; practice in ≤ 2 taps after login.
5. **Bilingual and RTL by default,** with human-reviewed Urdu; translation review is separate from content review.
6. **Bad internet is normal.** Nothing a student does is lost; sync status is always visible.
7. **Paper is a first-class output.**
8. **Only teacher-approved content in exams,** approval per use and per version.
9. **Fast on a 4 GB Chromebook.** One polished design; motion is purposeful and tiered (full/lite/off), never on exam screens.
10. **Measure learning, not activity.** Show mastery bands and retention, not raw counts or false precision.
11. **History is never rewritten.** Attempts, exams and grades reference immutable versions; corrections are audited.
12. **The server decides exams.** Clocks, acceptance and grades are server-side; the client timer is display only.
13. **The database is the security boundary.** RLS on every table; answer keys reach students only where the use allows it.
14. **Shared devices are private devices.** One student's data is never visible to the next.
15. **Live within the free tier.** Compact storage, rollups, cached content, YouTube for video; watch the limits monthly.

---

## 5. Proposed data model

Full detail: `DATABASE_DESIGN.md`. Draft migration: `db/017_lms_foundation.sql`.

### 5.1 New / extended tables
| Area | Tables |
|---|---|
| Curriculum | `curricula`; `chapters` + `curriculum_id, title_ur, textbook_ref, status`; `topics`; `concepts`; `concept_prerequisites` |
| Bank | `questions` + `concept_id, difficulty, status, current_version, origin, source, explanation, language_complete, scope_class_id, import_batch_id`; `question_versions` (append-only); `item_approvals`; `item_reviews`; `import_batches` |
| Learn | `learning_content`; `learning_content_versions` (append-only) |
| Learner state | `practice_attempts` (one compact row per attempt); `concept_mastery`; `follow_ups`; `gate_overrides` (append-only) |
| Exams | `assessments` + `mode, duration_seconds, opens_at, closes_at, join_code, settings, blueprint, results_confirmed_*`; `assessment_questions.question_version`; `exam_sessions`; `exam_session_answers`; `exam_events` |
| RPCs | `start_exam_session`, `save_exam_answer`, `submit_exam_session`, `grade_exam_session`, `log_exam_event` |

**Learner identity = `profiles.id`**, so Play Store users without a `students`/`enrollments` row use every learning table; exams additionally require an active enrollment.

### 5.2 Not created (merged or dropped)
`question_options` (stay in jsonb body), `question_tags` (concept_id + cognitive_level suffice), `content_versions`/`content_assets` (versions per item; assets are Storage paths in blocks), `worksheets` (= assessments), `exam_questions` (= assessment_questions), `student_attempts`/`student_answers` (= compact `practice_attempts`), `revision_schedule` (= columns on `concept_mastery`), `student_enrollments` (= existing `enrollments`), `content_downloads`/`sync_records` (client-side concern; server uses idempotent keys).

### 5.3 Dry-run evidence
Throwaway PG16 with stubbed `auth`/`storage` (`db/test/supabase_stubs.sql`), `setup.sql` + 002–016 + 017, then 017 again, then `db/test/017_smoke.sql`:
- applies cleanly; **re-run idempotent**;
- existing questions backfilled `approved` + version 1; new questions default `draft`;
- content edit → v2 snapshot; status-only change → no bump; versions immutable;
- exam paper contains **no answers**; double start → one session; save retry idempotent; double submit → same result; answer after submit rejected + logged;
- RLS as student: 0 unapproved versions visible, 1 after practice approval; own session visible; integrity events hidden.

---

## 6. Revised build order

Each phase = several small Claude sessions; each session ends runnable + verified.

| # | Phase | Effort | Exit criteria |
|---|---|---|---|
| 0 | Foundations: `apps/mobile` (Expo latest, TS, expo-router, web/PWA), `packages/core`, design system (light/dark, RTL, Nastaliq web), auth (PIN + QR, shared mode), generated DB types, CI running core tests, seed script | M | Login works on Android, Chromebook (APK), Windows (web) |
| 1 | Parity: assessments, attempts, file uploads, grading with audit; close the answer-key hole; retire those flows in the old app | M | Teachers use new console on Windows; old app not needed for these |
| 1b | Rebuild attendance, messaging + push, pre-reader; Google sign-in prep-only tier (prompt 05) before the paid release | M | Old app can be retired completely |
| 2 | Curriculum + bank: run 017, topic/concept editors, Importer (JSON → draft, validation report), Review screen with keyboard shortcuts, approvals | L | 1 Class 9 Math chapter imported and approved |
| 3 | Learn renderer (blocks, SVG math, diagrams, YouTube), basic practice, offline Learn packs | L | Pilot chapter learnable offline on a Chromebook |
| 4 | Diagnose → follow-ups → mastery → gates + relief → spaced revision | L | Full loop on pilot chapter with seed data |
| 5 | Online teacher exams, live view, item analysis, exam follow-ups, confirm-to-grades | L | 40-student simulated exam passes |
| 6 | Offline exams, sync hardening, shared-device hardening, load tests | M | All §3.3 cases pass in TEST_PLAN |
| 7 | Worksheets (print + interactive), assignments | M | A/B worksheet + key printed on A4 |
| 8 | Dashboards (student/teacher/admin). Parent role and iOS deferred (#24, #25) | M | |
| 9 | Animated explainers, in-app AI drafting, advanced analytics | L | |
| 10 | Extensions (added 2026-11-23): teacher training track, challenge tier, real-world/SDG tags, coding & project evidence in assignments | M | See §10 |

Changes vs §8 of the plan: parity phase inserted; seed moved into Phase 0 with the scaffold; offline/sync is designed in Phase 0 (queue in `packages/core`) and only hardened in 6; worksheets after exams.

---

## 6b. Seed and scale-test plan

Seed (details `TEST_PLAN.md` §Seed): 656 students across PG–10 (≈ 2 sections × ~30), ~30 teachers, 1 admin; 3 subjects × 6 chapters × 4 topics × 4 concepts; ~90 questions/topic with en/ur placeholders, some LaTeX/SVG; 3 months of history. All rows `is_test_data = true`; removal = one script deleting where flagged, in FK order. Runs only against a **separate dev Supabase project or local Postgres**, never production.

### Free-tier budget (verify against the current Supabase pricing page; figures as known in late 2026)
| Limit | Free tier | Our estimate | Verdict |
|---|---|---|---|
| Database | 500 MB | Bank ~30k questions × ~2 KB × ~1.5 versions ≈ 90 MB; attempts ≈ 1 KB/row × (656 × ~0.5/day × 180 days) ≈ 60 MB/yr; existing data small | ⚠️ fits ~2–3 years; needs yearly archive of raw attempts to Storage |
| Storage | 1 GB | Images/SVG + file assignments | ⚠️ cap upload size (2 MB), WebP compression |
| Egress | 5 GB/mo | Bank delta sync + images; video on YouTube | ⚠️ fits only with caching; Learn packs must be cached, not re-fetched |
| Realtime | 200 concurrent | 40 in exam + teachers | ✅ — but subscribe only on screens that need it (messages, live exam) |
| Edge Functions | 500k/mo | Push only | ✅ |
| MAU | 50k | < 1k | ✅ |
| Backups | **none** | — | ❌ add scheduled `pg_dump` (GitHub Action → private storage) before real LMS data |
| Pausing | after 7 days idle | School holidays | ⚠️ a weekly keep-alive ping or accept manual unpause |

Scale tests: 40 concurrent exam sessions (k6/node script calling the RPCs with real JWTs) + 5 classes simultaneously worst case; teacher views p95 < 1 s on seeded history; `EXPLAIN ANALYZE` of RLS helper paths (`teaches_learner` is the hottest — index `profiles(student_id)` exists, `enrollments(class_id, year_id)` exists).

---

## 7. Open questions: all answered 2026-11-23 (see DECISIONS #22–29)

| Q | Question | Answer |
|---|---|---|
| 1 | Attendance, messaging, pre-reader | Rebuilt right after parity (Phase 1b, prompts 14–16). Legacy code **and** data may be hard-deleted when they get in the way (#22). |
| 2 | Play Store buyers' login | Google sign-in = Preparation only; school login = everything (#23, prompt 05). |
| 3 | iOS | Not for now; Android + Windows/ChromeOS first (#24). |
| 4 | Parents | Deferred; redesigned later (#25). |
| 5 | Backups | Encrypted nightly dumps in a private GitHub repo (#29). |
| 6 | Mastery thresholds | 80 % / last 5 distinct / ≥1 hard + ≥1 unseen / relief after 3 rounds; tune later (#26). |
| 7 | Dev Supabase project | Yes, Hassan creates it (#27). |
| 8 | Urdu reviewers | Each subject's teachers (#28). |
| 9 | STEMP21 licence/data | Not applicable: no integration (#19). |

## 8. Verdict on the merged refinements

| Item | Verdict | Reason |
|---|---|---|
| 5.1 Concept level | **Approve** | Core of weakness detection. |
| 5.1 Prerequisites | **Approve, use lightly** | Store edges; v1 only uses them to suggest "revise X first". |
| 5.1 Explicit curriculum versions | **Modify** | One `curricula` row per board edition; academic year stays out of the content tree. |
| 5.1 One engine for all levels | **Approve** | Already a project rule. |
| 5.1 Per-use approval | **Approve** | Cheap with `item_approvals`. |
| 5.1 Full versioning/history | **Approve** | Trigger-based, no app burden. |
| 5.1 Typed content blocks | **Approve** | |
| 5.2 Importer validation | **Approve** | The most important tool in the project. |
| 5.2 Separate translation review | **Approve** | |
| 5.2 In-app AI generation | **Defer** | Phase 9; external generation is enough. |
| 5.3 10-part topic structure | **Approve (optional parts)** | |
| 5.3 Animated explainers for every topic | **Modify** | Only where a picture beats text; never blocks a topic from shipping. |
| 5.3 Alternative explanations | **Approve** | Teacher-authored first. |
| 5.4 Multi-signal mastery | **Modify** | Simple explainable rule + bands; tune later. Full weighting is over-engineered before data exists. |
| 5.4 Four task kinds | **Approve** | One table, `kind` column. |
| 5.4 Spaced revision | **Approve** | |
| 5.5 Server-authoritative exams | **Approve** | Implemented in draft RPCs. |
| 5.5 Configurable blocking scope | **Modify** | Keep default; add relief rule rather than many config knobs. |
| 5.11 Durable sync queue, rules | **Approve** | |
| 5.11 Server `sync_records` table | **Reject** | Idempotent keys make it unnecessary. |
| 5.12 Outcome metrics | **Approve, nightly rollup** | Not live queries. |
| 5.13 Module list | **Approve as folders** | Not services. |
| 5.13 Candidate tables | **Modify** | 9 merged/dropped (§5.2). |
| P10 Measure learning | **Approve** | |
| P11 Never trap | **Approve** | Relief rules. |
| P12 History never rewritten | **Approve** | |
| P13 Server source of truth for exams | **Approve** | |
| P14 Offline/shared-device privacy as foundations | **Approve** | |

**Over-engineering flags for a 656-student school:** `sync_records`, separate `question_options`/`question_tags`, `content_assets` table, weighted multi-factor mastery model before pilot data, in-app AI generation, animated video for every topic, configurable everything. Each is cut or deferred above.

---

## 9. STEMP21 Pakistan (added 2026-11-23)

STEMP21 offered a Grades 1–8 STEM curriculum, a lab and kits, teacher training and a project-assessment app. Public material describes a teacher/admin project-assessment app, not a full student LMS, so their LMS features are unconfirmed. **Decision:** take their content, kits and training; run STEM projects inside our LMS through a generic projects module (`db/022_stem_projects.sql`, Phase 7, dry-run verified). Full comparison, verdict and demo checklist: `STEMP21_COMPARISON.md`.

---

## 10. Extensions (decided 2026-11-23, built last)

Built after the core rebuild (Phases 0–9). Each reuses existing modules; none needs a new engine.

| # | Extension | Reuses | Schema (future migration `023_extensions.sql`) |
|---|---|---|---|
| E1 | **Teacher training track.** 2–3 min bilingual lessons on running the LMS (surprise exam, review queue, weak-topics view), quick checks, and a "ready to run exams" badge; admin sees who has completed it | Learn renderer, practice engine, `concept_mastery` (teachers are learners too: learner_id = profiles.id) | `learning_content.audience` (`student`/`teacher`); a staff-only "LMS training" curriculum subtree |
| E2 | **Challenge tier after mastery.** Optional harder "apply it" questions or mini-tasks unlocked once a concept is mastered; never affects gates; counts as evidence of applying knowledge in unfamiliar contexts (§5.12 measure 4) | Question bank, practice engine, mastery evidence | `questions.tier` (`core`/`challenge`); `practice_attempts.kind` gains `challenge` |
| E3 | **Real-world / SDG tags** on lessons and projects, so teachers find cross-subject links and plan projects | Learn blocks, projects (`db/022` already has `sdg_theme`) | `topics.sdg_themes smallint[]`, `learning_content` block field `sdg` |
| E4 | **Coding and project evidence in assignments.** Accept a Scratch `.sb3` file or screenshot plus a short reflection ("what did you build, what went wrong") | File-upload assignments (`db/014`), project evidence bucket (`db/022`) | allow `.sb3` MIME in upload checks; reflection in `submissions.responses` |
