// Student attempts: what counts as answered, the raw `responses` record, the
// submission row, and the state an assessment shows in the student's list.
// Ported from the old src/lib/attemptStore.js (isAnswered, buildResponses);
// pinned by test/attempts.test.ts. RLS (db/005 + db/025) is the real boundary.
//
// The record is deliberately NOT a score (rule 3): raw per-question values, in
// question order, so a grade can be recomputed later. Shape (unchanged, version 1):
//   { answers: [{ question_id, type, value }], answered_count, total_questions, version: 1 }

import type { SyncItem } from './sync/queue';

export type AnswerValue = string | boolean | null | undefined;
export type Answers = Record<string, AnswerValue>;

/** Types the student screen can answer (others show "can't answer here yet"). */
export const ANSWERABLE_TYPES = [
  'mcq',
  'true_false',
  'numeric',
  'short_text',
  'tap_image',
] as const;
export type AnswerableType = (typeof ANSWERABLE_TYPES)[number];

export function isAnswerable(type: string): type is AnswerableType {
  return (ANSWERABLE_TYPES as readonly string[]).includes(type);
}

export interface AttemptQuestion {
  id: string;
  type: string;
  body: unknown;
  marks: number;
}

/** Strict: a blank numeric / short answer or a null pick is unanswered. */
export function isAnswered(type: string, value: AnswerValue): boolean {
  if (type === 'true_false') return value === true || value === false;
  if (type === 'numeric' || type === 'short_text') {
    return typeof value === 'string' && value.trim() !== '';
  }
  // mcq option key / tap_image choice id
  return typeof value === 'string' && value.length > 0;
}

function normaliseValue(type: string, value: AnswerValue): string | boolean | null {
  if (!isAnswered(type, value)) return null;
  if (type === 'numeric' || type === 'short_text') return String(value).trim();
  return value as string | boolean;
}

// Type aliases (not interfaces) so they fit the generated `Json` column type.
export type ResponseItem = {
  question_id: string;
  type: string;
  value: string | boolean | null;
};
export type Responses = {
  answers: ResponseItem[];
  answered_count: number;
  total_questions: number;
  version: 1;
};

export function buildResponses(
  questions: readonly Pick<AttemptQuestion, 'id' | 'type'>[] | null | undefined,
  answers: Answers | null | undefined,
): Responses {
  const list = Array.isArray(questions) ? questions : [];
  const items = list.map((q) => ({
    question_id: q.id,
    type: q.type,
    value: normaliseValue(q.type, answers?.[q.id]),
  }));
  return {
    answers: items,
    answered_count: items.filter((i) => i.value !== null).length,
    total_questions: items.length,
    version: 1,
  };
}

export function answeredCount(
  questions: readonly Pick<AttemptQuestion, 'id' | 'type'>[],
  answers: Answers,
): number {
  return questions.filter((q) => isAnswered(q.type, answers[q.id])).length;
}

/** Keep only answers to questions in this paper (a draft may outlive an edit). */
export function pruneAnswers(
  questions: readonly Pick<AttemptQuestion, 'id'>[],
  answers: Answers | null | undefined,
): Answers {
  const ids = new Set(questions.map((q) => q.id));
  const out: Answers = {};
  for (const [k, v] of Object.entries(answers ?? {})) if (ids.has(k)) out[k] = v;
  return out;
}

// ---- Queue + submission row ---------------------------------------------------

export const SUBMISSION_KIND = 'submission';

/** Identity of one attempt: one per (enrollment, assessment), like the DB's unique key. */
export function attemptKey(enrollmentId: string, assessmentId: string): string {
  return `${enrollmentId}:${assessmentId}`;
}

export interface SubmissionPayload {
  enrollment_id: string;
  assessment_id: string;
  responses: Responses;
  /** ISO time the student pressed submit (not when it reached the server). */
  submitted_at: string;
}

/**
 * The row a student inserts. id = the queue item's client UUID; score and
 * graded_* are omitted so they stay null (db/005 requires that).
 */
export function submissionRow(item: Pick<SyncItem<SubmissionPayload>, 'id' | 'payload'>) {
  const p = item.payload;
  return {
    id: item.id,
    enrollment_id: p.enrollment_id,
    assessment_id: p.assessment_id,
    responses: p.responses,
    submitted_at: p.submitted_at,
  };
}

// ---- List state ---------------------------------------------------------------

/**
 * What a published assessment shows in the student's list:
 *   submitted  on the server (a submissions row exists)
 *   waiting    submitted on this device, not yet sent
 *   problem    the server refused it (kept on the device, shown to the student)
 *   started    a draft exists
 *   todo       nothing yet
 */
export type AttemptState = 'submitted' | 'waiting' | 'problem' | 'started' | 'todo';

export function attemptState(opts: {
  onServer: boolean;
  queued: Pick<SyncItem, 'state'> | null | undefined;
  hasDraft: boolean;
}): AttemptState {
  if (opts.onServer) return 'submitted';
  if (opts.queued) return opts.queued.state === 'rejected' ? 'problem' : 'waiting';
  if (opts.hasDraft) return 'started';
  return 'todo';
}

/** Score as a whole-number percent, or null when not marked / no total. */
export function scorePercent(score: number | null, total: number | null): number | null {
  if (score == null || !total || total <= 0) return null;
  return Math.round((Number(score) / total) * 100);
}
