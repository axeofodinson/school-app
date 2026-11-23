// Every case from scripts/verify-grading.mjs, unchanged.
import { describe, expect, it } from 'vitest';
import { buildRoster, gradeState, parseScore, reasonRequired } from '../src/grading';

describe('parseScore (total = 20)', () => {
  it.each([
    ['whole number in range', '15', 20, { value: 15 }],
    ['two decimals', '12.50', 20, { value: 12.5 }],
    ['zero is allowed', '0', 20, { value: 0 }],
    ['full marks', '20', 20, { value: 20 }],
    ['above total -> range', '21', 20, { error: 'scoreRange' }],
    ['blank -> required', '', 20, { error: 'scoreRequired' }],
    ['whitespace -> required', '   ', 20, { error: 'scoreRequired' }],
    ['negative -> invalid', '-3', 20, { error: 'scoreInvalid' }],
    ['three decimals -> invalid', '1.234', 20, { error: 'scoreInvalid' }],
    ['letters -> invalid', '12a', 20, { error: 'scoreInvalid' }],
    ['no total -> no ceiling', '999', null, { value: 999 }],
    ['total 0 -> no ceiling', '50', 0, { value: 50 }],
  ] as const)('%s', (_label, input, total, expected) => {
    expect(parseScore(input, total)).toEqual(expected);
  });
});

describe('reasonRequired', () => {
  it('first grade needs no reason', () => expect(reasonRequired(null, 15)).toBe(false));
  it('changing a grade needs a reason', () => expect(reasonRequired(15, 18)).toBe(true));
  it('re-saving same value needs none', () => expect(reasonRequired(15, 15)).toBe(false));
  it('same value, string vs number', () => expect(reasonRequired(15, '15')).toBe(false));
});

describe('gradeState', () => {
  it('no submission', () => expect(gradeState(null)).toBe('notSubmitted'));
  it('submitted, unmarked', () => expect(gradeState({ score: null })).toBe('ungraded'));
  it('marked', () => expect(gradeState({ score: 12 })).toBe('graded'));
  it('zero is marked', () => expect(gradeState({ score: 0 })).toBe('graded'));
});

describe('buildRoster', () => {
  const enrollments = [
    { id: 'e1', roll_number: 1, student: { full_name: 'Aisha', student_code: 'S-001' } },
    { id: 'e2', roll_number: 2, student: { full_name: 'Bilal', student_code: 'S-002' } },
    { id: 'e3', roll_number: null, student: { full_name: 'Zoya', student_code: 'S-003' } },
  ];
  const submissions = [
    { enrollment_id: 'e1', score: 18, submitted_at: '2026-07-01T09:00:00Z' },
    { enrollment_id: 'e3', score: null, submitted_at: '2026-07-02T09:00:00Z' },
  ];
  const roster = buildRoster(enrollments, submissions);

  it('roster length', () => expect(roster.length).toBe(3));
  it('e1 graded', () => expect(gradeState(roster[0]?.submission)).toBe('graded'));
  it('e2 has no submission', () => expect(roster[1]?.submission).toBeNull());
  it('e2 state notSubmitted', () => expect(gradeState(roster[1]?.submission)).toBe('notSubmitted'));
  it('e3 ungraded', () => expect(gradeState(roster[2]?.submission)).toBe('ungraded'));
  it('preserves student join', () => expect(roster[0]?.student?.full_name).toBe('Aisha'));
  it('null roll preserved', () => expect(roster[2]?.rollNumber).toBeNull());
  it('empty inputs -> empty roster', () => expect(buildRoster(null, null)).toEqual([]));
});
