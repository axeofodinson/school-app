# 60 — Offline (pre-downloaded) exams

**Model:** Opus · **Phase:** 6 · **Depends on:** 50 · **Blocked by:** —

Paste everything below the line into a new Claude Code session on the `school-app` repo.

---

You are continuing the Al-Syed school app remake. This session is prompt **60** from `prompts/`.

## Read first
- `CLAUDE.md` (rules + session protocol)
- `MODULE_STATUS.md`
- LMS_AUDIT §3.3 offline exam protocol

## Skills and MCPs to use
Skills: `engineering:testing-strategy`, `supabase`. Finish with `/security-review`. Invoke skills by name (e.g. "use the frontend-design skill"); see `GUIDE.md` §3.

## Goal
Exams that can be taken without a connection, with honest lower integrity.

## Do
- Download paper (no answers) while online; monotonic elapsed timer; local answers; upload on reconnect via an acceptance RPC (window + elapsed ≤ duration + grace); result after sync; 'offline' label in teacher view.

## Don't
- Anything outside this slice: note it in MODULE_STATUS instead.
- Don't break the old app in `src/` or run SQL on the Supabase project.

## Deliverables
- db/020 part 2 + client flow

## Done when
- [ ] Scenario O-6 and the offline-exam cases pass; late uploads stored and flagged, not graded.
- [ ] Type-check, lint and `packages/core` tests pass (once they exist).

## Finish
Follow the session protocol in `CLAUDE.md`: update `MODULE_STATUS.md`, tick **60** in `prompts/README.md` with a one-line note, update other docs you changed the truth of, commit, push, and report what Hassan must do next (e.g. run a migration, install a build).
