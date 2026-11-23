# 81 — Parent role

**Model:** Opus · **Phase:** 8 · **Depends on:** 80 · **Blocked by:** DEFERRED: parent features will be redesigned later (DECISIONS #25)

Paste everything below the line into a new Claude Code session on the `school-app` repo.

---

You are continuing the Al-Syed school app remake. This session is prompt **81** from `prompts/`.

## Read first
- `CLAUDE.md` (rules + session protocol)
- `MODULE_STATUS.md`
- db/setup.sql profiles roles

## Skills and MCPs to use
(deferred) Invoke skills by name (e.g. "use the frontend-design skill"); see `GUIDE.md` §3.

## Goal
Parents see their child's progress, attendance and results.

## Do
- Parent linking table + RLS, parent login flow as decided, read-only parent screens.

## Don't
- Anything outside this slice: note it in MODULE_STATUS instead.
- Don't break the old app in `src/` or run SQL on the Supabase project.

## Deliverables
- migration + features/parent

## Done when
- [ ] Parent can read only linked children (RLS matrix).
- [ ] Type-check, lint and `packages/core` tests pass (once they exist).

## Finish
Follow the session protocol in `CLAUDE.md`: update `MODULE_STATUS.md`, tick **81** in `prompts/README.md` with a one-line note, update other docs you changed the truth of, commit, push, and report what Hassan must do next (e.g. run a migration, install a build).
