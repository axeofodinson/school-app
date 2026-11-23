# 42 — Spaced revision (7 / 30 days)

**Model:** Opus · **Phase:** 4 · **Depends on:** 41 · **Blocked by:** —

Paste everything below the line into a new Claude Code session on the `school-app` repo.

---

You are continuing the Al-Syed school app remake. This session is prompt **42** from `prompts/`.

## Read first
- `CLAUDE.md` (rules + session protocol)
- `MODULE_STATUS.md`
- DATABASE_DESIGN.md concept_mastery.next_review_at

## Skills and MCPs to use
Skills: `engineering:testing-strategy`. Invoke skills by name (e.g. "use the frontend-design skill"); see `GUIDE.md` §3.

## Goal
Mastered concepts come back for retention checks and feed the learning-outcome measures.

## Do
- Schedule on mastery (7d, then 30d); due list in Prepare; failing a revision reopens a revision follow-up (lower priority).
- Nightly rollup of retention metrics (LMS_AUDIT §5.12).

## Don't
- Anything outside this slice: note it in MODULE_STATUS instead.
- Don't break the old app in `src/` or run SQL on the Supabase project.

## Deliverables
- revision scheduling in RPC + core, Prepare due list

## Done when
- [ ] Time-travel tests (fake clock) show correct due dates and transitions.
- [ ] Type-check, lint and `packages/core` tests pass (once they exist).

## Finish
Follow the session protocol in `CLAUDE.md`: update `MODULE_STATUS.md`, tick **42** in `prompts/README.md` with a one-line note, update other docs you changed the truth of, commit, push, and report what Hassan must do next (e.g. run a migration, install a build).
