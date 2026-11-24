// Assessment builder rules: field parsing, the question list (order + marks),
// what a publish needs, and which status moves are allowed. Pure and
// unit-tested (test/assessments.test.ts); the DB's RLS is the real boundary.
//
// Lifecycle (db/setup.sql assessments.status): draft → published → closed, and a
// closed one can be reopened. Never back to draft once published, and the
// question set is fixed once published: students may already have answered it,
// and history is never rewritten (CLAUDE.md rule 7).

import { toAsciiDigits } from './auth/login';

/** Builder types. 'file' worksheets (db/014) are built in prompt 12. */
export const ASSESSMENT_TYPES = ['assignment', 'test', 'exam', 'quiz'] as const;
export type AssessmentType = (typeof ASSESSMENT_TYPES)[number];

export const ASSESSMENT_STATUSES = ['draft', 'published', 'closed'] as const;
export type AssessmentStatus = (typeof ASSESSMENT_STATUSES)[number];

export const MAX_ITEM_MARKS = 100;
export const MAX_WEIGHTAGE = 100;

/** i18n keys under `console.assessments.errors`. */
export type AssessmentError =
  'titleRequired' | 'weightageInvalid' | 'dateInvalid' | 'marksInvalid' | 'needQuestions';

export interface PickedQuestion {
  questionId: string;
  /** Marks for this question in this assessment, as typed. */
  marks: string;
}

export interface AssessmentDraft {
  title: string;
  type: AssessmentType;
  weightage: string;
  /** YYYY-MM-DD or blank. */
  scheduledOn: string;
  picks: PickedQuestion[];
}

export interface AssessmentFields {
  title: string;
  type: AssessmentType;
  weightage: number;
  scheduled_on: string | null;
  total_marks: number | null;
}

export interface AssessmentItemRow {
  question_id: string;
  marks: number;
  sort_order: number;
}

export type AssessmentBuild =
  | { fields: AssessmentFields; items: AssessmentItemRow[] }
  | { error: AssessmentError; questionId?: string };

export function emptyAssessment(): AssessmentDraft {
  return { title: '', type: 'test', weightage: '', scheduledOn: '', picks: [] };
}

export function isAssessmentType(v: unknown): v is AssessmentType {
  return typeof v === 'string' && (ASSESSMENT_TYPES as readonly string[]).includes(v);
}

export function isAssessmentStatus(v: unknown): v is AssessmentStatus {
  return typeof v === 'string' && (ASSESSMENT_STATUSES as readonly string[]).includes(v);
}

/** Per-question marks: whole number 1–100. Null = blank or invalid. */
export function parseItemMarks(str: string): number | null {
  const s = toAsciiDigits(String(str ?? '')).trim();
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return n >= 1 && n <= MAX_ITEM_MARKS ? n : null;
}

/** Weightage %: 0–100, up to two decimals (numeric(5,2)); blank = 0. Null = invalid. */
export function parseWeightage(str: string): number | null {
  const s = toAsciiDigits(String(str ?? '')).trim();
  if (!s) return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const n = Number(s);
  return n >= 0 && n <= MAX_WEIGHTAGE ? n : null;
}

/** A real calendar date in YYYY-MM-DD ("2025-02-30" is rejected, not rolled over). */
export function isValidIsoDate(str: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const d = new Date(`${str}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === str;
}

/** Sum of valid marks (invalid rows count 0, so the total never shows NaN). */
export function totalMarks(picks: readonly PickedQuestion[]): number {
  return picks.reduce((sum, p) => sum + (parseItemMarks(p.marks) ?? 0), 0);
}

/**
 * Validate for saving at `target` status. A draft may be saved with no
 * questions (fill it in later); published/closed need at least one.
 */
export function buildAssessment(d: AssessmentDraft, target: AssessmentStatus): AssessmentBuild {
  const title = d.title.trim();
  if (!title) return { error: 'titleRequired' };
  const weightage = parseWeightage(d.weightage);
  if (weightage === null) return { error: 'weightageInvalid' };
  const date = toAsciiDigits(d.scheduledOn).trim();
  if (date && !isValidIsoDate(date)) return { error: 'dateInvalid' };

  const items: AssessmentItemRow[] = [];
  const seen = new Set<string>();
  for (const p of d.picks) {
    if (seen.has(p.questionId)) continue;
    seen.add(p.questionId);
    const marks = parseItemMarks(p.marks);
    if (marks === null) return { error: 'marksInvalid', questionId: p.questionId };
    items.push({ question_id: p.questionId, marks, sort_order: items.length });
  }
  if (target !== 'draft' && items.length === 0) return { error: 'needQuestions' };

  const total = items.reduce((s, i) => s + i.marks, 0);
  return {
    fields: {
      title,
      type: d.type,
      weightage,
      scheduled_on: date || null,
      total_marks: items.length ? total : null,
    },
    items,
  };
}

export type StatusAction = 'publish' | 'close' | 'reopen';

/** The status moves offered from each status. */
export function statusActions(status: AssessmentStatus): StatusAction[] {
  switch (status) {
    case 'draft':
      return ['publish'];
    case 'published':
      return ['close'];
    case 'closed':
      return ['reopen'];
  }
}

export function statusAfter(action: StatusAction): AssessmentStatus {
  return action === 'close' ? 'closed' : 'published';
}

/** Questions, marks and type can change only while a draft. Title/date/weight stay editable. */
export function questionsLocked(status: AssessmentStatus): boolean {
  return status !== 'draft';
}

// ---- the picked-question list ------------------------------------------------

export function togglePick(
  picks: readonly PickedQuestion[],
  questionId: string,
  defaultMarks: number | null | undefined,
): PickedQuestion[] {
  if (picks.some((p) => p.questionId === questionId)) {
    return picks.filter((p) => p.questionId !== questionId);
  }
  const m = defaultMarks != null && defaultMarks >= 1 ? Math.min(defaultMarks, MAX_ITEM_MARKS) : 1;
  return [...picks, { questionId, marks: String(m) }];
}

export function setPickMarks(
  picks: readonly PickedQuestion[],
  questionId: string,
  marks: string,
): PickedQuestion[] {
  return picks.map((p) => (p.questionId === questionId ? { ...p, marks } : p));
}

/** Move one pick up (-1) or down (+1); out-of-range moves are no-ops. */
export function movePick(
  picks: readonly PickedQuestion[],
  questionId: string,
  delta: -1 | 1,
): PickedQuestion[] {
  const from = picks.findIndex((p) => p.questionId === questionId);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= picks.length) return [...picks];
  const next = [...picks];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

/** Diff saved items against wanted ones: which rows to delete and which to upsert. */
export function diffItems(
  existingIds: readonly string[],
  wanted: readonly AssessmentItemRow[],
): { remove: string[]; upsert: AssessmentItemRow[] } {
  const keep = new Set(wanted.map((w) => w.question_id));
  return { remove: existingIds.filter((id) => !keep.has(id)), upsert: [...wanted] };
}
