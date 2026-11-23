# 16 — Rebuild: pre-reader tap-image questions (PG / young kids)

**Model:** Opus · **Phase:** 1b · **Depends on:** 11 · **Blocked by:** —

Paste everything below the line into a new Claude Code session on the `school-app` repo.

---

You are continuing the Al-Syed school app remake. This session is prompt **16** from `prompts/`.

## Read first
- `CLAUDE.md` (rules + session protocol)
- `MODULE_STATUS.md`
- db/006_prereader_tap_image_content.sql (body shape)
- old src/components/prereader/*, src/prereader/*
- DESIGN_SYSTEM.md (primary presentation)

## Skills and MCPs to use
Skills: `frontend-design`, `expo:expo-animation`, `design:accessibility-review`, `run`. Invoke skills by name (e.g. "use the frontend-design skill"); see `GUIDE.md` §3.

## Goal
A joyful, accessible tap-the-picture question experience for children who can't read yet.

## Do
- Big targets, audio prompt, immediate gentle feedback using motion tokens, celebration in full tier only.
- Read-aloud order (DESIGN_SYSTEM.md §3.1): `body.audio` clip → device speech (English; Urdu only where the voice test passes) → hidden.
- ElevenLabs audio for junior maths questions: a server-side generation step (Edge Function or a script run with the key as an environment secret; never in the app or in chat) that makes en + ur clips once per item version, stores them in a Storage bucket (new additive migration for the bucket + RLS, dry-run per DB-1), and writes `body.audio`. Start with ten PG–5 maths questions; report Urdu pronunciation quality, clip size and cost per clip. Teachers hear the clip in the review queue before approval.
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
