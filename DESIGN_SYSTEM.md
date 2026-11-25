# DESIGN_SYSTEM.md — Al-Syed app: look, feel, motion

Status: **spec v0.2 "Mosaic" (session 00, 2026-11-23)**. v0.1 (calm paper + teal) was reviewed as too plain; v0.2 keeps the structure and rules but changes the look. Later sessions build to this
instead of improvising. Tokens: [`packages/core/src/design/`](packages/core/src/design/) (`tokens.ts`, `motion.ts`; the app imports them
from `apps/mobile/ui/tokens.ts`). Checked by `npm test` (`packages/core/test/design-*.test.ts`: contrast,
motion table, exam lock-down, tier picker). Components: `apps/mobile/ui/`; live gallery: `/dev/gallery`. Interactive wireframes (all screens in §7 plus a foundations board) are a
private Design canvas for Hassan's review: https://claude.ai/artifact/5ziYMyoKToGFB761ASkGjN

Constraints that shaped everything: 4 GB school Chromebooks and cheap phones,
unreliable internet, English + Urdu (RTL), ages 4 to 16, no CDN, no
decorative motion, exams are monitored not locked.

## 0. Decisions from Hassan (answered 2026-11-23)

| # | Question | Answer |
|---|---|---|
| Q1 | v0.2 "Mosaic" look (ink + indigo, subject colours, tile patterns, sticker buttons, Baloo 2)? | **Yes** ("I like this much") |
| Q2 | Digits in Urdu screens? | **Western 0–9 everywhere** |
| Q3 | Read-aloud for PG–5? | **Device speech English-first, Urdu only where the voice test passes. Plus ElevenLabs audio** made once per item for junior maths questions, for natural pronunciation (§3.1) |
| Q4 | Mastery as tiles filling a subject mosaic? | **Yes, tiles** (no ring, no percentage) |
| Q5 | Celebration animation? | **Yes, one bundled burst** (~15 KB, chapter complete, full tier only) |

## 1. Identity: "Mosaic"

**Feel:** a bright, well-made school notebook with stickers in it. Fountain-pen
**ink** for text and outlines, **indigo** for "do this", **saffron** stars, and a
bright colour per subject. Headers and subject cards carry **Lahore-fort tile
patterns** (8-point *khatam* star, hex flower), which gives the app a local, crafted
look instead of a generic edtech one. Pressable things are chunky **stickers**:
2 px ink outline plus a hard 4 px ink shadow that you press "into". Playful where
students learn; quiet where they're tested.

**The big idea: mastery is a mosaic.** Each concept a student masters sets one tile
in that subject's pattern. Finishing a chapter completes a pattern (the only
celebration moment). Tiles never fall out, so progress is visible and permanent
without streaks or loss messages.

Principles (these decide arguments):
1. **Study first.** Content (the question, the lesson) is the biggest, highest-contrast thing on screen. Colour and pattern live in headers, cards and feedback, never behind running text.
2. **Wrong is information.** Wrong answers use clay, not alarm red; no shake, no buzzer, always a reason shown.
3. **No streaks, no flames, no loss messages** (LMS_AUDIT principle "measure learning, not activity"). Progress = tiles set, follow-ups cleared.
4. **Colour is never the only signal.** Every state has an icon shape and a word.
5. **Same components for all ages.** Age changes size, copy length, colour amount and celebration size (§3), not the component set.
6. **Exams are calm.** No patterns, no sticker shadows, nothing moves but the timer and save dot.
7. **Fast beats pretty** on a cheap Chromebook. Patterns are tiny SVG tiles; tier-down is a design feature (§6).

### 1.1 Iconography
- 24 px grid, 2 px stroke, round caps and joins, **outline by default, filled when selected**. Corner radius matches `radius.sm`.
- **Lucide** (ISC licence) path data copied into `apps/mobile/ui/icons.data.ts` and drawn with `react-native-svg` (session 02, DECISIONS #43). Not `lucide-react-native`: its barrel import would bundle ~1,900 icons. Add icons by copying their elements into that table.
- **RTL:** directional icons (chevron, arrow, back, send, list-bullet-with-indent) mirror; neutral icons (check, clock, cloud, book, pencil, lightbulb) do not. Directional icons are listed in `directionalIcons` and the `Icon` primitive mirrors them.
- Mastery band shapes (so colour-blind users can tell them apart): **learning = half-filled circle**, **weak = triangle with a dot** ("needs work"), **mastered = filled circle with a tick**.

### 1.2 Illustration (empty states, onboarding, result)
- Flat geometric spot illustrations with ink outlines (sticker style), subject hues + one saffron accent, **no text inside images** (i18n), no faces or characters (nothing to localise, nothing to date).
- **Patterns** (`patterns` token): 8-point star, hex flower, chevron; 32–64 dp SVG tiles at 7–22 % opacity on header bands, subject cards, the kid practice background and celebrations. Never behind running text, never on exam screens, never on staff data tables.
- Objects from a classroom: book, pencil, lamp, sprout, backpack, clock. ≤ 8 KB SVG each, drawn with `react-native-svg`, tinted from tokens so dark mode is free.
- Primary band gets larger art (up to 160 dp), student band 96 dp, staff 64 dp or icon only.
- Lottie only for one celebration burst (§6). Old pixel sprites in `assets/sprites/` are retired with the old app.

## 2. Foundations

### 2.1 Colour
Semantic roles, each with a light and a dark value (full table in the tokens file). All 48 text and UI pairs pass AA (24 per theme; 4.5:1 text, 3:1 UI), and all 8 subject hues carry ink text at ≥ 4.5:1 in both themes, verified by the script.

| Role | Light | Dark | Use |
|---|---|---|---|
| `bg` / `surface` / `surfaceAlt` | `#F5F3FB` / `#FFFFFF` / `#ECE9F6` | `#121230` / `#1D1C42` / `#272652` | canvas / cards / quiet fills |
| `text` = `ink` / `textMuted` | `#1B1A3A` / `#4F4B6E` | `#EFEEFF` / `#B4B1D6` | text; ink is also the sticker outline + hard shadow |
| `primary` (+`onPrimary`) | `#4434D4` indigo | `#A79CFF` | main action, links, focus |
| `accent` (+`onAccent`) | `#FFB627` saffron | `#FFC34D` | stars, medals, "test is open" (always labelled) |
| `correct` / `wrong` | `#11865B` / `#C2412D` | `#4FD8A0` / `#FF8C75` | answer feedback (+ icon + word) |
| `learning` / `weak` / mastered=`correct` | `#1F6FD1` / `#B35C00` / `#11865B` | `#7DB4FF` / `#F5A65A` / `#4FD8A0` | 3 mastery bands |
| `borderStrong` | `#77729A` | `#8C88B5` | input outlines; sticker outlines in dark |

**Subject hues** (`subjectHues`): sky `#7CC4FF`, mint `#6EDDB3`, coral `#FF9E8A`, sunflower `#FFD25E`, lilac `#C3B0FF`, lagoon `#5ED1D6`, rose `#FFA8C8`, lime `#B8E26A` (each a step darker in dark mode), always with ink text. Subjects are data, so a subject's hue comes from an optional `subjects.colour_key` or a stable hash of its id (`hueForSubject`); never a hardcoded subject→colour map. (`colour_key` would be a small additive migration in a later session; until then the hash is used.)

Rules: no hex outside tokens; soft shadows disappear in dark mode (hard sticker shadows stay, near-black); `accent` is a fill, never a thin line on white; neutrals lean violet so the page never goes flat grey.

### 2.2 Spacing, radius, elevation
- Space (4-pt grid): `xxs 2 · xs 4 · sm 8 · md 12 · lg 16 · xl 24 · xxl 32 · huge 48 · giant 64`. Screen gutter 16 phone, 24 tablet/desktop, 20 kid.
- Radius: `sm 8 · md 12 · lg 16 · xl 24 · full`. Kid presentation adds +4. Always `borderCurve: 'continuous'` on native.
- Elevation: **stickers** (`stickerSm` 2 px, `sticker` 4 px hard ink shadow, no blur) on pressable things; **soft** (`card`, `overlay`) on passive surfaces and sheets. Press = translateY by the shadow depth (`stickerPressDepth`), so the button sinks into its shadow. Staff data screens use soft/flat only; exam screens use no sticker shadows.
- Breakpoints: phone < 600, tablet/Chromebook-window 600–899, desktop ≥ 900 (two-pane), wide ≥ 1280 (max content width 1120).

### 2.3 Type
**Display: Baloo 2** (OFL, by Ek Type, a foundry that designs for South Asian scripts): chunky and warm, used for display/title/heading and the numbers that matter (scores, timer). **Body: Nunito** (OFL; rounded, very legible). Both bundled from `@expo-google-fonts/*` TTFs on native, WOFF2 subsets on web (Baloo 2 SemiBold/Bold/ExtraBold; Nunito Regular/SemiBold/Bold). **Urdu: Noto Nastaliq Urdu** (already in `assets/fonts/`, Regular + Bold; subset to WOFF2 for web). Tabular digits for the timer are applied with `fontVariant: ['tabular-nums']`; whether Nunito ships a `tnum` feature in the subset is **unverified** (test T-2).

| Step | Latin size/line | Urdu size/line (ratio) | Weight | Use |
|---|---|---|---|---|
| display | 36 / 42 Baloo | 36 / 70 (1.94) | ExtraBold | result score, greeting |
| title | 26 / 32 Baloo | 27 / 54 (2.0) | Bold | screen titles, questions |
| heading | 20 / 26 Baloo | 22 / 46 (2.1) | SemiBold | section and card titles |
| body | 16 / 24 | 18 / 40 (2.2) | Regular | questions, lessons, lists |
| bodySm | 14 / 20 | 16 / 36 (2.25) | Regular | helper text |
| caption | 12 / 16 | 14 / 30 (2.15) | Regular | timestamps, counts (never essential info for kid) |
| label | 15 / 20 | 17 / 34 | Bold | buttons, tabs, chips |

**Why Urdu is bigger and taller:** Nastaliq has a small x-height and tall diagonal strokes plus stacked marks, so it reads smaller at the same point size and clips when the line box is tight. Rules (also in `urduTextRules`):
- Urdu sizes ≈ 12 % larger; line-height ratio **≥ 1.9** (2.0–2.25 for running text).
- Controls with one line of Urdu use `minHeight` plus vertical padding, **never a fixed height**. Android: `includeFontPadding: false` and check top/bottom clipping.
- No letter-spacing, no italics, no uppercase, no faux bold (use the Bold file).
- Maths, numbers with units and Latin runs inside Urdu are isolated LTR (Unicode isolates), so `8/10` or `x²` never reorders.
- Kid presentation multiplies sizes **and** line-heights by 1.15.

**Urdu type specimen** (a specimen to test shaping, *not product copy*; real Urdu is written and reviewed by teachers per CLAUDE.md and DECISIONS #28). These four strings are in `urduSpecimens` and render in the gallery at every step:

| id | text | what it tests |
|---|---|---|
| joins | پڑھائی کا وقت | joins, ڑ, ھ |
| diacritics | اُستاد نے سَبَق سمجھایا | zabar/zer/pesh stacks, the tallest case |
| mixed | ٹیسٹ میں 8/10 نمبر | digits + loanword, LTR isolation |
| long | آج ہم کسر کی پہچان اور ان کا آپس میں موازنہ سیکھیں گے۔ | wrapping over 2–3 lines |

**Unverified until run:** *T-1* render the specimen at every step on a phone, a school Chromebook (APK) and Chrome: no clipped marks in single-line buttons, tabs, chips or the exam timer bar; adjust line-heights in the tokens, not per screen. *T-2* tabular digits in Nunito. *T-3* Urdu in the timer/header at 200 % system font size. Add all three to `TEST_PLAN.md` P-2/P-4.

Voice register: casual, kid-friendly, loanwords kids use ("test", "homework", "result"). Urdu is never machine-translated; new English keys get an Urdu key or `// TODO: ur`.

### 2.4 Mastery band display
Three bands only (no percentages shown), always **chip + shape + word**. Progress inside a subject is the **mosaic** (one tile per concept, filled = mastered, dashed = not yet), with an accessible label such as "Maths: 7 of 12 concepts mastered".

| Band | Shape | Word (en) | Colour |
|---|---|---|---|
| learning | half-filled circle | Learning | `learning` |
| weak | triangle with a dot | Needs work | `weak` |
| mastered | circle with a tick | Got it | `correct` |

## 3. Age presentation (same components, three presentations)

Picked from `classes.grade_level` of the active enrollment (`presentationForGrade`): PG and grades 1–5 → **kid**, 6–10 → **student**; staff screens → **staff**. No class (Play Store users) → **student**, or the grade they pick. A parent/teacher can override per account later.

| | kid (PG–5) | student (6–10) | staff (teacher/admin, desktop) |
|---|---|---|---|
| Font scale | ×1.15 | ×1 | ×1 |
| Min touch target / control height | 56 / 60 dp | 48 / 52 dp | 44 / 40 (mouse + keyboard) |
| Radius, gutter | +4, 20 | base, 16 | base, 24 |
| Icons | 32 dp, **always with a label** | 24 dp | 20 dp |
| Copy | ≤ 8 words per line; one idea per screen; encouraging voice | ≤ 16 words; plain, study-focused | ≤ 24 words; terse |
| Prompts | **speaker button** reads the question aloud (§3.1) | none | none |
| Options | one per row, large, option letters hidden | one per row, A/B/C/D | compact |
| Illustration | large (160 dp), on most empty states | medium (96 dp) | small or icon only |
| Colour | full: hue backgrounds, pattern behind practice | hue headers and cards | hue accents only (class card top band) |
| Celebration | big (bouncy spring, Lottie burst) | small (scale + tick) | none or toast |
| Default motion tier | auto | auto | **lite** |
| Density | airy | comfortable | dense, tables and two-pane |

### 3.1 Read-aloud audio (kid presentation)
The speaker button plays, in order of preference:
1. **Pre-made audio** stored with the item (`body.audio`, DATABASE_DESIGN §4): ElevenLabs voices, generated **once** when the question is imported or approved, for junior (PG–5) maths questions first. Natural pronunciation of numbers and maths words in Urdu and English.
2. **Device speech** (expo-speech / Web SpeechSynthesis): English everywhere; Urdu only on devices where the Urdu voice test passes.
3. Nothing (button hidden) if neither exists.

Rules: the ElevenLabs key never ships in the app; audio is made server-side (an Edge Function or a generation script in a session, with the key saved as an environment secret) and stored as small Opus/MP3 files (≈ 10–30 KB each) that go into offline packs. A teacher hears the clip in the review queue before the item is approved (it is part of the item version). Built in prompt 16: `readAloudPlan` (core) decides the order, `features/prereader` plays and caches clips, `db/030` holds them, `scripts/audio/generate-prereader-audio.mjs` makes them (format `mp3_22050_32`, ≈ 4 KB per second of speech). Urdu voice quality and real cost per clip are still **unverified** until the first run with the key (TEST_PLAN PR-3).

Tone examples (en; Urdu TODO with teachers): kid correct → "Yes! Well done."; student correct → "Correct."; kid wrong → "Not quite. Let's look."; student wrong → "Not quite. Here's why."

## 4. Components (inventory for session 02)

All take `style` (merged last), read tokens, honour presentation + motion tier, mirror under RTL, and have pressed, focus-visible, disabled and loading states. Names align with prompt 02.

| Group | Components | Notes |
|---|---|---|
| Core | `Text` (auto script, Nastaliq metrics), `Icon`, `Button` (primary / secondary / ghost / danger; sm md lg), `IconButton`, `Card`, `ListItem`, `Badge`, `Divider` | `Button` min target by presentation; label always visible for kid |
| Input | `TextField`, `PinField` (typed PIN, masked, big keys on kid), `SegmentedControl`, `Checkbox/Radio/Switch` (native where possible), `LanguageSwitch` | admission number field accepts QR scan prefill; PIN always typed |
| Feedback | `Toast`, `Banner` (info / success / warn / offline), `SyncStatusPill`, `Skeleton`, `EmptyState` (art + title + hint + one action), `ErrorState` (what, why, retry) | |
| Navigation | `Tabs` (bottom bar phone, side rail ≥ 900), `TopBar`, `Sheet/Modal`, `TwoPane` | tabs never slide |
| Visual learning | `Stage`, `StageControls`, `StepCaption`, `FigureBlock` (hotspots), `SceneBlock`, `ChartBlock`, `WidgetHost` + catalogue widgets, `CompareBlock`, `VideoBlock`, `PredictCard`, `TextVersionToggle` | §7b; renderers built in prompts 30 and 33 |
| Learning | `MosaicTiles`, `PatternBand`, `SubjectCard`, `ProgressBar`, `MasteryChip`, `ConceptCard`, `FollowUpRow`, `QuestionCard`, `OptionButton`, `FeedbackPanel` (correct / not quite + why), `LessonBlock` renderers | `OptionButton` states: idle, selected, correct, wrong, disabled |
| Exam | `ExamTimer`, `SaveIndicator`, `QuestionNavigator`, `SubmitBar` | the only exam-safe motion (§6) |
| Staff | `DataTable` (virtualised), `StudentTile`, `EventFeed`, `ReviewPane`, `StatTile` | web-first (`*.web.tsx` allowed) |
| Gallery | `/dev/gallery` renders each in en/ur × light/dark × full/lite/off × kid/student/staff | acceptance for 02 |

Component rules (from `expo-design-system`): a view moves into `ui/` only when used by ≥ 2 screens and has a nameable role; composition (`children`) beats prop explosion; native pickers/switches stay native.

## 5. Layout and input

- **Phone:** one column, bottom tabs (Home · Prepare · Tests · Me), safe-area aware.
- **Chromebook window / tablet (600–899):** one column, wider max width (680), bottom or side rail tabs.
- **Desktop ≥ 900:** `TwoPane` (list left 360–420, detail right), side rail, max width 1120. Review queue, live view, curriculum editors are built for this.
- Keyboard everywhere: visible focus (3 px `focus` ring + 2 px offset), Tab order follows reading order and **mirrors in RTL**, Enter submits, Esc closes sheets, number keys 1–4 select options on desktop, arrow keys move between options. Hover states on pointer devices (subtle `surfaceAlt`), never required.
- No orientation lock (CLAUDE.md). Text scales to 200 % without clipping: no fixed-height text containers.

## 6. Motion

Libraries and tier model: ARCHITECTURE §6b, CLAUDE.md Motion rules. This section is the **choreography**: which moments animate and exactly how. Tokens are in `moments` in the tokens file; `resolveMoment(name, tier, {inExam})` returns the behaviour.

**Gate every moment must pass** (from `expo-animation`): *How often?* (often → near-imperceptible or nothing). *What is its one-word purpose?* (feedback, state, hierarchy, progress, sync, explanation, delight; no purpose, no motion.) If it fails, the table says `none`.

**Durations:** `fast 120 · base 220 · slow 360` ms. **Springs** (classic damping/stiffness/mass form, accepted by Reanimated 4): `gentle` {damping 22, stiffness 170} no overshoot · `snappy` {18, 320, mass 0.9} tiny overshoot · `bouncy` {11, 260, mass 0.9} visible bounce (kid celebration only). **Easing:** out `(0.23,1,0.32,1)`, in-out `(0.77,0,0.175,1)`; never ease-in. Animate **transform + opacity only**; slide directions mirror in RTL.

**Tiers.** *full:* the table's full column. *lite:* opacity fades only, ≤ `base`, no springs, no movement (default on ≤ 4 GB RAM, on measured frame drops, and on staff screens). *off:* nothing moves; state still changes instantly (colour, icon, text), so nothing is lost. OS "reduce motion" forces **off** and cannot be overridden in-app. User can pick full/lite/off/auto in Settings.

### 6.1 Choreography table

| Moment | Purpose · how often | Token | **full** | **lite** | **off** | Haptic |
|---|---|---|---|---|---|---|
| Screen push/pop | hierarchy · often | `screenPush` | native stack slide (≈ 360 ms, platform curve), mirrors in RTL | fade, 120 ms | instant | — |
| Tab switch | hierarchy · often | `tabSwitch` | **none** (tabs are peers) | none | none | selection (tab bar only) |
| Sheet / modal | hierarchy · occasional | `sheetPresent` | native `formSheet`, or gentle spring up + fade | fade 120 | instant | — |
| Press feedback | feedback · often | `press` | sticker sinks into its shadow (translateY 2–4 px), 120 ms | opacity 0.85, 120 ms | colour change only | — |
| Option selected | state · often | `selectionChange` | border + fill cross-fade 120 | same | instant | selection |
| **Answer correct** | feedback · often | `answerCorrect` | tick scale-in 0.9→1 on snappy spring + green tint fade | tint fade 120 | tint + tick appear | success |
| **Answer wrong** | feedback · often | `answerWrong` | clay tint fade 220; **no shake** | fade 120 | instant | light |
| **Why-wrong reveal** | explanation · often | `whyWrongReveal` | panel fades in and rises 12 px, gentle spring (panel is already laid out; only transform/opacity move) | fade 220 | instant | — |
| **Tile set** (concept mastered) | progress · occasional | `mosaicTileSet` | new tile drops into the mosaic: scale 0.6→1 + fade, snappy spring | fade 220 | tile appears | light |
| Mastery band up | progress · rare | `masteryBandUp` | band chip cross-fade + one 1→1.06→1 pulse (snappy) | fade 220 | instant | light |
| Progress bar | progress · often | `progressBar` | fill slides inside an `overflow: hidden` track (translateX, 220, mirrors in RTL) | fade 120 | set value | — |
| **Follow-up cleared** | progress · occasional | `followUpCleared` | tick pops in the row (snappy) and row dims to "Done"; it stays in place and leaves the list on the next visit (no list reflow animation) | fade 220 | instant | success |
| Gate unlocked | progress · rare | `gateUnlocked` | lock icon swaps to open + scale-in, gentle | fade 220 | instant | success |
| Streak-free progress cue | progress · often | `mosaicTileSet` / `progressBar` | **"You set 3 new tiles this week"** changes with a fade; no flames, no streak counter, no loss state | same | instant | — |
| Sync: syncing | sync · often | `syncSyncing` | pill icon pulses opacity slowly (360 ms steps), **only while syncing, stops after 10 s** | static "Syncing" label | static label | — |
| Sync: done | sync · often | `syncDone` | label cross-fades to "Saved" tick, rests as idle after 2 s | same | instant | — |
| Offline banner | sync · occasional | `bannerEnter` | rises 8 px + fade, gentle | fade 120 | instant | — |
| Toast | feedback · occasional | `toast` | rises + fade, gentle; auto-dismiss 4 s | fade 120 | instant | — |
| Empty state | state · occasional | `emptyState` | art fades in and rises 8 px, 220 | fade 220 | instant | — |
| Subject pattern drift (DECISIONS #47) | delight · often | `patternDrift` | pattern moves diagonally by one tile every 8 s, looping (seamless), mirrors in RTL; stops when the screen is hidden | one 2 s glide on screen focus, card press and tile set, then still | still | — |
| Mosaic tile morph (DECISIONS #126) | delight · occasional | `shapeMorph` | sign-in tile row + mosaic mark turn square → star → diamond → rosette, 2.6 s per step (40 % hold, smootherstep turn), neighbours 1.25 steps apart (rolling wave), loops while focused, mirrors in RTL | one pass through the four shapes on screen focus, then still | still (mixed shapes) | — |
| Skeleton | state · often | `skeleton` | slow opacity pulse | static `surfaceAlt` | static | — |
| **Celebration: pattern complete** (chapter, student) | delight · rare | `celebrationMastery` | one bundled Lottie burst ≤ 1.5 s in the subject hue, once | badge scale-in (gentle) + fade | static badge | success |
| **Celebration: kid** | delight · rare | `celebrationKid` | bouncy badge pop, big | fade 220 | static badge | success |
| **Exam timer** | state · often | `examTimerTick` | digits change, **no tween**; colour change at 5 min and 1 min, no pulse | same | same | — |
| **Exam save indicator** | sync · often | `examSaveIndicator` | dot ↔ tick cross-fade 120 | same | instant | — |
| Language switch | — | — | **none**; direction flips instantly | | | — |
| Question switch (practice) | — | — | **none** (budget < 150 ms; content swaps, the feedback panel handles the motion) | | | — |
| Live view tile status | state · often (teacher) | `liveTileStatus` | colour cross-fade 120 | same | instant | — |
| Live event row | state · often (teacher) | `liveEventRow` | fade-in 220 (no slide, 40 tiles) | fade 120 | instant | — |
| Review: next item | progress · often (teacher) | `reviewAdvance` | card glides 24 px toward the reading direction + fade, 120 (mirrors in RTL) | fade 120 | instant | — |
| Review: decision stamp | feedback · often (teacher) | `reviewVerdict` | stamp pops from 0.85 (snappy spring); list row flashes its new state | fade 120 | instant (icon + word still change) | — |

**Rules from the table:**
1. **Exams:** with `inExam` set, `resolveMoment` returns `none` for everything except `examTimerTick` and `examSaveIndicator`, identical in all three tiers. No transitions between exam questions, no confetti, no toasts that slide; submit confirmation is an instant dialog. The post-submit **Result** screen is not an exam screen and may use `answerCorrect`-level motion only if the tier allows.
2. **Transform + opacity only, no exceptions.** v0.1 needed an SVG-stroke exception for the mastery ring; v0.2's mosaic tiles animate with scale + opacity.
3. **No parallax, shared-element hero transitions or looping decoration**, with two exceptions Hassan approved: the subject pattern drift (`patternDrift`, DECISIONS #47) and the mosaic tile morph (`shapeMorph`, DECISIONS #126). (ARCHITECTURE §6b lists parallax and shared elements under *full*: this spec does not use them, as they carry no meaning on study screens; revisit only with a use case).
4. **Haptics:** one per user action, same frame as the visual, never the only feedback; a setting turns them off.
5. **Budget:** every moment above must hold 60 fps on the reference phone and the cheapest Chromebook in lite tier (TEST_PLAN P-4/P-6). If one does not, its lite behaviour becomes the full behaviour.

### 6.2 Choreography added in the UI remake (DECISIONS #94)
| Moment | Full | Lite | Off / exam |
|---|---|---|---|
| `listEnter` | gentle spring, rise 14 px + fade, 45 ms cascade (≤ 8 steps) | the cascade as quick fades | there at once |
| `scoreReveal` | snappy pop from 0.7 + fade; tile burst at 80 %+ | fade | none |
| `kidPick` | bouncy pop from 0.82 + 9 mosaic chips from the tile (kid band) | fade | none |
| celebrations | `TileBurst`: 10–28 chips, ≤ 1.4 s, transform + opacity | words + still icon | words + still icon |

Sounds (DECISIONS #95) follow the same rule as motion in exams: none.

## 7. Screen wireframes (low fi)

Annotations: `[ ]` button, `( )` chip, `▦` mosaic tiles, `▒` content area. These text sketches give the layout; the v0.2 look (colour, pattern, stickers) is in the canvas. Drawn left-to-right (English); Urdu mirrors the whole layout. Interactive, themed versions are in the review Artifact. Each screen also needs an empty state and an offline state (listed under it).

### 7.1 Student Home (phone)
```
┌────────────────────────────────┐
│ Hi, Ayesha            [ا/EN] ☁✓│  greeting · language · sync pill
├────────────────────────────────┤
│ ▌ TEST IS OPEN  (only if live)  │  banner, top priority, accent
│ ▌ Physics · 15 min    [ Start ] │
├────────────────────────────────┤
│ Next up                         │
│ ┌────────────────────────────┐ │
│ │ ⚠ 2 follow-ups to clear    │ │  → Prepare (follow-ups first)
│ │   Fractions · Decimals     │ │
│ │               [ Continue ] │ │
│ └────────────────────────────┘ │
│ My subjects                     │
│ ▦▦▦▦░░ Maths      Learning  › │  subject card: hue + mosaic + band
│ ( 90% ) Science    Got it    › │
│ ( 30% ) English    Needs work› │
│ Today: moved up 1 concept       │  streak-free cue
├────────────────────────────────┤
│ Home   Prepare   Tests    Me   │
└────────────────────────────────┘
Empty (no class yet): art + "You're not in a class yet. Ask your teacher to add you." 
Offline: banner "No internet. Your work is saved here and will sync later."
```

### 7.2 Prepare tab: follow-ups first
```
┌────────────────────────────────┐
│ Prepare                  Maths ▾│  subject switcher
├────────────────────────────────┤
│ Do these first (2)              │  open follow-ups, gate message
│ ┌────────────────────────────┐ │
│ │ ◔ Fractions: adding        │ │  FollowUpRow: concept, kind, why
│ │   After your test · 6 Qs   │ │
│ │                    [ Start ]│ │
│ ├────────────────────────────┤ │
│ │ ◔ Decimals: place value  ✓ │ │  cleared → dims to "Done"
│ └────────────────────────────┘ │
│ New topics are paused until     │  gate, plain reason + how to clear
│ these are done.                 │
├────────────────────────────────┤
│ Revise today (3)    ▒▒▒▒▒▒     │  spaced revision due
│ Keep learning        ▒▒▒▒▒▒     │  topics / concepts with MasteryChip
├────────────────────────────────┤
│ Home   Prepare   Tests    Me   │
└────────────────────────────────┘
Empty (nothing due): art + "All caught up. Pick a topic to keep learning."
Gate relieved automatically after 3 rounds: note "We unlocked this for you."
```

### 7.3 Lesson reader (visual-first, all ages)
```
Phone                                    Chromebook / desktop ≥ 900 (two-pane)
┌────────────────────────────────┐      ┌─────────────────────────┬──────────────────┐
│ ‹ Physics · Motion   ▬▬▬░░░ 3/8│      │ STAGE (sticky, 60 %)    │ Step 2 of 4       │
├────────────────────────────────┤      │  scene / chart / widget │ caption (en|ur)   │
│ ┌────────────────────────────┐ │      │  ◀ ● ● ○ ○ ▶  ▶︎ play   │ text for the step │
│ │ STAGE: scene, chart, widget│ │      │                         │ [Explain more]    │
│ │ (subject-hue tint)         │ │      │                         │ Predict / Check   │
│ └────────────────────────────┘ │      └─────────────────────────┴──────────────────┘
│ ◀  ● ● ○ ○  ▶     ▶︎ Play  ⤢   │  step dots, play/pause, fullscreen
│ Step 2: speed stays the same,  │  caption = text equivalent of the step
│ so the distance grows evenly.  │
│ [ Explain more ▾ ]             │  detailed text collapsed by default
│ ┌ Predict ────────────────────┐│  predict → observe → explain
│ │ What happens to the graph? ││
│ └────────────────────────────┘│
│ [ Back ]              [ Next ] │
└────────────────────────────────┘
Keys: ← → steps · Space play/pause · F fullscreen. "Text version" toggle shows all captions + alt text.
Empty: "No lesson here yet. Practice is open." Offline: scenes, charts, widgets work; video shows "needs internet" + its step scene fallback.
```
Full spec of the visual blocks: §7b.

### 7.4 Practice question
```
┌────────────────────────────────┐
│ ✕  Fractions        4 / 10  ▬▬ │
├────────────────────────────────┤
│ [🔊] What is 1/2 + 1/4 ?        │  speaker: kid only
│                                 │
│ ( ) 3/4                         │  OptionButton, big
│ ( ) 2/6                         │
│ ( ) 1/4                         │
│ ( ) 2/4                         │
│                    [ Check ]    │
└────────────────────────────────┘
after Check, panel rises (no layout jump):
┌────────────────────────────────┐
│ ✗ Not quite.                    │  or ✓ Correct.
│ You added the tops and bottoms. │  why-wrong, concept-linked
│ Add fractions with the same     │
│ bottom number first.            │
│  [ See lesson ]    [ Next › ]   │
└────────────────────────────────┘
Empty: "No questions here yet." Offline: works from cached pack; answers queue.
```

### 7.5 Exam screen (no motion except timer and save)
```
┌────────────────────────────────┐
│ Physics test      ⏱ 12:41  ● Saved│  timer + save indicator: ONLY moving parts
├────────────────────────────────┤
│ Question 6 of 15                │
│ A car speeds up from rest …     │
│ ( ) 2 m/s²                      │  options shuffled per student
│ ( ) 4 m/s²                      │
│ ( ) 5 m/s²                      │
│ [ ‹ Previous ]     [ Next › ]   │  instant swap, <150 ms
├────────────────────────────────┤
│ 1 2 3 4 5 ▣6 7 8 9 …  [ Submit ]│  QuestionNavigator: answered/unanswered/flagged
│ Your teacher can see if you     │  honest, never "locked"
│ leave this screen.              │
└────────────────────────────────┘
Offline: "Offline. Answers are kept here and sent when you're back."
Timer: colour change at 5 min and 1 min only. Submit → instant dialog "Submit 12 of 15 answered?"
```

### 7.6 Result
```
┌────────────────────────────────┐
│          Physics test           │
│            11 / 15              │  display type
│   (  ●  )  Got it · most topics │
│ Your teacher will confirm marks.│  until results confirmed
├────────────────────────────────┤
│ By topic                        │
│ Motion        ▬▬▬▬▬▬▬▬ 4/4  ✓  │
│ Forces        ▬▬▬▬▬▬     3/5 ⚠  │
│ Energy        ▬▬▬▬       2/4 ⚠  │
│ 2 follow-ups added in Prepare.  │
│ [ Review my answers ] [ Go to Prepare ]│
└────────────────────────────────┘
Kid: bigger score, one celebration, 1 sentence.
```

### 7.7 Teacher: surprise exam launch (2 taps with a saved blueprint; ≤ 3 always)
```
Teacher Home (desktop)                           Tap 1: ⚡ on a class tile
┌────────────┬───────────────────────────────────────┐
│ Classes    │ Class 9 · Physics      [ ⚡ Surprise exam ]│  ← tap 1
│ Home       │ 38 students · last exam 12 Nov           │
│ Review     │                                         │
└────────────┴───────────────────────────────────────┘
Sheet (blueprint remembered per class + subject)  Tap 2: Start
┌──────────────────────────────────────┐
│ Surprise exam · Class 9 Physics      │
│ 10 questions · mixed · 15 min        │
│ Topics: Motion, Forces (last used)   │
│ [ Edit blueprint ]                   │
│            [ Cancel ] [ Start exam ] │  ← tap 2 → Live view opens
└──────────────────────────────────────┘
First time: Edit blueprint opens inline (class, subject, topics, count, minutes), then Start (3 taps).
Not enough approved questions: "Only 6 approved questions for Motion. Pick another topic or lower the count."
```

### 7.8 Teacher: live exam view (desktop, two-pane)
```
┌────────────────────────────────────────────────────────────┐
│ Class 9 Physics · ⏱ 09:12 left · 36 / 38 started  [Extend][End]│
├───────────────────────────────────┬────────────────────────┤
│ ▢ Ayesha  7/10 ●   ▢ Bilal 3/10 ● │ Events                 │
│ ▢ Chand   —   ○    ▢ Dua  10/10 ✓ │ 10:42 Bilal left screen│
│ ▢ Ehsan   5/10 ⚠ left screen      │ 10:41 Dua submitted    │
│  … 40 tiles, status = icon + word │ 10:40 Chand not started│
│                                   │ [ Void session ]       │
└───────────────────────────────────┴────────────────────────┘
Tile states: not started ○ · answering ● n/N · submitted ✓ · left screen ⚠ · offline ◌ · voided ⊘ (icon + word, never colour alone)
Empty: "Nobody has started yet. Ask students to open the app." Realtime lost: banner "Live updates paused. Retrying…"
```

### 7.9 Teacher: review queue (desktop, two-pane)
```
┌──────────────────────┬─────────────────────────────────────┐
│ To review (214)  ▾   │ Q-1042 · Fractions · level 2        │
│ ▢ Q-1042 ● Fractions │ ┌─ English ───────┬─ اردو ─────────┐ │
│ ▢ Q-1043   Fractions │ │ stem, options   │ stem, options  │ │
│ ▢ Q-1044   Decimals  │ └─────────────────┴────────────────┘ │
│ Filters: subject,    │ Answer: B · Explanation (both langs) │
│ status, batch        │ ☐ Urdu reads naturally  ☐ Answer correct│
│                      │ [ Reject ] [ Edit ]       [ Approve ] │
└──────────────────────┴─────────────────────────────────────┘
Keys: J/K next/prev · A approve · E edit · R reject. Bulk: select rows → "Approve 12".
Empty: "Nothing to review. Import questions to get started."
```

### 7.10 Admin home (desktop)
```
┌──────────┬───────────────────────────────────────────────┐
│ Home     │ 2026–27 · setup 4 of 6 done                   │
│ Students │ ☑ Academic year  ☑ Classes  ☑ Teachers        │  checklist, each links in
│ Classes  │ ☑ Enrolments  ☐ Curriculum  ☐ First content   │
│ Teachers │ Needs attention                               │
│ Curric.  │  3 students without a PIN · 214 questions waiting review│
│ Review   │ School at a glance  (656 students · 23 teachers) │
│ Backups  │ Last backup: yesterday 02:00 ✓                 │
└──────────┴───────────────────────────────────────────────┘
Empty (day one): checklist is the screen; every row has its own "Add the first …" action.
```

## 7b. Visual learning

Lessons for every age are **visual-first**: each lesson section is a visual on a
"stage" with a short caption, and the longer text sits under an *Explain more*
toggle. Visuals are **data** (blocks in `learning_content_versions.blocks`,
DATABASE_DESIGN §4). Adding a lesson never needs code, and every visual works
offline except video. One renderer per block type, built in prompts 30 and 33.

### 7b.1 Visual block types

| Block | What it is | Example | Works offline | Made by |
|---|---|---|---|---|
| `figure` | SVG or WebP with numbered **hotspots** (tap to show a label), pinch/scroll zoom | parts of a plant cell; a circuit | yes | C1 (SVG), teacher upload (WebP) |
| `scene` | **Step-through animation**: one SVG with named layers, plus steps that move/fade layers (transform + opacity) with a caption each. Tap through, or Play (auto-advance, pausable) | a car speeding up; water evaporating; carrying in addition | yes | C1 writes SVG + steps as JSON |
| `chart` | Bar, line, pie, scatter or table drawn natively from inline data; tap a point for its value; series can reveal one by one | distance–time graph; rainfall by month | yes | C1 / teacher |
| `widget` | Interactive **simulation** from a fixed catalogue, configured by params | slide *m* and *c* in y = mx + c; drag a triangle's corner and watch the area | yes | C1 picks a widget + params |
| `compare` | Two panels side by side (wrong idea vs right idea, before vs after) | 1/2 + 1/4 ≠ 2/6 vs = 3/4 | yes | C1 |
| `video` | Blender explainer on YouTube (unlisted), with poster + transcript, and a `scene` fallback when offline | 3D heart pumping | **no** (online only) | prompt 90 |
| `lottie` (optional, later) | Bundled vector animation ≤ 150 KB, played on tap | states of matter particles | yes | only when someone has one |

**Widget catalogue v1** (each widget is one reusable component; lessons only pass params):
`number_line`, `fraction_bars`, `function_graph` (sliders for named parameters; expressions parsed by a safe maths parser in `packages/core`, never `eval`), `geometry_shape` (drag vertices; live angles, area, perimeter), `angle`, `balance` (equations as a scale), `probability` (coins/dice/spinner, run N trials, chart the results), `motion_graph` (object moves, distance/speed–time graph draws alongside), `circuit` (series/parallel, bulb brightness). Adding a widget is a small code change, reused by every lesson after that.

**Pedagogy built in:** any `scene` or `widget` can carry a `predict` question (a practice item) asked *before* it plays: predict, observe, explain. `quick_check` follows a visual section. Kid presentation leans on `fraction_bars`, `number_line`, counting scenes and read-aloud captions; secondary leans on graphs, simulations and scenes.

### 7b.2 The stage (UI)
- A rounded panel tinted with a light wash of the subject hue, with a 2 px ink outline: the one place in the lesson where colour is strong. Aspect 16:10 (scenes, charts) or square (figures, widgets), max height 60 % of the viewport on phone.
- Controls under the stage, always visible: step dots (or a scrubber for 6+ steps), ◀ ▶, Play/Pause, Replay, Fullscreen, and a "Text version" toggle. Sticker style, ≥ 48 dp (56 for kid).
- Caption under the stage = the text for the current step, in the reading language; it changes with the step. Urdu captions use the Nastaliq metrics (§2.3) and the stage mirrors in RTL except graphs and number lines, which stay left-to-right like the textbook.
- Desktop/Chromebook ≥ 900: two-pane, stage sticky on the left (60 %), captions + text on the right; arrow keys step, Space plays.

### 7b.3 Diagram style (so every visual looks like one app)
C1, teachers and the importer follow these (`diagram` token):
- Strokes 2 px ink `#1B1A3A`, round caps; fills from subject hues; **meaning colours**: indigo = the quantity in focus, saffron = highlight (fill only, ink outline), green = correct/result, clay = wrong idea, grey `#77729A` = guides and axes.
- Labels: Nunito Bold 14 (Latin), Nastaliq 16 (Urdu); no text baked into raster images; every label is a separate text element with an id so both languages swap.
- Units always written (m/s, cm²). Graphs: light grid, axes in grey, data in indigo/saffron/green.

### 7b.4 Motion of lesson visuals ("content motion")
Lesson visuals are content, but they obey the same rules: **layers move by transform and opacity only**; widgets redraw geometry directly under the finger (drawing, not animation: no easing, no springs).

| Moment | Token | full | lite | off |
|---|---|---|---|---|
| Scene step | `sceneStep` | layers tween to the step's state, 220–900 ms ease-in-out (author sets `ms` ≤ 4000) | layers cross-fade, 120 ms | instant |
| Scene Play | `sceneStep` | auto-advances; pauses on the last step; **never autoplays on open or on scroll** | same, with cross-fades | no autoplay; Play steps once per tap |
| Chart reveal | `chartReveal` | series/bars grow from the baseline (scaleY from 0.6) + fade | fade | instant |
| Hotspot label | `hotspotReveal` | label pops (snappy) | fade | instant |
| Predict → reveal | `predictReveal` | answer chip fades, scene starts | fade | instant |
| Widget drag | — | follows the finger every frame | same | same (direct manipulation is never removed) |

Rules: any playback longer than 5 s has Pause (WCAG 2.2.2); a layer that flashes is not allowed (> 3 flashes/s); **exam items may only use static `figure` and `chart`** (no scenes, widgets or video in exams).

### 7b.5 Budgets (cheap 4 GB Chromebook, offline packs)
`visualBudget` token: SVG ≤ 60 KB and ≤ 400 elements per figure/scene; ≤ 12 layers moving at once; WebP ≤ 100 KB; Lottie ≤ 150 KB; ≤ 8 scene steps per block; widget redraw at 60 fps on the reference Chromebook in full tier, otherwise the device drops to lite. A chapter pack stays small because visuals are vector JSON (prompt 32 measures it).

### 7b.6 Accessibility and language
- Every visual block **requires** `alt` (en + ur) and a caption per step: the importer rejects a visual without them. "Text version" shows all of it as plain text for screen readers and low-end devices.
- Hotspot labels, chart labels, widget readouts are text (both languages), never pixels.
- Widgets have keyboard equivalents (arrow keys move the selected handle/slider by one step) and announce values ("slope m = 2").

### 7b.7 Security
SVG is markup, so the importer **sanitises** it: no `<script>`, event attributes, `foreignObject`, external `href`s or embedded raster data over budget. Sanitising lives in `packages/core/importer` and is unit-tested (prompt 21/33).

## 8. Voice and UX copy

Principles: say what happens; verbs on buttons ("Start test", not "OK"); errors = what happened + why + what to do, no blame; plain words; never "secure" or "locked" for exams (DECISIONS #17). Kid voice: short, warm, concrete.

| Moment | English (student) | Kid variant | Urdu |
|---|---|---|---|
| Student sign-in title | Sign in | Hello! Sign in | TODO: ur |
| Admission field / PIN | Admission number · PIN | same | TODO: ur |
| Wrong PIN | That PIN isn't right. Try again. | Oops, that PIN isn't right. | TODO: ur |
| No connection | No internet. Your work is saved here and will sync later. | No internet. Don't worry, your work is safe. | TODO: ur |
| Correct | Correct. | Yes! Well done. | TODO: ur |
| Wrong | Not quite. Here's why. | Not quite. Let's look. | TODO: ur |
| Follow-ups gate | New topics are paused until you clear your follow-ups. | Finish these first. Then you can go on. | TODO: ur |
| Relief | We unlocked this for you so you can keep learning. | same | TODO: ur |
| Prepare empty | All caught up. Pick a topic to keep learning. | All done! Pick something new. | TODO: ur |
| No class | You're not in a class yet. Ask your teacher to add you. | same | TODO: ur |
| Exam open | A test is open: {subject} | same | TODO: ur |
| Exam leave notice | Your teacher can see if you leave this screen. | same | TODO: ur |
| Submit confirm | Submit {n} of {total} answered? You can't change them after. | same | TODO: ur |
| Result pending | Your teacher will confirm marks. | same | TODO: ur |
| Sync states | Syncing · Saved · Waiting for internet · Couldn't sync, tap to retry | same | TODO: ur |
| Teacher: start | Start exam | | TODO: ur |
| Teacher: thin bank | Only {n} approved questions for {topic}. Pick another topic or lower the count. | | TODO: ur |
| Admin empty | No classes yet. Add one first. | | TODO: ur |

Urdu column is intentionally empty: teachers write it (DECISIONS #28), assisted by prompt C2.

## 9. Accessibility review (of this spec, WCAG 2.1 AA)

| Check | Result |
|---|---|
| 1.4.3 / 1.4.11 contrast | **Pass**, 48 pairs × 2 themes, script-verified. Found and fixed: `accent` on white is 2.03:1, so it is never used as a thin line or sole signal (labelled fills only). |
| 1.4.1 colour not sole signal | Spec'd: icon shapes + words for feedback, bands, live tiles |
| 1.4.4 / 1.4.12 text scale | Spec'd: no fixed-height text; Urdu uses `minHeight`; **test T-3** at 200 % |
| 2.1.1 / 2.4.7 keyboard + focus | Spec'd: 3 px ring, Tab order mirrors in RTL, option keys 1–4 |
| 2.2.1 timing | Exam time is teacher-set; extensions via teacher **Extend** (needs per-student extra time later: open item) |
| 2.3.3 / reduce motion | OS setting forces `off`; exam moments near-static |
| 2.5.5 target size | 56 / 48 / 44 dp by presentation, `hitSlop` for small visuals |
| 3.3.x errors, labels | Copy pattern in §8; every input has a visible label (placeholders are not labels) |
| 4.1.2 name, role, value | Primitives set `accessibilityRole/State/Label`; `FeedbackPanel` is an `alert`/live region; mosaic exposes "Maths: 7 of 12 concepts mastered, Learning" |
| Screen reader | **Unverified**: TalkBack on Android/ChromeOS and NVDA on web. Test: A-1 in `TEST_PLAN.md` |

## 10. How later sessions use this
- **02 (done):** tokens in `packages/core/src/design/`, providers (`ThemeProvider`, `MotionProvider`, `ExamMode`, `ToastProvider`), primitives in `apps/mobile/ui/`, `/dev/gallery` (en/ur × light/dark × full/lite/off/auto × kid/student/staff × exam). Moti dropped, Lucide icons copied (DECISIONS #41–#45).
- **01:** `app.json` needs no orientation lock; fonts: `@expo-google-fonts/nunito` + existing Nastaliq files.
- **All screens:** build from §7, add the empty/offline state, take screenshots in en + ur, light + dark, kid + student.
