# 61 — Sync hardening and shared-device hardening

**Model:** Opus · **Phase:** 6 · **Depends on:** 11, 32, 60 · **Blocked by:** —

Paste everything below the line into a new Claude Code session on the `school-app` repo.

---

You are continuing the Al-Syed school app remake. This session is prompt **61** from `prompts/`.

## Read first
- `CLAUDE.md` (rules + session protocol)
- `MODULE_STATUS.md`
- LMS_AUDIT §3.3–3.4
- TEST_PLAN O-1…O-6, S-1

## Goal
Every offline case in the plan works and no data leaks between students on a shared Chromebook.

## Do
- Implement and test all six sync rules; visible sync status everywhere; logout-with-unsent-queue flow; per-user encrypted-at-rest namespace (where platform allows).

## Don't
- Anything outside this slice: note it in MODULE_STATUS instead.
- Don't break the old app in `src/` or run SQL on the Supabase project.

## Deliverables
- tests O-1…O-6 automated where possible, manual scripts otherwise

## Done when
- [ ] All O and S tests recorded as pass in TEST_PLAN.
- [ ] Type-check, lint and `packages/core` tests pass (once they exist).

## Finish
Follow the session protocol in `CLAUDE.md`: update `MODULE_STATUS.md`, tick **61** in `prompts/README.md` with a one-line note, update other docs you changed the truth of, commit, push, and report what Hassan must do next (e.g. run a migration, install a build).
