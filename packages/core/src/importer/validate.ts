// The importer's dry run (prompt 21): one topic file in, a report out. Nothing
// here touches the network; bank duplicates are merged in afterwards
// (addBankMatches) and maths is rendered by an injected renderer (renderMath).
//
// File shape: DATABASE_DESIGN §4 "Import file", produced by prompt C1. Rules:
// schema (zod), exactly one correct key present in the options, concept +
// cognitive level on every question (CLAUDE.md rule 6), difficulty 1–3,
// English + Urdu presence (a warning: a missing translation is flagged, never
// passed off as reviewed), duplicates (exact normalised text + trigram
// similarity), visual block checks (alt, captions, safe SVG within budget,
// scene layers, widget catalogue, safe expressions).
//
// Per-question errors leave that question out; the rest can still import.
// Errors in the topic or concepts stop the whole file (questions hang on them).
import { z } from 'zod';

import { COGNITIVE_LEVELS, MAX_OPTIONS, MAX_QUESTION_MARKS, MIN_OPTIONS } from '../questions';
import { checkBlock } from '../visuals/blocks';

import {
  compactMathSvg,
  extractMath,
  mathKey,
  mathUnbalanced,
  MAX_TEX_LENGTH,
  type MathRender,
} from './math';
import {
  bestBankMatches,
  findInFileMatches,
  primaryText,
  questionMatchKey,
  SIMILAR_THRESHOLD,
  type BankCandidate,
} from './similar';
import {
  IMPORTABLE_TYPES,
  type Bi,
  type ImportableType,
  type ImportReport,
  type Issue,
  type IssueCode,
  type ParsedConcept,
  type ParsedFile,
  type ParsedLesson,
  type ParsedQuestion,
  type QuestionRow,
} from './types';

export const IMPORT_LIMITS = {
  fileMaxMb: 10,
  maxQuestions: 2000,
  stemMax: 2000,
  optionMax: 500,
  explanationMax: 4000,
  titleMax: 200,
  blockTextMax: 20000,
  maxBlocks: 200,
} as const;

// ---- schema ----------------------------------------------------------------------

const BiIn = z.union([
  z.string(),
  z.object({ en: z.string().optional(), ur: z.string().optional() }).passthrough(),
]);

const TopicIn = z.object({
  title_en: z.string().trim().min(1).max(IMPORT_LIMITS.titleMax),
  title_ur: z.string().max(IMPORT_LIMITS.titleMax).optional(),
});

const ConceptIn = z.object({
  key: z.string().trim().min(1).max(40),
  title_en: z.string().trim().min(1).max(IMPORT_LIMITS.titleMax),
  title_ur: z.string().max(IMPORT_LIMITS.titleMax).optional(),
  requires: z.array(z.string()).max(50).optional(),
});

const FileIn = z.object({
  curriculum: z.string().max(120).optional(),
  class: z.string().max(120).optional(),
  subject: z.string().max(120).optional(),
  chapter: z.string().max(300).optional(),
  topic: TopicIn,
  concepts: z.array(ConceptIn).min(1).max(40),
  lesson: z
    .object({
      blocks: z.array(z.unknown()).max(IMPORT_LIMITS.maxBlocks).optional(),
      alternatives: z
        .array(
          z.object({
            concept_id: z.string(),
            blocks: z.array(z.unknown()).max(IMPORT_LIMITS.maxBlocks),
          }),
        )
        .max(40)
        .optional(),
    })
    .optional(),
  questions: z.array(z.unknown()),
  test_data: z.boolean().optional(),
});

const OptionIn = z.object({ key: z.string(), text: BiIn });

const QuestionIn = z.object({
  concept: z.string().trim().min(1),
  type: z.string(),
  difficulty: z.unknown().optional(),
  cognitive_level: z.unknown().optional(),
  marks: z.number().int().optional(),
  body: z
    .object({
      stem: BiIn.optional(),
      options: z.array(OptionIn).optional(),
      visual: z.record(z.unknown()).optional(),
    })
    .passthrough(),
  answer: z
    .object({ correct: z.unknown(), also: z.array(z.string()).max(10).optional() })
    .passthrough(),
  explanation: z
    .object({
      en: z.string().optional(),
      ur: z.string().optional(),
      why_wrong: z.record(BiIn).optional(),
    })
    .optional()
    .nullable(),
  source: z.record(z.unknown()).optional().nullable(),
});

const BODY_KEYS = new Set(['stem', 'options', 'visual']);

// ---- helpers ---------------------------------------------------------------------

const bi = (v: z.infer<typeof BiIn> | undefined): Bi =>
  typeof v === 'string'
    ? { en: v.trim(), ur: '' }
    : { en: (v?.en ?? '').trim(), ur: (v?.ur ?? '').trim() };

function zodPath(base: string, path: (string | number)[]): string {
  return path.reduce<string>(
    (acc, p) => (typeof p === 'number' ? `${acc}[${p}]` : acc ? `${acc}.${p}` : p),
    base,
  );
}

function zodIssues(err: z.ZodError, base: string, q?: number): Issue[] {
  return err.issues.map((i) => {
    let code: IssueCode = 'badValue';
    if (i.code === 'invalid_type') code = i.received === 'undefined' ? 'required' : 'wrongType';
    else if (i.code === 'too_big') code = 'tooLong';
    else if (i.code === 'too_small') code = 'required';
    else if (i.code === 'invalid_union') code = 'wrongType';
    const issue: Issue = { severity: 'error', code, path: zodPath(base, i.path) };
    if (q !== undefined) issue.q = q;
    return issue;
  });
}

function preview(b: Bi): string {
  const s = (b.en || b.ur).replace(/\s+/g, ' ').trim();
  return s.length > 120 ? `${s.slice(0, 119)}…` : s;
}

// ---- one question ----------------------------------------------------------------

function checkQuestion(
  raw: unknown,
  index: number,
  conceptKeys: ReadonlySet<string>,
): { parsed: ParsedQuestion | null; issues: Issue[]; row: QuestionRow } {
  const issues: Issue[] = [];
  const base = `questions[${index}]`;
  const add = (severity: 'error' | 'warning', code: IssueCode, path: string, detail?: string) => {
    const i: Issue = { severity, code, path, q: index };
    if (detail !== undefined) i.detail = detail;
    issues.push(i);
  };
  const row: QuestionRow = { index, status: 'error', type: '', concept: '', preview: '' };

  const res = QuestionIn.safeParse(raw);
  if (!res.success) {
    issues.push(...zodIssues(res.error, base, index));
    if (raw && typeof raw === 'object') {
      const r = raw as Record<string, unknown>;
      row.type = typeof r.type === 'string' ? r.type : '';
      row.concept = typeof r.concept === 'string' ? r.concept : '';
      const b = r.body as Record<string, unknown> | undefined;
      row.preview = preview(
        bi(
          typeof b?.stem === 'string' || typeof b?.stem === 'object'
            ? (b.stem as never)
            : undefined,
        ),
      );
    }
    return { parsed: null, issues, row };
  }
  const q = res.data;
  row.type = q.type;
  row.concept = q.concept;

  for (const k of Object.keys(q.body))
    if (!BODY_KEYS.has(k)) add('warning', 'fieldIgnored', `${base}.body.${k}`);

  const type = q.type as ImportableType;
  if (!(IMPORTABLE_TYPES as readonly string[]).includes(q.type))
    add('error', 'typeUnsupported', `${base}.type`, q.type);
  if (!conceptKeys.has(q.concept)) add('error', 'conceptUnknown', `${base}.concept`, q.concept);

  if (q.cognitive_level === undefined || q.cognitive_level === null || q.cognitive_level === '')
    add('error', 'cognitiveMissing', `${base}.cognitive_level`);
  else if (!(COGNITIVE_LEVELS as readonly unknown[]).includes(q.cognitive_level))
    add('error', 'cognitiveInvalid', `${base}.cognitive_level`, String(q.cognitive_level));

  const diff = q.difficulty;
  if (diff !== 1 && diff !== 2 && diff !== 3)
    add('error', 'difficultyRange', `${base}.difficulty`, String(diff ?? '—'));

  const marks = q.marks ?? 1;
  if (marks < 1 || marks > MAX_QUESTION_MARKS)
    add('error', 'marksRange', `${base}.marks`, String(marks));

  // stem
  const stem = bi(q.body.stem);
  row.preview = preview(stem);
  let complete = true;
  if (!stem.en && !stem.ur) add('error', 'stemMissing', `${base}.body.stem`);
  else {
    if (!stem.en) add('warning', 'enMissing', `${base}.body.stem`);
    if (!stem.ur) {
      add('warning', 'urMissing', `${base}.body.stem`);
      complete = false;
    }
    if (Math.max(stem.en.length, stem.ur.length) > IMPORT_LIMITS.stemMax)
      add('error', 'tooLong', `${base}.body.stem`);
  }

  // options + answer
  let options: { key: string; text: Bi }[] | undefined;
  const correct = q.answer.correct;
  if (type === 'mcq') {
    const opts = q.body.options ?? [];
    if (opts.length < MIN_OPTIONS || opts.length > MAX_OPTIONS)
      add('error', 'optionsCount', `${base}.body.options`, String(opts.length));
    const keys = new Set<string>();
    const texts = new Set<string>();
    options = opts.map((o, i) => {
      const key = o.key.trim();
      const text = bi(o.text);
      const p = `${base}.body.options[${i}]`;
      if (!key) add('error', 'required', `${p}.key`);
      else if (keys.has(key)) add('error', 'optionKeyDuplicate', `${p}.key`, key);
      keys.add(key);
      if (!text.en && !text.ur) add('error', 'optionTextMissing', `${p}.text`, key);
      else {
        if (!text.ur) complete = false;
        if (Math.max(text.en.length, text.ur.length) > IMPORT_LIMITS.optionMax)
          add('error', 'tooLong', `${p}.text`);
        const t = (text.en || text.ur).toLowerCase();
        if (texts.has(t)) add('warning', 'optionsSame', `${p}.text`, key);
        texts.add(t);
      }
      return { key, text };
    });
    if (!stem.ur || options.some((o) => !o.text.ur)) {
      if (options.some((o) => o.text.en && !o.text.ur))
        add('warning', 'urMissing', `${base}.body.options`);
    }
    if (Array.isArray(correct)) add('error', 'correctNotSingle', `${base}.answer.correct`);
    else if (typeof correct !== 'string' || !correct.trim())
      add('error', 'correctMissing', `${base}.answer.correct`);
    else if (!keys.has(correct.trim()))
      add('error', 'correctMissing', `${base}.answer.correct`, correct);
  } else if (type === 'true_false') {
    if (typeof correct !== 'boolean') add('error', 'answerInvalid', `${base}.answer.correct`);
  } else if (type === 'numeric') {
    if (typeof correct !== 'number' || !Number.isFinite(correct))
      add('error', 'answerInvalid', `${base}.answer.correct`);
  } else if (type === 'short_text') {
    if (typeof correct !== 'string' || !correct.trim())
      add('error', 'answerInvalid', `${base}.answer.correct`);
  }
  if (type !== 'mcq' && q.body.options !== undefined)
    add('warning', 'fieldIgnored', `${base}.body.options`);

  // explanation
  let explanation: ParsedQuestion['explanation'] = null;
  if (!q.explanation || (!q.explanation.en?.trim() && !q.explanation.ur?.trim())) {
    add('warning', 'explanationMissing', `${base}.explanation`);
  } else {
    const e = bi(q.explanation);
    if (Math.max(e.en.length, e.ur.length) > IMPORT_LIMITS.explanationMax)
      add('error', 'tooLong', `${base}.explanation`);
    if (!e.ur) {
      add('warning', 'urMissing', `${base}.explanation`);
      complete = false;
    }
    explanation = e;
    const ww = q.explanation.why_wrong;
    if (ww) {
      const why: Record<string, Bi> = {};
      for (const [k, v] of Object.entries(ww)) {
        if (type === 'mcq' && options && !options.some((o) => o.key === k))
          add('warning', 'whyWrongUnknown', `${base}.explanation.why_wrong.${k}`, k);
        why[k] = bi(v);
      }
      explanation = { ...e, why_wrong: why };
    }
  }

  // a static figure/chart on the question (exam-safe only)
  if (q.body.visual) {
    for (const i of checkBlock(
      q.body.visual,
      `${base}.body.visual`,
      { conceptKeys, examSafe: true },
      index,
    ))
      issues.push(i);
  }

  // maths delimiters
  for (const [p, text] of mathTexts({ stem, options, explanation }, base))
    if (mathUnbalanced(text)) add('warning', 'mathUnbalanced', p);

  const hasError = issues.some((i) => i.severity === 'error');
  row.status = hasError ? 'error' : 'ok';
  if (hasError) return { parsed: null, issues, row };

  const body: ParsedQuestion['body'] = { stem };
  if (options) body.options = options;
  if (q.body.visual) body.visual = q.body.visual;
  const answer: ParsedQuestion['answer'] =
    type === 'mcq'
      ? { correct: String(correct).trim() }
      : type === 'short_text'
        ? { correct: String(correct).trim(), ...(q.answer.also ? { also: q.answer.also } : {}) }
        : { correct: correct as number | boolean };
  return {
    parsed: {
      index,
      concept: q.concept,
      type,
      difficulty: diff as 1 | 2 | 3,
      cognitive_level: q.cognitive_level as ParsedQuestion['cognitive_level'],
      marks,
      body,
      answer,
      explanation,
      source: q.source ?? null,
      languageComplete: complete,
    },
    issues,
    row,
  };
}

/** Every bilingual text of a question, with its path. */
function mathTexts(
  q: {
    stem: Bi;
    options?: { key: string; text: Bi }[];
    explanation: ParsedQuestion['explanation'];
  },
  base: string,
): [string, string][] {
  const out: [string, string][] = [];
  const push = (p: string, b: Bi) => {
    if (b.en) out.push([`${p}.en`, b.en]);
    if (b.ur) out.push([`${p}.ur`, b.ur]);
  };
  push(`${base}.body.stem`, q.stem);
  q.options?.forEach((o, i) => push(`${base}.body.options[${i}].text`, o.text));
  if (q.explanation) {
    push(`${base}.explanation`, q.explanation);
    for (const [k, v] of Object.entries(q.explanation.why_wrong ?? {}))
      push(`${base}.explanation.why_wrong.${k}`, v);
  }
  return out;
}

// ---- concepts --------------------------------------------------------------------

function conceptLoop(concepts: ParsedConcept[]): string | null {
  const next = new Map<string, string[]>();
  for (const c of concepts) next.set(c.key, [...(next.get(c.key) ?? []), ...c.requires]);
  const state = new Map<string, 1 | 2>();
  const visit = (k: string): string | null => {
    if (state.get(k) === 2) return null;
    if (state.get(k) === 1) return k;
    state.set(k, 1);
    for (const r of next.get(k) ?? []) {
      const hit = visit(r);
      if (hit) return hit;
    }
    state.set(k, 2);
    return null;
  };
  for (const c of concepts) {
    const hit = visit(c.key);
    if (hit) return hit;
  }
  return null;
}

// ---- the file --------------------------------------------------------------------

export interface ValidateResult {
  report: ImportReport;
  /** Null when the file can't import at all (fileOk = false). */
  file: ParsedFile | null;
  /** Normalised duplicate keys of the parsed questions, same order (for bank matching). */
  keys: string[];
}

/** Read the text of an uploaded file (JSON). */
export function parseImportText(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text.replace(/^\uFEFF/, '')) };
  } catch {
    return { ok: false };
  }
}

export function validateImportFile(raw: unknown, opts: { bytes?: number } = {}): ValidateResult {
  const issues: Issue[] = [];
  const empty = (): ValidateResult => ({
    report: {
      fileOk: false,
      counts: {
        questions: 0,
        ready: 0,
        errors: 0,
        duplicates: 0,
        similar: 0,
        warnings: issues.filter((i) => i.severity === 'warning').length,
        concepts: 0,
        lessonBlocks: 0,
        mathExpressions: 0,
      },
      issues,
      rows: [],
      lessons: [],
    },
    file: null,
    keys: [],
  });

  if (opts.bytes !== undefined && opts.bytes > IMPORT_LIMITS.fileMaxMb * 1024 * 1024) {
    issues.push({
      severity: 'error',
      code: 'tooLarge',
      path: '',
      detail: String(IMPORT_LIMITS.fileMaxMb),
    });
    return empty();
  }
  const top = FileIn.safeParse(raw);
  if (!top.success) {
    issues.push(...zodIssues(top.error, ''));
    return empty();
  }
  const f = top.data;
  if (f.questions.length > IMPORT_LIMITS.maxQuestions) {
    issues.push({
      severity: 'error',
      code: 'tooManyQuestions',
      path: 'questions',
      detail: String(IMPORT_LIMITS.maxQuestions),
    });
    return empty();
  }

  // topic + concepts
  const topic = { title_en: f.topic.title_en.trim(), title_ur: (f.topic.title_ur ?? '').trim() };
  if (!topic.title_ur)
    issues.push({ severity: 'warning', code: 'urMissing', path: 'topic.title_ur' });
  const concepts: ParsedConcept[] = [];
  const keys = new Set<string>();
  const titles = new Set<string>();
  f.concepts.forEach((c, i) => {
    const key = c.key.trim();
    if (keys.has(key))
      issues.push({
        severity: 'error',
        code: 'conceptKeyDuplicate',
        path: `concepts[${i}].key`,
        detail: key,
      });
    keys.add(key);
    const t = c.title_en.trim().toLowerCase();
    if (titles.has(t))
      issues.push({
        severity: 'error',
        code: 'conceptTitleDuplicate',
        path: `concepts[${i}].title_en`,
        detail: c.title_en,
      });
    titles.add(t);
    if (!c.title_ur?.trim())
      issues.push({ severity: 'warning', code: 'urMissing', path: `concepts[${i}].title_ur` });
    concepts.push({
      key,
      title_en: c.title_en.trim(),
      title_ur: (c.title_ur ?? '').trim(),
      requires: [],
    });
  });
  f.concepts.forEach((c, i) => {
    const own = concepts[i]!;
    for (const r of c.requires ?? []) {
      const rk = r.trim();
      if (!keys.has(rk)) {
        // C1 may describe an earlier chapter's concept in words: link it by hand later.
        issues.push({
          severity: 'warning',
          code: 'requiresUnknown',
          path: `concepts[${i}].requires`,
          detail: r,
        });
      } else if (rk === own.key) {
        issues.push({
          severity: 'error',
          code: 'requiresLoop',
          path: `concepts[${i}].requires`,
          detail: rk,
        });
      } else if (!own.requires.includes(rk)) own.requires.push(rk);
    }
  });
  const loop = conceptLoop(concepts);
  if (loop)
    issues.push({ severity: 'error', code: 'requiresLoop', path: 'concepts', detail: loop });

  // Only the topic and concepts can stop the file: questions and lessons hang on them.
  const fileOk = !issues.some((i) => i.severity === 'error');

  // lesson + alternatives
  const lessons: ParsedLesson[] = [];
  const lessonRows: ImportReport['lessons'] = [];
  let lessonBlocks = 0;
  const lessonIn: {
    kind: 'lesson' | 'alternative';
    concept: string | null;
    blocks: unknown[];
    path: string;
  }[] = [];
  if (f.lesson?.blocks?.length)
    lessonIn.push({
      kind: 'lesson',
      concept: null,
      blocks: f.lesson.blocks,
      path: 'lesson.blocks',
    });
  f.lesson?.alternatives?.forEach((a, i) =>
    lessonIn.push({
      kind: 'alternative',
      concept: a.concept_id,
      blocks: a.blocks,
      path: `lesson.alternatives[${i}].blocks`,
    }),
  );
  for (const l of lessonIn) {
    const before = issues.length;
    if (l.concept !== null && !keys.has(l.concept))
      issues.push({
        severity: 'error',
        code: 'lessonConceptUnknown',
        path: l.path.replace(/\.blocks$/, '.concept_id'),
        detail: l.concept,
      });
    l.blocks.forEach((b, i) => {
      issues.push(...checkBlock(b, `${l.path}[${i}]`, { conceptKeys: keys }));
      if (b && typeof b === 'object') {
        const r = b as Record<string, unknown>;
        for (const side of ['en', 'ur'] as const) {
          const text = r[side];
          if (typeof text === 'string') {
            if (text.length > IMPORT_LIMITS.blockTextMax)
              issues.push({ severity: 'error', code: 'tooLong', path: `${l.path}[${i}].${side}` });
            if (mathUnbalanced(text))
              issues.push({
                severity: 'warning',
                code: 'mathUnbalanced',
                path: `${l.path}[${i}].${side}`,
              });
          }
        }
      }
    });
    const ok = !issues.slice(before).some((i) => i.severity === 'error');
    lessonBlocks += l.blocks.length;
    lessonRows.push({ kind: l.kind, concept: l.concept, blocks: l.blocks.length, ok });
    if (ok)
      lessons.push({
        kind: l.kind,
        concept: l.concept,
        blocks: l.blocks as Record<string, unknown>[],
      });
  }

  // questions
  if (f.questions.length === 0)
    issues.push({ severity: 'warning', code: 'noQuestions', path: 'questions' });
  const rows: QuestionRow[] = [];
  const parsed: ParsedQuestion[] = [];
  f.questions.forEach((q, i) => {
    const r = checkQuestion(q, i, keys);
    issues.push(...r.issues);
    rows.push(r.row);
    if (r.parsed) parsed.push(r.parsed);
  });

  // concepts with no question get no diagnostic: worth a look, not an error
  const used = new Set(parsed.map((q) => q.concept));
  concepts.forEach((c, i) => {
    if (f.questions.length > 0 && !used.has(c.key))
      issues.push({
        severity: 'warning',
        code: 'conceptUnused',
        path: `concepts[${i}]`,
        detail: c.key,
      });
  });

  // duplicates inside the file
  const matchKeys = parsed.map((q) => questionMatchKey(q.body));
  for (const m of findInFileMatches(matchKeys)) {
    const q = parsed[m.of]!;
    const other = parsed[m.match]!;
    const row = rows[q.index]!;
    row.status = m.exact ? 'duplicate' : 'similar';
    row.match = {
      where: 'file',
      ref: String(other.index),
      similarity: m.similarity,
      preview: rows[other.index]!.preview,
    };
    issues.push({
      severity: m.exact ? 'error' : 'warning',
      code: m.exact ? 'duplicateInFile' : 'similarInFile',
      path: `questions[${q.index}]`,
      q: q.index,
      detail: String(other.index + 1),
    });
  }

  const file: ParsedFile = {
    curriculum: (f.curriculum ?? '').trim(),
    className: (f.class ?? '').trim(),
    subject: (f.subject ?? '').trim(),
    chapter: (f.chapter ?? '').trim(),
    topic,
    concepts,
    lessons,
    questions: parsed,
    testData: f.test_data === true,
  };
  const report: ImportReport = {
    fileOk,
    counts: {
      questions: f.questions.length,
      ready: 0,
      errors: 0,
      duplicates: 0,
      similar: 0,
      warnings: 0,
      concepts: concepts.length,
      lessonBlocks,
      mathExpressions: 0,
    },
    issues,
    rows,
    lessons: lessonRows,
  };
  recount(report);
  return { report, file: fileOk ? file : null, keys: matchKeys };
}

/** Recompute the counts after anything changed rows or issues. */
export function recount(report: ImportReport): void {
  const c = report.counts;
  c.ready = report.rows.filter((r) => r.status === 'ok' || r.status === 'similar').length;
  c.errors = report.rows.filter((r) => r.status === 'error').length;
  c.duplicates = report.rows.filter((r) => r.status === 'duplicate').length;
  c.similar = report.rows.filter((r) => r.status === 'similar').length;
  c.warnings = report.issues.filter((i) => i.severity === 'warning').length;
}

/**
 * Merge the bank lookup in: an exact match is a duplicate (never imported
 * again), a close one is "similar" (flagged; imported unless left out).
 */
export function addBankMatches(
  v: ValidateResult,
  candidates: BankCandidate[],
  threshold = SIMILAR_THRESHOLD,
): void {
  if (!v.file) return;
  const qs = v.file.questions;
  for (const m of bestBankMatches(v.keys, candidates, threshold)) {
    const q = qs[m.of];
    if (!q) continue;
    const row = v.report.rows[q.index]!;
    if (row.status === 'duplicate' || row.status === 'error') continue;
    if (row.status === 'similar' && !m.exact && row.match && row.match.similarity >= m.similarity)
      continue;
    const body = m.body as Record<string, unknown> | null;
    const prev = primaryText(body?.stem) || primaryText(body?.prompt);
    row.status = m.exact ? 'duplicate' : 'similar';
    row.match = {
      where: 'bank',
      ref: m.question_id,
      similarity: m.similarity,
      preview: prev.slice(0, 120),
    };
    v.report.issues.push({
      severity: m.exact ? 'error' : 'warning',
      code: m.exact ? 'duplicateInBank' : 'similarInBank',
      path: `questions[${q.index}]`,
      q: q.index,
      detail: m.question_id,
    });
  }
  recount(v.report);
}

// ---- maths -----------------------------------------------------------------------

export interface MathResult {
  /** TeX key → compact SVG, for every expression that rendered. */
  svgs: Map<string, string>;
}

/**
 * Render every distinct `$…$` in the importable questions and lesson text.
 * A question whose maths doesn't render becomes an error row (left out); a
 * lesson block whose maths fails makes that lesson not ok.
 */
export function renderMath(
  v: ValidateResult,
  render: MathRender,
  known: ReadonlySet<string> = new Set(),
): MathResult {
  const svgs = new Map<string, string>();
  const failed = new Map<string, string>();
  const run = (text: string): string | null => {
    for (const seg of extractMath(text)) {
      const key = mathKey(seg);
      if (svgs.has(key) || known.has(key)) continue;
      const bad = failed.get(key);
      if (bad !== undefined) return seg.tex;
      if (seg.tex.length > MAX_TEX_LENGTH) {
        failed.set(key, 'tooLong');
        return seg.tex;
      }
      const r = render(seg.tex, seg.display);
      if (r.ok) svgs.set(key, compactMathSvg(r.svg));
      else {
        failed.set(key, r.error);
        return seg.tex;
      }
    }
    return null;
  };
  if (!v.file) return { svgs };
  const total = new Set<string>();
  const count = (text: string) => extractMath(text).forEach((s) => total.add(mathKey(s)));

  const keep: ParsedQuestion[] = [];
  const keepKeys: string[] = [];
  v.file.questions.forEach((q, qi) => {
    let bad: string | null = null;
    for (const [p, text] of mathTexts(
      { stem: q.body.stem, options: q.body.options, explanation: q.explanation },
      `questions[${q.index}]`,
    )) {
      count(text);
      const tex = run(text);
      if (tex !== null) {
        bad = tex;
        v.report.issues.push({
          severity: 'error',
          code: 'mathError',
          path: p,
          q: q.index,
          detail: tex,
        });
        break;
      }
    }
    if (bad === null) {
      keep.push(q);
      keepKeys.push(v.keys[qi]!);
    } else {
      const row = v.report.rows[q.index]!;
      row.status = 'error';
      delete row.match;
    }
  });
  v.file.questions = keep;
  v.keys = keepKeys;

  v.file.lessons = v.file.lessons.filter((l) => {
    let ok = true;
    l.blocks.forEach((b, i) => {
      for (const side of ['en', 'ur'] as const) {
        const text = b[side];
        if (typeof text !== 'string') continue;
        count(text);
        const tex = run(text);
        if (tex !== null) {
          ok = false;
          v.report.issues.push({
            severity: 'error',
            code: 'mathError',
            path: `${l.kind === 'lesson' ? 'lesson.blocks' : `lesson.alternatives(${l.concept})`}[${i}].${side}`,
            detail: tex,
          });
        }
      }
    });
    if (!ok) {
      const row = v.report.lessons.find((r) => r.kind === l.kind && r.concept === l.concept);
      if (row) row.ok = false;
    }
    return ok;
  });
  v.report.counts.mathExpressions = total.size;
  recount(v.report);
  return { svgs };
}
