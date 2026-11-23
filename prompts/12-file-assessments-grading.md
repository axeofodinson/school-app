# 12 — Parity: file assessments and grading with audit

**Model:** Opus · **Phase:** 1 · **Depends on:** 10, 11 · **Blocked by:** —

Paste everything below the line into a new Claude Code session on the `school-app` repo.

---

You are continuing the Al-Syed school app remake. This session is prompt **12** from `prompts/`.

## Read first
- `CLAUDE.md` (rules + session protocol)
- `MODULE_STATUS.md`
- db/013_grade_editing_versioned.sql (record_grade)
- db/014_assessment_files.sql
- old GradingScreen.js, FileAssessmentScreen.js, OverdueAssignmentsScreen.js
- src/reporting/*

## Goal
Teachers grade (and correct grades with a reason), file-upload assessments work, and report-card aggregates match the old app.

## Do
- File assessments: teacher uploads (image/markdown/document), students view; uses the private bucket.
- Grading grid via `record_grade()` only; correction requires reason; history view.
- Report card + overdue assignments: port `src/reporting/{aggregate,grading,overdue}.js` to packages/core with their verify cases as tests.

## Don't
- No direct writes to submissions.score from the client.
- Don't break the old app in `src/` or run SQL on the Supabase project.

## Deliverables
- features/grading, features/files, core reporting modules

## Done when
- [ ] Aggregates identical to the old scripts on the same fixture data (tests).
- [ ] Correction without reason is rejected; history shows both values.
- [ ] Type-check, lint and `packages/core` tests pass (once they exist).

## Finish
Follow the session protocol in `CLAUDE.md`: update `MODULE_STATUS.md`, tick **12** in `prompts/README.md` with a one-line note, update other docs you changed the truth of, commit, push, and report what Hassan must do next (e.g. run a migration, install a build).
