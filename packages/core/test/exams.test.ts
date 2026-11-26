import { describe, expect, it } from 'vitest';

import {
  clockOffset,
  drawPaper,
  formatClock,
  markSaved,
  mergeServerAnswers,
  mixCounts,
  normaliseBlueprint,
  normaliseJoinCode,
  remainingMs,
  setAnswer,
  swapQuestion,
  unsaved,
  type DrawItem,
} from '../src/exams';

function pool(spec: { topic: string; d: number; n: number; used?: string | null }[]): DrawItem[] {
  const out: DrawItem[] = [];
  for (const s of spec)
    for (let i = 0; i < s.n; i++)
      out.push({
        id: `${s.topic}-d${s.d}-${i}`,
        version: 1,
        chapterId: s.topic.startsWith('a') ? 'ch1' : 'ch2',
        topicId: s.topic,
        difficulty: s.d,
        lastUsedAt: s.used ?? null,
      });
  return out;
}

describe('blueprint', () => {
  it('falls back to defaults for broken input and clamps', () => {
    const b = normaliseBlueprint({
      count: '500',
      minutes: -3,
      mix: { easy: 0, medium: 0, hard: 0 },
    });
    expect(b.count).toBe(100);
    expect(b.minutes).toBe(5);
    expect(b.mix).toEqual({ easy: 30, medium: 50, hard: 20 });
    expect(normaliseBlueprint(null).count).toBe(20);
    expect(normaliseBlueprint({ topicIds: ['t', 't', 3] }).topicIds).toEqual(['t']);
  });
  it('mix counts always sum to the count', () => {
    for (const n of [1, 7, 10, 19, 20, 33])
      for (const mix of [
        { easy: 30, medium: 50, hard: 20 },
        { easy: 1, medium: 1, hard: 1 },
        { easy: 0, medium: 0, hard: 5 },
      ]) {
        const c = mixCounts(n, mix);
        expect(c[1] + c[2] + c[3]).toBe(n);
      }
    expect(mixCounts(10, { easy: 30, medium: 50, hard: 20 })).toEqual({ 1: 3, 2: 5, 3: 2 });
  });
});

describe('drawPaper', () => {
  const p = pool([
    { topic: 'a1', d: 1, n: 5 },
    { topic: 'a1', d: 2, n: 5 },
    { topic: 'a1', d: 3, n: 2 },
    { topic: 'b1', d: 1, n: 5 },
    { topic: 'b1', d: 2, n: 5 },
    { topic: 'b1', d: 3, n: 2 },
  ]);
  const bp = normaliseBlueprint({ count: 10, mix: { easy: 30, medium: 50, hard: 20 } });

  it('is deterministic for a seed, honours the mix, no duplicates', () => {
    const a = drawPaper(p, bp, 42);
    const b = drawPaper(p, bp, 42);
    expect(a.picks).toEqual(b.picks);
    expect(a.picks).toHaveLength(10);
    expect(new Set(a.picks.map((x) => x.questionId)).size).toBe(10);
    const by = (d: number) => a.picks.filter((x) => x.difficulty === d).length;
    expect([by(1), by(2), by(3)]).toEqual([3, 5, 2]);
    expect(a.missing).toBe(0);
    expect(a.borrowed).toBe(0);
  });
  it('spreads across topics', () => {
    const a = drawPaper(p, bp, 7);
    const topics = a.picks.map((x) => x.topicId);
    expect(topics.filter((t) => t === 'a1').length).toBeGreaterThanOrEqual(4);
    expect(topics.filter((t) => t === 'b1').length).toBeGreaterThanOrEqual(4);
  });
  it('limits to the chosen topics and chapters', () => {
    const a = drawPaper(p, { ...bp, topicIds: ['b1'], count: 6 }, 1);
    expect(a.picks.every((x) => x.topicId === 'b1')).toBe(true);
    const c = drawPaper(p, { ...bp, chapterIds: ['ch1'], count: 6 }, 1);
    expect(c.picks.every((x) => x.topicId === 'a1')).toBe(true);
  });
  it('prefers items this class has not used recently', () => {
    const q = pool([
      { topic: 'a1', d: 2, n: 3, used: '2026-11-20T00:00:00Z' },
      { topic: 'a2', d: 2, n: 3, used: null },
    ]);
    const a = drawPaper(
      q,
      normaliseBlueprint({ count: 3, mix: { easy: 0, medium: 1, hard: 0 } }),
      9,
    );
    expect(a.picks.every((x) => x.topicId === 'a2')).toBe(true);
  });
  it('borrows from another level and says so; reports what is still missing', () => {
    const a = drawPaper(p, { ...bp, count: 10, mix: { easy: 0, medium: 0, hard: 1 } }, 3);
    expect(a.levels.find((l) => l.difficulty === 3)).toEqual({ difficulty: 3, wanted: 10, got: 4 });
    expect(a.borrowed).toBe(6);
    expect(a.picks).toHaveLength(10);
    const big = drawPaper(p, { ...bp, count: 50 }, 3);
    expect(big.picks).toHaveLength(24);
    expect(big.missing).toBe(26);
    expect(drawPaper([], bp, 1)).toMatchObject({ available: 0, missing: 10, picks: [] });
  });
  it('swaps within the same topic and level when it can', () => {
    const a = drawPaper(p, bp, 5);
    const first = a.picks[0]!;
    const s = swapQuestion(
      p,
      a.picks.map((x) => x.questionId),
      first.questionId,
      () => 0,
    );
    expect(s).not.toBeNull();
    expect(s!.topicId).toBe(first.topicId);
    expect(a.picks.map((x) => x.questionId)).not.toContain(s!.id);
    const lone = pool([{ topic: 'z', d: 2, n: 1 }]);
    expect(swapQuestion(lone, ['z-d2-0'], 'z-d2-0')).toBeNull();
  });
});

describe('exam clock', () => {
  it('offset assumes the server stamped mid-trip', () => {
    expect(clockOffset(1_000_500, 1000, 2000)).toBe(999_000);
    expect(clockOffset('nope', 0, 0)).toBe(0);
  });
  it('remaining time uses the server clock and never goes negative', () => {
    expect(remainingMs(10_000, 1_000, 4_000)).toBe(5_000);
    expect(remainingMs(10_000, 0, 20_000)).toBe(0);
  });
  it('formats', () => {
    expect(formatClock(65_000)).toBe('1:05');
    expect(formatClock(3_725_000)).toBe('1:02:05');
    expect(formatClock(400)).toBe('0:01');
    expect(formatClock(-5)).toBe('0:00');
  });
});

describe('join codes', () => {
  it('accepts case and spaces, refuses look-alikes and wrong lengths', () => {
    expect(normaliseJoinCode(' abc 23x ')).toBe('ABC23X');
    expect(normaliseJoinCode('ABC-23X')).toBe('ABC23X');
    expect(normaliseJoinCode('ABCO23')).toBeNull();
    expect(normaliseJoinCode('ABC23')).toBeNull();
  });
});

describe('answer saving', () => {
  it('only marks saved when nothing newer was tapped', () => {
    let s = setAnswer({}, 'q1', 'A', 1);
    s = setAnswer(s, 'q1', 'B', 2);
    expect(markSaved(s, 'q1', 'A', 1)).toBe(s);
    expect(unsaved(s)).toEqual(['q1']);
    s = markSaved(s, 'q1', 'B', 2);
    expect(unsaved(s)).toEqual([]);
  });
  it('resume keeps unsaved local taps over the server copy', () => {
    const local = {
      q1: { value: 'C', at: 5, saved: false },
      q2: { value: 'A', at: 3, saved: true },
    };
    const m = mergeServerAnswers(local, { q1: 'A', q2: 'B', q3: true });
    expect(m.q1).toEqual({ value: 'C', at: 5, saved: false });
    expect(m.q2!.value).toBe('B');
    expect(m.q3!.value).toBe(true);
  });
});
