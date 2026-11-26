// The Learn reader's model (prompt 30, DESIGN_SYSTEM.md §7.3 + §7b,
// DATABASE_DESIGN.md §4). A lesson is a stored array of blocks
// (`learning_content_versions.blocks`); this turns it into what the reader
// shows: objectives, then SECTIONS, each a visual on the stage with a short
// caption, the longer text under "Explain more", misconception callouts and
// quick checks. Pure: no React, no Supabase; the app renders the result.
import { extractMath, mathKey } from './importer/math';
import { parseMarkdown, type MdBlock, type Span } from './markdown';

export type LessonLang = 'en' | 'ur';
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

// ───────────────────────────── language ─────────────────────────────

export interface Picked {
  text: string;
  /** The language the text is actually in. */
  lang: LessonLang;
  /** True when the reading language was missing and the other one is shown. */
  fallback: boolean;
}

/**
 * The text for the reading language, falling back to the other one (a lesson
 * with a missing Urdu caption still teaches; the reader marks the fallback).
 * A plain string counts as the reading language.
 */
export function pickLang(v: unknown, lang: LessonLang): Picked | null {
  if (typeof v === 'string') return v.trim() ? { text: v.trim(), lang, fallback: false } : null;
  if (!isObj(v)) return null;
  const own = str(v[lang]);
  if (own) return { text: own, lang, fallback: false };
  const other: LessonLang = lang === 'en' ? 'ur' : 'en';
  const alt = str(v[other]);
  return alt ? { text: alt, lang: other, fallback: true } : null;
}

// ───────────────────────────── blocks → sections ─────────────────────────────

export const LESSON_VISUAL_TYPES = [
  'figure',
  'scene',
  'chart',
  'widget',
  'compare',
  'video',
  'lottie',
] as const;
export type LessonVisualType = (typeof LESSON_VISUAL_TYPES)[number];
/** Rendered in prompt 33; prompt 30 draws a placeholder card with their text. */
export const LATER_VISUAL_TYPES: readonly LessonVisualType[] = [
  'scene',
  'chart',
  'widget',
  'lottie',
];

export interface LessonBlock extends Obj {
  type: string;
}

export interface QuickCheckRef {
  blockIndex: number;
  /** Set by the author; otherwise one is picked from the concept's approved practice items. */
  questionId: string | null;
  conceptId: string | null;
  /** The block's own text (a prompt to think about when no item is available). */
  block: LessonBlock;
}

export interface LessonSection {
  index: number;
  kind: 'visual' | 'text' | 'summary';
  visual: { block: LessonBlock; blockIndex: number } | null;
  /** intro / simple: the caption under the stage. */
  lead: LessonBlock[];
  /** detailed / worked_example / application: under "Explain more". */
  more: LessonBlock[];
  /** misconception: "Watch out" callouts. */
  watchOut: LessonBlock[];
  checks: QuickCheckRef[];
  conceptId: string | null;
}

export interface LessonModel {
  objectives: LessonBlock[];
  sections: LessonSection[];
}

const LEAD = new Set(['intro', 'simple']);
const MORE = new Set(['detailed', 'worked_example', 'application']);

/** Older drafts used `visual` + `media`: read as a figure (DATABASE_DESIGN §4). */
export function normaliseBlock(b: unknown): LessonBlock | null {
  if (!isObj(b) || typeof b.type !== 'string') return null;
  if (b.type === 'visual') {
    const { media, ...rest } = b;
    return { ...rest, type: 'figure', svg: b.svg ?? media } as LessonBlock;
  }
  return b as LessonBlock;
}

export function isVisual(b: LessonBlock): boolean {
  return (LESSON_VISUAL_TYPES as readonly string[]).includes(b.type);
}

const conceptOf = (b: LessonBlock) => (typeof b.concept_id === 'string' ? b.concept_id : null);

/**
 * Group blocks into sections. A visual opens a section (or joins one that so far
 * has only its lead text, which then becomes its caption); intro/simple text
 * opens a new text section once the current one has said something; the longer
 * text, callouts and checks join the current section; `summary` is its own last
 * section. Unknown block types are skipped (the importer refuses them anyway).
 */
export function buildLesson(blocks: unknown): LessonModel {
  const list = Array.isArray(blocks) ? blocks : [];
  const objectives: LessonBlock[] = [];
  const sections: LessonSection[] = [];
  let cur: LessonSection | null = null;
  const open = (kind: LessonSection['kind'], conceptId: string | null): LessonSection => {
    const s: LessonSection = {
      index: sections.length,
      kind,
      visual: null,
      lead: [],
      more: [],
      watchOut: [],
      checks: [],
      conceptId,
    };
    sections.push(s);
    return s;
  };
  const said = (s: LessonSection) =>
    s.lead.length > 0 || s.more.length > 0 || s.watchOut.length > 0 || s.checks.length > 0;

  list.forEach((raw, blockIndex) => {
    const b = normaliseBlock(raw);
    if (!b) return;
    const cid = conceptOf(b);
    if (b.type === 'objectives') {
      objectives.push(b);
      return;
    }
    if (isVisual(b)) {
      const joins =
        cur &&
        cur.kind === 'text' &&
        !cur.visual &&
        cur.more.length === 0 &&
        cur.checks.length === 0;
      const s = joins ? cur! : open('visual', cid);
      s.kind = 'visual';
      s.visual = { block: b, blockIndex };
      s.conceptId = s.conceptId ?? cid;
      cur = s;
      return;
    }
    if (b.type === 'summary') {
      cur = open('summary', cid);
      cur.lead.push(b);
      return;
    }
    if (LEAD.has(b.type)) {
      if (!cur || cur.kind === 'summary' || said(cur)) cur = open('text', cid);
      cur.lead.push(b);
      cur.conceptId = cur.conceptId ?? cid;
      return;
    }
    if (!MORE.has(b.type) && b.type !== 'misconception' && b.type !== 'quick_check') return;
    if (!cur || cur.kind === 'summary') cur = open('text', cid);
    if (MORE.has(b.type)) cur.more.push(b);
    else if (b.type === 'misconception') cur.watchOut.push(b);
    else if (b.type === 'quick_check')
      cur.checks.push({
        blockIndex,
        questionId: typeof b.question_id === 'string' && b.question_id ? b.question_id : null,
        conceptId: cid ?? cur.conceptId,
        block: b,
      });
    cur.conceptId = cur.conceptId ?? cid;
  });
  return { objectives, sections };
}

/** Every concept a lesson's checks could draw a practice item from. */
export function lessonConceptIds(model: LessonModel): string[] {
  const out = new Set<string>();
  for (const s of model.sections) {
    if (s.conceptId) out.add(s.conceptId);
    for (const c of s.checks) if (c.conceptId) out.add(c.conceptId);
  }
  return [...out];
}

/** Every question an author named in a quick check or a `predict_question_id`. */
export function lessonQuestionIds(blocks: unknown): string[] {
  const out = new Set<string>();
  for (const raw of Array.isArray(blocks) ? blocks : []) {
    if (!isObj(raw)) continue;
    for (const k of ['question_id', 'predict_question_id'])
      if (typeof raw[k] === 'string' && raw[k]) out.add(raw[k] as string);
  }
  return [...out];
}

export interface PoolItem {
  questionId: string;
  conceptId: string | null;
}

/**
 * Which practice item each quick check shows. A named item is used only when it
 * is in the pool (the pool holds what this reader may read: for a student, the
 * versions approved for practice). Otherwise the first unused item of the
 * check's concept. No item → null: the check shows its own text as a prompt.
 */
export function assignQuickChecks(
  model: LessonModel,
  pool: PoolItem[],
): Map<number, string | null> {
  const inPool = new Set(pool.map((p) => p.questionId));
  // A visual's predict question is asked before it plays: never reuse it as a quick check.
  const used = new Set<string>(
    model.sections.flatMap((s) => {
      const id = s.visual?.block.predict_question_id;
      return typeof id === 'string' && id ? [id] : [];
    }),
  );
  const out = new Map<number, string | null>();
  const checks = model.sections.flatMap((s) => s.checks);
  for (const c of checks)
    if (c.questionId && inPool.has(c.questionId)) {
      out.set(c.blockIndex, c.questionId);
      used.add(c.questionId);
    }
  for (const c of checks) {
    if (out.has(c.blockIndex)) continue;
    const hit = c.conceptId
      ? pool.find((p) => p.conceptId === c.conceptId && !used.has(p.questionId))
      : undefined;
    if (hit) used.add(hit.questionId);
    out.set(c.blockIndex, hit?.questionId ?? null);
  }
  return out;
}

// ───────────────────────────── text helpers ─────────────────────────────

const NON_TEXT_KEYS = new Set([
  'type',
  'svg',
  'media',
  'image',
  'poster',
  'youtube_id',
  'concept_id',
  'question_id',
  'predict_question_id',
  'layers',
  'set',
  'params',
  'widget',
  'kind',
  'role',
  'tone',
]);

/** Every `$…$` key in a lesson's text (en + ur), to fetch from `math_svgs` once. */
export function lessonMathKeys(value: unknown): string[] {
  const out = new Set<string>();
  const walk = (v: unknown) => {
    if (typeof v === 'string') {
      for (const seg of extractMath(v)) out.add(mathKey(seg));
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (isObj(v)) for (const [k, x] of Object.entries(v)) if (!NON_TEXT_KEYS.has(k)) walk(x);
  };
  walk(value);
  return [...out];
}

export interface MathRef {
  key: string;
  tex: string;
  display: boolean;
}
export interface LessonSpan extends Span {
  math?: MathRef;
}
export type LessonMdBlock =
  | { type: 'heading'; level: number; spans: LessonSpan[] }
  | { type: 'paragraph'; spans: LessonSpan[] }
  | { type: 'quote'; spans: LessonSpan[] }
  | { type: 'code'; text: string }
  | { type: 'list'; ordered: boolean; items: LessonSpan[][] };

// Private-use marks hold maths out of the Markdown parser's way ($x_1$ must not italicise).
const MARK_OPEN = String.fromCharCode(0xe000);
const MARK_CLOSE = String.fromCharCode(0xe001);
const MARK_RE = new RegExp(`${MARK_OPEN}(\\d+)${MARK_CLOSE}`, 'g');

/** Positions of maths in text, mirroring extractMath (same delimiters and escapes). */
function mathRanges(text: string): { start: number; end: number; ref: MathRef }[] {
  const d: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\\') i++;
    else if (text[i] === '$') d.push(i);
  }
  const out: { start: number; end: number; ref: MathRef }[] = [];
  let k = 0;
  while (k < d.length) {
    const at = d[k]!;
    const display = d[k + 1] === at + 1;
    const open = display ? k + 2 : k + 1;
    let close = -1;
    for (let j = open; j < d.length; j++) {
      if (!display || d[j + 1] === d[j]! + 1) {
        close = j;
        break;
      }
    }
    if (close < 0) break;
    const inner = text.slice(at + (display ? 2 : 1), d[close]);
    const tex = inner.trim();
    const end = d[close]! + (display ? 2 : 1);
    if (tex && (display || !tex.includes('\n'))) {
      const ref = { tex, display, key: mathKey({ tex, display }) };
      out.push({ start: at, end, ref });
    }
    k = close + (display ? 2 : 1);
  }
  return out;
}

/**
 * Lesson Markdown (the worksheet subset, core/markdown) with `$…$` maths kept
 * whole: maths spans carry the key its pre-rendered SVG is stored under.
 * `\$` reads as a dollar sign.
 */
export function parseLessonText(src: string | null | undefined): LessonMdBlock[] {
  const text = String(src ?? '');
  const refs: MathRef[] = [];
  const raw: string[] = [];
  let masked = '';
  let last = 0;
  for (const r of mathRanges(text)) {
    masked += text.slice(last, r.start) + MARK_OPEN + refs.length + MARK_CLOSE;
    refs.push(r.ref);
    raw.push(text.slice(r.start, r.end));
    last = r.end;
  }
  masked += text.slice(last);
  const unescape = (s: string) => s.replace(/\\\$/g, '$');
  const restore = (s: string) =>
    unescape(s.replace(MARK_RE, (_, n: string) => raw[Number(n)] ?? ''));
  const spans = (list: Span[]): LessonSpan[] => {
    const out: LessonSpan[] = [];
    for (const sp of list) {
      let at = 0;
      for (const m of sp.text.matchAll(MARK_RE)) {
        if (m.index! > at) out.push({ ...sp, text: unescape(sp.text.slice(at, m.index)) });
        const ref = refs[Number(m[1])];
        if (ref) out.push({ text: ref.tex, math: ref });
        at = m.index! + m[0].length;
      }
      if (at < sp.text.length) out.push({ ...sp, text: unescape(sp.text.slice(at)) });
    }
    return out.length ? out : [{ text: '' }];
  };
  return parseMarkdown(masked).map((b: MdBlock): LessonMdBlock => {
    switch (b.type) {
      case 'code':
        return { type: 'code', text: restore(b.text) };
      case 'list':
        return { type: 'list', ordered: b.ordered, items: b.items.map(spans) };
      default:
        return { ...b, spans: spans(b.spans) };
    }
  });
}

/** A short plain label (section nav, alt fallbacks): no Markdown marks, maths as TeX. */
export function plainLabel(src: string | null | undefined, max = 60): string {
  const first =
    String(src ?? '')
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.length > 0) ?? '';
  const flat = parseLessonText(first)
    .flatMap((b) => ('spans' in b ? b.spans : b.type === 'list' ? b.items.flat() : []))
    .map((s) => s.text)
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut.slice(0, max - 1)).trimEnd()}…`;
}

// ───────────────────────────── maths SVG sizing ─────────────────────────────

/**
 * MathJax sizes its SVG in `ex` (width, height, vertical-align). The app draws
 * it at the surrounding text size: 1 ex ≈ 0.45 em for the bundled fonts. Falls
 * back to the viewBox (height = 1.2 em) when the attributes are missing.
 */
export function mathBox(
  svg: string,
  fontSize: number,
): { width: number; height: number; baselineShift: number } {
  const ex = fontSize * 0.45;
  const attr = (name: string) => {
    const m = new RegExp(`\\s${name}="(-?[\\d.]+)ex"`).exec(svg);
    return m ? Number(m[1]) : null;
  };
  const w = attr('width');
  const h = attr('height');
  const va = /vertical-align:\s*(-?[\d.]+)ex/.exec(svg);
  if (w !== null && h !== null && w > 0 && h > 0)
    return {
      width: round(w * ex),
      height: round(h * ex),
      baselineShift: va ? round(Number(va[1]) * ex) : 0,
    };
  const vb = /viewBox="\s*-?[\d.]+[\s,]+-?[\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*"/.exec(svg);
  const height = round(fontSize * 1.2);
  if (vb && Number(vb[2]) > 0)
    return { width: round((Number(vb[1]) / Number(vb[2])) * height), height, baselineShift: 0 };
  return { width: height, height, baselineShift: 0 };
}
const round = (n: number) => Math.round(n * 10) / 10;

// ───────────────────────────── reader controls ─────────────────────────────

export type LessonKeyAction = 'next' | 'prev' | 'play' | 'fullscreen' | 'first' | 'last';

/**
 * Keyboard (wireframe 7.3): ← → step, Space play/pause, F fullscreen, Home/End.
 * In Urdu the reader mirrors, so ← moves forward (towards the reading end).
 */
export function lessonKeyAction(key: string, isRTL: boolean): LessonKeyAction | null {
  switch (key) {
    case 'ArrowRight':
      return isRTL ? 'prev' : 'next';
    case 'ArrowLeft':
      return isRTL ? 'next' : 'prev';
    case ' ':
    case 'Spacebar':
      return 'play';
    case 'f':
    case 'F':
      return 'fullscreen';
    case 'Home':
      return 'first';
    case 'End':
      return 'last';
    default:
      return null;
  }
}

export function clampStep(i: number, count: number): number {
  if (count <= 0) return 0;
  return Math.min(count - 1, Math.max(0, Math.trunc(Number.isFinite(i) ? i : 0)));
}

/**
 * Stage shape (§7b.2): figures and widgets square, everything else 16:10. One-line
 * widgets (number line, fraction bars) are wide too, so they don't float in white.
 */
export function stageAspect(type: string, widget?: unknown): number {
  if (type === 'widget' && (widget === 'number_line' || widget === 'fraction_bars')) return 16 / 10;
  return type === 'figure' || type === 'widget' ? 1 : 16 / 10;
}

// ───────────────────────────── video ─────────────────────────────

const YT_ID = /^[\w-]{11}$/;

/** youtube-nocookie embed (web iframe). Null for anything that isn't a video id. */
export function youtubeEmbedUrl(id: unknown, lang: LessonLang): string | null {
  if (typeof id !== 'string' || !YT_ID.test(id)) return null;
  return `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&playsinline=1&hl=${lang}&cc_lang_pref=${lang}`;
}

export function youtubeWatchUrl(id: unknown): string | null {
  return typeof id === 'string' && YT_ID.test(id) ? `https://www.youtube.com/watch?v=${id}` : null;
}

/** The block a video falls back to offline (`offline_fallback_block`): any visual but video. */
export function videoFallback(blocks: unknown, video: LessonBlock): LessonBlock | null {
  const i = video.offline_fallback_block;
  if (typeof i !== 'number' || !Array.isArray(blocks)) return null;
  const b = normaliseBlock(blocks[i]);
  return b && isVisual(b) && b.type !== 'video' ? b : null;
}

// ───────────────────────────── text version ─────────────────────────────

export interface TextLine {
  kind: 'alt' | 'label' | 'caption' | 'title' | 'text' | 'data' | 'transcript';
  text: string;
  /** Hotspot / step number, 1-based. */
  n?: number;
  fallback?: boolean;
}

/**
 * Everything a visual shows, as text (§7b.6 "Text version"): alt, hotspot labels,
 * compare panels, scene step captions, chart values, video transcript.
 */
export function visualText(block: LessonBlock, lang: LessonLang): TextLine[] {
  const out: TextLine[] = [];
  const add = (kind: TextLine['kind'], v: unknown, n?: number) => {
    const p = pickLang(v, lang);
    if (!p) return;
    const line: TextLine = { kind, text: p.text };
    if (n !== undefined) line.n = n;
    if (p.fallback) line.fallback = true;
    out.push(line);
  };
  add('alt', block.alt);
  switch (block.type) {
    case 'figure':
      (Array.isArray(block.hotspots) ? block.hotspots : []).forEach((h, i) => {
        if (isObj(h)) add('label', h.label, i + 1);
      });
      break;
    case 'compare':
      for (const side of ['left', 'right'] as const) {
        const s = block[side];
        if (!isObj(s)) continue;
        add('title', s.title);
        add('text', s.text);
      }
      break;
    case 'scene':
      (Array.isArray(block.steps) ? block.steps : []).forEach((s, i) => {
        if (isObj(s)) add('caption', s.caption, i + 1);
      });
      break;
    case 'chart': {
      const x = isObj(block.x) ? block.x : {};
      const xs = Array.isArray(x.values) ? x.values.map(String) : [];
      const xl = pickLang(x.label, lang)?.text;
      const unit = (u: unknown) => (typeof u === 'string' && u ? ` ${u}` : '');
      const yUnit = isObj(block.y) ? unit(block.y.unit) : '';
      for (const s of Array.isArray(block.series) ? block.series : []) {
        if (!isObj(s) || !Array.isArray(s.values)) continue;
        const name = pickLang(s.name, lang)?.text;
        const pairs = s.values.map((v, i) =>
          xs[i] !== undefined ? `${xs[i]}${unit(x.unit)}: ${v}${yUnit}` : `${v}${yUnit}`,
        );
        out.push({
          kind: 'data',
          text: `${name ? `${name}: ` : ''}${xl ? `(${xl}) ` : ''}${pairs.join(', ')}`,
        });
      }
      break;
    }
    case 'widget':
      add('text', block.task);
      break;
    case 'video':
      add('transcript', block.transcript);
      break;
  }
  return out;
}

/** Width ÷ height of an SVG (viewBox first, then width/height attributes); 1 when unknown. */
export function svgAspect(svg: string): number {
  const vb = /viewBox="\s*-?[\d.]+[\s,]+-?[\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*"/.exec(svg);
  if (vb && Number(vb[1]) > 0 && Number(vb[2]) > 0) return Number(vb[1]) / Number(vb[2]);
  const w = /<svg[^>]*\swidth="([\d.]+)(?:px)?"/.exec(svg);
  const h = /<svg[^>]*\sheight="([\d.]+)(?:px)?"/.exec(svg);
  if (w && h && Number(w[1]) > 0 && Number(h[1]) > 0) return Number(w[1]) / Number(h[1]);
  return 1;
}

/** The largest box of `aspect` that fits inside w × h (SVG "meet"), centred. */
export function fitBox(w: number, h: number, aspect: number) {
  if (w <= 0 || h <= 0 || !(aspect > 0)) return { width: 0, height: 0, left: 0, top: 0 };
  const width = Math.min(w, h * aspect);
  const height = width / aspect;
  return { width, height, left: (w - width) / 2, top: (h - height) / 2 };
}
