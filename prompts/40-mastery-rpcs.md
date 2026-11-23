# 40 — Mastery, diagnostics and follow-up RPCs (migration 019)

**Model:** Opus · **Phase:** 4 · **Depends on:** 31 · **Blocked by:** — (thresholds decided: DECISIONS #26)

Paste everything below the line into a new Claude Code session on the `school-app` repo.

---

You are continuing the Al-Syed school app remake. This session is prompt **40** from `prompts/`.

## Read first
- `CLAUDE.md` (rules + session protocol)
- `MODULE_STATUS.md`
- DATABASE_DESIGN.md §5 (019)
- LMS_AUDIT §1.2 5.4 rows, §3.5

## Goal
Server-side, explainable mastery: record an attempt → update concept_mastery → create/merge follow-ups.

## Do
- `record_practice_attempt(attempt jsonb)` security-definer RPC: idempotent on id, recompute concept_mastery for touched concepts (rule from LMS_AUDIT, thresholds in a config table), create/update one open follow-up per weak concept and kind, exclude retired versions.
- Mirror the rule in packages/core for offline preview, with shared test vectors so client and server agree.
- Diagnostic builder: ~30 items covering every concept of a topic (configurable).

## Don't
- Anything outside this slice: note it in MODULE_STATUS instead.
- Don't break the old app in `src/` or run SQL on the Supabase project.

## Deliverables
- db/019 + smoke tests, core mastery + shared vectors

## Done when
- [ ] Same attempt sent twice changes nothing.
- [ ] Shared vectors pass in both SQL and TS.
- [ ] Type-check, lint and `packages/core` tests pass (once they exist).

## Finish
Follow the session protocol in `CLAUDE.md`: update `MODULE_STATUS.md`, tick **40** in `prompts/README.md` with a one-line note, update other docs you changed the truth of, commit, push, and report what Hassan must do next (e.g. run a migration, install a build).
