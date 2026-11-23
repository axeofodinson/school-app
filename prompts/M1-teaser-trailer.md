# M1 — Marketing teaser trailer (coded, rendered to MP4)

**Model:** Opus · **Phase:** anytime (marketing) · **Depends on:** — (re-skin after 00) · **Blocked by:** Hassan approving the storyboard and the Urdu lines

Paste everything below the line into a new Claude Code session on the `school-app` repo.

---

You are making a marketing teaser trailer for the upcoming Al-Syed High School app + LMS. Read `CLAUDE.md`, `LMS_AUDIT.md` §4 and §10, `ARCHITECTURE.md` §6b, `GUIDE.md`, and `DESIGN_SYSTEM.md` if it exists (use its colours, type and motion tokens).

**State (2026-11-23):** done in `marketing/teaser/` (see its README). Hassan chose the hook, close and school-name Urdu and approved the other drafts. Remaining: WhatsApp check on Android; re-skin to `DESIGN_SYSTEM.md` once prompt 00 lands; music added (ElevenLabs, `audio/music.mp3`) with synthesised effects via `mix.mjs`; voice lines optional (`audio/vo-1..6.mp3`, then `npm run mix`).

## Skills and MCPs
`frontend-design` (if listed), `design:ux-copy`, `artifact-design` (publish the preview), `run` (Playwright). Context7 for GSAP docs.

## Goal
A 30–40 s coded trailer (HTML/CSS/SVG + GSAP bundled locally) that makes students, parents and teachers excited while staying honest. Six beats: hook + logo, Learn (EN ⇄ Urdu lesson, diagram, formula), Understand (wrong answer → why → follow-up → mastered), Surprise exams (3 taps → 40 live dots → results), Works where you are (Chromebook / PC / phone, offline saved → synced, A4 worksheet), Close (Coming soon, school, "Android · Chromebook · Web").

## Rules
- `window.seek(ms)` renders the exact frame; no `Date.now()`, no unseeded randomness. Wait for `document.fonts.ready`.
- `render.mjs`: pre-installed Playwright Chromium, 30 fps, ffmpeg H.264 yuv420p CRF 20 +faststart. Formats from one timeline: 1080×1920, 1920×1080, and a 6–8 s 1080×1080 loop. Silent renders, then `mix.mjs` adds music, effects and optional voice.
- All text in `copy.json`. Urdu is human-written: render `[UR]` placeholders until Hassan writes or approves each line; never present Claude's drafts as final.
- Honesty: "coming soon"; only planned features; no fake stats, testimonials, real names or photos; never "secure"/"cheat-proof"/"locked down"; no platform logos unless Hassan provides official badges.
- Readable on a phone (≥ 1.5 s per line, safe margins on 9:16); 9:16 and 16:9 each ≤ 15 MB.
- Don't commit videos (`marketing/teaser/out/` is git-ignored).

## Done when
- [x] Hassan approved the Urdu lines (storyboard shared as the preview Artifact).
- [x] All three MP4s render from one command; frames identical across two renders.
- [x] Urdu renders correctly in every format; nothing clipped in 9:16.
- [x] Sizes within budget. [ ] Plays in WhatsApp on an Android phone (Hassan).
