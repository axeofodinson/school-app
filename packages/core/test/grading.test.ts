// Every case from scripts/verify-grading.mjs, unchanged.
import { describe, expect, it } from 'vitest';
import {
  buildRoster,
  fmtScore,
  gradeBlocksAttempt,
  gradeRpcError,
  gradeState,
  parseScore,
  reasonRequired,
  sortRoster,
} from '../src/grading';
import { legacy } from './legacy';

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

describe('gradeRpcError (db/013 record_grade messages)', () => {
  it.each([
    ['reason_required', 'reason_required'],
    ['P0001: not_authorized', 'not_authorized'],
    ['score_out_of_range', 'score_out_of_range'],
    ['enrollment_class_mismatch', 'enrollment_class_mismatch'],
    ['Failed to fetch', null],
    [null, null],
  ] as const)('%s -> %s', (msg, want) => expect(gradeRpcError(msg)).toBe(want));
});

describe('gradeBlocksAttempt', () => {
  const open = { type: 'test', status: 'published' };
  it('open paper, no attempt yet -> warn', () => expect(gradeBlocksAttempt(open, null)).toBe(true));
  it('attempt already in -> no warning', () =>
    expect(gradeBlocksAttempt(open, { score: null })).toBe(false));
  it('file worksheet -> no online attempt to lose', () =>
    expect(gradeBlocksAttempt({ type: 'file', status: 'published' }, null)).toBe(false));
  it('closed paper -> nothing left to submit', () =>
    expect(gradeBlocksAttempt({ type: 'test', status: 'closed' }, null)).toBe(false));
  it('draft -> students cannot see it yet', () =>
    expect(gradeBlocksAttempt({ type: 'test', status: 'draft' }, null)).toBe(false));
});

describe('fmtScore', () => {
  it.each([
    ['15.00', '15'],
    ['12.50', '12.5'],
    [0, '0'],
    [null, ''],
    ['', ''],
  ] as const)('%s -> %s', (s, want) => expect(fmtScore(s)).toBe(want));
});

describe('sortRoster', () => {
  it('roll ascending, unnumbered last by name', () =>
    expect(
      sortRoster([
        { id: 'c', roll_number: null, student: { full_name: 'Zoya' } },
        { id: 'b', roll_number: 2, student: { full_name: 'Bilal' } },
        { id: 'd', roll_number: null, student: { full_name: 'Ali' } },
        { id: 'a', roll_number: 1, student: { full_name: 'Aisha' } },
      ]).map((r) => r.id),
    ).toEqual(['a', 'b', 'd', 'c']));
});

describe('parity with src/reporting/grading.js', () => {
  it('parseScore / reasonRequired / gradeState / buildRoster agree on shared inputs', async () => {
    const old = await legacy('src/reporting/grading.js');
    const scores = ['', ' 7 ', '7.5', '7.555', '-1', 'x', '100', '20', '20.01', '0'];
    for (const s of scores)
      for (const t of [20, null, 0, '20']) {
        expect(parseScore(s, t)).toEqual(old.parseScore!(s, t));
      }
    for (const [c, n] of [
      [null, 3],
      [3, 3],
      [3, '3'],
      [3, 4],
      ['3.00', 3],
    ] as const) {
      expect(reasonRequired(c, n)).toBe(old.reasonRequired!(c, n));
    }
    for (const s of [null, { score: null }, { score: 0 }, { score: 5 }]) {
      expect(gradeState(s)).toBe(old.gradeState!(s));
    }
    const en = [{ id: 'e1', roll_number: 1 }, { id: 'e2' }];
    const subs = [{ enrollment_id: 'e2', score: 4 }];
    expect(buildRoster(en, subs)).toEqual(old.buildRoster!(en, subs));
  });
});
