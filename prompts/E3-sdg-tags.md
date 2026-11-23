# E3 — Extension: real-world / SDG tags

**Model:** Opus · **Phase:** 10 · **Depends on:** 30 · **Blocked by:** —

Paste everything below the line into a new Claude Code session on the `school-app` repo.

---

You are continuing the Al-Syed school app remake. This session is prompt **E3** from `prompts/`.

## Read first
- `CLAUDE.md` (rules + session protocol)
- `MODULE_STATUS.md`
- LMS_AUDIT §10 E3

## Goal
Tag lessons and projects with real-world/SDG themes and let teachers browse by theme.

## Do
- topics.sdg_themes, block-level sdg field in lesson blocks + importer, theme filter in teacher browsing.

## Don't
- Anything outside this slice: note it in MODULE_STATUS instead.
- Don't break the old app in `src/` or run SQL on the Supabase project.

## Deliverables
- 023 part E3

## Done when
- [ ] Filter by theme returns tagged topics and projects.
- [ ] Type-check, lint and `packages/core` tests pass (once they exist).

## Finish
Follow the session protocol in `CLAUDE.md`: update `MODULE_STATUS.md`, tick **E3** in `prompts/README.md` with a one-line note, update other docs you changed the truth of, commit, push, and report what Hassan must do next (e.g. run a migration, install a build).
