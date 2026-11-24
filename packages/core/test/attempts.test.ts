// Attempt record rules, ported from the old src/lib/attemptStore.js
// (isAnswered / buildResponses) with short_text added (DECISIONS #64 shape).
import { describe, expect, it } from 'vitest';

import {
  answeredCount,
  attemptKey,
  attemptState,
  buildResponses,
  isAnswerable,
  isAnswered,
  pruneAnswers,
  scorePercent,
  submissionRow,
  type SubmissionPayload,
} from '../src';

describe('isAnswered', () => {
  it.each([
    ['true_false', true, true],
    ['true_false', false, true],
    ['true_false', null, false],
    ['true_false', 'true', false],
    ['numeric', '42', true],
    ['numeric', '  ', false],
    ['numeric', '', false],
    ['numeric', undefined, false],
    ['short_text', ' Lahore ', true],
    ['short_text', ' ', false],
    ['mcq', 'A', true],
    ['mcq', '', false],
    ['mcq', null, false],
    ['tap_image', 'b', true],
    ['tap_image', undefined, false],
  ] as const)('%s %j → %s', (type, value, want) => expect(isAnswered(type, value)).toBe(want));
});

describe('buildResponses', () => {
  const qs = [
    { id: 'q1', type: 'mcq' },
    { id: 'q2', type: 'true_false' },
    { id: 'q3', type: 'numeric' },
    { id: 'q4', type: 'short_text' },
    { id: 'q5', type: 'tap_image' },
  ];
  it('keeps order, raw values, explicit nulls for skipped', () => {
    const r = buildResponses(qs, { q1: 'B', q2: false, q3: ' 3.5 ', q4: '', q5: 'c', extra: 'x' });
    expect(r).toEqual({
      answers: [
        { question_id: 'q1', type: 'mcq', value: 'B' },
        { question_id: 'q2', type: 'true_false', value: false },
        { question_id: 'q3', type: 'numeric', value: '3.5' },
        { question_id: 'q4', type: 'short_text', value: null },
        { question_id: 'q5', type: 'tap_image', value: 'c' },
      ],
      answered_count: 4,
      total_questions: 5,
      version: 1,
    });
  });
  it('handles nothing', () => {
    expect(buildResponses(null, null)).toEqual({
      answers: [],
      answered_count: 0,
      total_questions: 0,
      version: 1,
    });
  });
  it('answeredCount + pruneAnswers', () => {
    expect(answeredCount(qs, { q1: 'A', q2: true, q3: '' })).toBe(2);
    expect(pruneAnswers([{ id: 'q1' }], { q1: 'A', gone: 'B' })).toEqual({ q1: 'A' });
    expect(pruneAnswers([{ id: 'q1' }], null)).toEqual({});
  });
});

describe('submission row', () => {
  it('carries the client UUID and never a score', () => {
    const payload: SubmissionPayload = {
      enrollment_id: 'e1',
      assessment_id: 'a1',
      responses: buildResponses([], {}),
      submitted_at: '2026-11-24T10:00:00.000Z',
    };
    const row = submissionRow({ id: 'uuid-1', payload });
    expect(row).toEqual({ id: 'uuid-1', ...payload });
    expect(Object.keys(row)).not.toContain('score');
    expect(Object.keys(row)).not.toContain('graded_by');
    expect(attemptKey('e1', 'a1')).toBe('e1:a1');
  });
});

describe('attemptState', () => {
  it.each([
    [{ onServer: true, queued: { state: 'pending' }, hasDraft: true }, 'submitted'],
    [{ onServer: false, queued: { state: 'pending' }, hasDraft: false }, 'waiting'],
    [{ onServer: false, queued: { state: 'rejected' }, hasDraft: false }, 'problem'],
    [{ onServer: false, queued: null, hasDraft: true }, 'started'],
    [{ onServer: false, queued: undefined, hasDraft: false }, 'todo'],
  ] as const)('%j → %s', (o, want) => expect(attemptState(o)).toBe(want));
});

describe('misc', () => {
  it('answerable types', () => {
    expect(isAnswerable('short_text')).toBe(true);
    expect(isAnswerable('match')).toBe(false);
  });
  it('scorePercent', () => {
    expect(scorePercent(7, 10)).toBe(70);
    expect(scorePercent(2, 3)).toBe(67);
    expect(scorePercent(null, 10)).toBeNull();
    expect(scorePercent(5, 0)).toBeNull();
    expect(scorePercent(5, null)).toBeNull();
  });
});
