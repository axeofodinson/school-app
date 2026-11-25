import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { autoMarkItem, autoScore, type MarkableItem } from '../src/autoMark';

// Shared with db/test/018_smoke.sql: the SQL marker must agree case by case.
const cases = JSON.parse(
  readFileSync(new URL('./fixtures/auto-mark-cases.json', import.meta.url), 'utf8'),
) as { note: string; type: string; value: unknown; answer: unknown; expect: boolean | null }[];

describe('autoMarkItem (same cases as db/018 auto_mark_item)', () => {
  for (const c of cases) {
    it(c.note, () => expect(autoMarkItem(c.type, c.value, c.answer)).toBe(c.expect));
  }
});

describe('autoScore', () => {
  const paper: MarkableItem[] = [
    { question_id: 'q1', type: 'mcq', marks: 2, answer: { correct: 'B' } },
    { question_id: 'q2', type: 'true_false', marks: 1, answer: { correct: true } },
    { question_id: 'q3', type: 'short_text', marks: 3, answer: { correct: 'Lahore' } },
  ];
  const resp = (answers: { question_id: string; value: unknown }[]) => ({ answers });

  it('sums the marks of correct answers', () => {
    expect(
      autoScore(
        paper,
        resp([
          { question_id: 'q1', value: 'B' },
          { question_id: 'q2', value: false },
          { question_id: 'q3', value: 'lahore' },
        ]),
      ),
    ).toBe(5);
  });
  it('a missing answer is wrong, not unmarkable', () => {
    expect(autoScore(paper, resp([{ question_id: 'q1', value: 'B' }]))).toBe(2);
  });
  it('first answer per question wins', () => {
    expect(
      autoScore(
        paper,
        resp([
          { question_id: 'q1', value: 'A' },
          { question_id: 'q1', value: 'B' },
        ]),
      ),
    ).toBe(0);
  });
  it('one unmarkable question leaves the whole attempt for the teacher', () => {
    const mixed = [...paper, { question_id: 'q4', type: 'match', marks: 1, answer: {} }];
    expect(autoScore(mixed, resp([{ question_id: 'q1', value: 'B' }]))).toBeNull();
  });
  it('empty paper or no responses', () => {
    expect(autoScore([], resp([]))).toBeNull();
    expect(autoScore(paper, null)).toBeNull();
  });
  it('a score above the total is left for the teacher', () => {
    expect(autoScore(paper, resp([{ question_id: 'q3', value: 'Lahore' }]), 2)).toBeNull();
    expect(autoScore(paper, resp([{ question_id: 'q3', value: 'Lahore' }]), 6)).toBe(3);
  });
});
