# 31 — Practice engine (port prep.html ideas)

**Model:** Opus · **Phase:** 3 · **Depends on:** 22 · **Blocked by:** —

Paste everything below the line into a new Claude Code session on the `school-app` repo.

---

You are continuing the Al-Syed school app remake. This session is prompt **31** from `prompts/`.

## Read first
- `CLAUDE.md` (rules + session protocol)
- `MODULE_STATUS.md`
- LMS_AUDIT §3.1
- DATABASE_DESIGN.md (practice_attempts.items shape)
- DESIGN_SYSTEM.md feedback motion

## Goal
One engine powering practice, topic drill, smart review and retry-wrong, with explanations of why an answer is right and why the chosen one is wrong.

## Do
- `packages/core/practice`: item selection (unseen first, difficulty mix, concept coverage), scoring per type, attempt builder (compact items array), retry-wrong set.
- UI: question card, flag, tips, timer (optional), feedback with why-wrong explanation, end-of-set summary by concept.
- Upload attempts through the sync queue into practice_attempts.

## Don't
- No streak/time-spent as success metrics (principle 10).
- Don't break the old app in `src/` or run SQL on the Supabase project.

## Deliverables
- core practice + tests, features/practice

## Done when
- [ ] Selection never repeats an item within a set; unit tests for each mode.
- [ ] Attempt row matches the documented shape.
- [ ] Type-check, lint and `packages/core` tests pass (once they exist).

## Finish
Follow the session protocol in `CLAUDE.md`: update `MODULE_STATUS.md`, tick **31** in `prompts/README.md` with a one-line note, update other docs you changed the truth of, commit, push, and report what Hassan must do next (e.g. run a migration, install a build).
