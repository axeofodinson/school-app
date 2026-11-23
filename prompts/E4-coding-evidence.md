# E4 — Extension: coding and project evidence in assignments

**Model:** Opus · **Phase:** 10 · **Depends on:** 71 · **Blocked by:** —

Paste everything below the line into a new Claude Code session on the `school-app` repo.

---

You are continuing the Al-Syed school app remake. This session is prompt **E4** from `prompts/`.

## Read first
- `CLAUDE.md` (rules + session protocol)
- `MODULE_STATUS.md`
- LMS_AUDIT §10 E4
- db/022 evidence bucket

## Skills and MCPs to use
Skills: `frontend-design`. Invoke skills by name (e.g. "use the frontend-design skill"); see `GUIDE.md` §3.

## Goal
Students submit Scratch `.sb3` files or screenshots plus a short reflection.

## Do
- Accept .sb3 MIME, reflection prompt (what did you build, what went wrong), teacher view with download.

## Don't
- Anything outside this slice: note it in MODULE_STATUS instead.
- Don't break the old app in `src/` or run SQL on the Supabase project.

## Deliverables
- assignment type support + UI

## Done when
- [ ] A .sb3 upload and reflection round-trip works on Chromebook.
- [ ] Type-check, lint and `packages/core` tests pass (once they exist).

## Finish
Follow the session protocol in `CLAUDE.md`: update `MODULE_STATUS.md`, tick **E4** in `prompts/README.md` with a one-line note, update other docs you changed the truth of, commit, push, and report what Hassan must do next (e.g. run a migration, install a build).
