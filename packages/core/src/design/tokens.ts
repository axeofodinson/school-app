/**
 * Design tokens for the Al-Syed app (v0.2 "Mosaic", DESIGN_SYSTEM.md).
 * Moved here from docs/design/tokens.draft.ts in session 02. The app reads them
 * through apps/mobile/ui/tokens.ts; nothing else may define a colour, size or radius.
 *
 * Rules baked in:
 *  - Pure data + pure functions. No React, no react-native imports, so it runs
 *    in Node and is unit-tested (packages/core/test/design-*.test.ts).
 *  - Colours are semantic roles with a light and a dark value. Every text/background
 *    pair is checked for WCAG AA by test/design-tokens.test.ts.
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
  return keys[h % keys.length] ?? keys[0]!;
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

/**
 * Diagram style for lesson visuals (DESIGN_SYSTEM.md §7b.3). C1, teachers and the importer use these,
 * so every figure, scene, chart and widget looks like one app. Strokes must be ≥ 3:1 on white (checked).
 */
export const diagram = {
  strokeWidth: 2,
  ink: '#1B1A3A',
  focus: '#4434D4', // the quantity in focus
  highlight: '#FFB627', // fill only, always with an ink outline
  result: '#11865B', // correct / result
  wrongIdea: '#C2412D', // misconception panels
  guide: '#77729A', // axes, guides, grid labels
  grid: '#DDD8EC', // faint grid lines (decorative)
  labelFont: {
    latin: { family: 'Nunito-Bold', size: 14 },
    urdu: { family: 'NotoNastaliqUrdu-Regular', size: 16 },
  },
  stageAspect: { wide: 16 / 10, square: 1 },
  stageMaxViewportShare: 0.6,
} as const;

/** Size/complexity budgets for lesson visuals (§7b.5). The importer enforces them. */
export const visualBudget = {
  svgMaxKb: 60,
  svgMaxElements: 400,
  maxMovingLayers: 12,
  imageMaxKb: 100,
  lottieMaxKb: 150,
  maxSceneSteps: 8,
  stepMaxMs: 4000,
  pauseRequiredAfterMs: 5000, // WCAG 2.2.2
} as const;

/** Lesson visual block types (§7b.1) and the widget catalogue v1. Exam items may use only `examSafeVisuals`. */
export const visualBlockTypes = [
  'figure',
  'scene',
  'chart',
  'widget',
  'compare',
  'video',
  'lottie',
] as const;
export const widgetCatalogue = [
  'number_line',
  'fraction_bars',
  'function_graph',
  'geometry_shape',
  'angle',
  'balance',
  'probability',
  'motion_graph',
  'circuit',
] as const;
export const examSafeVisuals: ReadonlyArray<(typeof visualBlockTypes)[number]> = [
  'figure',
  'chart',
];

export type MasteryBand = 'learning' | 'weak' | 'mastered';

/** Which colour roles draw a mastery band. Shape + label are mandatory too (DESIGN_SYSTEM.md §2.4). */
export const masteryRoles: Record<
  MasteryBand,
  { fill: keyof ColourRoles; soft: keyof ColourRoles; onSoft: keyof ColourRoles }
> = {
  learning: { fill: 'learning', soft: 'learningSoft', onSoft: 'onLearningSoft' },
  weak: { fill: 'weak', soft: 'weakSoft', onSoft: 'onWeakSoft' },
  mastered: { fill: 'correct', soft: 'correctSoft', onSoft: 'onCorrectSoft' },
};

/**
 * Text/background pairs that MUST meet WCAG AA. Checked by test/design-tokens.test.ts.
 * min 4.5 = normal text, 3 = large text (≥ 24 sp, or ≥ 18.66 sp bold) or non-text UI.
 * Subject hues are checked separately: `ink` on every hue ≥ 4.5 in both themes.
 */
export const contrastPairs: ReadonlyArray<{
  fg: keyof ColourRoles;
  bg: keyof ColourRoles;
  min: 3 | 4.5;
  why: string;
}> = [
  { fg: 'text', bg: 'bg', min: 4.5, why: 'body on canvas' },
  { fg: 'text', bg: 'surface', min: 4.5, why: 'body on card' },
  { fg: 'text', bg: 'surfaceAlt', min: 4.5, why: 'body on quiet fill' },
  { fg: 'textMuted', bg: 'bg', min: 4.5, why: 'secondary on canvas' },
  { fg: 'textMuted', bg: 'surface', min: 4.5, why: 'secondary on card' },
  { fg: 'textMuted', bg: 'surfaceAlt', min: 4.5, why: 'secondary on quiet fill' },
  { fg: 'primary', bg: 'bg', min: 4.5, why: 'link / text button on canvas' },
  { fg: 'primary', bg: 'surface', min: 4.5, why: 'link / text button on card' },
  { fg: 'onPrimary', bg: 'primary', min: 4.5, why: 'primary button label' },
  { fg: 'onPrimary', bg: 'wrong', min: 4.5, why: 'danger button label' },
  { fg: 'onPrimarySoft', bg: 'primarySoft', min: 4.5, why: 'selected chip / tab' },
  { fg: 'onAccent', bg: 'accent', min: 4.5, why: 'label on accent fill' },
  { fg: 'onAccentSoft', bg: 'accentSoft', min: 4.5, why: 'highlight banner' },
  { fg: 'onCorrectSoft', bg: 'correctSoft', min: 4.5, why: 'correct feedback text' },
  { fg: 'onWrongSoft', bg: 'wrongSoft', min: 4.5, why: 'why-wrong feedback text' },
  { fg: 'onWrongSoft', bg: 'bg', min: 4.5, why: 'field error text on canvas' },
  { fg: 'onWrongSoft', bg: 'surface', min: 4.5, why: 'field error text on card' },
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
  urdu: {
    regular: 'NotoNastaliqUrdu-Regular',
    semibold: 'NotoNastaliqUrdu-Bold',
    bold: 'NotoNastaliqUrdu-Bold',
  },
} as const;

export type TypeStep = 'display' | 'title' | 'heading' | 'body' | 'bodySm' | 'caption' | 'label';
export type Script = 'latin' | 'urdu';
export type TextMetrics = {
  size: number;
  lineHeight: number;
  weight: 'regular' | 'semibold' | 'bold' | 'extrabold';
  family?: 'display' | 'body';
};

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
  /** Digits: Western 0–9 in both languages (maths consistency with textbooks). Decided by Hassan (DECISIONS #37). */
  digits: 'western',
  /** Maths, numbers with units and Latin runs are isolated LTR inside RTL text (U+2066 … U+2069). */
  isolateLtrRuns: true,
} as const;

/** Type specimens for the gallery (NOT product copy; Hassan/teachers write real Urdu, CLAUDE.md). */
export const urduSpecimens = [
  { id: 'joins', text: 'پڑھائی کا وقت', note: 'common joins, ڑ, ھ' },
  {
    id: 'diacritics',
    text: 'اُستاد نے سَبَق سمجھایا',
    note: 'zabar / zer / pesh: tallest stacks, check clipping',
  },
  { id: 'mixed', text: 'ٹیسٹ میں 8/10 نمبر', note: 'Latin digits + loanword, LTR isolation' },
  {
    id: 'long',
    text: 'آج ہم کسر کی پہچان اور ان کا آپس میں موازنہ سیکھیں گے۔',
    note: 'wrapping across 2–3 lines at body size',
  },
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
  kid: {
    fontScale: 1.15,
    minTarget: 56,
    controlHeight: 60,
    radiusBoost: 4,
    gutter: 20,
    iconSize: 32,
    labelWithIcon: true,
    maxCopyWords: 8,
    readAloud: true,
    celebration: 'big',
    density: 'airy',
  },
  student: {
    fontScale: 1,
    minTarget: 48,
    controlHeight: 52,
    radiusBoost: 0,
    gutter: 16,
    iconSize: 24,
    labelWithIcon: false,
    maxCopyWords: 16,
    readAloud: false,
    celebration: 'small',
    density: 'comfortable',
  },
  staff: {
    fontScale: 1,
    minTarget: 44,
    controlHeight: 40,
    radiusBoost: 0,
    gutter: 24,
    iconSize: 20,
    labelWithIcon: false,
    maxCopyWords: 24,
    readAloud: false,
    celebration: 'small',
    density: 'dense',
  },
};

export function presentationForGrade(gradeLevel: number | null | undefined): PresentationId {
  if (gradeLevel == null) return 'student';
  return gradeLevel <= 5 ? 'kid' : 'student';
}

/** Layout breakpoints (dp / CSS px). Two-pane from `desktop` (DESIGN_SYSTEM.md §5). */
export const breakpoints = { phone: 0, tablet: 600, desktop: 900, wide: 1280 } as const;

/** Gutter and content width per breakpoint (DESIGN_SYSTEM.md §2.2, §5). */
export const layout = {
  gutter: { phone: 16, tablet: 24, desktop: 24, wide: 24 },
  maxContentWidth: { phone: 600, tablet: 680, desktop: 1120, wide: 1120 },
  /** List pane of `TwoPane` on desktop: 360–420 wide. */
  listPane: { min: 360, max: 420 },
} as const;

// ───────────────────────────── 5. Pure helpers ─────────────────────────────

export type Breakpoint = keyof typeof breakpoints;

/** Which breakpoint a window width falls in. */
export function breakpointFor(width: number): Breakpoint {
  if (width >= breakpoints.wide) return 'wide';
  if (width >= breakpoints.desktop) return 'desktop';
  if (width >= breakpoints.tablet) return 'tablet';
  return 'phone';
}

/** Layout decisions for a window width + presentation. Kid gutter wins on phone (20). */
export function layoutFor(width: number, presentation: PresentationId) {
  const bp = breakpointFor(width);
  const gutter = bp === 'phone' ? presentations[presentation].gutter : layout.gutter[bp];
  return {
    breakpoint: bp,
    gutter,
    maxContentWidth: layout.maxContentWidth[bp],
    twoPane: bp === 'desktop' || bp === 'wide',
    /** Tabs: bottom bar below desktop, side rail from desktop. */
    navigation: bp === 'desktop' || bp === 'wide' ? ('rail' as const) : ('bar' as const),
  };
}

// Arabic-script blocks (Urdu lives here). Built from code points so the source has no
// invisible characters and no \p{} escapes (Hermes support varies).
const ARABIC_RANGES: ReadonlyArray<[number, number]> = [
  [0x0600, 0x06ff],
  [0x0750, 0x077f],
  [0x08a0, 0x08ff],
  [0xfb50, 0xfdff],
  [0xfe70, 0xfefc],
];
const ARABIC_SCRIPT = new RegExp(
  `[${ARABIC_RANGES.map(([a, b]) => `${String.fromCharCode(a)}-${String.fromCharCode(b)}`).join('')}]`,
);

/** 'urdu' if the text contains any Arabic-script letter, else 'latin'. */
export function scriptOf(text: string): Script {
  return ARABIC_SCRIPT.test(text) ? 'urdu' : 'latin';
}

const LRI = String.fromCharCode(0x2066); // LEFT-TO-RIGHT ISOLATE
const PDI = String.fromCharCode(0x2069); // POP DIRECTIONAL ISOLATE
/**
 * A Latin/number run: starts with a Latin letter or Western digit (optionally after a
 * minus sign, opening bracket or decimal point); may continue over
 * maths symbols, slashes, dots and single spaces, and ends on a letter, digit, ², ³, % or ).
 * So "8/10", "x + 2 = 5" and "5 cm" stay one LTR unit inside Urdu.
 */
const LTR_RUN =
  /(?:[-−(.](?=[A-Za-z0-9]))?[A-Za-z0-9](?:[A-Za-z0-9²³%+\-−=×÷^/.,:()<>≤≥ ]*[A-Za-z0-9²³%)])?/g;

/** Wrap Latin/number runs inside Urdu text in Unicode isolates so they never reorder. */
/** Unicode isolate marks used by isolateLtrRuns. */
export const BIDI = { LRI, PDI } as const;

export function isolateLtrRuns(text: string): string {
  if (!urduTextRules.isolateLtrRuns || text.includes(LRI) || scriptOf(text) === 'latin')
    return text;
  return text.replace(LTR_RUN, (run) => `${LRI}${run}${PDI}`);
}

export type ResolvedText = {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
};

/**
 * Concrete font, size and line-height for a step, script and presentation.
 * Presentation scale multiplies size AND line-height, so Urdu keeps its ratio.
 */
export function textMetrics(
  step: TypeStep,
  script: Script,
  presentation: PresentationId,
): ResolvedText {
  const m = typeScale[script][step];
  const scale = presentations[presentation].fontScale;
  const family =
    script === 'urdu'
      ? fontFamily.urdu[m.weight === 'regular' ? 'regular' : 'bold']
      : m.family === 'display'
        ? fontFamily.display[m.weight === 'regular' ? 'semibold' : m.weight]
        : fontFamily.latin[m.weight === 'extrabold' ? 'bold' : m.weight];
  return {
    fontFamily: family,
    fontSize: Math.round(m.size * scale),
    lineHeight: Math.round(m.lineHeight * scale),
  };
}

/** WCAG 2.1 contrast ratio of two #RRGGBB colours. */
export function contrastRatio(a: string, b: string): number {
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const lum = (hex: string) => {
    const n = parseInt(hex.slice(1, 7), 16);
    return (
      0.2126 * lin((n >> 16) / 255) +
      0.7152 * lin(((n >> 8) & 255) / 255) +
      0.0722 * lin((n & 255) / 255)
    );
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

/** Radius for a presentation (kid adds +4 to every non-capsule radius). */
export function radiusFor(name: keyof typeof radius, presentation: PresentationId): number {
  return name === 'full' ? radius.full : radius[name] + presentations[presentation].radiusBoost;
}
