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
         "math_svg": {"stem": "<svg…>"}, "diagram": "storage/path.svg"}
answer: {"correct": "B"}
explanation: {"en": "...", "ur": "...", "why_wrong": {"A": {"en": "...", "ur": "..."}}}
```

**Lesson blocks** (`learning_content_versions.blocks`):
```json
[{"type": "objectives|intro|simple|detailed|visual|worked_example|misconception|quick_check|application|summary|video",
  "concept_id": "uuid|null", "en": "markdown", "ur": "markdown",
  "media": {"svg": "...", "image": "path", "youtube_id": "..."},
  "question_id": "uuid (quick_check only)"}]
```

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

**practice_attempts.items:** `[{"q": uuid, "v": 3, "a": "B", "c": true, "ms": 8200}]`.

## 5. Migration plan
| File | Phase | Contents |
|---|---|---|
| `017_lms_foundation.sql` | 2 (run at start of Phase 2) | everything above (draft, dry-run verified) |
| `018_close_answer_key_read.sql` | 1 cut-over | enable 017 Part 10 (students lose direct `questions` read) |
| `019_mastery_rpcs.sql` | 4 | `record_practice_attempt` → mastery/follow-ups/relief |
| `020_exam_sweep_offline.sql` | 5–6 | pg_cron sweep, option permutation, offline acceptance RPC, item-analysis view |
| `021_rollups.sql` | 8 | nightly analytics rollups |
| `022_stem_projects.sql` | 7 | STEM projects (draft, dry-run verified; see §6) |

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
