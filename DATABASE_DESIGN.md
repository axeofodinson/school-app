# DATABASE_DESIGN.md

Builds on `db/setup.sql` + `db/002–016`. LMS additions are in the **draft**
`db/017_lms_foundation.sql` (not run on Supabase). Rules: additive only, never
re-run or edit `setup.sql`, never edit an applied migration.

## 1. Entity map

```
curricula ─┐
classes → subjects → chapters → topics → concepts ⇄ concept_prerequisites
                                   │          │
                         learning_content   questions → question_versions (append-only)
                         (+_versions)           │            ▲
                                          item_approvals    │ (question_id, version)
                                          item_reviews      │
                                          import_batches    │
profiles (learner_id) ─┬─ practice_attempts (items jsonb → versions)
                       ├─ concept_mastery (learner, concept)
                       ├─ follow_ups ── gate_overrides (append-only)
                       └─ exam_sessions → exam_session_answers → question_versions
students → enrollments ┘        │
assessments (mode) → assessment_questions (question_version)
           └→ submissions (+ submission_grade_edits, record_grade)  ← only after teacher confirms
```

## 2. Key constraints
| Table | Constraint | Why |
|---|---|---|
| question_versions | PK (question_id, version); update/delete trigger raises | History never rewritten |
| questions | `difficulty 1–3`, `status in (draft,reviewed,approved,retired)`, `origin in (human,ai,ai_edited)` | |
| item_approvals | unique live (item_kind, item_id, scope) where not revoked | One live approval per use |
| follow_ups | unique (learner_id, concept_id, kind) where status='open' | One follow-up per weak concept; stacked exams merge |
| exam_sessions | unique (assessment_id, learner_id) | Two devices resume one session |
| exam_session_answers | PK (session_id, question_id); FK → question_versions | Idempotent saves, exact version |
| gate_overrides | append-only trigger | Audit |
| topics / concepts | non-blank title ≤ 200, Urdu ≤ 200, summaries ≤ 1000; `diagnostic_size` null or 5–60; no DELETE policy (retire) | Editors (prompt 20), DECISIONS #97 |
| concept_prerequisites | PK (concept, requires), no self link, trigger `t_cprereq_no_cycle` (no loops) | Follow-ups walk it (DECISIONS #98) |
| curricula | code ≤ 40 unique, board, name non-blank | Textbook editions (DECISIONS #101) |
| practice_attempts | PK = client UUID | Retry-safe offline upload |
| assessments | `mode in (standard, live_exam, offline_exam)`; unique live join_code | |

## 3. Indexes (in 017)
`topics(chapter_id, sort_order)`, `concepts(topic_id, sort_order)`,
`questions(concept_id, status)`, `practice_attempts(learner_id, started_at desc)`,
`concept_mastery(concept_id, state)`, partial `concept_mastery(learner_id, next_review_at)`,
partial `follow_ups(learner_id, kind) where open`, `exam_sessions(assessment_id, status)`,
`exam_events(session_id)`, `item_reviews(item_kind, item_id)`.
Re-check with `EXPLAIN ANALYZE` on seeded data (TEST_PLAN §S-3).

## 4. JSON shapes

**Question body/answer** (existing convention, `QuestionAuthoringScreen.js`):
```json
body:   {"stem": {"en": "...", "ur": "..."},
         "options": [{"key": "A", "text": {"en": "...", "ur": "..."}}],
         "math_svg": {"stem": "<svg…>"}, "diagram": "storage/path.svg",
         "audio": {"en": "storage/path.opus", "ur": "storage/path.opus",
                   "source": "elevenlabs|recorded|none", "voice": "voice id"}}
answer: {"correct": "B"}
// true_false: {"correct": true}   numeric: {"correct": 42}
// short_text: {"correct": "Lahore", "also": ["Lahore City"]}  (DECISIONS #64)
explanation: {"en": "...", "ur": "...", "why_wrong": {"A": {"en": "...", "ur": "..."}}}
```

**Lesson blocks** (`learning_content_versions.blocks`):
```json
[{"type": "objectives|intro|simple|detailed|worked_example|misconception|quick_check|application|summary",
  "concept_id": "uuid|null", "en": "markdown", "ur": "markdown",
  "question_id": "uuid (quick_check only)"}]
```

**Visual blocks** (same array; visual-first lessons, DESIGN_SYSTEM.md §7b). Every
visual block requires `alt` {en, ur}; captions are {en, ur}; SVG is inline,
sanitised and within `visualBudget` (≤ 60 KB, ≤ 400 elements). No schema change:
`blocks` is jsonb. (Older drafts that used `visual` + `media` are read as `figure`.)
```json
{"type": "figure", "concept_id": "…", "alt": {"en": "", "ur": ""},
 "svg": "<svg…>" , "image": "storage path (WebP ≤ 100 KB, optional instead of svg)",
 "hotspots": [{"x": 0.42, "y": 0.30, "label": {"en": "", "ur": ""}}]}

{"type": "scene", "concept_id": "…", "alt": {…}, "svg": "<svg> with <g id=\"car\">… layers",
 "layers": ["car", "arrow", "graph_line"],
 "steps": [{"caption": {"en": "", "ur": ""}, "ms": 900,
            "set": {"car": {"x": 120, "y": 0, "scale": 1, "rotate": 0, "opacity": 1},
                    "arrow": {"opacity": 0}}}],
 "pivots": {"car": [40, 108]},
 "predict_question_id": "uuid|null"}
// pivots (optional): turning point per layer in SVG units for scale/rotate; default = the layer's box centre.

{"type": "chart", "concept_id": "…", "alt": {…}, "kind": "bar|line|pie|scatter|table",
 "x": {"label": {"en": "", "ur": ""}, "unit": "s", "values": [0, 1, 2, 3]},
 "y": {"label": {"en": "", "ur": ""}, "unit": "m"},
 "series": [{"name": {"en": "", "ur": ""}, "values": [0, 5, 10, 15], "role": "focus|highlight|result"}],
 "reveal": "none|series|points"}

{"type": "widget", "concept_id": "…", "alt": {…},
 "widget": "number_line|fraction_bars|function_graph|geometry_shape|angle|balance|probability|motion_graph|circuit",
 "params": {"expr": "m*x + c", "sliders": {"m": [-5, 5, 1, 1], "c": [-10, 10, 1, 2]}, "x": [-10, 10]},
 "task": {"en": "", "ur": ""}, "predict_question_id": "uuid|null"}
// params per built widget (prompt 33; sliders are [min, max, step, start]):
//   function_graph {"expr", "sliders", "x": [x0, x1], "y": [y0, y1]}
//   fraction_bars  {"bars": [{"den": 2, "shaded": 1}, …] (≤ 4), "max_den": 12}
//   number_line    {"min", "max", "step", "start", "jump", "target"} (≤ 200 steps)
//   motion_graph   {"u", "a", "t": seconds, "sliders": {"u": […], "a": […]}, "graph": "distance|speed"}
// Other catalogue widgets show their text version until built.

{"type": "compare", "concept_id": "…", "alt": {…},
 "left":  {"title": {"en": "", "ur": ""}, "svg": "…", "text": {"en": "", "ur": ""}, "tone": "wrong_idea"},
 "right": {"title": {…}, "svg": "…", "text": {…}, "tone": "result"}}

{"type": "video", "concept_id": "…", "alt": {…}, "youtube_id": "…", "poster": "storage path",
 "transcript": {"en": "", "ur": ""}, "offline_fallback_block": 3}
```
Exam items may contain only static `figure`/`chart` (no scene, widget, video).
`body.audio` (read-aloud, mainly PG–5): files are generated once (ElevenLabs) or
recorded, stored in Storage, part of the item version (new audio = new version),
and included in offline packs. Shape: `{"en": path, "ur": path}`, paths in the
private `question-audio` bucket (`db/030`), content-addressed
`{question_id}/{fingerprint}.{locale}.mp3` (fingerprint = text + voice + model,
`packages/core/src/prereaderAudio.ts`). Made by `scripts/audio/generate-prereader-audio.mjs`
(prompt 16, DECISIONS #90–91). Legacy `body.prompt_audio` (db/006) is still read.

**Import file (one per topic):**
```json
{"curriculum": "PTB-2024", "class": "Class 9", "subject": "Math",
 "chapter": "...", "topic": {"title_en": "...", "title_ur": "..."},
 "concepts": [{"key": "c1", "title_en": "...", "title_ur": "...", "requires": ["c0"]}],
 "lesson": {"blocks": [...]},
 "questions": [{"concept": "c1", "type": "mcq", "difficulty": 2,
                "cognitive_level": "apply", "body": {...}, "answer": {...},
                "explanation": {...}, "source": {"book": "...", "page": 12}}]}
```
Importer checks: schema, exactly one correct key present in options, en+ur
non-empty (flags, not passes, translation), concept keys resolve, duplicate
stems (normalised hash + trigram similarity), cognitive_level present (CLAUDE.md rule 6).
Visual blocks: `alt` + per-step captions present (error), SVG sanitised (no script,
event attributes, foreignObject, external href), within `visualBudget`, scene
layer ids exist in the SVG, widget name in the catalogue, `expr` parses with the
safe maths parser.

**Pre-rendered maths (`math_svgs`, db/031):** `$…$` in an imported stem, option,
explanation or lesson block is rendered to SVG once, in the importer, and stored
once for the whole bank: key = the TeX (display maths prefixed `D:`), value =
the MathJax SVG with its `data-*`/ARIA bookkeeping stripped. Question bodies keep
the TeX as written; renderers look the SVG up by key (`packages/core/src/importer/math.ts`).
Rows are insert-only and readable by any signed-in user.

**Import batch (`import_batches`, db/031):** `status` (importing → done, or
retired), `file_name`, `chapter_id`, `topic_id`, `question_count`,
`is_test_data`, `report` (the dry-run counts + up to 200 issues) and, once
retired, `retired_by/at` + `retire_note`. Questions and `learning_content` carry
`import_batch_id`, so `retire_import_batch()` pulls a bad batch as a unit
without deleting anything.

**Review (db/032):** a decision is one `item_reviews` row (decision, version,
`translation_ok` = the separate "Urdu reads naturally" check, notes). Approve
sets the live `item_approvals` scopes to exactly the chosen ones; request
changes keeps the question `draft` (it shows in the "Changes asked" tab while its
latest review on the current version says so); reject sets it `retired`. A
question's queue state is derived, never stored twice.

**practice_attempts.items:** `[{"q": uuid, "v": 3, "a": "B", "c": true, "ms": 8200}]`.

## 5. Migration plan
| File | Phase | Contents |
|---|---|---|
| `017_lms_foundation.sql` | 2 (final in prompt 20, not run yet; then 023) | everything above. Prompt 20 added: Part 0 preflight (stops on a hand-made table of the same name), curriculum check constraints, prerequisite loop trigger, `teaches_chapter_subject()` (teacher curriculum scope = subject taught this year), insert/update-only policies (no deletes) on topics/concepts/learning content, insert-only review log, no-delete approvals/batches (DECISIONS #96–99) |
| `018_close_answer_key_read.sql` | 1 cut-over (prompt 13; draft, runs after 026) | `p_questions_read` = staff + teachers only (017 Part 10); `student_paper(assessment)` + `student_paper_levels(assessments[])` security-definer reads without answers; `auto_mark_item()` (pure rule, same as core `autoMark.ts`) + AFTER INSERT trigger `t_submissions_auto_mark`: a fully auto-markable paper is scored on insert, with an `Auto-marked` row in `submission_grade_edits` (edited_by null) (DECISIONS #78–81) |
| `019_mastery_rpcs.sql` | 4 | `record_practice_attempt` → mastery/follow-ups/relief |
| `020_exam_sweep_offline.sql` | 5–6 | pg_cron sweep, option permutation, offline acceptance RPC, item-analysis view |
| `021_rollups.sql` | 8 | nightly analytics rollups |
| `022_stem_projects.sql` | 7 | STEM projects (draft, dry-run verified; see §6) |
| `025_student_attempts_own_class.sql` | 1 (with prompt 11; draft) | student submission insert must match the enrollment's class + year, active enrollment, published test; students may read closed assessments of their class (DECISIONS #70) |
| `026_grade_write_guard.sql` | 1 (with prompt 12; draft) | trigger `submissions_grade_guard`: client roles can't write scores/graded_*/responses/submitted_at or delete submissions; grades only via `record_grade()` (DECISIONS #73) |
| `024_profiles_self_update_guard.sql` | applied to production 2026-11-24 | trigger: non-staff clients edit only their own `full_name`/`phone` (closes the self-promote hole, DECISIONS #62) |
| `031_content_importer.sql` | 2 (prompt 21; draft, runs after 017 + 023) | import batch status/file/chapter/topic/counts + `learning_content.import_batch_id`; `math_svgs` (one pre-rendered SVG per TeX, insert-only, unsafe markup refused by CHECK); pg_trgm + `question_match_text(body)` + GIN index; `import_find_matches(subject, texts[])`, `import_content(chunk)` (invoker, chunked, client ids = retry-safe), `retire_import_batch(batch, reason)` (DECISIONS #102–106) |
| `032_review_queue.sql` | 2 (prompt 22; draft, runs after 031) | approvals/reviews written only by `review_question()` / `review_approve_many()` / `review_edit_question()` (security definer; teacher scope = `teaches_concept`, staff any; stale version refused; reason required to send back or reject); `item_approvals` guard trigger (revoke once, never change or delete) + `item_reviews` immutable; `t_questions_review_reset` (new version of an approved question → draft, `ai` → `ai_edited`) + `t_questions_review_revoke` (new version or retire → approvals revoked); `is_approved()` version-aware; `review_queue()` / `review_counts()` (invoker) (DECISIONS #107–111) |
| `033_lesson_review.sql` | 3 (prompt 30; draft, runs after 017 + 023 + 031 + 032) | students read a lesson version only when it carries a live `learn` approval (`item_approvals`, prompt 22) and the lesson is `approved` (replaces `p_lcv_read`); `review_lesson(content, version, decision, translation_ok?, notes?)` (security definer, staff only, stale-version and reason checks) (DECISIONS #112–116) |
| `023_access_tiers.sql` | 0/2 (after 017; before Google sign-in is switched on) | `profiles.access_tier` (`school`/`prep_only`), `merged_into`/`merged_at`; `handle_new_user_v2` + `auth.identities` guard; `profiles_guard` (self-edit = name/phone only); `is_school_member()` + restrictive policies; `account_links` (insert-only); `find_prep_accounts()`, `link_prep_account()` (draft, dry-run verified; DECISIONS #57–61). Re-run after applying 022 so project tables get their policy |

Every migration: idempotent, dry-run with `db/test/` harness before Supabase.

## 6. STEM projects (`db/022_stem_projects.sql`, draft)

```
projects ─┬─ project_concepts → concepts
          └─ project_rubric_criteria (max_points, levels, concept_id?)
assessments(type='project', project_id) ─┬─ project_teams → project_team_members(enrollment)
                                         ├─ project_scores(enrollment, criterion, points, remark)
                                         └─ submissions (total via record_grade → submission_grade_edits)
storage bucket project-evidence: {assessment_id}/{enrollment_id}/{file}
```
Constraints: `source <> 'school'` requires `licence_note` (third-party content only with permission); `type='project'` ⇔ `project_id` set; one team per student per assignment; scores ≤ criterion `max_points`; criteria retired, never deleted. Scores are written only through `score_project()` (teacher of the class or staff), which can apply one score to a whole team and then records each total through `record_grade()`.

## 7. Attendance (`db/028_attendance_audit.sql`, draft)

One row per enrollment per day (`attendance`, unique `(enrollment_id, on_date)`; status present / absent / late / leave), as in setup.sql, plus `marked_at`, `edit_count`, `last_edited_at`. `attendance_edits(attendance_id, prev_status, new_status, reason, edited_by, edited_at)` is append-only history written only by the audit trigger. The new app writes through `record_attendance(class, day, marks, reason, taken_at)`; the old app's plain upsert still works and is audited. Read functions `attendance_day_summary(year, day)` and `attendance_student_summary(class, year, from, to)` are SECURITY INVOKER (RLS scopes them). Attendance attaches to the enrollment (rule 2); nothing is deleted from the app (DECISIONS #83).

**Messages (db/010, 012, 029).** `messages(id, sender_id, scope school|class|student, target_id, title, body, created_at, push_claimed_at, push_result)`: insert-only from the app (no UPDATE/DELETE for client roles); a teacher may send only to a class they teach or a student in one; a student reads school-wide, their current active class and personal messages (also on Realtime). `message_reads(message_id, student_id, read_at)`, PK both ids, written once through `mark_messages_read(ids[])`; `message_read_counts(ids[])` for the sender. `push_tokens(student_id, token unique, device_info, disabled_at)`: written through `register_push_token()` / `disable_push_token()` (a token moves to whoever signs in on that device); dead tokens are soft-disabled by the Edge Function, never deleted (DECISIONS #86–#88).
