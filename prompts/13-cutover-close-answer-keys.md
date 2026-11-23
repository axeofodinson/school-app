# 13 — Cut-over: retire old flows and close the answer-key hole

**Model:** Opus · **Phase:** 1 · **Depends on:** 10, 11, 12 · **Blocked by:** Hassan's go-ahead to publish the new build

Paste everything below the line into a new Claude Code session on the `school-app` repo.

---

You are continuing the Al-Syed school app remake. This session is prompt **13** from `prompts/`.

## Read first
- `CLAUDE.md` (rules + session protocol)
- `MODULE_STATUS.md`
- LMS_AUDIT.md §2.2 item 1
- db/017_lms_foundation.sql Part 10
- DATABASE_DESIGN.md §5

## Goal
Ship the new app for parity flows and stop students reading answer keys.

## Do
- Write `db/018_close_answer_key_read.sql`: students lose direct `questions` read; provide a security-definer RPC (or view) returning question bodies WITHOUT answers for published assessments of the student's class; grade attempts server-side (RPC) for auto-gradable types. Update the new app to use it.
- Dry-run with the harness; add a smoke test proving a student cannot select `answer`.
- Release checklist: EAS preview build, test on phone + Chromebook + Windows web, then production build with a version bump. Attendance, messaging and pre-reader are rebuilt next (prompts 14–16); until then they may be unavailable in the new app — that is accepted (DECISIONS #22).

## Don't
- Don't run the SQL on Supabase; hand Hassan the exact steps.
- Don't break the old app in `src/` or run SQL on the Supabase project.

## Deliverables
- db/018 + smoke test, release checklist in TEST_PLAN, app switched to the RPC

## Done when
- [ ] Harness: student `select answer from questions` returns 0 rows; attempts still grade correctly.
- [ ] Hassan has the run order and the build to install.
- [ ] Type-check, lint and `packages/core` tests pass (once they exist).

## Finish
Follow the session protocol in `CLAUDE.md`: update `MODULE_STATUS.md`, tick **13** in `prompts/README.md` with a one-line note, update other docs you changed the truth of, commit, push, and report what Hassan must do next (e.g. run a migration, install a build).
