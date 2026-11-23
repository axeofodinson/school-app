# 71 — Assignments: typed, file and photo submissions

**Model:** Opus · **Phase:** 7 · **Depends on:** 12 · **Blocked by:** —

Paste everything below the line into a new Claude Code session on the `school-app` repo.

---

You are continuing the Al-Syed school app remake. This session is prompt **71** from `prompts/`.

## Read first
- `CLAUDE.md` (rules + session protocol)
- `MODULE_STATUS.md`
- db/014
- LMS_PLAN §5.7

## Skills and MCPs to use
Skills: `frontend-design`, `run`. Invoke skills by name (e.g. "use the frontend-design skill"); see `GUIDE.md` §3.

## Goal
Per-topic or teacher-made assignments with typed answers, file upload or photo of paper work; teacher marks with comments.

## Do
- Student submit (text / file / camera photo, compressed); teacher marking with comment via record_grade; overdue tracking reuse.

## Don't
- Anything outside this slice: note it in MODULE_STATUS instead.
- Don't break the old app in `src/` or run SQL on the Supabase project.

## Deliverables
- features/assignments

## Done when
- [ ] Upload size capped; photo compressed to budget; marking audited.
- [ ] Type-check, lint and `packages/core` tests pass (once they exist).

## Finish
Follow the session protocol in `CLAUDE.md`: update `MODULE_STATUS.md`, tick **71** in `prompts/README.md` with a one-line note, update other docs you changed the truth of, commit, push, and report what Hassan must do next (e.g. run a migration, install a build).
