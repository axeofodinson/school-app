# 30 — Learn: lesson reader

**Model:** Opus · **Phase:** 3 · **Depends on:** 22 · **Blocked by:** —

Paste everything below the line into a new Claude Code session on the `school-app` repo.

---

You are continuing the Al-Syed school app remake. This session is prompt **30** from `prompts/`.

## Read first
- DESIGN_SYSTEM.md §7.3 and §7b (visual learning)
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
- Visual-first reader (DESIGN_SYSTEM.md §7.3, §7b): `Stage` + `StageControls` + `StepCaption`, two-pane ≥ 900, "Text version" toggle, keyboard (←/→, Space, F).
- Renderers for text blocks, `figure` (hotspots, zoom), `compare`, `video` (YouTube iframe web / WebView native, poster + transcript, offline fallback to a scene) and quick checks (practice item component). SVG math and diagrams via react-native-svg. `scene`, `chart`, `widget` come in prompt 33: render a placeholder card for them here.
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
