# 90 — Animated explainer pipeline (Blender)

**Model:** Opus (local session with Blender MCP) · **Phase:** 9 · **Depends on:** 30, 33 · **Blocked by:** Must run in Claude Code on Hassan's PC with Blender + Blender MCP (GUIDE.md §2)

Paste everything below the line into a new Claude Code session on the `school-app` repo.

---

You are continuing the Al-Syed school app remake. This session is prompt **90** from `prompts/`.

## Read first
- `CLAUDE.md` (rules + session protocol)
- `MODULE_STATUS.md`
- LMS_AUDIT §1.2 5.3 animated explainers row
- GUIDE.md §2 (Blender MCP setup)

## Skills and MCPs to use
MCP: Blender MCP (local, on Hassan's PC). Skills: `run` / Playwright for rendering Urdu captions. Invoke skills by name (e.g. "use the frontend-design skill"); see `GUIDE.md` §3.

## Goal
Make short animated explainers for concepts where a picture beats text, with correct Urdu text.

## Do
- Prototype one 60–90 s explainer for a pilot concept using Blender driven through the Blender MCP (scene, objects, keyframes, camera, render to MP4 720p, 24–30 fps).
- Urdu text: Blender's text objects don't shape Arabic-script text correctly, so render each Urdu caption as a transparent PNG/SVG with a proper text engine (headless Chromium via Playwright with the bundled Nastaliq font) and import it as an image plane, or overlay captions afterwards with ffmpeg. Verify this on day one with one sentence.
- Script-driven: a `tools/explainers/<concept>/script.json` (scenes, narration en/ur, captions) and a Python Blender script that builds the scene from it, so more videos can be made the same way. Narration audio is recorded by a teacher or left silent with captions.
- Measure render time and file size; upload to the school YouTube channel (unlisted) by hand; link from a lesson `video` block (poster + transcript + `offline_fallback_block` pointing at a `scene` that explains the same idea without internet). Use Blender only where a 3D or long animation is worth it; short 2D explanations are `scene` blocks (prompt 33), which work offline.

## Don't
- Don't put rendered videos in the repo (only scripts and small previews).
- Don't break the old app in `src/` or run SQL on the Supabase project.

## Deliverables
- tools/explainers/ + one finished video + how-to in GUIDE.md

## Done when
- [ ] Urdu captions render correctly (connected Nastaliq) in the final video.
- [ ] File ≤ 4 MB/min at 720p; render time recorded.
- [ ] Type-check, lint and `packages/core` tests pass (once they exist).

## Finish
Follow the session protocol in `CLAUDE.md`: update `MODULE_STATUS.md`, tick **90** in `prompts/README.md` with a one-line note, update other docs you changed the truth of, commit, push, and report what Hassan must do next (e.g. run a migration, install a build).
