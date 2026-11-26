import { describe, expect, it } from 'vitest';

import {
  buildAttemptRow,
  conceptAccuracy,
  difficultyPlan,
  hasAnswer,
  historyFromAttempts,
  isAttemptItem,
  modeCounts,
  PRACTICE_LIMITS,
  practiceKind,
  retryWrongIds,
  scorePracticeAnswer,
  selectItems,
  summarizeByConcept,
  type PracticeHistory,
  type PracticePoolItem,
} from '../src/practice';

// Seeded PRNG so every run picks the same set.
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const NOW = Date.parse('2026-11-25T10:00:00Z');
const DAY = 24 * 60 * 60_000;

function pool(concepts = ['c1', 'c2', 'c3'], perConcept = 6): PracticePoolItem[] {
  const out: PracticePoolItem[] = [];
  for (const c of concepts)
    for (let i = 0; i < perConcept; i++)
      out.push({
        questionId: `${c}-q${i}`,
        version: 1,
        conceptId: c,
        difficulty: (i % 3) + 1,
        type: 'mcq',
      });
  return out;
}

const ids = (xs: { questionId: string }[]) => xs.map((x) => x.questionId);
const noRepeats = (xs: { questionId: string }[]) => new Set(ids(xs)).size === xs.length;

function hist(entries: [string, Partial<{ wrong: number; lastCorrect: boolean; ago: number }>][]) {
  const h: Record<string, { seen: number; wrong: number; lastCorrect: boolean; lastAt: number }> =
    {};
  for (const [q, e] of entries)
    h[q] = {
      seen: 1 + (e.wrong ?? 0),
      wrong: e.wrong ?? 0,
      lastCorrect: e.lastCorrect ?? true,
      lastAt: NOW - (e.ago ?? DAY),
    };
  return h as PracticeHistory;
}

describe('difficultyPlan', () => {
  it('mixes easy, medium and hard in rising order', () => {
    expect(difficultyPlan(10)).toEqual([1, 1, 1, 2, 2, 2, 2, 3, 3, 3]);
    expect(difficultyPlan(1)).toEqual([2]);
    expect(difficultyPlan(0)).toEqual([]);
  });
});

describe('selectItems — practice', () => {
  it('never repeats an item, for many seeds and sizes', () => {
    for (let seed = 1; seed < 200; seed++) {
      const size = (seed % 15) + 1;
      const r = selectItems(pool(), {}, { mode: 'practice', size, now: NOW }, seeded(seed));
      expect(noRepeats(r.items)).toBe(true);
      expect(r.items.length).toBe(size);
    }
  });

  it('never repeats even when the pool has the same question twice', () => {
    const p = [...pool(['c1'], 3), ...pool(['c1'], 3)];
    const r = selectItems(p, {}, { mode: 'practice', size: 10, now: NOW }, seeded(3));
    expect(noRepeats(r.items)).toBe(true);
    expect(r.items.length).toBe(3);
    expect(r.reason).toBe('short');
  });

  it('covers every concept before doubling up', () => {
    const r = selectItems(pool(), {}, { mode: 'practice', size: 6, now: NOW }, seeded(7));
    const per = new Map<string, number>();
    for (const i of r.items) per.set(i.conceptId!, (per.get(i.conceptId!) ?? 0) + 1);
    expect([...per.values()].sort()).toEqual([2, 2, 2]);
  });

  it('puts unseen items first', () => {
    const p = pool(['c1'], 6);
    const h = hist(p.slice(0, 4).map((x) => [x.questionId, {}]));
    const r = selectItems(p, h, { mode: 'practice', size: 2, now: NOW }, seeded(1));
    expect(ids(r.items).sort()).toEqual(['c1-q4', 'c1-q5']);
  });

  it('after the unseen run out, the longest-ago seen come next', () => {
    const p = pool(['c1'], 3);
    const h = hist([
      ['c1-q0', { ago: 1 * DAY }],
      ['c1-q1', { ago: 9 * DAY }],
      ['c1-q2', { ago: 3 * DAY }],
    ]);
    const r = selectItems(p, h, { mode: 'practice', size: 1, now: NOW }, seeded(1));
    expect(ids(r.items)).toEqual(['c1-q1']);
  });

  it('mixes difficulty and orders it rising', () => {
    const r = selectItems(pool(), {}, { mode: 'practice', size: 9, now: NOW }, seeded(11));
    const d = r.items.map((i) => i.difficulty);
    expect(d).toEqual([...d].sort());
    expect(new Set(d)).toEqual(new Set([1, 2, 3]));
  });

  it('leaves out types it cannot mark on the device', () => {
    const p: PracticePoolItem[] = [
      { questionId: 'a', version: 1, conceptId: 'c', difficulty: 1, type: 'long_answer' },
      { questionId: 'b', version: 1, conceptId: 'c', difficulty: 1, type: 'tap_image' },
      { questionId: 'c', version: 1, conceptId: 'c', difficulty: 1, type: 'numeric' },
    ];
    const r = selectItems(p, {}, { mode: 'practice', now: NOW }, seeded(1));
    expect(ids(r.items)).toEqual(['c']);
  });

  it('is empty on an empty pool', () => {
    expect(selectItems([], {}, { mode: 'practice', now: NOW }).reason).toBe('empty');
  });

  it('is deterministic for one seed', () => {
    const a = selectItems(pool(), {}, { mode: 'practice', now: NOW }, seeded(42));
    const b = selectItems(pool(), {}, { mode: 'practice', now: NOW }, seeded(42));
    expect(ids(a.items)).toEqual(ids(b.items));
  });

  it('caps the size at the hard limit', () => {
    const big = pool(['c1', 'c2', 'c3', 'c4', 'c5'], 20);
    const r = selectItems(big, {}, { mode: 'practice', size: 500, now: NOW }, seeded(5));
    expect(r.items.length).toBe(PRACTICE_LIMITS.maxItems);
    expect(noRepeats(r.items)).toBe(true);
  });
});

describe('selectItems — topic drill', () => {
  it('only uses the chosen concept and never repeats', () => {
    for (let seed = 1; seed < 50; seed++) {
      const r = selectItems(
        pool(),
        {},
        { mode: 'drill', conceptIds: ['c2'], size: 5, now: NOW },
        seeded(seed),
      );
      expect(r.items.every((i) => i.conceptId === 'c2')).toBe(true);
      expect(noRepeats(r.items)).toBe(true);
      expect(r.items.length).toBe(5);
    }
  });

  it('is empty for a concept with no items', () => {
    const r = selectItems(pool(), {}, { mode: 'drill', conceptIds: ['nope'], now: NOW });
    expect(r).toEqual({ items: [], reason: 'empty' });
  });
});

describe('selectItems — smart review', () => {
  it('wrong last time first, then weak concepts, then due; skips recent right answers', () => {
    const p = pool(['c1', 'c2'], 4);
    const h = hist([
      ['c1-q0', { lastCorrect: false, wrong: 1, ago: 1 * DAY }], // wrong → tier 0
      ['c2-q0', { lastCorrect: true, wrong: 2, ago: 2 * DAY }], // c2 weak (1 of 3)
      ['c1-q1', { lastCorrect: true, ago: 10 * DAY }], // due
      ['c1-q2', { lastCorrect: true, ago: 1 * DAY }], // recent, right → not review
    ]);
    const r = selectItems(p, h, { mode: 'review', now: NOW }, seeded(1));
    expect(ids(r.items)).toEqual(['c1-q0', 'c2-q0', 'c1-q1']);
    expect(r.reason).toBe('short');
    expect(noRepeats(r.items)).toBe(true);
  });

  it('falls back to a practice set when there is nothing to review', () => {
    const r = selectItems(pool(), {}, { mode: 'review', size: 4, now: NOW }, seeded(2));
    expect(r.reason).toBe('fallback');
    expect(r.items.length).toBe(4);
    expect(noRepeats(r.items)).toBe(true);
  });

  it('never repeats across many seeds', () => {
    const p = pool(['c1', 'c2', 'c3'], 8);
    const h = hist(p.map((x, i) => [x.questionId, { lastCorrect: i % 2 === 0, ago: i * DAY }]));
    for (let seed = 1; seed < 50; seed++) {
      const r = selectItems(p, h, { mode: 'review', size: 12, now: NOW }, seeded(seed));
      expect(noRepeats(r.items)).toBe(true);
    }
  });
});

describe('selectItems — retry wrong', () => {
  it('uses exactly the given wrong ids, each once', () => {
    const r = selectItems(
      pool(),
      {},
      { mode: 'retry', retryIds: ['c1-q1', 'c3-q2', 'c1-q1', 'gone'], now: NOW },
      seeded(4),
    );
    expect(ids(r.items).sort()).toEqual(['c1-q1', 'c3-q2']);
    expect(r.reason).toBe('ok');
  });

  it('without ids, retries what was last answered wrong', () => {
    const h = hist([
      ['c1-q0', { lastCorrect: false, wrong: 1 }],
      ['c2-q3', { lastCorrect: true, wrong: 1 }],
    ]);
    const r = selectItems(pool(), h, { mode: 'retry', now: NOW }, seeded(1));
    expect(ids(r.items)).toEqual(['c1-q0']);
  });

  it('is empty when nothing was wrong', () => {
    expect(selectItems(pool(), {}, { mode: 'retry', now: NOW }).reason).toBe('empty');
  });
});

describe('modeCounts + conceptAccuracy', () => {
  it('counts what each mode would give', () => {
    const h = hist([
      ['c1-q0', { lastCorrect: false, wrong: 1 }],
      ['c1-q1', { ago: 20 * DAY }],
    ]);
    expect(modeCounts(pool(), h, NOW)).toEqual({
      practice: 10,
      review: 2,
      retry: 1,
      unseen: 16,
    });
  });

  it('needs two answers before calling a concept weak', () => {
    const acc = conceptAccuracy(pool(), hist([['c1-q0', { lastCorrect: false, wrong: 0 }]]));
    expect(acc.c1?.share).toBeNull();
  });
});

describe('scorePracticeAnswer', () => {
  it('marks each practice type like an exam would', () => {
    expect(scorePracticeAnswer({ type: 'mcq', answer: { correct: 'B' } }, 'B')).toBe(true);
    expect(scorePracticeAnswer({ type: 'mcq', answer: { correct: 'B' } }, 'C')).toBe(false);
    expect(scorePracticeAnswer({ type: 'true_false', answer: { correct: false } }, false)).toBe(
      true,
    );
    expect(scorePracticeAnswer({ type: 'numeric', answer: { correct: '2.5' } }, '۲.۵')).toBe(true);
    expect(
      scorePracticeAnswer({ type: 'short_text', answer: { correct: 'Lahore' } }, ' lahore '),
    ).toBe(true);
  });

  it('refuses what it cannot mark', () => {
    expect(scorePracticeAnswer({ type: 'long_answer', answer: { correct: 'x' } }, 'x')).toBeNull();
    expect(scorePracticeAnswer({ type: 'mcq', answer: null }, 'A')).toBeNull();
  });

  it('knows an empty box is not an answer', () => {
    expect(hasAnswer('  ')).toBe(false);
    expect(hasAnswer(false)).toBe(true);
    expect(hasAnswer(null)).toBe(false);
  });
});

describe('buildAttemptRow', () => {
  const answers = [
    { questionId: 'q1', version: 3, value: 'B', correct: true, ms: 8200.4 },
    { questionId: 'q2', version: 1, value: 'x'.repeat(500), correct: false, ms: -5, flagged: true },
    { questionId: 'q3', version: 2, value: true, correct: false, ms: 99 * 60_000, tip: true },
    { questionId: 'q1', version: 3, value: 'C', correct: false, ms: 1 },
  ];
  const row = buildAttemptRow({
    id: '11111111-1111-4111-8111-111111111111',
    learnerId: 'me',
    mode: 'practice',
    topicId: 't1',
    startedAt: NOW,
    finishedAt: NOW + 60_000,
    answers,
    deviceId: 'web',
  });

  it('matches the documented shape (DATABASE_DESIGN: q, v, a, c, ms)', () => {
    expect(Object.keys(row).sort()).toEqual(
      [
        'id',
        'learner_id',
        'kind',
        'topic_id',
        'follow_up_id',
        'started_at',
        'finished_at',
        'items',
        'n_correct',
        'n_total',
        'device_id',
      ].sort(),
    );
    expect(row.items[0]).toEqual({ q: 'q1', v: 3, a: 'B', c: true, ms: 8200 });
    expect(row.items.every(isAttemptItem)).toBe(true);
    expect(row.started_at).toBe('2026-11-25T10:00:00.000Z');
    expect(row.kind).toBe('practice');
  });

  it('keeps one item per question, counts, clamps time, cuts long text, sets flags only when on', () => {
    expect(row.items.map((i) => i.q)).toEqual(['q1', 'q2', 'q3']);
    expect(row.n_total).toBe(3);
    expect(row.n_correct).toBe(1);
    expect(row.items[1]).toMatchObject({ ms: 0, f: 1 });
    expect((row.items[1]!.a as string).length).toBe(PRACTICE_LIMITS.maxAnswerChars);
    expect(row.items[2]).toMatchObject({ ms: PRACTICE_LIMITS.maxMs, t: 1 });
    expect('f' in row.items[0]!).toBe(false);
    expect('t' in row.items[0]!).toBe(false);
  });

  it('maps smart review to the revision kind', () => {
    expect(practiceKind('review')).toBe('revision');
    expect(practiceKind('retry')).toBe('practice');
    expect(practiceKind('drill')).toBe('practice');
  });

  it('never finishes before it starts', () => {
    const r = buildAttemptRow({
      id: 'x',
      learnerId: 'me',
      mode: 'drill',
      topicId: null,
      startedAt: NOW,
      finishedAt: NOW - 5,
      answers: [],
    });
    expect(r.finished_at).toBe(r.started_at);
    expect(r.items).toEqual([]);
  });
});

describe('history, retry set and summary', () => {
  it('folds attempts oldest first, counting the same attempt once', () => {
    const a = {
      id: 'a',
      started_at: '2026-11-20T10:00:00Z',
      items: [
        { q: 'q1', v: 1, a: 'A', c: false, ms: 1 },
        { q: 'q2', v: 1, a: 'B', c: true, ms: 1 },
      ],
    };
    const b = {
      id: 'b',
      started_at: '2026-11-22T10:00:00Z',
      items: [{ q: 'q1', v: 1, a: 'B', c: true, ms: 1 }, { bad: true }],
    };
    const h = historyFromAttempts([b, a, a]);
    expect(h.q1).toEqual({
      seen: 2,
      wrong: 1,
      lastCorrect: true,
      lastAt: Date.parse('2026-11-22T10:00:00Z'),
    });
    expect(h.q2?.seen).toBe(1);
  });

  it('lists the wrong ones once, in order', () => {
    expect(
      retryWrongIds([
        { questionId: 'a', correct: false },
        { questionId: 'b', correct: true },
        { questionId: 'c', correct: false },
        { questionId: 'a', correct: false },
      ]),
    ).toEqual(['a', 'c']);
  });

  it('summarises by concept, weakest first', () => {
    const s = summarizeByConcept(
      [
        { questionId: 'c1-q0', correct: true },
        { questionId: 'c1-q1', correct: true },
        { questionId: 'c2-q0', correct: false },
        { questionId: 'c2-q1', correct: true },
        { questionId: 'zz', correct: false },
      ],
      pool(),
    );
    expect(s.map((x) => [x.conceptId, x.right, x.total])).toEqual([
      [null, 0, 1],
      ['c2', 1, 2],
      ['c1', 2, 2],
    ]);
    expect(s[1]!.wrongIds).toEqual(['c2-q0']);
  });
});
