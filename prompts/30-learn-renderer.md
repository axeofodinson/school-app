# 30 — Learn: lesson reader

**Model:** Opus · **Phase:** 3 · **Depends on:** 22 · **Blocked by:** —

Paste everything below the line into a new Claude Code session on the `school-app` repo.

---

You are continuing the Al-Syed school app remake. This session is prompt **30** from `prompts/`.

## Read first
- `CLAUDE.md` (rules + session protocol)
- `MODULE_STATUS.md`
- DATABASE_DESIGN.md §4 lesson blocks
- DESIGN_SYSTEM.md
- ARCHITECTURE.md §6

## Skills and MCPs to use
Skills: `frontend-design`, `expo:expo-ui`, `expo:expo-dom` (only if a web-only renderer is needed), `run`. Invoke skills by name (e.g. "use the frontend-design skill"); see `GUIDE.md` §3.

## Goal
Students read a topic's lesson in English or Urdu with diagrams, math, video and quick checks.

## Do
- Block renderer for all block types; per-block language toggle; SVG math and diagrams via react-native-svg; YouTube embed (iframe web / WebView native) with an offline placeholder; quick-check blocks use the practice item component.
- Topic page: objectives, sections nav, 'alternative explanation' entry point (kind=alternative).
- Teacher preview of drafts.

## Don't
- No runtime KaTeX WebViews.
- Don't break the old app in `src/` or run SQL on the Supabase project.

## Deliverables
- features/learn

## Done when
- [ ] Pilot topic renders in en/ur on phone, Chromebook, web within the performance budget (P-4).
- [ ] YouTube embed tested on lab Wi-Fi (P-5) or marked unverified.
- [ ] Type-check, lint and `packages/core` tests pass (once they exist).

## Finish
Follow the session protocol in `CLAUDE.md`: update `MODULE_STATUS.md`, tick **30** in `prompts/README.md` with a one-line note, update other docs you changed the truth of, commit, push, and report what Hassan must do next (e.g. run a migration, install a build).
