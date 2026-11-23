/**
 * DRAFT design tokens for the Al-Syed app remake (session 00, v0.2 "Mosaic").
 * Spec and reasons: DESIGN_SYSTEM.md. Session 02 moves this to
 * apps/mobile/ui/tokens.ts (+ ui/motion.ts) and wires it to React.
 *
 * Rules baked in:
 *  - Pure data + pure functions. No React, no react-native imports, so it runs
 *    in Node and can move to packages/core if useful.
 *  - Colours are semantic roles with a light and a dark value. Every text/background
 *    pair is checked for WCAG AA by scripts/verify-design-tokens.mjs.
 *  - Motion animates transform + opacity only. No exceptions (the mastery ring became mosaic tiles in v0.2).
 *  - Urdu strings here are type SPECIMENS only, not product copy.
 */

// ───────────────────────────── 1. Colour ─────────────────────────────
// v0.2 "Mosaic" direction: fountain-pen ink, bright subject colours, tile patterns,
// chunky "sticker" controls with a hard ink shadow. See DESIGN_SYSTEM.md §1.

export type ColourRoles = {
  // surfaces
  bg: string; // app canvas
  surface: string; // cards, sheets
  surfaceAlt: string; // quiet fills, selected rows, skeleton
  border: string; // decorative dividers (no contrast requirement)
  borderStrong: string; // input / control boundary (≥ 3:1 vs bg and surface)
  ink: string; // hard 'sticker' shadow (both themes) and sticker outline in light; dark outlines use borderStrong
  // text
  text: string;
  textMuted: string; // secondary text (≥ 4.5:1 on bg, surface, surfaceAlt)
  // brand
  primary: string; // main action fill, links, focus; also text on bg/surface (≥ 4.5:1)
  onPrimary: string;
  primarySoft: string;
  onPrimarySoft: string;
  accent: string; // saffron FILL (stars, medals, "today" marker). Labelled in onAccent; never a thin line on white
  onAccent: string;
  accentSoft: string;
  onAccentSoft: string;
  // feedback (never colour alone: always paired with an icon + word)
  correct: string;
  correctSoft: string;
  onCorrectSoft: string;
  wrong: string; // clay, deliberately not alarm-red: wrong is information, not punishment
  wrongSoft: string;
  onWrongSoft: string;
  // mastery bands (3 bands, DECISIONS #26). mastered reuses `correct`.
  learning: string;
  learningSoft: string;
  onLearningSoft: string;
  weak: string;
  weakSoft: string;
  onWeakSoft: string;
  // misc
  focus: string; // keyboard focus ring: 3 px + 2 px offset
  scrim: string;
};

export const colours: { light: ColourRoles; dark: ColourRoles } = {
  light: {
    bg: '#F5F3FB',
    surface: '#FFFFFF',
    surfaceAlt: '#ECE9F6',
    border: '#DDD8EC',
    borderStrong: '#77729A',
    ink: '#1B1A3A',
    text: '#1B1A3A',
    textMuted: '#4F4B6E',
    primary: '#4434D4',
    onPrimary: '#FFFFFF',
    primarySoft: '#E6E2FF',
    onPrimarySoft: '#3326AA',
    accent: '#FFB627',
    onAccent: '#1B1A3A',
    accentSoft: '#FFF0CC',
    onAccentSoft: '#6E4600',
    correct: '#11865B',
    correctSoft: '#D9F5E8',
    onCorrectSoft: '#0B5E40',
    wrong: '#C2412D',
    wrongSoft: '#FFE3DC',
    onWrongSoft: '#8E2B1B',
    learning: '#1F6FD1',
    learningSoft: '#DDEBFF',
    onLearningSoft: '#174F96',
    weak: '#B35C00',
    weakSoft: '#FFE9CF',
    onWeakSoft: '#7A3F00',
    focus: '#4434D4',
    scrim: 'rgba(27, 26, 58, 0.5)',
  },
  dark: {
    bg: '#121230',
    surface: '#1D1C42',
    surfaceAlt: '#272652',
    border: '#34335E',
    borderStrong: '#8C88B5',
    ink: '#05051A',
    text: '#EFEEFF',
    textMuted: '#B4B1D6',
    primary: '#A79CFF',
    onPrimary: '#14123A',
    primarySoft: '#2D2870',
    onPrimarySoft: '#D4CEFF',
    accent: '#FFC34D',
    onAccent: '#1B1A3A',
    accentSoft: '#3D2F0E',
    onAccentSoft: '#FFD27A',
    correct: '#4FD8A0',
    correctSoft: '#103A2B',
    onCorrectSoft: '#9EF0CB',
    wrong: '#FF8C75',
    wrongSoft: '#43201A',
    onWrongSoft: '#FFB8A8',
    learning: '#7DB4FF',
    learningSoft: '#172F57',
    onLearningSoft: '#BBD7FF',
    weak: '#F5A65A',
    weakSoft: '#3F2711',
    onWeakSoft: '#FBC891',
    focus: '#A79CFF',
    scrim: 'rgba(0, 0, 0, 0.6)',
  },
};

/**
 * Subject hues: bright, light fills that ALWAYS carry `ink` text (contrast-checked).
 * Subjects are data (CLAUDE.md rule 1): a subject gets a hue from `subjects.colour_key`
 * if set, else by stable hash of its id into this list. Never hardcode subject → colour.
 */
export const subjectHues = {
  sky: { light: '#7CC4FF', dark: '#5AA8F0' },
  mint: { light: '#6EDDB3', dark: '#45C493' },
  coral: { light: '#FF9E8A', dark: '#F27E68' },
  sunflower: { light: '#FFD25E', dark: '#F2BD3A' },
  lilac: { light: '#C3B0FF', dark: '#A792F5' },
  lagoon: { light: '#5ED1D6', dark: '#3DB7BD' },
  rose: { light: '#FFA8C8', dark: '#F288B0' },
  lime: { light: '#B8E26A', dark: '#9CCB4A' },
} as const;
export type SubjectHue = keyof typeof subjectHues;

export function hueForSubject(subjectId: string, colourKey?: string | null): SubjectHue {
  const keys = Object.keys(subjectHues) as SubjectHue[];
  if (colourKey && (keys as string[]).includes(colourKey)) return colourKey as SubjectHue;
  let h = 0;
  for (let i = 0; i < subjectId.length; i++) h = (h * 31 + subjectId.charCodeAt(i)) >>> 0;
  return keys[h % keys.length];
}

/**
 * Tile patterns (Mughal / Lahore-fort girih inspired), drawn with react-native-svg as a
 * repeating 48 dp tile at low opacity over a subject hue. Used ONLY on header bands,
 * subject cards and celebrations. Never behind running text, never on exam screens.
 */
export const patterns = {
  star8: { tile: 48, opacity: { light: 0.22, dark: 0.18 } }, // khatam: 8-point star
  hexFlower: { tile: 48, opacity: { light: 0.2, dark: 0.16 } },
  chevron: { tile: 32, opacity: { light: 0.18, dark: 0.14 } },
} as const;

export type MasteryBand = 'learning' | 'weak' | 'mastered';

/** Which colour roles draw a mastery band. Shape + label are mandatory too (DESIGN_SYSTEM.md §2.4). */
export const masteryRoles: Record<MasteryBand, { fill: keyof ColourRoles; soft: keyof ColourRoles; onSoft: keyof ColourRoles }> = {
  learning: { fill: 'learning', soft: 'learningSoft', onSoft: 'onLearningSoft' },
  weak: { fill: 'weak', soft: 'weakSoft', onSoft: 'onWeakSoft' },
  mastered: { fill: 'correct', soft: 'correctSoft', onSoft: 'onCorrectSoft' },
};

/**
 * Text/background pairs that MUST meet WCAG AA. Checked by scripts/verify-design-tokens.mjs.
 * min 4.5 = normal text, 3 = large text (≥ 24 sp, or ≥ 18.66 sp bold) or non-text UI.
 * Subject hues are checked separately: `ink` on every hue ≥ 4.5 in both themes.
 */
export const contrastPairs: ReadonlyArray<{ fg: keyof ColourRoles; bg: keyof ColourRoles; min: 3 | 4.5; why: string }> = [
  { fg: 'text', bg: 'bg', min: 4.5, why: 'body on canvas' },
  { fg: 'text', bg: 'surface', min: 4.5, why: 'body on card' },
  { fg: 'text', bg: 'surfaceAlt', min: 4.5, why: 'body on quiet fill' },
  { fg: 'textMuted', bg: 'bg', min: 4.5, why: 'secondary on canvas' },
  { fg: 'textMuted', bg: 'surface', min: 4.5, why: 'secondary on card' },
  { fg: 'textMuted', bg: 'surfaceAlt', min: 4.5, why: 'secondary on quiet fill' },
  { fg: 'primary', bg: 'bg', min: 4.5, why: 'link / text button on canvas' },
  { fg: 'primary', bg: 'surface', min: 4.5, why: 'link / text button on card' },
  { fg: 'onPrimary', bg: 'primary', min: 4.5, why: 'primary button label' },
  { fg: 'onPrimarySoft', bg: 'primarySoft', min: 4.5, why: 'selected chip / tab' },
  { fg: 'onAccent', bg: 'accent', min: 4.5, why: 'label on accent fill' },
  { fg: 'onAccentSoft', bg: 'accentSoft', min: 4.5, why: 'highlight banner' },
  { fg: 'onCorrectSoft', bg: 'correctSoft', min: 4.5, why: 'correct feedback text' },
  { fg: 'onWrongSoft', bg: 'wrongSoft', min: 4.5, why: 'why-wrong feedback text' },
  { fg: 'onLearningSoft', bg: 'learningSoft', min: 4.5, why: 'learning band label' },
  { fg: 'onWeakSoft', bg: 'weakSoft', min: 4.5, why: 'weak band label' },
  // non-text (1.4.11)
  { fg: 'borderStrong', bg: 'bg', min: 3, why: 'input boundary on canvas' },
  { fg: 'borderStrong', bg: 'surface', min: 3, why: 'input boundary on card' },
  { fg: 'focus', bg: 'bg', min: 3, why: 'focus ring' },
  { fg: 'focus', bg: 'surface', min: 3, why: 'focus ring on card' },
  { fg: 'correct', bg: 'surface', min: 3, why: 'mastered tile / check icon' },
  { fg: 'wrong', bg: 'surface', min: 3, why: 'wrong icon' },
  { fg: 'learning', bg: 'surface', min: 3, why: 'learning band icon' },
  { fg: 'weak', bg: 'surface', min: 3, why: 'weak band icon' },
];

// ───────────────────────────── 2. Space, radius, elevation ─────────────────────────────

/** 4-pt grid. Names are by size, not by use. */
export const space = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16, // phone screen gutter
  xl: 24, // tablet / Chromebook gutter, section gap
  xxl: 32,
  huge: 48,
  giant: 64,
} as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 24, full: 9999 } as const;

/**
 * Two shadow families.
 * - `sticker*`: hard, unblurred offset shadow in `ink` on things you can press (buttons, option
 *   buttons, subject cards). Pressing translates the element down INTO its shadow (transform only).
 * - soft (`card`, `overlay`): passive surfaces and sheets. Dark mode drops soft shadows for a border.
 */
export const elevation = {
  flat: { light: 'none', dark: 'none' },
  stickerSm: { light: '0 2px 0 #1B1A3A', dark: '0 2px 0 #05051A' },
  sticker: { light: '0 4px 0 #1B1A3A', dark: '0 4px 0 #05051A' },
  card: { light: '0 1px 3px rgba(27, 26, 58, 0.10)', dark: 'none' },
  overlay: { light: '0 12px 32px rgba(27, 26, 58, 0.24)', dark: 'none' },
} as const;
/** Press = translateY by the shadow depth so the sticker "clicks" down. */
export const stickerPressDepth = { stickerSm: 2, sticker: 4 } as const;
export const strokeWidth = { hairline: 1, control: 2, sticker: 2 } as const;

// ───────────────────────────── 3. Type ─────────────────────────────

/**
 * Bundled font families (no CDN; npm @expo-google-fonts/* TTFs on native, WOFF2 subsets on web).
 * Display: Baloo 2 (OFL, by Ek Type, made for South Asian scripts): chunky, warm, not babyish.
 *   Used for display/title/heading and numbers that matter (scores, timer). Body: Nunito.
 * Urdu: Noto Nastaliq Urdu (already in assets/fonts) for every step, including display.
 */
export const fontFamily = {
  display: { semibold: 'Baloo2-SemiBold', bold: 'Baloo2-Bold', extrabold: 'Baloo2-ExtraBold' },
  latin: { regular: 'Nunito-Regular', semibold: 'Nunito-SemiBold', bold: 'Nunito-Bold' },
  urdu: { regular: 'NotoNastaliqUrdu-Regular', semibold: 'NotoNastaliqUrdu-Bold', bold: 'NotoNastaliqUrdu-Bold' },
} as const;

export type TypeStep = 'display' | 'title' | 'heading' | 'body' | 'bodySm' | 'caption' | 'label';
export type Script = 'latin' | 'urdu';
export type TextMetrics = { size: number; lineHeight: number; weight: 'regular' | 'semibold' | 'bold' | 'extrabold'; family?: 'display' | 'body' };

/**
 * Sizes in sp at presentation "student". The "kid" and "staff" presentations scale these (see `presentations`).
 * Urdu sizes are ~12 % larger (Nastaliq's x-height is small) and line-heights are 2.0–2.2× because
 * Nastaliq stacks tall diagonal strokes and diacritics. Line-heights below are STARTING VALUES:
 * unverified until test T-1 (DESIGN_SYSTEM.md §2.3) is run on a phone, a Chromebook and Chrome.
 */
export const typeScale: Record<Script, Record<TypeStep, TextMetrics>> = {
  latin: {
    display: { size: 36, lineHeight: 42, weight: 'extrabold', family: 'display' }, // Baloo 2
    title: { size: 26, lineHeight: 32, weight: 'bold', family: 'display' },
    heading: { size: 20, lineHeight: 26, weight: 'semibold', family: 'display' },
    body: { size: 16, lineHeight: 24, weight: 'regular' },
    bodySm: { size: 14, lineHeight: 20, weight: 'regular' },
    caption: { size: 12, lineHeight: 16, weight: 'regular' },
    label: { size: 15, lineHeight: 20, weight: 'bold' }, // buttons, tabs, chips (Nunito Bold)
  },
  urdu: {
    display: { size: 36, lineHeight: 70, weight: 'bold' }, // ≈1.94
    title: { size: 27, lineHeight: 54, weight: 'bold' }, // 2.0
    heading: { size: 22, lineHeight: 46, weight: 'semibold' }, // ≈2.1
    body: { size: 18, lineHeight: 40, weight: 'regular' }, // ≈2.2
    bodySm: { size: 16, lineHeight: 36, weight: 'regular' }, // 2.25
    caption: { size: 14, lineHeight: 30, weight: 'regular' }, // ≈2.15
    label: { size: 17, lineHeight: 34, weight: 'semibold' }, // single-line control label
  },
};

/** Urdu rules the Text primitive must enforce. */
export const urduTextRules = {
  letterSpacing: 0, // never track Nastaliq: it breaks joins
  italic: false, // never synthesise italic
  uppercase: false,
  minLineHeightRatio: 1.9,
  /** Single-line controls must grow with the line box: use minHeight + vertical padding, never a fixed height. */
  controlsUseMinHeight: true,
  /** Android: avoid top/bottom clipping of tall glyphs. */
  androidIncludeFontPadding: false,
  /** Digits: Western 0–9 in both languages (maths consistency with textbooks). Open question #Q2. */
  digits: 'western',
  /** Maths, numbers with units and Latin runs are isolated LTR inside RTL text (U+2066 … U+2069). */
  isolateLtrRuns: true,
} as const;

/** Type specimens for the gallery (NOT product copy; Hassan/teachers write real Urdu, CLAUDE.md). */
export const urduSpecimens = [
  { id: 'joins', text: 'پڑھائی کا وقت', note: 'common joins, ڑ, ھ' },
  { id: 'diacritics', text: 'اُستاد نے سَبَق سمجھایا', note: 'zabar / zer / pesh: tallest stacks, check clipping' },
  { id: 'mixed', text: 'ٹیسٹ میں 8/10 نمبر', note: 'Latin digits + loanword, LTR isolation' },
  { id: 'long', text: 'آج ہم کسر کی پہچان اور ان کا آپس میں موازنہ سیکھیں گے۔', note: 'wrapping across 2–3 lines at body size' },
] as const;

// ───────────────────────────── 4. Presentations (age + surface) ─────────────────────────────

/**
 * Same components, three presentations. Chosen from classes.grade_level of the learner's
 * active enrollment (PG = 0 or lower, 1–5 → kid, 6–10 → student); staff surfaces always use "staff".
 * No class (Play Store prep-only users) → "student", or the grade they pick at onboarding.
 */
export type PresentationId = 'kid' | 'student' | 'staff';

export const presentations: Record<
  PresentationId,
  {
    fontScale: number; // multiplies typeScale sizes AND line-heights (keep Urdu ratios)
    minTarget: number; // dp; Android guideline is 48
    controlHeight: number; // default button/field height
    radiusBoost: number; // added to radius.* for friendlier corners
    gutter: number;
    iconSize: number;
    labelWithIcon: boolean; // icon-only controls are never allowed for kid
    maxCopyWords: number; // guidance for UX copy: question prompts, helper text
    readAloud: boolean; // speaker button on prompts (expo-speech; Urdu voice unverified)
    celebration: 'big' | 'small'; // full-tier celebration size
    density: 'airy' | 'comfortable' | 'dense';
  }
> = {
  kid: { fontScale: 1.15, minTarget: 56, controlHeight: 60, radiusBoost: 4, gutter: 20, iconSize: 32, labelWithIcon: true, maxCopyWords: 8, readAloud: true, celebration: 'big', density: 'airy' },
  student: { fontScale: 1, minTarget: 48, controlHeight: 52, radiusBoost: 0, gutter: 16, iconSize: 24, labelWithIcon: false, maxCopyWords: 16, readAloud: false, celebration: 'small', density: 'comfortable' },
  staff: { fontScale: 1, minTarget: 44, controlHeight: 40, radiusBoost: 0, gutter: 24, iconSize: 20, labelWithIcon: false, maxCopyWords: 24, readAloud: false, celebration: 'small', density: 'dense' },
};

export function presentationForGrade(gradeLevel: number | null | undefined): PresentationId {
  if (gradeLevel == null) return 'student';
  return gradeLevel <= 5 ? 'kid' : 'student';
}

/** Layout breakpoints (dp / CSS px). Two-pane from `tablet`. */
export const breakpoints = { phone: 0, tablet: 600, desktop: 900, wide: 1280 } as const;

// ───────────────────────────── 5. Motion ─────────────────────────────

export type MotionTier = 'full' | 'lite' | 'off';

/** ARCHITECTURE §6b durations. */
export const duration = { instant: 0, fast: 120, base: 220, slow: 360 } as const;

/**
 * Spring presets in the classic damping/stiffness/mass form, which works in Reanimated 3 and 4.
 * (Reanimated 4's duration/dampingRatio form may replace these in session 02 if the SDK ships v4.)
 */
export const spring = {
  gentle: { damping: 22, stiffness: 170, mass: 1 }, // settle, no overshoot
  snappy: { damping: 18, stiffness: 320, mass: 0.9 }, // small overshoot, quick
  bouncy: { damping: 11, stiffness: 260, mass: 0.9 }, // visible bounce: celebration, kid band only
} as const;

/** Easing curves as cubic-bezier control points; build with Easing.bezier(...) in the app. */
export const easing = {
  out: [0.23, 1, 0.32, 1],
  inOut: [0.77, 0, 0.175, 1],
  linear: [0, 0, 1, 1],
} as const;

export type SpringName = keyof typeof spring;
export type DurationName = keyof typeof duration;
export type AnimProp = 'opacity' | 'translateX' | 'translateY' | 'scale' | 'rotate';

/** What one tier does for one moment. `none` = state changes instantly (colour/icon still change). */
export type Behaviour =
  | { kind: 'none' }
  | { kind: 'timing'; duration: DurationName; ease: keyof typeof easing; props: AnimProp[] }
  | { kind: 'spring'; spring: SpringName; props: AnimProp[] }
  | { kind: 'lottie'; asset: string; maxMs: number };

export type Moment = {
  purpose: 'feedback' | 'state' | 'hierarchy' | 'progress' | 'sync' | 'explanation' | 'delight';
  frequency: 'often' | 'occasional' | 'rare';
  haptic?: 'selection' | 'light' | 'success' | 'none';
  /** Whether the moment runs inside an exam. Only the two exam moments do. */
  examSafe?: boolean;
  /** Slide moments mirror under RTL (translateX sign flips). */
  rtlFlip?: boolean;
  full: Behaviour;
  lite: Behaviour;
  off: Behaviour;
};

const none: Behaviour = { kind: 'none' };
const fade = (d: DurationName): Behaviour => ({ kind: 'timing', duration: d, ease: 'out', props: ['opacity'] });

/**
 * Every motion moment in the app. If a moment is not in this table it does not animate.
 * Table with rationale: DESIGN_SYSTEM.md §6.
 */
export const moments = {
  // Navigation: native stack does the work; we only choose fade vs platform slide.
  screenPush: { purpose: 'hierarchy', frequency: 'often', rtlFlip: true, full: { kind: 'timing', duration: 'slow', ease: 'inOut', props: ['translateX', 'opacity'] }, lite: fade('fast'), off: none },
  tabSwitch: { purpose: 'hierarchy', frequency: 'often', full: none, lite: none, off: none }, // tabs are peers: never slide
  sheetPresent: { purpose: 'hierarchy', frequency: 'occasional', full: { kind: 'spring', spring: 'gentle', props: ['translateY', 'opacity'] }, lite: fade('fast'), off: none },
  press: { purpose: 'feedback', frequency: 'often', haptic: 'none', full: { kind: 'timing', duration: 'fast', ease: 'out', props: ['translateY'] }, lite: fade('fast'), off: none }, // sticker sinks into its shadow (stickerPressDepth)
  selectionChange: { purpose: 'state', frequency: 'often', haptic: 'selection', full: fade('fast'), lite: fade('fast'), off: none },

  // Answer feedback (practice, diagnostic, follow-up). Not used in exams.
  answerCorrect: { purpose: 'feedback', frequency: 'often', haptic: 'success', full: { kind: 'spring', spring: 'snappy', props: ['scale', 'opacity'] }, lite: fade('fast'), off: none },
  answerWrong: { purpose: 'feedback', frequency: 'often', haptic: 'light', full: fade('base'), lite: fade('fast'), off: none }, // no shake: wrong is information, not a penalty
  whyWrongReveal: { purpose: 'explanation', frequency: 'often', full: { kind: 'spring', spring: 'gentle', props: ['translateY', 'opacity'] }, lite: fade('base'), off: none },

  // Progress
  mosaicTileSet: { purpose: 'progress', frequency: 'occasional', haptic: 'light', full: { kind: 'spring', spring: 'snappy', props: ['scale', 'opacity'] }, lite: fade('base'), off: none }, // a mastered concept's tile drops into the subject mosaic
  masteryBandUp: { purpose: 'progress', frequency: 'rare', haptic: 'light', full: { kind: 'spring', spring: 'snappy', props: ['scale'] }, lite: fade('base'), off: none },
  progressBar: { purpose: 'progress', frequency: 'often', full: { kind: 'timing', duration: 'base', ease: 'out', props: ['translateX'] }, lite: fade('fast'), off: none }, // fill slides inside an overflow-hidden track
  followUpCleared: { purpose: 'progress', frequency: 'occasional', haptic: 'success', full: { kind: 'spring', spring: 'snappy', props: ['scale', 'opacity', 'translateX'] }, lite: fade('base'), off: none },
  gateUnlocked: { purpose: 'progress', frequency: 'rare', haptic: 'success', full: { kind: 'spring', spring: 'gentle', props: ['scale', 'opacity'] }, lite: fade('base'), off: none },

  // System state
  syncSyncing: { purpose: 'sync', frequency: 'often', full: { kind: 'timing', duration: 'slow', ease: 'linear', props: ['opacity'] }, lite: none, off: none }, // slow pulse, max 10 s, only while syncing
  syncDone: { purpose: 'sync', frequency: 'often', full: fade('fast'), lite: fade('fast'), off: none },
  bannerEnter: { purpose: 'sync', frequency: 'occasional', rtlFlip: false, full: { kind: 'spring', spring: 'gentle', props: ['translateY', 'opacity'] }, lite: fade('fast'), off: none },
  toast: { purpose: 'feedback', frequency: 'occasional', full: { kind: 'spring', spring: 'gentle', props: ['translateY', 'opacity'] }, lite: fade('fast'), off: none },
  emptyState: { purpose: 'state', frequency: 'occasional', full: { kind: 'timing', duration: 'base', ease: 'out', props: ['translateY', 'opacity'] }, lite: fade('base'), off: none },
  skeleton: { purpose: 'state', frequency: 'often', full: { kind: 'timing', duration: 'slow', ease: 'linear', props: ['opacity'] }, lite: none, off: none },

  // Delight (rare tier only)
  celebrationMastery: { purpose: 'delight', frequency: 'rare', haptic: 'success', full: { kind: 'lottie', asset: 'celebrate-burst', maxMs: 1500 }, lite: { kind: 'spring', spring: 'gentle', props: ['scale', 'opacity'] }, off: none },
  celebrationKid: { purpose: 'delight', frequency: 'rare', haptic: 'success', full: { kind: 'spring', spring: 'bouncy', props: ['scale', 'opacity'] }, lite: fade('base'), off: none },

  // Exam: identical in every tier. Nothing else moves.
  examTimerTick: { purpose: 'state', frequency: 'often', examSafe: true, full: none, lite: none, off: none }, // digits change; no tween
  examSaveIndicator: { purpose: 'sync', frequency: 'often', examSafe: true, full: fade('fast'), lite: fade('fast'), off: none }, // dot/check cross-fade

  // Teacher live view (web, staff presentation: lite default)
  liveTileStatus: { purpose: 'state', frequency: 'often', full: fade('fast'), lite: fade('fast'), off: none },
  liveEventRow: { purpose: 'state', frequency: 'often', full: fade('base'), lite: fade('fast'), off: none },
} as const satisfies Record<string, Moment>;

export type MomentName = keyof typeof moments;

/** Moments allowed while an exam screen is mounted. Everything else resolves to `none`. */
export const examAllowedMoments: ReadonlyArray<MomentName> = ['examTimerTick', 'examSaveIndicator'];

/**
 * Pick the tier. Pure, so it can be unit-tested in packages/core (session 02).
 * User choice wins over auto-detect, except OS reduce-motion always forces `off`.
 */
export function pickMotionTier(input: {
  osReduceMotion: boolean;
  userChoice?: MotionTier | 'auto';
  deviceMemoryGb?: number; // navigator.deviceMemory on web; native RAM via expo-device
  isLowEndGpuOrDroppingFrames?: boolean; // from a frame-drop sampler
  surface?: 'student' | 'staff';
}): MotionTier {
  if (input.osReduceMotion) return 'off';
  if (input.userChoice && input.userChoice !== 'auto') return input.userChoice;
  if (input.isLowEndGpuOrDroppingFrames) return 'lite';
  if (input.deviceMemoryGb !== undefined && input.deviceMemoryGb <= 4) return 'lite';
  if (input.surface === 'staff') return 'lite';
  return 'full';
}

/** What a component should actually do right now. */
export function resolveMoment(name: MomentName, tier: MotionTier, ctx: { inExam?: boolean } = {}): Behaviour {
  if (ctx.inExam && !examAllowedMoments.includes(name)) return { kind: 'none' };
  const m: Moment = moments[name];
  return m[tier];
}
