# Al-Syed LMS — Planning Brief for Claude Code

> **Claude Code: read this whole file before doing anything.**
> This is a planning and feasibility pass. **Do not write or change any app code yet.**
> Your job: audit this plan against the real codebase and real platform limits, mark what works and what doesn't, and propose better designs and principles. Section 9 has the exact output I want.

---

## 1. Context

- **School:** Al-Syed High School, a small private school in a small town in Punjab, Pakistan. Mostly Punjab-board students. Teachers are not tech-heavy. Students and teachers are mixed Urdu/English.
- **Devices:** Students mostly use **Chromebooks**. Teachers and admin use **Windows** PCs. Some Android phones. The internet can be unreliable.
- **Existing assets:**
  - `school-app`: Expo + React Native + Supabase (this repo). Already has grade editing with audit history, push notifications, enrollment soft-delete, file-upload assessments, and messaging (currently being rebuilt).
  - `prep.html`: a single-file offline MCQ practice app, about 11.5k lines, attached separately. It already has practice mode, topic drill, smart review, retry-wrong, a dashboard (streaks, charts), a custom question bank with import/export, a timer, a flag button, tips, and 8 CSS themes. The question bank is hard-coded and all progress lives in localStorage.
- **Goal:** one LMS inside the school app. A single shared **question and content bank** serves four uses: **Learn**, **Practice**, **Exam** and **Worksheets**.
- **Confirmed direction:**
  - The aim is **deep conceptual understanding**, not just exam prep.
  - Scope is **all classes, primary through matric**, from the start.
  - Content is **hybrid**: AI drafts it, and teachers create, review and approve it.
  - This is a **school-wide learning platform**. Keep the ambitious feature set, but organise the build around dependencies, clear interfaces and incremental verification rather than cutting it down to a tiny MVP.
- **Guiding principle:** the LMS should help students understand **why** an answer is correct, **why their own answer was wrong**, and **how to apply the knowledge independently**. Success is measured by improved understanding and retention, not by the number of features, questions attempted or exams completed.
- A second review of this plan (by another AI) was merged into this version. Where it conflicted with Hassan's confirmed decisions, Hassan's decisions are kept and marked **(confirmed)**.
- **Distribution (context only):** the app is on the Play Store for Rs 150 and free for enrolled students. Note any development impact (e.g. users with no class or teacher), but don't design billing in this pass.

---

## 2. Hard guardrails

- Do **not** edit or run `db/setup.sql`. Its Part 0 reset is destructive. All schema work goes in new additive migrations (`db/00N_*.sql`), written but not run.
- Do not delete existing features or tables. Propose changes; don't apply them.
- Don't assume CDNs are reachable. Prefer bundled dependencies (fonts, KaTeX, etc.).
- If something can't be verified from the code, say **"unverified"** and state what test would verify it.

---

## 3. Platform compatibility (verify first)

The app **already works on Android phones**. This is not a rewrite for desktop. The task is to **add compatibility** for **ChromeOS** and **Windows** without breaking Android.

Check and report:
1. **Android app on Chromebooks:** ChromeOS can run Play Store apps. What breaks or looks wrong in the existing Android build on a Chromebook (keyboard/mouse input, window resizing, landscape layouts, large screens, file pickers)? This may be the cheapest path for ChromeOS.
2. **Web build for Windows (and as a ChromeOS fallback):** can the current Expo app ship a solid web build (react-native-web)? List every dependency that is native-only or broken on web (push notifications, file pickers, secure storage, video, etc.) and its web fallback. Is an installable **PWA** with an offline cache feasible?
3. **Recommendation:** which route(s) cover Android + ChromeOS + Windows with the least duplicated work. Note that managed school Chromebooks may block the Play Store.
4. **Performance budget:** cheap Chromebooks (4 GB RAM, Celeron/MediaTek). Keep animations and effects light; the prep.html themes are dropped.
5. **Offline behaviour:** what can work with no connection (Practice, downloaded Learn content, a pre-downloaded exam) and how results sync later.

---

## 4. Draft core principles (please improve these)

1. **One bank, many uses.** Every question and explanation is written once, tagged once, and reused across Learn, Practice, Exam and Worksheets.
2. **Understand first, practice second, and mastery before moving on.** Each topic is taught in depth, then diagnosed, then weak points are followed up until cleared. A student normally cannot move to the next topic with open follow-ups.
3. **Follow-ups come first, always.** Follow-ups (from diagnostics or exams) are the top-priority queue. Follow-ups created by an **exam** block all other preparation until cleared: opening the Prepare tab shows them first. The rest of the app is unaffected.
4. **Usable by the weakest user.** A teacher with little tech experience can launch a surprise exam in **under 30 seconds and 3 taps**. A student can start practising in 2 taps after login.
5. **Bilingual by default.** Every student-facing text has English and Urdu. Urdu renders properly (Nastaleeq font bundled, RTL-safe layout). The student can toggle language per screen.
6. **Bad internet is normal.** Downloaded content and practice work offline, and nothing is lost if the connection drops mid-exam.
7. **Paper is a first-class output.** Anything in the bank can be printed cleanly on A4.
8. **Teacher-approved content only in exams.** AI-generated questions are drafts until a teacher approves them.
9. **Fast on cheap hardware.** One clean design. The prep.html themes are dropped (confirmed).
10. **Measure learning, not activity.** Streaks, time spent and question counts are not proof of understanding.
11. **Never trap a student.** Gates must handle repeated failure, running out of fresh questions, and wrong or retired questions.
12. **History is never rewritten.** Revising content, questions or the curriculum must not change past attempts or exam results.
13. **The server is the source of truth for exams.** Timing, submission and accepted results are decided by the server, not the client.
14. **Offline and shared-device privacy are foundations, not polish.**

---

## 5. Feature modules

### 5.1 Question and content bank (foundation)
- Hierarchy: **Academic year → Curriculum → Class → Subject → Chapter → Topic → Concept → Items**.
  - **Concept** is essential. Questions, explanations, examples and follow-ups attach to the concept they teach or test. Example: a student weak at *Class 9 → Math → Algebra → Linear equations → Solving equations* is flagged for that concept, not just given a low Algebra score.
  - **Prerequisites:** concepts can depend on other concepts, including across topics and chapters, so the system can spot when an earlier weakness causes later mistakes.
  - **Curriculum versions** are explicit. Textbook or syllabus changes must not break old records. Start with Punjab Textbook Board, but don't hardcode it; other boards may come later.
  - **One engine for all levels.** Primary, middle and secondary differ through configurable presentation and content (primary: visual, short, simple; secondary: deeper, analytical, board-exam focused), not separate engines.
- **Content states:** `draft → reviewed → approved → retired`. Approval is **scoped per use**: approving a lesson explanation doesn't approve its questions for exams, and a question can be approved for practice but not exams.
- **Versioning and history:** author and whether a human or AI created it, reviewer, approver, approval date, version number, textbook reference, language completeness, and revision history. Attempts and exams always point to the **exact version** they used.
- **Structured content:** store lessons as typed content blocks in JSON (explanation, worked_example, diagram, quick_check, …), each linked to a `concept_id`, not one big text field per topic.
- MCQ fields: `id`, `class`, `subject`, `chapter`, `topic`, `difficulty (1–3)`, `stem_en`, `stem_ur`, `options[]` (en/ur, without the "A)" prefix that prep.html bakes in), `correct_index`, `explanation_en`, `explanation_ur`, `source` (book + page), `status (draft | approved | retired)`, `created_by`, `approved_by`, and stats (`times_used`, `percent_correct`).
- Other item types (for Learn, Worksheets): short answer, fill in the blank, true/false, matching, diagram labelling. **Claude Code: say which are realistic for v1.**
- Supports math (KaTeX, bundled) and SVG diagrams. prep.html already uses SVG diagrams.

### 5.2 AI content pipeline (book → ~1000 MCQs)
- Workflow: Hassan gives Claude a book chapter → Claude outputs **JSON in the bank schema** → the app's **Importer** validates it (schema, duplicates, exactly one correct answer, both languages present) → it lands as **draft** → a teacher reviews it in a fast **Review screen** (approve / edit / reject, keyboard shortcuts on Windows).
- v1: generation happens **outside** the app (Hassan + Claude) and the app only imports. Later: maybe in-app generation through an API. **Claude Code: assess the cost, API-key security and whether it's worth it.**
- Also generates per topic: simple explanation (en/ur), key points, 1–2 worked examples, an assignment prompt.
- The Importer also validates references, flags likely duplicates and checks that answers match questions **before** content enters the review queue.
- **AI does:** draft explanations in both languages, question drafts and variations, suggested concept tags, worked examples, worksheet and assignment drafts, diagram suggestions, duplicate detection and completeness checks.
- **Teachers do:** verify accuracy, check alignment with the textbook, fix language and translations, judge whether it suits the class level, check questions for ambiguity, approve, edit or reject, and **create their own lessons and questions** (confirmed: hybrid).
- **Translation quality is reviewed separately.** Content isn't complete just because both language fields contain text.

### 5.3 Preparation, stage 1: Learn (in-depth teaching for every topic)
- **Every topic in the course** is explored in depth, in **both English and Urdu**, written simply but effectively.
- Each topic page contains: the full explanation, **diagrams** (SVG), **images**, **video lectures**, and **animated explainer videos generated with Claude Code** (programmatic animation, e.g. Manim / Remotion / HTML-canvas rendered to MP4), plus worked examples.
- **Claude Code: assess the animated-video pipeline.** Which tool fits best, the render cost per topic, file sizes for weak internet, whether Urdu text and Nastaleeq render inside the animations, and how to store and stream them (or download them for offline use).
- **Standard topic structure.** Teachers use only the parts that suit the subject:
  1. Learning objectives
  2. Introduction
  3. Simple explanation
  4. Detailed explanation
  5. Visuals (diagrams, animations)
  6. Worked examples
  7. Common misconceptions
  8. Quick checks during the lesson
  9. Real-world applications
  10. Summary
- **Alternative explanations:** when a student keeps struggling with a concept, offer a *different* explanation (simpler wording, another worked example, a visual, an analogy, a walkthrough of the common mistake), not just more questions. These are teacher-prepared or teacher-approved at first; AI-adaptive explanations come later.
- Content volume is large (every topic × 2 languages × media). Propose a content format (e.g. structured JSON/Markdown per topic) that Claude can generate in bulk and the app can render consistently.

### 5.4 Preparation, stage 2: Diagnose → Follow-ups → Gate (prep.html engine)
After Learn, the prep.html design takes over:
1. **Diagnostic test:** about **30 questions** for the topic, covering every subtopic/concept.
2. **Weakness detection:** questions are tagged by **subtopic/concept**, so wrong answers map to specific weak points, not just a score.
3. **Follow-ups:** for each weak concept the app creates a **follow-up record for that student**: a short re-explanation (link back to that part of the Learn page) plus a targeted set of new questions on that concept.
4. **Gate:** the student **cannot move to the next topic until all follow-ups are cleared**. The gate applies **only within that subject (confirmed)**: the student can still study other subjects. It is **on by default** but can be relaxed by a teacher per topic/student ("most of the time", not always). Every override records who made it, when and why.
   - **Mastery is not a single percentage.** Weigh accuracy across several questions, concept coverage, difficulty, new vs repeated questions, consistency across attempts, applying the concept in a new context, and retention later. Thresholds are configurable and tuned on real results. Don't show more precision than the evidence supports.
   - **One follow-up per weak concept, not per wrong answer.** Related mistakes are merged into a single follow-up.
   - **Follow-up loop:** identify the concept → create or update the follow-up → link to the Learn section → give an alternative explanation if needed → fresh questions → record attempts → reassess later.
   - **Spaced revision:** mastered concepts come back for delayed checks (e.g. after 7 and 30 days) to measure retention.
   - **Four separate kinds of task**, each with its own rules: diagnostic follow-ups, exam follow-ups (highest priority, see 5.5), spaced-revision reminders and teacher-assigned remedial work.
- The diagnostic size (about 30) is a target, **configurable** by topic size, class level and how many questions are available.
- Questions need **explicit concept tags**. Never fall back to inferring topics like prep.html's `inferTopic()`.
5. **History:** every attempt and follow-up is stored per student, so teachers see exactly where each student struggles and how long they took to clear it.

Engine notes:
- Reuse prep.html's ideas (practice, smart review, retry-wrong, flags, tips, dashboard), rebuilt in the app. It currently has **no subtopic tagging** (`inferTopic()` guesses topics), so tagging must be added to the bank schema.
- Load questions from Supabase (cached offline), not hard-coded; save attempts and follow-ups to the server, not only localStorage; replace the university presets with class/subject/chapter/topic.
- **Decided: port, don't embed (confirmed).** prep.html is inspiration only. Rebuild its useful flows (practice, smart review, retry-wrong, flags, tips, dashboard) as React components. The themes are dropped.
- This needs a **large bank**: about 30 diagnostic questions per topic plus enough extra questions per concept that follow-ups don't repeat. Estimate the number of questions per chapter.

### 5.5 Exam (teacher-only feature, including surprise exams)
- **Only teachers can create, schedule, launch or manage exams.** Students cannot start or browse exams themselves. An exam appears on a student's screen only when a teacher launches it for their class.
- **Students take the exam in the app**, logged in with **their own accounts**, so every result is saved to that student.
- **The result is shown to the student immediately** after submitting (or at auto-submit when time runs out).
- **Exams feed the weakness system:** wrong answers are mapped to concepts and automatically create **follow-ups** for that student (same mechanism as 5.4).
- **Exam follow-ups are top priority and a hard block:** until they are cleared, the student **cannot start preparing anything else** (no other Learn topics, diagnostics or practice). The rest of the app (messages, grades, assignments, etc.) stays usable as normal; the block applies **only inside the Prepare tab**. When the student opens **Prepare**, they land on the pending follow-ups instead of the usual topic list. The app does **not** force-open follow-ups on launch.
- Teacher flow: pick class → pick chapters/topics → number of questions + difficulty mix → time limit → **Start**. A short join code or auto-push to that class.
- Each student gets the questions in a different order with shuffled options, drawn from **approved** items only.
- During the exam, tips, themes and back-navigation are disabled (configurable). It auto-submits at the time limit and auto-saves every answer locally and to the server. The answer review unlocks only after submission.
- Integrity on Chromebooks: fullscreen request, plus flags for tab switching or window blur (`visibilitychange`/`blur`) shown on the teacher's live view. **Claude Code: be honest about what a web app cannot prevent, and whether ChromeOS kiosk mode (managed devices) would be needed for real lockdown.**
- Teacher live view: who joined, progress, flags, and results the instant the exam ends. Item analysis afterwards (which questions most students got wrong).
- Results can optionally push into the existing grades system.
- **Server-authoritative exam state:** the server owns start and end time, session state, submission status and accepted results. The client timer is display only. Design for disconnections, duplicate submissions, retries, delayed sync and many students submitting at once.
- Exam follow-ups block the Prepare tab **by default (confirmed)**. Claude Code can propose making the blocking scope configurable and how to avoid trapping students (see principle 11), but must keep this default.
- Investigate **managed ChromeOS / kiosk mode** if stronger lockdown is needed. Never promise secure lockdown on unmanaged devices.

### 5.6 Worksheets (concept, needs design)
Hassan has no fixed idea yet. Proposed options:
- **(a) Printable worksheets:** pick topics → A4 PDF with sets A/B (shuffled), school header, space for name/roll no., separate answer key.
- **(b) In-app interactive worksheets:** mixed item types (fill blanks, match, label diagram, short answer), done on Chromebook, auto-marked where possible, with teacher marking for short answers.
- **(c) Homework packs:** a worksheet assigned to a class with a due date, tracked as submitted or late.
**v1 (confirmed): (a) printable and (b) in-app interactive**, both from the same bank, using approved questions and including short answers, fill-in-the-blanks and diagrams, not just MCQs. (c) homework packs come later.

### 5.7 Assignments
- Per topic or teacher-made. Submission by typing, file upload (reuse the existing file-upload assessments) or photo of paper work. Teacher marks with a comment.

### 5.8 Dashboards
- **Student:** topics mastered, weak topics, streak, upcoming exams and homework.
- **Teacher:** class weak topics, exam results, item analysis, students falling behind.
- **Admin/principal:** school-wide overview by class and subject.

### 5.9 Accounts and roster
- The roster is managed manually by Hassan for now (no full student records in the app yet).
- **Shared Chromebooks:** keep the existing **admission no + PIN** login and add a **QR card** option. Fast logout, and no data leaking between students.
- Roles: student, teacher, admin.

---

## 5.10 Build phase: synthetic data at real school scale

For now we **build and test features without real content or real student data**. All testing uses **generated (fake) data sized to the real school: 656 students**.

Propose a **seed script** (idempotent, clearly marked as test data, removable in one command, never touching `db/setup.sql`) that creates:
- **656 student accounts** spread across realistic classes/sections, plus teachers and an admin.
- A **placeholder bank**: several subjects × chapters × topics × concepts, with enough fake MCQs per concept for a 30-question diagnostic plus non-repeating follow-ups. Include English + Urdu placeholder text and some items with math/diagrams to test rendering.
- Placeholder Learn pages with dummy media links (small sample images/videos) to test layout, caching and offline download.
- **Simulated history:** months of attempts, diagnostics, follow-ups (open and cleared) and past exams per student, so dashboards, gates and teacher views can be tested under realistic volume.

Scale tests to run or plan:
- **Concurrent exam:** a full class taking a surprise exam at once, and a worst case of many classes at the same time. Answers auto-save and results appear instantly for everyone.
- **Teacher views** (live exam monitor, class weak topics, item analysis) stay fast with 656 students' history.
- **Supabase limits** at this scale: database size, egress, Realtime concurrent connections, Edge Function invocations. Is the current plan enough, and what does it cost if not?
- Query performance: required indexes, row-level security policy cost and pagination.
- Never use real student data for routine development tests.

---

## 5.11 Offline sync and shared devices (foundation)

Offline support needs: downloadable Learn packages, cached questions, local storage of attempts and answers, a **durable sync queue**, unique ids per attempt and answer, retry-safe sync, duplicate detection, conflict handling, and a **visible sync status**. A failed connection must never silently discard work.

Define the rules for:
- the same answer submitted twice
- one student on two devices
- a device reconnecting after a long time offline
- a newer server record conflicting with a local one
- an exam ending while a device is disconnected
- logging out before sync finishes

Practice can be generously offline. **Offline exams** need a separate, explicit protocol and can't match the integrity of a connected, server-run exam.

**Shared Chromebooks:** individual accounts, fast login and logout (roll no + PIN or QR card), and strict separation of each student's cached data. Logout clears or securely isolates the previous student's data without losing their unsynced work.

---

## 5.12 Measuring learning outcomes

Track whether students actually learn:
1. Improvement from the first diagnostic to later assessments
2. Retention after 7 and 30 days
3. Fewer repeated conceptual mistakes
4. Correct answers to **unfamiliar** questions on the same concept
5. Time and attempts needed to show understanding
6. Progress across prerequisite concepts

Use these to improve teaching and find students who need help.

---

## 5.13 Module boundaries and data entities (proposal, check against the repo)

These are **logical modules inside the existing app**, not separate services. Reuse what already exists, and don't build duplicate systems.

| Module | Owns |
|---|---|
| Curriculum | academic years, curricula, classes, subjects, chapters, topics, concepts |
| Content | explanations, examples, diagrams, media, versions |
| Question Bank | questions, options, answers, tags, sources |
| Content Review | import, validation, review, approval |
| Learning | Learn pages and lesson interactions |
| Practice | practice, diagnostics, retry-wrong, smart review |
| Mastery | concept progress, follow-ups, revision |
| Examinations | exam creation, sessions, timing, answers, results |
| Worksheets | printable and interactive worksheets |
| Assignments | homework, submissions, marking |
| Analytics | student, teacher and admin reporting |
| Identity & Roster | roles, enrollment, shared-device sessions |
| Offline Sync | local data, sync, conflicts |

Candidate tables (logical only; inspect the existing schema first):
- **Curriculum:** `academic_years`, `curricula`, `classes`, `subjects`, `chapters`, `topics`, `concepts`, `concept_prerequisites`
- **Content:** `learning_content`, `content_versions`, `content_assets`
- **Questions and assessment:** `questions`, `question_options`, `question_tags`, `question_reviews`, `worksheets`, `exams`, `exam_questions`
- **Student learning:** `student_attempts`, `student_answers`, `concept_mastery`, `follow_ups`, `revision_schedule`
- **Operations:** `exam_sessions`, `exam_session_answers`, `student_enrollments`, `content_downloads`, `sync_records`

Define data contracts between modules before any parallel implementation.

---

## 6. Risks I already see (please confirm or reject)

- AI-generated MCQs will contain some wrong answers. Teacher review is mandatory before exams.
- Urdu Nastaleeq rendering on the web is heavy and can be slow on cheap devices. It needs testing.
- Video bandwidth: Supabase Storage egress costs vs YouTube unlisted (needs internet, may be filtered) vs a local LAN server in school.
- A web app cannot fully lock down a Chromebook during an exam.
- Content volume: in-depth bilingual pages, diagrams and animated videos for **every** topic is a very large job. The generation and review pipeline matters more than the app UI.
- Strict gating can leave a student stuck on one topic; teachers need visibility and an override.
- Follow-up priority rules: decide how diagnostic follow-ups and exam follow-ups interact, what happens when several exams stack up follow-ups, and whether exam follow-ups can ever be overridden.
- Follow-ups need enough unseen questions per concept, or students will memorise answers.
- 30+ students submitting at once over weak school Wi-Fi.
- Free-tier Supabase limits (storage, egress, realtime connections) at school scale.

---

## 7. Hassan's answers (confirmed decisions)

**Devices and network**
1. Chromebooks are **not managed** through Google Admin, so kiosk lockdown isn't available. Exam integrity is **monitoring only** (fullscreen plus blur/visibility flags).
2. Students **can install Play Store apps** on the Chromebooks. **The existing Android app on ChromeOS is a viable primary route.** Claude Code should compare it with the web build.
3. Wi-Fi is available **in the lab only**. Exams and online content happen in the lab; classrooms are effectively offline.
4. Students **do not take Chromebooks home**. At home they use the Android app on their own phones, where they have one.
5. Max concurrent exam: **up to 40 students (one class)**.

**Curriculum and content**
6. Scope: **all classes, primary through matric.** Which classes and subjects get the *first complete* bilingual content sets: **still open**.
7. Board: **Punjab Textbook Board first**, extensible to others later.
8. Medium of instruction: **mixed Urdu/English**, so both languages matter equally.
9. Video lectures come from **the school's own YouTube channel**.
10. Hosting: **YouTube unlisted**. Videos need internet (lab Wi-Fi or home) and can't be downloaded for offline use. Claude Code: check that YouTube embeds work in the app on Android, ChromeOS and Windows.
14. Teachers **create content too** (hybrid), and **class-specific material is allowed** alongside the central bank. It still needs approval before exam use.

**Accounts and policy**
11. Login: **admission number + PIN already exists in the app**; keep it. Add a **QR card** login as a second option for shared Chromebooks.
12. Exam results go into official grades **only after the teacher confirms**.
18. The diagnostic topic gate can be relaxed by **teachers** (logged with who, when and why).
19. **Non-enrolled Play Store users** (who pay Rs 150) can use Preparation **without a class or teacher**. Claude Code: design for students with no class, no teacher overrides and no teacher exams. Who approves or relaxes gates for them?
20. Diagnostic follow-ups block **only within that subject**. Exam follow-ups block all of Prepare.
21. See 7.

**Features**
13. Worksheets v1: **both printable and in-app interactive**, from the same bank.
15. **prep.html is inspiration only.** It is not shipped or kept as a standalone file. Port its good ideas and UX into the app (React components); **don't embed the HTML file**.
16. **Drop the fancy themes.** Use one clean, fast, readable design (light/dark is fine).

---

## 8. Proposed build order (challenge it)

Dependency-based phases. Each phase has defined interfaces, acceptance criteria and tests. Offline, permissions and security are designed from phase 1, even though their hardening comes later.

| # | Work | Priority |
|---|---|---|
| 0 | Seed script: synthetic data for 656 students (used in every phase) | Foundation |
| 1 | Repo audit, ChromeOS + Windows compatibility (without breaking Android), architecture map | Foundation |
| 2 | Curriculum hierarchy, concepts, content and question-bank model | Foundation |
| 3 | Importer, validation, teacher review, versioning | Foundation |
| 4 | Learn interface, bilingual rendering, basic practice | Core |
| 5 | Diagnostics, concept follow-ups, mastery, spaced revision, gates | Core |
| 6 | Teacher exams: sessions, results, item analysis, exam follow-ups | High |
| 7 | Offline sync, shared-device hardening, scale testing | High |
| 8 | Printable worksheets, assignments, dashboards | Expansion |
| 9 | Animated explainers, advanced analytics, more AI features | Expansion |

---

## 9. What I want back from you (Claude Code)

Produce `LMS_AUDIT.md` with:

1. **Feasibility table:** every item in sections 3 and 5 marked ✅ Works as planned / ⚠️ Works with changes / ❌ Won't work, each with a one-line reason and evidence (file path, package, or platform limit).
2. **Codebase findings:** what in the current repo can be reused for the LMS and what blocks web/ChromeOS support.
3. **Better design proposals:** where you'd do it differently and why, especially Practice port vs embed, exam integrity, offline sync, shared-device login and worksheets v1.
4. **Improved core principles:** rewrite section 4.
5. **Proposed data model:** tables plus a draft additive migration (written, **not run**).
6. **Revised build order** with rough effort per phase (S/M/L).
6b. **Seed and scale-test plan** for 656 students (section 5.10), including the Supabase limits/cost findings.
7. **Open questions:** anything still blocking that only I can answer.
8. **Verdict on the merged refinements:** for each new item (sections 5.1–5.5, 5.11–5.13, and principles 10–14), say **approve / modify / reject** with a reason. Flag anything over-engineered for a 656-student school.

Then, if the plan is approved, create and maintain these working docs:
- `ARCHITECTURE.md`: system design and module boundaries
- `DATABASE_DESIGN.md`: relationships, constraints, indexes, migration plan
- `MODULE_STATUS.md`: progress, dependencies, outstanding work
- `TEST_PLAN.md`: functional, security, offline and performance tests
- `DECISIONS.md`: major decisions and the reasons for them

Rules for every later phase: inspect before changing, reuse existing features, use additive migrations only, never run `db/setup.sql`, don't remove features or tables, keep testing Android while adding web/ChromeOS, bundle dependencies, mark unverified behaviour, and use synthetic data only.

Keep it concrete. No code changes in this pass.
