// Question authoring rules: turn a teacher's form into the questions.body /
// questions.answer jsonb pair, and turn a stored row back into a form. Pure and
// unit-tested (test/questions.test.ts); the app's form only renders this.
//
// Shapes (unchanged from the old app and db/006, DATABASE_DESIGN.md §questions):
//   mcq         body { stem, options: [{ key: 'A', text }] }  answer { correct: 'A' }
//   true_false  body { stem }                                 answer { correct: true }
//   numeric     body { stem }                                 answer { correct: 42 }
//   short_text  body { stem }                                 answer { correct: 'Lahore', also?: ['lahore city'] }
//   tap_image   body { prompt{en,ur}, choices[] … }           answer { correct: 'b' }  (read-only here)
//
// short_text had no shape before prompt 10 (DECISIONS #64): `correct` is the
// model answer, `also` the other accepted spellings; matching ignores case and
// extra spaces (see shortTextMatches).

import { toAsciiDigits } from './auth/login';

export const QUESTION_TYPES = [
  'mcq',
  'multi_select',
  'numeric',
  'short_text',
  'true_false',
  'tap_image',
  'match',
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

/** Types the authoring form can write. tap_image is listed and pickable, never edited here. */
export const AUTHORABLE_TYPES = ['mcq', 'true_false', 'numeric', 'short_text'] as const;
export type AuthorableType = (typeof AUTHORABLE_TYPES)[number];

export const COGNITIVE_LEVELS = ['recall', 'understand', 'apply', 'analyze'] as const;
export type CognitiveLevel = (typeof COGNITIVE_LEVELS)[number];

export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 6;
export const MAX_QUESTION_MARKS = 100;
export const MAX_SHORT_ALSO = 10;

/** i18n keys under `teacher.questions.errors`. */
export type QuestionError =
  | 'cognitiveRequired'
  | 'stemRequired'
  | 'optionTextRequired'
  | 'correctRequired'
  | 'numericRequired'
  | 'numericInvalid'
  | 'tfRequired'
  | 'shortRequired'
  | 'marksInvalid';

export interface QuestionDraft {
  type: AuthorableType;
  /** Required: no default, so the DB default ('recall') is never relied on (rule 6). */
  cognitive: CognitiveLevel | null;
  stem: string;
  /** mcq option texts, in order (keys come from position). */
  options: string[];
  /** mcq: index of the correct option. */
  correctIndex: number | null;
  /** numeric: the typed answer. */
  numeric: string;
  /** true_false: the chosen answer. */
  tf: boolean | null;
  /** short_text: the model answer. */
  short: string;
  /** short_text: other accepted answers, one per line. */
  shortAlso: string;
  /** Default marks; blank means 1. */
  marks: string;
}

export interface McqOption {
  key: string;
  text: string;
}

export type QuestionBody = { stem: string; options?: McqOption[] } & Record<string, unknown>;
export type QuestionAnswer = { correct: string | number | boolean; also?: string[] };

export type BuildResult =
  { body: QuestionBody; answer: QuestionAnswer; marks: number } | { error: QuestionError };

export function emptyDraft(type: AuthorableType = 'mcq'): QuestionDraft {
  return {
    type,
    cognitive: null,
    stem: '',
    options: ['', ''],
    correctIndex: null,
    numeric: '',
    tf: null,
    short: '',
    shortAlso: '',
    marks: '',
  };
}

/** Option key from its position: 0 → 'A', 1 → 'B' … */
export function optionKey(index: number): string {
  return String.fromCharCode(65 + index);
}

/** Accepts "42", "-2", "3.14", Urdu/Arabic-Indic digits; rejects "3a", "1/2", "". */
export function parseNumericAnswer(str: string): number | null {
  const s = toAsciiDigits(str).trim();
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Marks: a whole number 1–100; blank means 1. Null = present but invalid. */
export function parseQuestionMarks(str: string): number | null {
  const s = toAsciiDigits(str).trim();
  if (!s) return 1;
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return n >= 1 && n <= MAX_QUESTION_MARKS ? n : null;
}

/** Switch type, dropping answer state that doesn't apply so a stale key can't be saved. */
export function changeType(d: QuestionDraft, type: AuthorableType): QuestionDraft {
  if (d.type === type) return d;
  return {
    ...d,
    type,
    options: d.options.length >= MIN_OPTIONS ? d.options : ['', ''],
    correctIndex: null,
    numeric: '',
    tf: null,
    short: '',
    shortAlso: '',
  };
}

export function addOption(d: QuestionDraft): QuestionDraft {
  if (d.options.length >= MAX_OPTIONS) return d;
  return { ...d, options: [...d.options, ''] };
}

/** Remove an option and keep the correct-answer pointer on the same option. */
export function removeOption(d: QuestionDraft, index: number): QuestionDraft {
  if (d.options.length <= MIN_OPTIONS || index < 0 || index >= d.options.length) return d;
  const c = d.correctIndex;
  return {
    ...d,
    options: d.options.filter((_, i) => i !== index),
    correctIndex: c === null || c === index ? null : c > index ? c - 1 : c,
  };
}

function splitLines(s: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of s.split(/\r?\n/)) {
    const v = raw.trim();
    const k = normaliseShortText(v);
    if (v && !seen.has(k)) {
      seen.add(k);
      out.push(v);
    }
  }
  return out;
}

/** Validate a draft and build the jsonb pair, or the first error (form order). */
export function buildQuestion(d: QuestionDraft): BuildResult {
  if (!d.cognitive) return { error: 'cognitiveRequired' };
  const stem = d.stem.trim();
  if (!stem) return { error: 'stemRequired' };

  let body: QuestionBody = { stem };
  let answer: QuestionAnswer;
  switch (d.type) {
    case 'mcq': {
      const texts = d.options.map((o) => o.trim());
      if (texts.length < MIN_OPTIONS || texts.some((x) => !x)) {
        return { error: 'optionTextRequired' };
      }
      if (d.correctIndex === null || d.correctIndex < 0 || d.correctIndex >= texts.length) {
        return { error: 'correctRequired' };
      }
      body = { stem, options: texts.map((text, i) => ({ key: optionKey(i), text })) };
      answer = { correct: optionKey(d.correctIndex) };
      break;
    }
    case 'numeric': {
      if (!d.numeric.trim()) return { error: 'numericRequired' };
      const n = parseNumericAnswer(d.numeric);
      if (n === null) return { error: 'numericInvalid' };
      answer = { correct: n };
      break;
    }
    case 'true_false':
      if (d.tf === null) return { error: 'tfRequired' };
      answer = { correct: d.tf };
      break;
    case 'short_text': {
      const main = d.short.trim();
      if (!main) return { error: 'shortRequired' };
      const also = splitLines(d.shortAlso)
        .filter((v) => normaliseShortText(v) !== normaliseShortText(main))
        .slice(0, MAX_SHORT_ALSO);
      answer = also.length ? { correct: main, also } : { correct: main };
      break;
    }
  }

  const marks = parseQuestionMarks(d.marks);
  if (marks === null) return { error: 'marksInvalid' };
  return { body, answer, marks };
}

export interface StoredQuestion {
  type: string;
  cognitive_level: string;
  body: unknown;
  answer: unknown;
  default_marks: number | null;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function isAuthorable(type: string): type is AuthorableType {
  return (AUTHORABLE_TYPES as readonly string[]).includes(type);
}

export function isCognitiveLevel(v: unknown): v is CognitiveLevel {
  return typeof v === 'string' && (COGNITIVE_LEVELS as readonly string[]).includes(v);
}

/** A stored row back into a form (edit / duplicate). Null for types this form can't edit. */
export function draftFromQuestion(q: StoredQuestion): QuestionDraft | null {
  if (!isAuthorable(q.type)) return null;
  const body = isObj(q.body) ? q.body : {};
  const answer = isObj(q.answer) ? q.answer : {};
  const d = emptyDraft(q.type);
  d.cognitive = isCognitiveLevel(q.cognitive_level) ? q.cognitive_level : null;
  d.stem = typeof body.stem === 'string' ? body.stem : '';
  d.marks = q.default_marks != null ? String(q.default_marks) : '';
  const correct = answer.correct;
  switch (q.type) {
    case 'mcq': {
      const opts = Array.isArray(body.options) ? body.options.filter(isObj) : [];
      if (opts.length >= MIN_OPTIONS) {
        d.options = opts.map((o) => (typeof o.text === 'string' ? o.text : ''));
      }
      const idx = opts.findIndex((o) => o.key === correct);
      d.correctIndex = idx >= 0 && idx < d.options.length ? idx : null;
      break;
    }
    case 'numeric':
      d.numeric = typeof correct === 'number' || typeof correct === 'string' ? String(correct) : '';
      break;
    case 'true_false':
      d.tf = typeof correct === 'boolean' ? correct : null;
      break;
    case 'short_text':
      d.short = typeof correct === 'string' ? correct : '';
      d.shortAlso = Array.isArray(answer.also)
        ? answer.also.filter((v): v is string => typeof v === 'string').join('\n')
        : '';
      break;
  }
  return d;
}

/**
 * The text to show for a question in lists: the stem, or a tap_image prompt in
 * the UI language (falling back to the other one).
 */
export function questionLabel(body: unknown, locale: 'en' | 'ur' = 'en'): string {
  if (!isObj(body)) return '';
  if (typeof body.stem === 'string' && body.stem.trim()) return body.stem.trim();
  const p = body.prompt;
  if (isObj(p)) {
    const first = p[locale] ?? p[locale === 'en' ? 'ur' : 'en'];
    if (typeof first === 'string') return first.trim();
  }
  if (typeof body.prompt_text === 'string') return body.prompt_text.trim();
  return '';
}

/** Lower-case, collapse spaces, Latin digits: how short_text answers are compared. */
export function normaliseShortText(s: string): string {
  return toAsciiDigits(s).trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Does a typed response match a short_text answer key? (for grading, prompt 11+). */
export function shortTextMatches(response: string, answer: QuestionAnswer): boolean {
  const r = normaliseShortText(response);
  if (!r) return false;
  const keys = [answer.correct, ...(answer.also ?? [])];
  return keys.some((k) => typeof k === 'string' && normaliseShortText(k) === r);
}
