# 33 — Visual blocks: scenes, charts, widgets

**Model:** Opus · **Phase:** 3 · **Depends on:** 30 · **Blocked by:** —

Paste everything below the line into a new Claude Code session on the `school-app` repo.

---

You are continuing the Al-Syed school app remake. This session is prompt **33** from `prompts/`.

## Read first
- `CLAUDE.md` (rules + session protocol)
- `MODULE_STATUS.md`
- DESIGN_SYSTEM.md §7b (visual learning) and §6 (motion tiers)
- DATABASE_DESIGN.md §4 visual blocks
- `apps/mobile/ui/` tokens: `diagram`, `visualBudget`, `widgetCatalogue`, moments `sceneStep`, `chartReveal`, `hotspotReveal`, `predictReveal`

## Skills and MCPs to use
Skills: `frontend-design`, `expo:expo-animation`, `dataviz` (charts), `design:accessibility-review`, `run` (screenshots). Finish with `/code-review`. Invoke skills by name; see `GUIDE.md` §3.

## Goal
Lessons explain with motion and interaction, not just text: step-through scenes, native charts and interactive simulations, all from lesson data, offline, fast on a 4 GB Chromebook.

## Do
- `SceneBlock`: parse the SVG once, map layer ids to Reanimated animated groups, tween transform + opacity between steps (`sceneStep`), Play/Pause/Replay, captions per step, `predict` card before play. Lite = cross-fade steps; off = instant, no autoplay.
- `ChartBlock`: bar/line/pie/scatter/table with react-native-svg from data; tap a point for its value; series reveal (`chartReveal`); labels in both languages; axes stay left-to-right in Urdu.
- `WidgetHost` + the first widgets: `function_graph` (safe maths parser in `packages/core`, never `eval`), `fraction_bars`, `number_line`, `motion_graph`. Gesture Handler + shared values, geometry redrawn on the UI thread; keyboard steps and spoken values. Leave the rest of the catalogue as a list in MODULE_STATUS.
- `packages/core/visuals`: block schema (zod), SVG sanitiser, budget checker, safe expression parser, with unit tests (good/bad fixtures, including an SVG with `<script>`).
- Gallery entries for each block in `/dev/gallery` (en/ur, light/dark, full/lite/off, kid/student).
- Sample lesson data for one pilot topic (Class 9 Physics, motion; synthetic, `is_test_data`), with one scene, one chart and one widget.

## Don't
- Don't animate layout properties; scene layers move by transform + opacity only.
- Don't autoplay on open or on scroll; don't allow scenes/widgets in exam items.
- Don't use WebViews or runtime KaTeX for visuals.
- Don't break the old app in `src/` or run SQL on the Supabase project.

## Deliverables
- features/learn visual blocks, packages/core/visuals + tests, gallery entries, sample topic data

## Done when
- [ ] Sample scene, chart and widget run at 60 fps in full tier on the reference Chromebook (TEST_PLAN V-1), or the device falls back to lite; marked unverified if no device.
- [ ] Sanitiser rejects the bad SVG fixtures; budget checker flags oversize visuals.
- [ ] Every visual has alt text + captions in both languages and works with "Text version".
- [ ] Type-check, lint and `packages/core` tests pass.

## Finish
Follow the session protocol in `CLAUDE.md`: update `MODULE_STATUS.md`, tick **33** in `prompts/README.md` with a one-line note, update other docs you changed the truth of, commit, push, and report what Hassan must do next.
