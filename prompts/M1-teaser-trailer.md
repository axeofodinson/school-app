# M1 — Teaser trailer for the new app (marketing)

**Model:** Opus · **Phase:** marketing (any time) · **Depends on:** — (better after 00, so it can use the real look) · **Blocked by:** Hassan supplies/approves the Urdu lines

Paste everything below the line into a new Claude Code session on the `school-app` repo.

---

You are making a marketing teaser trailer for the upcoming Al-Syed High School app + LMS. Read `CLAUDE.md`, `LMS_AUDIT.md` §4 (principles) and §10, `ARCHITECTURE.md` §6b (motion), `GUIDE.md`, and `DESIGN_SYSTEM.md` if it exists (use its colours, type and motion tokens; if it doesn't exist yet, design a clean, calm, premium look and note it should be re-skinned after prompt 00).

## Skills and MCPs to use
Skills: `frontend-design` (visual quality), `expo:expo-animation` principles for motion feel, `design:ux-copy` (short, punchy lines), `artifact-design` (to publish the preview), `run` (Playwright). Context7 for GSAP/anime.js docs.

## Goal
A 30–40 second, genuinely striking coded trailer that makes students, parents and teachers excited about what's coming, while staying honest. It is rendered to MP4 for WhatsApp, Facebook, Instagram and YouTube.

## Story (about 6 beats; adjust timing to the music if Hassan gives a track)
1. **Hook (0–4 s):** a single bold line on a dark stage, e.g. "Learning, rebuilt." / Urdu line. Logo-mark reveal for Al-Syed High School.
2. **Learn (4–10 s):** an animated phone/Chromebook mockup showing a lesson page flipping between English and Urdu (Nastaliq), a diagram drawing itself, a math formula appearing.
3. **Understand, not memorise (10–17 s):** a practice question; the student picks a wrong option; the "why it's wrong" explanation slides in; a follow-up card appears; a mastery ring fills to "Mastered".
4. **Surprise exams (17–23 s):** the teacher taps three times ("Class 9 → Algebra → Start"); 40 student dots light up on a live view; results appear the moment it ends.
5. **Works where you are (23–29 s):** quick cuts: a Chromebook in the lab, a Windows PC for teachers, an Android phone at home; a Wi-Fi icon drops out and an "offline ✓ saved" pill keeps going; a printed A4 worksheet slides out.
6. **Close (29–36 s):** "Coming soon" + Urdu line + school name + "Android · Chromebook · Web" + optional Play Store badge text (only if Hassan confirms the listing).

## How to build it
- `marketing/teaser/` in the repo: one static HTML page with a **deterministic timeline**. Use **GSAP** or **anime.js** installed from npm and bundled locally (no CDN links); this is a web-only marketing piece, so DOM animation libraries are fine here, unlike the app. Everything is drawn with HTML/CSS/SVG: mock UI built in code, not screenshots of a real app.
- The timeline must be **seekable by time**: expose `window.seek(ms)` that renders the exact frame for a timestamp (pause the timeline and set its progress). No `Date.now()`, no randomness without a fixed seed.
- **Fonts:** bundle the Noto Nastaliq Urdu font from `assets/fonts/` (and a Latin display font from npm, e.g. `@fontsource/...`), loaded via `@font-face` from local files. Wait for `document.fonts.ready` before capturing.
- **Render script** `marketing/teaser/render.mjs`: use the pre-installed Playwright Chromium (`require('playwright')`, `chromium.launch()`, don't reinstall), open the page at the target size, step `seek()` at 30 fps, screenshot each frame, and encode with ffmpeg (installed at `/usr/bin/ffmpeg`): H.264, `yuv420p`, `-crf 20`, `+faststart`.
- **Two formats from the same timeline** (responsive layout, not two animations):
  - `teaser-9x16.mp4` at 1080×1920 for WhatsApp status / Reels / Shorts;
  - `teaser-16x9.mp4` at 1920×1080 for YouTube / Facebook.
  - Also a 6–8 s `teaser-loop-1x1.mp4` (1080×1080) of the hook + close for posts.
- **Audio:** produce a silent version. If Hassan provides a royalty-free track (`marketing/teaser/music.mp3`, not committed if large), add `--music` to mux it with a fade-out. Never download copyrighted music.
- **Text:** all lines live in one `copy.json` (`en` + `ur` per line) so wording can change without touching animation code.

## Urdu
Urdu must be natural and human-written (CLAUDE.md). Draft the **English** lines yourself, then **ask Hassan** to write or approve each Urdu line before the final render (use multiple-choice questions where helpful, but never invent Urdu and present it as final). Until he answers, render with `[UR]` placeholders. Check Nastaliq renders connected and isn't clipped (generous line-height).

## Honesty rules (this is marketing for a school)
- Everything is **"coming soon"**; don't imply it is available today.
- Show only features that are in the plan (`LMS_AUDIT.md`, `prompts/README.md`). No fake statistics, no fake testimonials, no real student names or photos.
- Don't say exams are "secure"/"cheat-proof"/"locked down" (they're monitored, not locked).
- No logos of Google/Apple/Microsoft beyond plain text like "Android · Chromebook · Web" unless Hassan provides official badge files and confirms use.

## Quality bar
- Feels premium: purposeful motion (easing, staggered reveals, depth via scale/opacity/blur), consistent colour, strong typography, no clip-art look. Every beat shows a *learning* idea, not just UI.
- Readable on a phone: large type, ≥ 1.5 s on screen per line, safe margins for platform UI on 9:16.
- File size: 9:16 and 16:9 each ≤ 15 MB (WhatsApp-friendly).

## Deliverables
- `marketing/teaser/` (HTML, CSS, JS, `copy.json`, `render.mjs`, `README.md` with how to re-render and change text)
- The MP4s, sent to Hassan as files (don't commit large video files; add `marketing/teaser/out/` to `.gitignore`)
- A private Artifact with the live, interactive version so Hassan can preview on his phone before rendering

## Done when
- [ ] Hassan approved the storyboard (send a quick frame-strip or the Artifact first) and the Urdu lines.
- [ ] All three MP4s render from one command; frames are identical between two renders (deterministic).
- [ ] Urdu renders correctly in every format; nothing is clipped in 9:16.
- [ ] Sizes within budget; plays on an Android phone in WhatsApp.

## Finish
Commit the source (not the videos) and push to the session's branch; add a line to `prompts/README.md` (tick M1) and `MODULE_STATUS.md`; send Hassan the MP4s and the Artifact link, and tell him how to change text and re-render.
