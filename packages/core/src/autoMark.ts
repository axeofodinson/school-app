// Auto-marking rules for a submitted attempt. The SERVER marks (db/018:
// auto_mark_item + the submissions insert trigger); this is the same rule in
// TypeScript so the app and tests can reason about it. Both are pinned by
// test/fixtures/auto-mark-cases.json (core test + db/test/018_smoke.sql), so a
// change to one must change the other.
//
//   mcq / tap_image  value is the option key / choice id; equal to answer.correct
//   true_false       value and correct are booleans
//   numeric          typed text, Latin or Urdu digits, optional sign and one
//                    decimal point (. or \u066b); numerically equal to correct
//   short_text       normalised text (see normaliseShortText) equals correct or
//                    one of `also` (DECISIONS #64)
// Result: true = correct, false = wrong or blank, null = can't be auto-marked
// (type not supported, or the key has no usable `correct`): a teacher marks it.

import { toAsciiDigits } from './auth/login';
import { normaliseShortText } from './questions';

/** submission_grade_edits.reason the server writes for its own mark (edited_by null). */
export const AUTO_MARK_REASON = 'Auto-marked';

const NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)$/;

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function autoMarkItem(type: string, value: unknown, answer: unknown): boolean | null {
  if (!isObj(answer)) return null;
  const k = answer.correct;
  if (k === undefined || k === null) return null;

  switch (type) {
    case 'mcq':
    case 'tap_image':
      if (typeof k !== 'string' || k === '') return null;
      return typeof value === 'string' && value === k;
    case 'true_false':
      if (typeof k !== 'boolean') return null;
      return typeof value === 'boolean' && value === k;
    case 'numeric': {
      if (typeof k !== 'number' && typeof k !== 'string') return null;
      const key = String(k).trim();
      if (!NUMBER.test(key)) return null;
      if (typeof value !== 'string') return false;
      const v = toAsciiDigits(value)
        .replace(/\u066b/g, '.')
        .replace(/[ \u00a0]/g, '');
      if (!NUMBER.test(v)) return false;
      return Number(v) === Number(key);
    }
    case 'short_text': {
      if (typeof k !== 'string' || normaliseShortText(k) === '') return null;
      if (typeof value !== 'string') return false;
      const v = normaliseShortText(value);
      if (!v) return false;
      if (v === normaliseShortText(k)) return true;
      const also = Array.isArray(answer.also) ? answer.also : [];
      return also.some((a) => typeof a === 'string' && normaliseShortText(a) === v);
    }
    default:
      return null;
  }
}

export interface MarkableItem {
  question_id: string;
  type: string;
  marks: number;
  answer: unknown;
}

/**
 * Score a responses record (attempts.ts Responses) against a paper with keys.
 * null when anything in the paper can't be auto-marked, the paper is empty, or
 * the score would exceed the assessment's total: the teacher marks it then.
 */
export function autoScore(
  items: readonly MarkableItem[],
  responses: { answers?: { question_id: string; value: unknown }[] } | null | undefined,
  totalMarks?: number | null,
): number | null {
  if (!items.length || !responses || !Array.isArray(responses.answers)) return null;
  const given = new Map<string, unknown>();
  for (const a of responses.answers) {
    if (isObj(a) && !given.has(String(a.question_id))) given.set(String(a.question_id), a.value);
  }
  let score = 0;
  for (const it of items) {
    const ok = autoMarkItem(it.type, given.get(it.question_id) ?? null, it.answer);
    if (ok === null) return null;
    if (ok) score += it.marks;
  }
  if (totalMarks != null && score > totalMarks) return null;
  return score;
}
