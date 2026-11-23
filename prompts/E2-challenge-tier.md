# E2 — Extension: challenge tier after mastery

**Model:** Opus · **Phase:** 10 · **Depends on:** 41 · **Blocked by:** —

Paste everything below the line into a new Claude Code session on the `school-app` repo.

---

You are continuing the Al-Syed school app remake. This session is prompt **E2** from `prompts/`.

## Read first
- `CLAUDE.md` (rules + session protocol)
- `MODULE_STATUS.md`
- LMS_AUDIT §10 E2

## Skills and MCPs to use
Skills: `engineering:testing-strategy`. Invoke skills by name (e.g. "use the frontend-design skill"); see `GUIDE.md` §3.

## Goal
Optional harder 'apply it' items unlocked after mastering a concept; never blocks anyone.

## Do
- questions.tier, practice kind 'challenge', unlock rule, challenge entry on mastered concepts, evidence feeds the 'unfamiliar questions' outcome measure.

## Don't
- Challenge results must not reopen gates or create follow-ups.
- Don't break the old app in `src/` or run SQL on the Supabase project.

## Deliverables
- 023 part E2, practice mode

## Done when
- [ ] Unit tests: challenge failure leaves mastery state unchanged.
- [ ] Type-check, lint and `packages/core` tests pass (once they exist).

## Finish
Follow the session protocol in `CLAUDE.md`: update `MODULE_STATUS.md`, tick **E2** in `prompts/README.md` with a one-line note, update other docs you changed the truth of, commit, push, and report what Hassan must do next (e.g. run a migration, install a build).
