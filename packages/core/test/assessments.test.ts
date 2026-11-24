import { describe, expect, it } from 'vitest';
import {
  buildAssessment,
  diffItems,
  emptyAssessment,
  isValidIsoDate,
  movePick,
  parseItemMarks,
  parseWeightage,
  questionsLocked,
  setPickMarks,
  statusActions,
  statusAfter,
  togglePick,
  totalMarks,
  type AssessmentDraft,
} from '../src/assessments';

const draft = (over: Partial<AssessmentDraft> = {}): AssessmentDraft => ({
  ...emptyAssessment(),
  title: 'Chapter 1 Test',
  ...over,
});

describe('parsers', () => {
  it('parseItemMarks', () => {
    expect(parseItemMarks('5')).toBe(5);
    expect(parseItemMarks('۵')).toBe(5);
    expect(parseItemMarks('')).toBeNull();
    expect(parseItemMarks('0')).toBeNull();
    expect(parseItemMarks('101')).toBeNull();
  });
  it('parseWeightage', () => {
    expect(parseWeightage('')).toBe(0);
    expect(parseWeightage('12.5')).toBe(12.5);
    expect(parseWeightage('100')).toBe(100);
    expect(parseWeightage('100.01')).toBeNull();
    expect(parseWeightage('1.234')).toBeNull();
    expect(parseWeightage('-1')).toBeNull();
  });
  it('isValidIsoDate rejects roll-overs', () => {
    expect(isValidIsoDate('2026-02-28')).toBe(true);
    expect(isValidIsoDate('2026-02-30')).toBe(false);
    expect(isValidIsoDate('2026-2-3')).toBe(false);
  });
});

describe('buildAssessment', () => {
  it('a draft may be empty', () => {
    expect(buildAssessment(draft(), 'draft')).toEqual({
      fields: {
        title: 'Chapter 1 Test',
        type: 'test',
        weightage: 0,
        scheduled_on: null,
        total_marks: null,
      },
      items: [],
    });
  });

  it('publishing needs questions', () => {
    expect(buildAssessment(draft(), 'published')).toEqual({ error: 'needQuestions' });
  });

  it('orders items, sums marks, drops duplicate picks', () => {
    const d = draft({
      weightage: '10',
      scheduledOn: '2026-12-01',
      picks: [
        { questionId: 'q2', marks: '3' },
        { questionId: 'q1', marks: '2' },
        { questionId: 'q2', marks: '9' },
      ],
    });
    expect(buildAssessment(d, 'published')).toEqual({
      fields: {
        title: 'Chapter 1 Test',
        type: 'test',
        weightage: 10,
        scheduled_on: '2026-12-01',
        total_marks: 5,
      },
      items: [
        { question_id: 'q2', marks: 3, sort_order: 0 },
        { question_id: 'q1', marks: 2, sort_order: 1 },
      ],
    });
  });

  it.each([
    [{ title: ' ' }, { error: 'titleRequired' }],
    [{ weightage: '120' }, { error: 'weightageInvalid' }],
    [{ scheduledOn: '01/12/2026' }, { error: 'dateInvalid' }],
    [{ picks: [{ questionId: 'q9', marks: 'x' }] }, { error: 'marksInvalid', questionId: 'q9' }],
  ] as const)('errors %#', (over, expected) => {
    expect(buildAssessment(draft(over as Partial<AssessmentDraft>), 'draft')).toEqual(expected);
  });
});

describe('status rules', () => {
  it('draft → published → closed ↔ published, never back to draft', () => {
    expect(statusActions('draft')).toEqual(['publish']);
    expect(statusActions('published')).toEqual(['close']);
    expect(statusActions('closed')).toEqual(['reopen']);
    expect(statusAfter('publish')).toBe('published');
    expect(statusAfter('close')).toBe('closed');
    expect(statusAfter('reopen')).toBe('published');
  });
  it('questions lock once published', () => {
    expect(questionsLocked('draft')).toBe(false);
    expect(questionsLocked('published')).toBe(true);
    expect(questionsLocked('closed')).toBe(true);
  });
});

describe('pick list', () => {
  it('toggle uses default marks, clamps, and removes', () => {
    let p = togglePick([], 'a', 3);
    p = togglePick(p, 'b', null);
    p = togglePick(p, 'c', 500);
    expect(p).toEqual([
      { questionId: 'a', marks: '3' },
      { questionId: 'b', marks: '1' },
      { questionId: 'c', marks: '100' },
    ]);
    expect(togglePick(p, 'b', 1).map((x) => x.questionId)).toEqual(['a', 'c']);
  });
  it('move and set marks', () => {
    const p = [
      { questionId: 'a', marks: '1' },
      { questionId: 'b', marks: '1' },
    ];
    expect(movePick(p, 'b', -1).map((x) => x.questionId)).toEqual(['b', 'a']);
    expect(movePick(p, 'a', -1).map((x) => x.questionId)).toEqual(['a', 'b']);
    expect(setPickMarks(p, 'b', '4')[1]).toEqual({ questionId: 'b', marks: '4' });
    expect(totalMarks([...p, { questionId: 'c', marks: 'x' }])).toBe(2);
  });
  it('diffItems removes only what was dropped', () => {
    expect(diffItems(['a', 'b'], [{ question_id: 'b', marks: 2, sort_order: 0 }])).toEqual({
      remove: ['a'],
      upsert: [{ question_id: 'b', marks: 2, sort_order: 0 }],
    });
  });
});
