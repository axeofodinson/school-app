import { describe, expect, it } from 'vitest';

import {
  followUpSteps,
  gateFor,
  prepareModel,
  roundPreview,
  subjectMosaics,
  type FollowUpView,
  type TopicPos,
} from '../src/followups';
import { selectItems, type PracticePoolItem } from '../src/practice';

const NOW = Date.parse('2026-11-26T10:00:00Z');
const day = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

const fu = (o: Partial<FollowUpView> & Pick<FollowUpView, 'id'>): FollowUpView => ({
  conceptId: `c-${o.id}`,
  subjectId: 'maths',
  topicId: 't2',
  kind: 'diagnostic',
  status: 'open',
  rounds: 0,
  createdAt: day(3),
  closedAt: null,
  closeReason: null,
  ...o,
});

// Maths: t1 < t2 < t3 (t3 in a later chapter); Science: s1.
const POS: TopicPos[] = [
  { topicId: 't1', subjectId: 'maths', chapterOrder: 1, topicOrder: 1 },
  { topicId: 't2', subjectId: 'maths', chapterOrder: 1, topicOrder: 2 },
  { topicId: 't3', subjectId: 'maths', chapterOrder: 2, topicOrder: 1 },
  { topicId: 's1', subjectId: 'science', chapterOrder: 1, topicOrder: 1 },
];
const positions = new Map(POS.map((p) => [p.topicId, p]));
const at = (id: string) => positions.get(id)!;

describe('gateFor (TEST_PLAN F-3)', () => {
  it('nothing open: every topic is open', () => {
    for (const p of POS) expect(gateFor(p, [], positions)).toEqual({ state: 'open' });
  });

  it('a diagnostic follow-up pauses only later topics of the same subject', () => {
    const open = [fu({ id: 'a', topicId: 't2' })];
    expect(gateFor(at('t1'), open, positions).state).toBe('open');
    expect(gateFor(at('t2'), open, positions).state).toBe('open'); // its own topic
    expect(gateFor(at('t3'), open, positions)).toEqual({
      state: 'paused',
      by: 'diagnostic',
      followUpIds: ['a'],
    });
    expect(gateFor(at('s1'), open, positions).state).toBe('open'); // other subject
  });

  it('an exam follow-up pauses every other topic, in every subject', () => {
    const open = [fu({ id: 'e', kind: 'exam', topicId: 't1' })];
    expect(gateFor(at('t1'), open, positions).state).toBe('open');
    expect(gateFor(at('t2'), open, positions)).toMatchObject({ state: 'paused', by: 'exam' });
    expect(gateFor(at('s1'), open, positions)).toMatchObject({ state: 'paused', by: 'exam' });
  });

  it('teacher-set and revision follow-ups never pause', () => {
    const open = [
      fu({ id: 't', kind: 'teacher', topicId: 't1' }),
      fu({ id: 'r', kind: 'revision', topicId: 't1' }),
    ];
    for (const p of POS) expect(gateFor(p, open, positions).state).toBe('open');
  });

  it('a relieved or cleared follow-up lifts the gate (relax / auto relief)', () => {
    const closed = [
      fu({ id: 'a', status: 'relieved', closeReason: 'teacher_relax' }),
      fu({ id: 'b', status: 'cleared', closeReason: 'round_passed' }),
    ];
    expect(gateFor(at('t3'), closed, positions).state).toBe('open');
  });

  it('a follow-up on a topic it can’t place pauses nothing', () => {
    const open = [fu({ id: 'x', topicId: 'gone' }), fu({ id: 'y', topicId: null })];
    expect(gateFor(at('t3'), open, positions).state).toBe('open');
  });
});

describe('prepareModel', () => {
  it('orders exam → diagnostic → teacher → revision, oldest first', () => {
    const m = prepareModel(
      [
        fu({ id: 'r', kind: 'revision', createdAt: day(9) }),
        fu({ id: 'd2', createdAt: day(1) }),
        fu({ id: 't', kind: 'teacher', createdAt: day(5) }),
        fu({ id: 'd1', createdAt: day(4) }),
        fu({ id: 'e', kind: 'exam', createdAt: day(0) }),
      ],
      NOW,
    );
    expect(m.doFirst.map((f) => f.id)).toEqual(['e', 'd1', 'd2', 't', 'r']);
    expect(m.examBlocks).toBe(true);
  });

  it('keeps recently closed ones (newest first) and counts unlocks', () => {
    const m = prepareModel(
      [
        fu({ id: 'old', status: 'cleared', closedAt: day(10) }),
        fu({ id: 'c', status: 'cleared', closedAt: day(2), closeReason: 'mastered' }),
        fu({ id: 'a', status: 'relieved', closedAt: day(1), closeReason: 'auto_relief: rounds' }),
        fu({ id: 'x', status: 'relieved', closedAt: day(0), closeReason: 'teacher_relax' }),
        fu({ id: 'n', status: 'cancelled', closedAt: day(0) }),
      ],
      NOW,
    );
    expect(m.doFirst).toEqual([]);
    expect(m.examBlocks).toBe(false);
    expect(m.recent.map((f) => f.id)).toEqual(['x', 'a', 'c']);
    expect(m.autoUnlocked).toBe(1);
    expect(m.teacherUnlocked).toBe(1);
  });
});

describe('follow-up flow', () => {
  it('re-read first; another way leads from round 2', () => {
    expect(followUpSteps({ rounds: 0 })).toEqual(['read', 'practise']);
    expect(followUpSteps({ rounds: 1 })).toEqual(['read', 'practise']);
    expect(followUpSteps({ rounds: 2 })).toEqual(['another', 'read', 'practise']);
  });

  it('round preview matches the server rule (≥ 80 % on ≥ 3)', () => {
    const r = (n: number, right: number) =>
      Array.from({ length: n }, (_, i) => ({ correct: i < right }));
    expect(roundPreview(r(2, 2))).toBe('tooFew');
    expect(roundPreview(r(5, 4))).toBe('pass');
    expect(roundPreview(r(6, 4))).toBe('notYet');
    expect(roundPreview(r(3, 3))).toBe('pass');
  });

  it('followup and diagnose modes pick from the pool like the server', () => {
    const pool: PracticePoolItem[] = [
      { questionId: 'a1', version: 1, conceptId: 'A', difficulty: 2, type: 'mcq' },
      { questionId: 'a2', version: 1, conceptId: 'A', difficulty: 1, type: 'mcq' },
      { questionId: 'b1', version: 1, conceptId: 'B', difficulty: 3, type: 'mcq' },
      { questionId: 'b2', version: 1, conceptId: 'B', difficulty: 2, type: 'mcq' },
    ];
    const hist = { a1: { seen: 1, wrong: 1, lastCorrect: false, lastAt: NOW - 1000 } };
    const fset = selectItems(pool, hist, { mode: 'followup', conceptIds: ['A'], now: NOW });
    expect(fset.items.map((i) => i.questionId).sort()).toEqual(['a1', 'a2']);
    const diag = selectItems(pool, hist, {
      mode: 'diagnose',
      size: 4,
      conceptOrder: { A: 0, B: 1 },
      now: NOW,
    });
    // A: unseen a2 first, then seen a1; B: medium b2, then hard b1. Concepts alternate.
    expect(diag.items.map((i) => i.questionId)).toEqual(['a2', 'b2', 'a1', 'b1']);
  });
});

describe('subjectMosaics', () => {
  const concepts = [
    { id: 'm1', subjectId: 'maths' },
    { id: 'm2', subjectId: 'maths' },
    { id: 's1', subjectId: 'science' },
    { id: 'e1', subjectId: 'english' },
  ];
  it('one tile per concept, set when mastered; bands from the concepts', () => {
    const m = subjectMosaics(
      concepts,
      new Map([
        ['m1', 'mastered'],
        ['m2', 'carried_over'],
        ['s1', 'weak'],
      ]),
    );
    expect(m.get('maths')).toEqual({
      subjectId: 'maths',
      total: 2,
      mastered: 1,
      weak: 0,
      band: 'learning',
    });
    expect(m.get('science')?.band).toBe('weak');
    expect(m.get('english')).toMatchObject({ total: 1, mastered: 0, band: null });
  });
  it('all mastered = got it', () => {
    const m = subjectMosaics(
      concepts.slice(0, 2),
      new Map([
        ['m1', 'mastered'],
        ['m2', 'mastered'],
      ]),
    );
    expect(m.get('maths')?.band).toBe('mastered');
  });
});
