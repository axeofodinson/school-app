// Worksheets (prompt 70, LMS_AUDIT §3.7): a paper made from items approved for
// worksheet use. Pure and unit-tested (test/worksheets.test.ts):
//   * pickWorksheet: draw `count` items from the chosen topics and item kinds,
//     topics taken in turn, seeded (the same seed and pool give the same sheet);
//   * makeSet: set A or B of that sheet. Sections stay in a fixed order (MCQ,
//     true/false, fill in the blank, short answer); questions inside a section
//     and MCQ options are shuffled per set, then options are lettered by
//     position, so the key is worked out per set (TEST_PLAN F-6);
//   * worksheetHtml: a complete A4 document (sets + key pages) for browser
//     print or expo-print. All text is escaped; maths is the pre-rendered SVG
//     as an <img> data URL (never inline markup).
import { escapeHtml } from './auth/qr';
import { seededRand } from './exams';
import { parseLessonText, pickLang, type LessonLang, type LessonSpan } from './learn';

export const WORKSHEET_KINDS = ['mcq', 'true_false', 'fill_blank', 'short_answer'] as const;
export type WorksheetKind = (typeof WORKSHEET_KINDS)[number];
export type WorksheetSet = 'A' | 'B';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Three or more underscores (or a run of dots) in a stem mark a blank to fill. */
const BLANK = /_{3,}|\.{5,}|…{2,}/;

function stemTexts(body: unknown): string[] {
  if (!isObj(body)) return [];
  const s = body.stem ?? body.prompt;
  if (typeof s === 'string') return [s];
  if (isObj(s)) return [s.en, s.ur].filter((x): x is string => typeof x === 'string');
  return [];
}

/** How an item prints, or null when it can't go on paper (tap_image, match…). */
export function worksheetKind(type: string, body: unknown): WorksheetKind | null {
  if (type === 'mcq') return 'mcq';
  if (type === 'true_false') return 'true_false';
  if (type === 'short_text' || type === 'numeric')
    return stemTexts(body).some((s) => BLANK.test(s)) ? 'fill_blank' : 'short_answer';
  return null;
}

export interface WorksheetPoolItem {
  questionId: string;
  version: number;
  topicId: string;
  type: string;
  body: unknown;
  answer: unknown;
}

export interface WorksheetSpec {
  topicIds: readonly string[];
  kinds: readonly WorksheetKind[];
  count: number;
}

export interface WorksheetItem extends WorksheetPoolItem {
  kind: WorksheetKind;
}

export interface WorksheetPick {
  items: WorksheetItem[];
  /** Items that fit the topics and kinds (the most a sheet can have). */
  available: number;
  /** Asked for but not there. */
  short: number;
}

export const WORKSHEET_MAX = 40;

function shuffled<T>(xs: readonly T[], rand: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

const KIND_ORDER = (k: WorksheetKind) => WORKSHEET_KINDS.indexOf(k);

/** Draw the sheet: topics in turn (so every chosen topic is asked), seeded. */
export function pickWorksheet(
  pool: readonly WorksheetPoolItem[],
  spec: WorksheetSpec,
  seed: number,
): WorksheetPick {
  const count = Math.max(1, Math.min(WORKSHEET_MAX, Math.floor(spec.count) || 1));
  const topics = new Set(spec.topicIds);
  const kinds = new Set(spec.kinds);
  const seen = new Set<string>();
  const fit: WorksheetItem[] = [];
  for (const p of [...pool].sort((a, b) => (a.questionId < b.questionId ? -1 : 1))) {
    if (seen.has(p.questionId) || !topics.has(p.topicId)) continue;
    const kind = worksheetKind(p.type, p.body);
    if (!kind || !kinds.has(kind)) continue;
    seen.add(p.questionId);
    fit.push({ ...p, kind });
  }
  const rand = seededRand(seed);
  const byTopic = new Map<string, WorksheetItem[]>();
  for (const t of spec.topicIds) byTopic.set(t, []);
  for (const it of shuffled(fit, rand)) byTopic.get(it.topicId)?.push(it);
  const picked: WorksheetItem[] = [];
  const lanes = [...byTopic.values()];
  while (picked.length < count && lanes.some((l) => l.length)) {
    for (const lane of lanes) {
      const it = lane.shift();
      if (it && picked.length < count) picked.push(it);
    }
  }
  picked.sort((a, b) => KIND_ORDER(a.kind) - KIND_ORDER(b.kind));
  return { items: picked, available: fit.length, short: Math.max(0, count - picked.length) };
}

export interface SheetOption {
  letter: string;
  text: unknown;
}
export interface SheetQuestion {
  /** 1-based number on this set's paper. */
  n: number;
  questionId: string;
  kind: WorksheetKind;
  body: unknown;
  /** MCQ only: in this set's order, lettered by position. */
  options: SheetOption[];
  /** The answer for this set's key: an option letter, true/false, or the model answer. */
  key: string | boolean | number | null;
  /** Other accepted answers (short answer). */
  also: string[];
}
export interface SheetSet {
  set: WorksheetSet;
  questions: SheetQuestion[];
}

const LETTERS = 'ABCDEFGH';

function mcqOptions(body: unknown): { key: string; text: unknown }[] {
  if (!isObj(body) || !Array.isArray(body.options)) return [];
  return body.options
    .filter(isObj)
    .map((o, i) => ({ key: typeof o.key === 'string' ? o.key : LETTERS[i]!, text: o.text }));
}

function correctOf(answer: unknown): unknown {
  return isObj(answer) ? answer.correct : undefined;
}

/**
 * Set A or B of a sheet. B is shuffled with its own seed; when that happens to
 * give the same question order as A (sections with one item can't move),
 * the MCQ options still differ where there are any.
 */
export function makeSet(
  items: readonly WorksheetItem[],
  seed: number,
  set: WorksheetSet,
): SheetSet {
  const rand = seededRand((seed ^ (set === 'A' ? 0x2545f491 : 0x9e3779b9)) >>> 0);
  const sections = WORKSHEET_KINDS.map((k) => items.filter((i) => i.kind === k));
  let ordered = sections.flatMap((s) => shuffled(s, rand));
  if (set === 'B') {
    const a = makeSet(items, seed, 'A').questions.map((q) => q.questionId);
    if (ordered.every((q, i) => q.questionId === a[i])) {
      // Rotate inside the first section that can move, so B never repeats A's order.
      const s = sections.findIndex((x) => x.length > 1);
      if (s >= 0) {
        const start = sections.slice(0, s).reduce((n, x) => n + x.length, 0);
        const len = sections[s]!.length;
        const part = ordered.slice(start, start + len);
        part.push(part.shift()!);
        ordered = [...ordered.slice(0, start), ...part, ...ordered.slice(start + len)];
      }
    }
  }
  const questions = ordered.map((it, i): SheetQuestion => {
    const correct = correctOf(it.answer);
    if (it.kind === 'mcq') {
      const opts = shuffled(mcqOptions(it.body), rand);
      const options = opts.map((o, j) => ({ letter: LETTERS[j]!, text: o.text }));
      const at = opts.findIndex((o) => o.key === correct);
      return {
        n: i + 1,
        questionId: it.questionId,
        kind: it.kind,
        body: it.body,
        options,
        key: at >= 0 ? options[at]!.letter : null,
        also: [],
      };
    }
    const also =
      isObj(it.answer) && Array.isArray(it.answer.also)
        ? it.answer.also.filter((x): x is string => typeof x === 'string')
        : [];
    const key =
      typeof correct === 'string' || typeof correct === 'number' || typeof correct === 'boolean'
        ? correct
        : null;
    return {
      n: i + 1,
      questionId: it.questionId,
      kind: it.kind,
      body: it.body,
      options: [],
      key,
      also,
    };
  });
  return { set, questions };
}

// ───────────────────────────── print ─────────────────────────────

export interface WorksheetLabels {
  school: string;
  title: string;
  /** e.g. "Class 9-A · Mathematics" */
  subtitle: string;
  set: (set: WorksheetSet) => string;
  name: string;
  roll: string;
  date: string;
  sections: Record<WorksheetKind, string>;
  true: string;
  false: string;
  key: (set: WorksheetSet) => string;
  /** "Also accept" before other answers in the key. */
  also: string;
  /** The sheet's code, so the same sheet can be made again. */
  code: string;
}

export interface WorksheetDoc {
  sets: readonly SheetSet[];
  /** Answer-key pages after the sets (one per set). */
  withKey: boolean;
  lang: LessonLang;
  /** Pre-rendered maths, key → SVG (math_svgs). Missing maths prints as its TeX. */
  math?: Readonly<Record<string, string>>;
  /** @font-face CSS for Urdu (the app passes its bundled font). */
  fontCss?: string;
}

const e = escapeHtml;

function spanHtml(sp: LessonSpan, math: Readonly<Record<string, string>>): string {
  if (sp.math) {
    const svg = math[sp.math.key];
    if (svg)
      return `<img class="m${sp.math.display ? ' md' : ''}" alt="${e(sp.math.tex)}" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}">`;
    return `<code dir="ltr">${e(sp.math.tex)}</code>`;
  }
  let h = e(sp.text);
  if (sp.code) h = `<code>${h}</code>`;
  if (sp.bold) h = `<b>${h}</b>`;
  if (sp.italic) h = `<i>${h}</i>`;
  return h;
}

/** Text in the reading language (falling back to the other), as inline HTML. */
export function textHtml(
  v: unknown,
  lang: LessonLang,
  math: Readonly<Record<string, string>> = {},
): string {
  const p = pickLang(v, lang);
  if (!p) return '';
  const blocks = parseLessonText(p.text);
  const parts = blocks.map((b) => {
    if (b.type === 'code') return `<code>${e(b.text)}</code>`;
    if (b.type === 'list')
      return `<${b.ordered ? 'ol' : 'ul'}>${b.items.map((it) => `<li>${it.map((s) => spanHtml(s, math)).join('')}</li>`).join('')}</${b.ordered ? 'ol' : 'ul'}>`;
    return b.spans.map((s) => spanHtml(s, math)).join('');
  });
  const inner = parts.join('<br>');
  return p.lang === lang ? inner : `<span lang="${p.lang}" dir="auto">${inner}</span>`;
}

function stemOf(body: unknown): unknown {
  return isObj(body) ? (body.stem ?? body.prompt) : null;
}

function questionHtml(q: SheetQuestion, d: WorksheetDoc, l: WorksheetLabels): string {
  const m = d.math ?? {};
  const stem = textHtml(stemOf(q.body), d.lang, m);
  let work = '';
  if (q.kind === 'mcq') {
    work = `<ol class="opts">${q.options
      .map((o) => `<li><span class="box">${o.letter}</span> ${textHtml(o.text, d.lang, m)}</li>`)
      .join('')}</ol>`;
  } else if (q.kind === 'true_false') {
    work = `<div class="tf"><span class="box"></span> ${e(l.true)} &nbsp;&nbsp; <span class="box"></span> ${e(l.false)}</div>`;
  } else if (q.kind === 'fill_blank') {
    work = '';
  } else {
    work = '<div class="lines"><div></div><div></div><div></div></div>';
  }
  return `<li class="q" value="${q.n}"><div class="stem">${stem}</div>${work}</li>`;
}

function keyText(q: SheetQuestion, l: WorksheetLabels): string {
  if (q.key === null) return '—';
  if (typeof q.key === 'boolean') return e(q.key ? l.true : l.false);
  const main = `<b dir="auto">${e(String(q.key))}</b>`;
  return q.also.length
    ? `${main} <span class="also">(${e(l.also)}: ${q.also.map(e).join(', ')})</span>`
    : main;
}

/** Sets (and their keys) as one A4 HTML document. */
export function worksheetHtml(d: WorksheetDoc, l: WorksheetLabels): string {
  const dir = d.lang === 'ur' ? 'rtl' : 'ltr';
  const header = (s: WorksheetSet, key = false) =>
    `<header><div class="school">${e(l.school)}</div><h1>${e(key ? l.key(s) : l.title)}</h1>` +
    `<div class="sub">${e(l.subtitle)} · <b>${e(l.set(s))}</b> · <span dir="ltr">${e(l.code)}</span></div></header>`;
  const pages: string[] = [];
  for (const s of d.sets) {
    let body = '';
    for (const k of WORKSHEET_KINDS) {
      const qs = s.questions.filter((q) => q.kind === k);
      if (!qs.length) continue;
      body += `<h2>${e(l.sections[k])}</h2><ol class="qs">${qs.map((q) => questionHtml(q, d, l)).join('')}</ol>`;
    }
    pages.push(
      `<section class="page">${header(s.set)}` +
        `<div class="who"><span>${e(l.name)} <i></i></span><span>${e(l.roll)} <i class="short"></i></span><span>${e(l.date)} <i class="short"></i></span></div>` +
        `${body}</section>`,
    );
  }
  if (d.withKey) {
    for (const s of d.sets) {
      pages.push(
        `<section class="page key">${header(s.set, true)}<ol class="keys">${s.questions
          .map((q) => `<li value="${q.n}">${keyText(q, l)}</li>`)
          .join('')}</ol></section>`,
      );
    }
  }
  const urdu = d.lang === 'ur';
  return `<!doctype html><html lang="${d.lang}" dir="${dir}"><head><meta charset="utf-8"><title>${e(l.title)}</title>
<style>
${d.fontCss ?? ''}
@page { size: A4; margin: 14mm 14mm 16mm; }
* { box-sizing: border-box; }
body { margin: 0; color: #000; font-family: ${urdu ? "'WorksheetUrdu', 'Noto Nastaliq Urdu', 'Noto Naskh Arabic', serif" : "'Nunito', 'Segoe UI', Arial, sans-serif"}; font-size: 11.5pt; line-height: ${urdu ? 2.2 : 1.45}; }
.page { page-break-after: always; break-after: page; }
.page:last-child { page-break-after: auto; break-after: auto; }
header { border-bottom: 0.4mm solid #000; padding-bottom: 2mm; margin-bottom: 3mm; }
.school { font-size: 10pt; letter-spacing: 0.02em; }
h1 { font-size: 16pt; margin: 1mm 0; }
.sub { font-size: 10pt; }
.who { display: flex; gap: 6mm; margin: 2mm 0 4mm; font-size: 10.5pt; }
.who span { display: flex; align-items: flex-end; gap: 2mm; flex: 2; }
.who span:not(:first-child) { flex: 1; }
.who i { flex: 1; border-bottom: 0.3mm solid #000; height: 5mm; }
h2 { font-size: 12pt; margin: 4mm 0 1mm; border-inline-start: 1.2mm solid #000; padding-inline-start: 2mm; break-after: avoid-page; page-break-after: avoid; }
ol.qs { margin: 0; padding-inline-start: 7mm; }
li.q { margin: 0 0 3mm; break-inside: avoid; }
.opts { list-style: none; padding: 0; margin: 1mm 0 0; display: grid; grid-template-columns: 1fr 1fr; gap: 1mm 6mm; }
.box { display: inline-block; min-width: 5mm; height: 5mm; border: 0.3mm solid #000; border-radius: 1mm; text-align: center; font-size: 9pt; line-height: 5mm; font-family: 'Nunito', Arial, sans-serif; }
.tf { margin-top: 1mm; }
.lines div { border-bottom: 0.3mm solid #777; height: 8mm; }
img.m { height: 1.3em; vertical-align: middle; }
img.md { display: block; height: 2.2em; margin: 1mm auto; }
code { font-family: monospace; unicode-bidi: isolate; }
ol.keys { columns: 3; column-gap: 8mm; padding-inline-start: 8mm; font-size: 11pt; }
ol.keys li { break-inside: avoid; margin-bottom: 1mm; }
.also { font-size: 9pt; color: #333; }
</style></head><body>${pages.join('')}</body></html>`;
}
