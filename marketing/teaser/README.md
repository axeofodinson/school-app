# Al-Syed teaser trailer (prompt M1)

A 38-second coded teaser for the coming Al-Syed High School app + LMS. Everything
is drawn with HTML/CSS/SVG (mock UI, not screenshots) and animated with one paused
GSAP timeline, so any frame can be rendered exactly by time.

Look: provisional (there is no `DESIGN_SYSTEM.md` yet). **Re-skin after prompt 00**:
colours are CSS variables at the top of `style.css`; type is Fraunces (display),
Inter (UI) and Noto Nastaliq Urdu. The logo mark (book + star) is a placeholder
until the school gives its crest.

## Files
| File | What it is |
|---|---|
| `copy.json` | **All on-screen text** (`en`, `ur`, `ur_draft` per line) |
| `index.html` / `style.css` / `teaser.js` | the scenes, the layout for every aspect ratio, the timeline |
| `build.mjs` | inlines fonts, GSAP, CSS, copy and JS into `dist/teaser.html` (one file, no network) |
| `render.mjs` | Playwright + ffmpeg: seeks the timeline at 30 fps and encodes the (silent) MP4s |
| `mix.mjs` | builds the soundtrack (music + synthesised effects + optional voice) and muxes it in |
| `audio/music.mp3` | 30 s music track Hassan generated with ElevenLabs for this teaser |
| `player.html` | preview page with play/scrub and a format toggle (published as the Artifact) |
| `out/` | rendered videos and stills (git-ignored) |

## Render
```bash
cd marketing/teaser
npm install
npm run render
```
That writes `out/teaser-9x16.mp4` (1080×1920), `out/teaser-16x9.mp4` (1920×1080) and
`out/teaser-loop-1x1.mp4` (1080×1080, hook + close, ~7.5 s), silent, plus a `-sound.mp4`
version of each with the soundtrack. H.264, yuv420p, CRF 20, `+faststart`; AAC 160 kbps,
-16 LUFS. Takes about 8 minutes. After a text-only change you still need the full render;
after an audio-only change `node mix.mjs` is enough (seconds).

### Sound
- **Music:** `audio/music.mp3` (30 s) is stretched to 38 s by repeating two 4.8 s phrases
  mid-track (`CUT`/`REPEAT` in `mix.mjs`), so its fade-out sits under the close card.
- **Effects:** synthesised with ffmpeg in `mix.mjs` (taps, a soft "wrong" cue, a "mastered"
  chime, offline/synced blips, a paper whoosh), timed to the animation. `--no-sfx` turns them off.
- **Voice (optional):** drop `audio/vo-1.mp3` … `vo-6.mp3` in and run `node mix.mjs`; each line
  starts at its scene (`VO` in `mix.mjs`) and the music ducks under it.
- Only use audio you own or generated yourself. Commercial use of ElevenLabs output needs a paid plan.

Options (after `node build.mjs`):
```bash
node render.mjs --format 9x16             # one format (9x16, 16x9, 1x1, or a comma list)
node render.mjs --urdu draft              # Claude's Urdu drafts: preview only, never publish
node render.mjs --stills                  # storyboard strips: out/storyboard-<format>.png
node render.mjs --at 9.6,33               # full-size PNG stills at those seconds
node render.mjs --hash                    # per-frame SHA-256 in out/hashes-<format>.txt (determinism check)
```
Preview in a browser: `node build.mjs`, then open `dist/teaser.html#autoplay=1`
(add `&urdu=draft` to see the drafts), or open `player.html` from a local server.

## Change the text
1. Edit `copy.json`. Keep lines short: each is on screen for about 1.5–6 s.
2. **Urdu:** put the approved line in `ur`. While `ur` is `""` the video shows a
   `[UR]` placeholder. `ur_draft` is only a suggestion and is never used in a real render.
3. `npm run render`.

Timing lives in `teaser.js` (`BEATS` and the absolute times in `build()`); the 1:1 loop
segments are `LOOP`. If you move an animation, move its effect in `SFX` (`mix.mjs`) too.

## Rules this piece follows
- Everything is "coming soon"; only features in `LMS_AUDIT.md` / `prompts/README.md` are shown.
- No statistics, testimonials, real names or photos. The score bars are a mock chart.
- Exams are never called secure or locked down.
- No Google/Apple/Microsoft logos: just "Android · Chromebook · Web". The Play Store line
  (`store` in `copy.json`) stays empty until the listing is confirmed.
- Deterministic: no `Date.now()`, no `Math.random()` (a seeded PRNG for the seat order).
- No CDN: fonts come from `assets/fonts/` and npm and are inlined at build time.
- GSAP is allowed here because this is a web-only marketing page, not the app
  (DECISIONS #32). The app still uses Reanimated + Moti only.
