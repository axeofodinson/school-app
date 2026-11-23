# 51 — Live exam view, item analysis, exam follow-ups, confirm to grades

**Model:** Opus · **Phase:** 5 · **Depends on:** 50 · **Blocked by:** —

Paste everything below the line into a new Claude Code session on the `school-app` repo.

---

You are continuing the Al-Syed school app remake. This session is prompt **51** from `prompts/`.

## Read first
- `CLAUDE.md` (rules + session protocol)
- `MODULE_STATUS.md`
- ARCHITECTURE.md §4
- db/013 record_grade

## Goal
Teachers watch the exam live, see item analysis, and push confirmed results into grades.

## Do
- Live view (Realtime on exam_sessions/exam_events): joined, progress, flags, submitted.
- Results + item analysis (per question % correct, distractor choice counts).
- Exam follow-ups generated per weak concept (kind=exam).
- Confirm results → record_grade per student with reason 'Exam result'; void a session with reason.

## Don't
- Anything outside this slice: note it in MODULE_STATUS instead.
- Don't break the old app in `src/` or run SQL on the Supabase project.

## Deliverables
- features/exam-live, item-analysis view

## Done when
- [ ] Realtime connections stay well under the free limit during L-1.
- [ ] Confirm writes audited grades; unconfirmed results never appear in grades.
- [ ] Type-check, lint and `packages/core` tests pass (once they exist).

## Finish
Follow the session protocol in `CLAUDE.md`: update `MODULE_STATUS.md`, tick **51** in `prompts/README.md` with a one-line note, update other docs you changed the truth of, commit, push, and report what Hassan must do next (e.g. run a migration, install a build).
