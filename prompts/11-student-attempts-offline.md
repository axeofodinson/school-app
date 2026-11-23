# 11 — Parity: student takes assessments, offline-safe

**Model:** Opus · **Phase:** 1 · **Depends on:** 03, 10 · **Blocked by:** —

Paste everything below the line into a new Claude Code session on the `school-app` repo.

---

You are continuing the Al-Syed school app remake. This session is prompt **11** from `prompts/`.

## Read first
- `CLAUDE.md` (rules + session protocol)
- `MODULE_STATUS.md`
- old src/lib/attemptStore.js (port its logic)
- old src/screens/student/AssessmentAttemptScreen.js, PreReaderAttempt.js
- db/005 (student attempts RLS)
- LMS_AUDIT §3.3

## Skills and MCPs to use
Skills: `engineering:testing-strategy`, `run`. Finish with `/code-review`. Invoke skills by name (e.g. "use the frontend-design skill"); see `GUIDE.md` §3.

## Goal
Students see their published assessments and submit attempts that survive dropped connections.

## Do
- Port attemptStore into `packages/core/sync` as the generic durable queue: per-user namespace, client UUIDs, retry with backoff, pure helpers unit-tested (reuse the old verify cases).
- Student assessment list + attempt screen (all existing types; tap_image keeps speech where available), draft autosave, submit, pending-sync indicator.
- Results list reading submissions.

## Don't
- Don't add LMS features yet.
- Don't break the old app in `src/` or run SQL on the Supabase project.

## Deliverables
- packages/core/sync + tests, features/attempts

## Done when
- [ ] Airplane-mode test: answer, kill app, reopen, reconnect → exactly one submission.
- [ ] Student cannot submit for another class (RLS).
- [ ] Type-check, lint and `packages/core` tests pass (once they exist).

## Finish
Follow the session protocol in `CLAUDE.md`: update `MODULE_STATUS.md`, tick **11** in `prompts/README.md` with a one-line note, update other docs you changed the truth of, commit, push, and report what Hassan must do next (e.g. run a migration, install a build).
