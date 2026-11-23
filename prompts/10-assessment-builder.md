# 10 — Parity: teacher/admin assessment builder

**Model:** Opus · **Phase:** 1 · **Depends on:** 03 · **Blocked by:** —

Paste everything below the line into a new Claude Code session on the `school-app` repo.

---

You are continuing the Al-Syed school app remake. This session is prompt **10** from `prompts/`.

## Read first
- `CLAUDE.md` (rules + session protocol)
- `MODULE_STATUS.md`
- old src/screens/console/AssessmentBuilderScreen.js and src/screens/teacher/QuestionAuthoringScreen.js (behaviour to keep)
- db/setup.sql assessments, assessment_questions, questions
- db/003 (teacher chapter scope)

## Skills and MCPs to use
Skills: `frontend-design`, `design:ux-copy`, `run`. Finish with `/code-review`. Invoke skills by name (e.g. "use the frontend-design skill"); see `GUIDE.md` §3.

## Goal
Teachers and admins can author questions and build/publish assessments in the new app (web on Windows first).

## Do
- Question authoring for existing types (mcq, true_false, numeric, short_text, tap_image read-only) with the existing body/answer JSON shapes; cognitive_level required.
- Assessment builder: class/subject/year, type, weightage, total marks, pick questions, publish/close; respects prerequisites (empty states that point to the missing setup).
- Keyboard-friendly on desktop (tab order, Enter to save).
- Split into small components and typed api functions (features/assessments/api.ts).

## Don't
- Don't port the 1,394-line screen; rebuild it in small parts.
- Don't change the schema.
- Don't break the old app in `src/` or run SQL on the Supabase project.

## Deliverables
- features/questions, features/assessments

## Done when
- [ ] A teacher can create a question and a published assessment for a class they teach, and cannot for a class they don't (RLS).
- [ ] Works on web (Windows) and Android.
- [ ] Type-check, lint and `packages/core` tests pass (once they exist).

## Finish
Follow the session protocol in `CLAUDE.md`: update `MODULE_STATUS.md`, tick **10** in `prompts/README.md` with a one-line note, update other docs you changed the truth of, commit, push, and report what Hassan must do next (e.g. run a migration, install a build).
