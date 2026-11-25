// Teacher review queue (prompt 22): the pure rules behind features/review.
// The server (db/032) is the authority: who may decide, stale versions, scopes,
// reasons. This file only makes the screen fast and honest: keyboard map,
// what blocks Approve, where the cursor goes after a decision, the bilingual
// edit draft and the patch it becomes.

export const REVIEW_SCOPES = ['learn', 'practice', 'exam', 'worksheet'] as const;
export type ReviewScope = (typeof REVIEW_SCOPES)[number];

/** Scopes ticked for a fresh item: what AI drafts are for. Exam is always a deliberate tick. */
export const DEFAULT_REVIEW_SCOPES: readonly ReviewScope[] = ['learn', 'practice'];

export const REVIEW_TABS = ['to_review', 'changes', 'approved', 'retired'] as const;
export type ReviewTab = (typeof REVIEW_TABS)[number];

export type ReviewDecision = 'approve' | 'request_changes' | 'reject';

/** Question types whose text, options and key can be edited in the queue. */
export const REVIEW_EDITABLE_TYPES = ['mcq', 'true_false', 'numeric', 'short_text'] as const;

export interface ReviewItem {
  id: string;
  version: number;
  status: 'draft' | 'reviewed' | 'approved' | 'retired';
  origin: 'human' | 'ai' | 'ai_edited';
  type: string;
  cognitive_level: string;
  difficulty: number;
  chapter_id: string;
  concept_id: string | null;
  topic_id: string | null;
  body: unknown;
  answer: unknown;
  explanation: unknown;
  source: unknown;
  import_batch_id: string | null;
  created_at: string;
  scopes: string[];
  last_decision: ReviewDecision | null;
  last_notes: string | null;
  last_translation: boolean | null;
  last_reviewed_at: string | null;
  can_review: boolean;
  in_use: boolean;
}

export interface ReviewCounts {
  to_review: number;
  changes: number;
  approved: number;
  retired: number;
}

// ───────────────────────────── keyboard ─────────────────────────────

export type ReviewKeyAction =
  | { kind: 'approve' }
  | { kind: 'edit' }
  | { kind: 'reject' }
  | { kind: 'changes' }
  | { kind: 'next' }
  | { kind: 'prev' }
  | { kind: 'scope'; scope: ReviewScope }
  | { kind: 'checkAnswer' }
  | { kind: 'checkUrdu' }
  | { kind: 'select' }
  | { kind: 'help' };

export interface KeyInput {
  key: string;
  /** KeyboardEvent.code: the physical key, so shortcuts work on an Urdu layout too. */
  code?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}

/**
 * Windows shortcuts (wireframe 7.9): J/K or ↓/↑ next/prev, A approve, E edit,
 * R reject, C request changes, 1–4 scopes, V answer checked, U Urdu reads
 * naturally, X select for bulk, ? help. Nothing fires while typing or with
 * Ctrl/Alt/⌘ held (those belong to the browser).
 */
export function reviewKeyAction(e: KeyInput, ctx: { typing: boolean }): ReviewKeyAction | null {
  if (ctx.typing || e.ctrlKey || e.metaKey || e.altKey) return null;
  if (e.key === 'ArrowDown') return { kind: 'next' };
  if (e.key === 'ArrowUp') return { kind: 'prev' };
  if (e.key === '?') return { kind: 'help' };
  const code = e.code ?? '';
  const letter = code.startsWith('Key') ? code.slice(3).toLowerCase() : e.key.toLowerCase();
  const digit = code.startsWith('Digit')
    ? code.slice(5)
    : code.startsWith('Numpad')
      ? code.slice(6)
      : e.key;
  if (/^[1-4]$/.test(digit)) return { kind: 'scope', scope: REVIEW_SCOPES[Number(digit) - 1]! };
  switch (letter) {
    case 'j':
      return { kind: 'next' };
    case 'k':
      return { kind: 'prev' };
    case 'a':
      return { kind: 'approve' };
    case 'e':
      return { kind: 'edit' };
    case 'r':
      return { kind: 'reject' };
    case 'c':
      return { kind: 'changes' };
    case 'v':
      return { kind: 'checkAnswer' };
    case 'u':
      return { kind: 'checkUrdu' };
    case 'x':
      return { kind: 'select' };
    default:
      return null;
  }
}

// ───────────────────────────── scopes + approve gate ─────────────────────────────

/** Toggle one scope; the result is always in REVIEW_SCOPES order with no repeats. */
export function toggleScope(scopes: readonly string[], s: ReviewScope): ReviewScope[] {
  const set = new Set(scopes);
  if (set.has(s)) set.delete(s);
  else set.add(s);
  return REVIEW_SCOPES.filter((x) => set.has(x));
}

/** Scopes to start an item with: its live ones when it has any, else the defaults. */
export function startingScopes(item: Pick<ReviewItem, 'scopes'>): ReviewScope[] {
  const live = REVIEW_SCOPES.filter((s) => item.scopes.includes(s));
  return live.length ? live : [...DEFAULT_REVIEW_SCOPES];
}

export type ApproveBlock =
  'cantReview' | 'retired' | 'noConcept' | 'noScopes' | 'answerUnchecked' | null;

/** Why Approve is not available right now (null = it is). Order = what to fix first. */
export function approveBlock(
  item: Pick<ReviewItem, 'can_review' | 'status' | 'concept_id'>,
  s: { scopes: readonly string[]; answerChecked: boolean },
): ApproveBlock {
  if (item.status === 'retired') return 'retired';
  if (!item.concept_id) return 'noConcept';
  if (!item.can_review) return 'cantReview';
  if (s.scopes.length === 0) return 'noScopes';
  if (!s.answerChecked) return 'answerUnchecked';
  return null;
}

/** Does an item with this decision leave the tab it is listed in? */
export function leavesTab(tab: ReviewTab, decision: ReviewDecision): boolean {
  switch (tab) {
    case 'to_review':
      return true;
    case 'changes':
      return decision !== 'request_changes';
    case 'approved':
      return decision !== 'approve';
    case 'retired':
      return false;
  }
}

/**
 * Where the cursor goes after a decision on `currentId`: the item that slides
 * into its place (or the one before, at the end), or the next item when it
 * stays. null = the list is empty.
 */
export function nextAfterDecision(
  ids: readonly string[],
  currentId: string,
  leaves: boolean,
): string | null {
  const i = ids.indexOf(currentId);
  if (i < 0) return ids[0] ?? null;
  if (!leaves) return ids[Math.min(i + 1, ids.length - 1)] ?? null;
  const rest = ids.filter((id) => id !== currentId);
  if (rest.length === 0) return null;
  return rest[Math.min(i, rest.length - 1)]!;
}

/** Move the cursor one step, staying inside the list. */
export function stepId(
  ids: readonly string[],
  currentId: string | null,
  dir: 1 | -1,
): string | null {
  if (ids.length === 0) return null;
  const i = currentId ? ids.indexOf(currentId) : -1;
  if (i < 0) return ids[0]!;
  return ids[Math.max(0, Math.min(ids.length - 1, i + dir))]!;
}

/** "12 of 214" style progress: done this session against what was waiting when the queue opened. */
export function reviewProgress(
  done: number,
  remaining: number,
): { done: number; total: number; ratio: number } {
  const d = Math.max(0, done);
  const total = d + Math.max(0, remaining);
  return { done: d, total, ratio: total === 0 ? 1 : d / total };
}

// ───────────────────────────── bilingual text ─────────────────────────────

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' ? v : '');

/** Both languages of one text (the importer's `Bi`, always strings here). */
export interface BiText {
  en: string;
  ur: string;
}
type Bi = BiText;

/** {en, ur} from a stored text: a bilingual object, or an older plain string (English). */
export function biText(v: unknown): Bi {
  if (typeof v === 'string') return { en: v, ur: '' };
  if (isObj(v)) return { en: str(v.en), ur: str(v.ur) };
  return { en: '', ur: '' };
}

export interface ReviewView {
  stem: Bi;
  options: { key: string; text: Bi }[];
  explanation: Bi;
  /** Short reason per wrong option, when the file had one. */
  whyWrong: { key: string; text: Bi }[];
  source: { book: string; page: string; ref: string } | null;
  correct: string | null;
  also: string[];
  hasAudio: boolean;
}

/** Everything the review pane shows, read defensively from stored JSON. */
export function reviewView(
  item: Pick<ReviewItem, 'type' | 'body' | 'answer' | 'explanation' | 'source'>,
): ReviewView {
  const body = isObj(item.body) ? item.body : {};
  const stem = biText(body.stem ?? body.prompt);
  const options = (Array.isArray(body.options) ? body.options : [])
    .filter(isObj)
    .map((o, i) => ({ key: str(o.key) || String.fromCharCode(65 + i), text: biText(o.text) }));
  const ex = isObj(item.explanation) ? item.explanation : {};
  const why = isObj(ex.why_wrong) ? ex.why_wrong : {};
  const ans = isObj(item.answer) ? item.answer : {};
  const c = ans.correct;
  let correct: string | null = null;
  if (typeof c === 'string' || typeof c === 'number') correct = String(c);
  else if (typeof c === 'boolean') correct = c ? 'true' : 'false';
  else if (Array.isArray(c)) correct = c.map(String).join(', ');
  const src = isObj(item.source) ? item.source : null;
  return {
    stem,
    options,
    explanation: biText(item.explanation),
    whyWrong: Object.entries(why).map(([key, v]) => ({ key, text: biText(v) })),
    source: src
      ? {
          book: str(src.book),
          page: src.page === undefined || src.page === null ? '' : String(src.page),
          ref: str(src.ref),
        }
      : null,
    correct,
    also: Array.isArray(ans.also) ? ans.also.filter((x): x is string => typeof x === 'string') : [],
    hasAudio: isObj(body.audio) || isObj(body.prompt_audio),
  };
}

/** Which Urdu is missing (the separate translation check looks here first). */
export function urduGaps(v: ReviewView): { stem: boolean; options: number; explanation: boolean } {
  return {
    stem: v.stem.en.trim() !== '' && v.stem.ur.trim() === '',
    options: v.options.filter((o) => o.text.en.trim() !== '' && o.text.ur.trim() === '').length,
    explanation: v.explanation.en.trim() !== '' && v.explanation.ur.trim() === '',
  };
}

export function hasUrduGaps(v: ReviewView): boolean {
  const g = urduGaps(v);
  return g.stem || g.options > 0 || g.explanation;
}

// ───────────────────────────── edit draft → patch ─────────────────────────────

export interface ReviewDraft {
  type: string;
  stemEn: string;
  stemUr: string;
  options: { key: string; en: string; ur: string }[];
  /** mcq: option key · true_false: 'true'|'false' · numeric/short_text: the text. */
  correct: string;
  /** short_text: other accepted answers, one per line. */
  also: string;
  explEn: string;
  explUr: string;
  level: string;
  difficulty: number;
  conceptId: string | null;
}

export function isReviewEditable(type: string): boolean {
  return (REVIEW_EDITABLE_TYPES as readonly string[]).includes(type);
}

export function reviewDraft(item: ReviewItem): ReviewDraft {
  const v = reviewView(item);
  return {
    type: item.type,
    stemEn: v.stem.en,
    stemUr: v.stem.ur,
    options: v.options.map((o) => ({ key: o.key, en: o.text.en, ur: o.text.ur })),
    correct: v.correct ?? '',
    also: v.also.join('\n'),
    explEn: v.explanation.en,
    explUr: v.explanation.ur,
    level: item.cognitive_level,
    difficulty: item.difficulty,
    conceptId: item.concept_id,
  };
}

export type ReviewEditError =
  | 'stemRequired'
  | 'optionsTooFew'
  | 'optionEmpty'
  | 'correctMissing'
  | 'numericInvalid'
  | 'shortRequired'
  | 'notEditable'
  | 'conceptRequired';

export type ReviewPatch = Partial<{
  body: Obj;
  answer: Obj;
  explanation: Obj | null;
  cognitive_level: string;
  difficulty: number;
  concept_id: string;
}>;

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();
const bi = (en: string, ur: string): Bi => ({ en: squash(en), ur: squash(ur) });

/** Order-insensitive JSON equality for plain data. */
function same(a: unknown, b: unknown): boolean {
  const norm = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(norm)
      : isObj(v)
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, norm(v[k])]),
          )
        : v;
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}

/**
 * The edit as the smallest patch for review_edit_question (db/032). Keeps
 * everything else in the stored body (diagram, maths renderings); drops the
 * read-aloud clip when the words it reads changed, because a clip is part of
 * the version it was made for.
 */
export function buildReviewPatch(
  item: ReviewItem,
  d: ReviewDraft,
): { ok: true; patch: ReviewPatch; changed: boolean } | { ok: false; error: ReviewEditError } {
  if (!isReviewEditable(item.type)) return { ok: false, error: 'notEditable' };
  const stem = bi(d.stemEn, d.stemUr);
  if (!stem.en && !stem.ur) return { ok: false, error: 'stemRequired' };
  if (!d.conceptId) return { ok: false, error: 'conceptRequired' };

  const oldBody = isObj(item.body) ? item.body : {};
  const body: Obj = { ...oldBody, stem };
  let answer: Obj;
  switch (item.type) {
    case 'mcq': {
      const opts = d.options.map((o) => ({ key: o.key, text: bi(o.en, o.ur) }));
      if (opts.length < 2) return { ok: false, error: 'optionsTooFew' };
      if (opts.some((o) => !o.text.en && !o.text.ur)) return { ok: false, error: 'optionEmpty' };
      if (!opts.some((o) => o.key === d.correct)) return { ok: false, error: 'correctMissing' };
      // Keep anything else an option carried (an image, say).
      const old = Array.isArray(oldBody.options) ? oldBody.options.filter(isObj) : [];
      body.options = opts.map((o) => ({ ...(old.find((x) => x.key === o.key) ?? {}), ...o }));
      answer = { correct: d.correct };
      break;
    }
    case 'true_false':
      if (d.correct !== 'true' && d.correct !== 'false')
        return { ok: false, error: 'correctMissing' };
      answer = { correct: d.correct === 'true' };
      break;
    case 'numeric': {
      const n = Number(d.correct.trim().replace(/,/g, ''));
      if (!d.correct.trim() || !Number.isFinite(n)) return { ok: false, error: 'numericInvalid' };
      answer = { correct: n };
      break;
    }
    default: {
      const c = squash(d.correct);
      if (!c) return { ok: false, error: 'shortRequired' };
      const also = [
        ...new Set(
          d.also
            .split('\n')
            .map(squash)
            .filter((x) => x && x !== c),
        ),
      ].slice(0, 10);
      answer = also.length ? { correct: c, also } : { correct: c };
    }
  }

  const oldView = reviewView(item);
  const wordsChanged =
    !same(oldView.stem, stem) ||
    (item.type === 'mcq' &&
      !same(
        oldView.options.map((o) => o.text),
        (body.options as { text: Bi }[]).map((o) => o.text),
      ));
  if (wordsChanged) delete body.audio;

  const oldEx = isObj(item.explanation) ? item.explanation : null;
  const ex = bi(d.explEn, d.explUr);
  const explanation: Obj | null =
    ex.en || ex.ur || oldEx?.why_wrong ? { ...(oldEx ?? {}), en: ex.en, ur: ex.ur } : null;

  const patch: ReviewPatch = {};
  if (!same(oldBody, body)) patch.body = body;
  if (!same(item.answer ?? null, answer)) patch.answer = answer;
  if (!same(oldEx, explanation)) patch.explanation = explanation;
  if (d.level !== item.cognitive_level) patch.cognitive_level = d.level;
  if (d.difficulty !== item.difficulty) patch.difficulty = d.difficulty;
  if (d.conceptId !== item.concept_id) patch.concept_id = d.conceptId;
  return { ok: true, patch, changed: Object.keys(patch).length > 0 };
}
