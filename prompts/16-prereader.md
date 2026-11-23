# 16 — Rebuild: pre-reader tap-image questions (PG / young kids)

**Model:** Fable (UX) + Opus · **Phase:** 1b · **Depends on:** 11 · **Blocked by:** —

Paste everything below the line into a new Claude Code session on the `school-app` repo.

---

You are continuing the Al-Syed school app remake. This session is prompt **16** from `prompts/`.

## Read first
- `CLAUDE.md` (rules + session protocol)
- `MODULE_STATUS.md`
- db/006_prereader_tap_image_content.sql (body shape)
- old src/components/prereader/*, src/prereader/*
- DESIGN_SYSTEM.md (primary presentation)

## Goal
A joyful, accessible tap-the-picture question experience for children who can't read yet.

## Do
- Big targets, audio prompt (recorded audio preferred, speech fallback), immediate gentle feedback using motion tokens, celebration in full tier only.
- Same questions table/body shape (one question table rule).

## Don't
- Anything outside this slice: note it in MODULE_STATUS instead.
- Don't break the old app in `src/` or run SQL on the Supabase project.

## Deliverables
- features/prereader

## Done when
- [ ] Works with touch and mouse on a Chromebook; audio plays offline from bundled/cached files.
- [ ] Type-check, lint and `packages/core` tests pass (once they exist).

## Finish
Follow the session protocol in `CLAUDE.md`: update `MODULE_STATUS.md`, tick **16** in `prompts/README.md` with a one-line note, update other docs you changed the truth of, commit, push, and report what Hassan must do next (e.g. run a migration, install a build).
