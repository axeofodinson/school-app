// Curriculum editors (prompt 20): pure rules shared by the app and its tests.
// The database is still the boundary (db/017 checks, RLS, the prerequisite
// loop trigger); these give the editor the same answers before a round trip.

/** Topic diagnostic size: null = the engine's default. Mirrors topics_diagnostic_size_check. */
export const DIAGNOSTIC_MIN = 5;
export const DIAGNOSTIC_MAX = 60;
export const DIAGNOSTIC_DEFAULT = 30;

/** Text limits, mirroring the 017 check constraints. */
export const CURRICULUM_LIMITS = {
  title: 200,
  summary: 1000,
  editionCode: 40,
  editionBoard: 120,
  editionName: 160,
  textbookRef: 120,
} as const;

export type CurriculumStatus = 'active' | 'retired';

export type CurriculumError =
  | 'titleRequired'
  | 'titleTooLong'
  | 'summaryTooLong'
  | 'diagnosticNotNumber'
  | 'diagnosticRange'
  | 'codeRequired'
  | 'codeTooLong'
  | 'boardRequired'
  | 'nameRequired'
  | 'textTooLong'
  | 'dateInvalid';

const clean = (s: string | null | undefined) => (s ?? '').trim().replace(/\s+/g, ' ');
const orNull = (s: string) => (s === '' ? null : s);

export interface TitleDraft {
  titleEn: string;
  titleUr: string;
}

export interface TopicDraft extends TitleDraft {
  /** As typed: '' = engine default. */
  diagnosticSize: string;
}

export interface ConceptDraft extends TitleDraft {
  summaryEn: string;
  summaryUr: string;
}

export interface ChapterDraft extends TitleDraft {
  textbookRef: string;
  curriculumId: string | null;
}

export interface EditionDraft {
  code: string;
  board: string;
  name: string;
  /** YYYY-MM-DD or ''. */
  effectiveFrom: string;
}

type Built<T> = { ok: true; value: T } | { ok: false; error: CurriculumError; field: string };

function titles(d: TitleDraft): Built<{ title_en: string; title_ur: string | null }> {
  const en = clean(d.titleEn);
  const ur = clean(d.titleUr);
  if (!en) return { ok: false, error: 'titleRequired', field: 'titleEn' };
  if (en.length > CURRICULUM_LIMITS.title)
    return { ok: false, error: 'titleTooLong', field: 'titleEn' };
  if (ur.length > CURRICULUM_LIMITS.title)
    return { ok: false, error: 'titleTooLong', field: 'titleUr' };
  return { ok: true, value: { title_en: en, title_ur: orNull(ur) } };
}

/** Parse a typed diagnostic size; accepts Urdu/Arabic-Indic digits. '' = default (null). */
export function parseDiagnosticSize(raw: string): Built<number | null> {
  const s = toAsciiDigits(raw).trim();
  if (s === '') return { ok: true, value: null };
  if (!/^\d+$/.test(s)) return { ok: false, error: 'diagnosticNotNumber', field: 'diagnosticSize' };
  const n = Number(s);
  if (n < DIAGNOSTIC_MIN || n > DIAGNOSTIC_MAX) {
    return { ok: false, error: 'diagnosticRange', field: 'diagnosticSize' };
  }
  return { ok: true, value: n };
}

export function buildTopic(
  d: TopicDraft,
): Built<{ title_en: string; title_ur: string | null; diagnostic_size: number | null }> {
  const t = titles(d);
  if (!t.ok) return t;
  const size = parseDiagnosticSize(d.diagnosticSize);
  if (!size.ok) return size;
  return { ok: true, value: { ...t.value, diagnostic_size: size.value } };
}

export function buildConcept(d: ConceptDraft): Built<{
  title_en: string;
  title_ur: string | null;
  summary_en: string | null;
  summary_ur: string | null;
}> {
  const t = titles(d);
  if (!t.ok) return t;
  // Summaries keep their line breaks; only the ends are trimmed.
  const se = (d.summaryEn ?? '').trim();
  const su = (d.summaryUr ?? '').trim();
  if (se.length > CURRICULUM_LIMITS.summary) {
    return { ok: false, error: 'summaryTooLong', field: 'summaryEn' };
  }
  if (su.length > CURRICULUM_LIMITS.summary) {
    return { ok: false, error: 'summaryTooLong', field: 'summaryUr' };
  }
  return { ok: true, value: { ...t.value, summary_en: orNull(se), summary_ur: orNull(su) } };
}

export function buildChapter(d: ChapterDraft): Built<{
  title: string;
  title_ur: string | null;
  textbook_ref: string | null;
  curriculum_id: string | null;
}> {
  const t = titles(d);
  if (!t.ok) return t;
  const ref = clean(d.textbookRef);
  if (ref.length > CURRICULUM_LIMITS.textbookRef) {
    return { ok: false, error: 'textTooLong', field: 'textbookRef' };
  }
  return {
    ok: true,
    value: {
      title: t.value.title_en,
      title_ur: t.value.title_ur,
      textbook_ref: orNull(ref),
      curriculum_id: d.curriculumId,
    },
  };
}

export function buildEdition(d: EditionDraft): Built<{
  code: string;
  board: string;
  name: string;
  effective_from: string | null;
}> {
  const code = clean(d.code).toUpperCase();
  const board = clean(d.board);
  const name = clean(d.name);
  const from = clean(d.effectiveFrom);
  if (!code) return { ok: false, error: 'codeRequired', field: 'code' };
  if (code.length > CURRICULUM_LIMITS.editionCode) {
    return { ok: false, error: 'codeTooLong', field: 'code' };
  }
  if (!board) return { ok: false, error: 'boardRequired', field: 'board' };
  if (board.length > CURRICULUM_LIMITS.editionBoard) {
    return { ok: false, error: 'textTooLong', field: 'board' };
  }
  if (!name) return { ok: false, error: 'nameRequired', field: 'name' };
  if (name.length > CURRICULUM_LIMITS.editionName) {
    return { ok: false, error: 'textTooLong', field: 'name' };
  }
  if (from && !isIsoDate(toAsciiDigits(from))) {
    return { ok: false, error: 'dateInvalid', field: 'effectiveFrom' };
  }
  return {
    ok: true,
    value: { code, board, name, effective_from: from ? toAsciiDigits(from) : null },
  };
}

function isIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function toAsciiDigits(s: string): string {
  return s
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06f0));
}

// ---- Ordering -------------------------------------------------------------------

export interface Ordered {
  id: string;
  sort_order: number;
}

/** Stable display order: sort_order, then the order rows came in. */
export function inOrder<T extends Ordered>(items: readonly T[]): T[] {
  return items
    .map((it, i) => ({ it, i }))
    .sort((a, b) => a.it.sort_order - b.it.sort_order || a.i - b.i)
    .map((x) => x.it);
}

/** sort_order for a new item at the end. */
export function nextSortOrder(items: readonly Ordered[]): number {
  return items.reduce((m, it) => Math.max(m, it.sort_order), 0) + 1;
}

/**
 * Move one item up (-1) or down (+1) among its siblings. Returns only the rows
 * whose sort_order must change (renumbered 1..n so ties and gaps heal), or []
 * when the move is not possible.
 */
export function moveItem(items: readonly Ordered[], id: string, dir: -1 | 1): Ordered[] {
  const list = inOrder(items);
  const from = list.findIndex((it) => it.id === id);
  const to = from + dir;
  if (from < 0 || to < 0 || to >= list.length) return [];
  const moved = [...list];
  [moved[from], moved[to]] = [moved[to]!, moved[from]!];
  return moved
    .map((it, i) => ({ id: it.id, sort_order: i + 1 }))
    .filter((it) => list.find((o) => o.id === it.id)!.sort_order !== it.sort_order);
}

// ---- Prerequisites ----------------------------------------------------------------

export interface PrereqEdge {
  concept_id: string;
  requires_concept_id: string;
}

/**
 * Would adding "concept needs requires" close a loop? True when `requires`
 * already (directly or through others) needs `concept`, or they're the same.
 * Mirrors db/017 concept_prereq_no_cycle().
 */
export function wouldCreateCycle(
  edges: readonly PrereqEdge[],
  concept: string,
  requires: string,
): boolean {
  if (concept === requires) return true;
  const needs = new Map<string, string[]>();
  for (const e of edges) {
    const list = needs.get(e.concept_id) ?? [];
    list.push(e.requires_concept_id);
    needs.set(e.concept_id, list);
  }
  const seen = new Set<string>();
  const stack = [requires];
  while (stack.length) {
    const c = stack.pop()!;
    if (c === concept) return true;
    if (seen.has(c)) continue;
    seen.add(c);
    stack.push(...(needs.get(c) ?? []));
  }
  return false;
}

/** The prerequisite edits to send: add the new ones, remove the dropped ones. */
export function prereqChanges(
  current: readonly string[],
  next: readonly string[],
): { add: string[]; remove: string[] } {
  const cur = new Set(current);
  const nxt = new Set(next);
  return {
    add: [...nxt].filter((id) => !cur.has(id)),
    remove: [...cur].filter((id) => !nxt.has(id)),
  };
}

// ---- Counts for the chapter list ----------------------------------------------------

export interface TopicCountRow {
  chapter_id: string;
  status: CurriculumStatus | string;
  concepts: { status: CurriculumStatus | string }[] | null;
}

/** Active topics and concepts per chapter (retired ones are not counted). */
export function chapterCounts(
  topics: readonly TopicCountRow[],
): Map<string, { topics: number; concepts: number }> {
  const out = new Map<string, { topics: number; concepts: number }>();
  for (const t of topics) {
    if (t.status !== 'active') continue;
    const c = out.get(t.chapter_id) ?? { topics: 0, concepts: 0 };
    c.topics += 1;
    c.concepts += (t.concepts ?? []).filter((x) => x.status === 'active').length;
    out.set(t.chapter_id, c);
  }
  return out;
}

/** Pick the title for the UI language, falling back to English. */
export function localTitle(
  row: { title_en?: string | null; title?: string | null; title_ur?: string | null },
  locale: string,
): string {
  const en = row.title_en ?? row.title ?? '';
  return locale === 'ur' && row.title_ur ? row.title_ur : en;
}
