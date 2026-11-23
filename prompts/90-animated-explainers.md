# 90 — Animated explainer pipeline (Remotion / Manim)

**Model:** Fable (pedagogy) + Opus (pipeline) · **Phase:** 9 · **Depends on:** 30 · **Blocked by:** —

Paste everything below the line into a new Claude Code session on the `school-app` repo.

---

You are continuing the Al-Syed school app remake. This session is prompt **90** from `prompts/`.

## Read first
- `CLAUDE.md` (rules + session protocol)
- `MODULE_STATUS.md`
- LMS_AUDIT §1.2 5.3 animated explainers row

## Goal
Make short animated explainers for concepts where a picture beats text, with correct Urdu text.

## Do
- Prototype one 60–90 s explainer for a pilot concept in Remotion (Nastaliq text) and, if useful, Manim for a math animation; measure render time and size at 720p; publish to YouTube unlisted; link from a lesson video block.
- Template so more explainers can be made from a script file.

## Don't
- Anything outside this slice: note it in MODULE_STATUS instead.
- Don't break the old app in `src/` or run SQL on the Supabase project.

## Deliverables
- tools/explainers/ + one finished video + how-to

## Done when
- [ ] Urdu renders correctly in the video; file ≤ 4 MB/min at 720p.
- [ ] Type-check, lint and `packages/core` tests pass (once they exist).

## Finish
Follow the session protocol in `CLAUDE.md`: update `MODULE_STATUS.md`, tick **90** in `prompts/README.md` with a one-line note, update other docs you changed the truth of, commit, push, and report what Hassan must do next (e.g. run a migration, install a build).
