// Spaced revision with a fake clock (TEST_PLAN SR-2): due dates and transitions
// over 7 + 30 days, the same numbers db/037 uses (db/test/037_smoke.sql SR-1).
import { describe, expect, it } from 'vitest';

import {
  daysUntil,
  isRevisionDue,
  nextRevision,
  REVISION,
  retentionRates,
  revisionModel,
  revisionOutcome,
  scheduleOnMastery,
  type RevisionRow,
  type RevisionSlot,
} from '../src';

const DAY = 24 * 60 * 60 * 1000;
const H = 60 * 60 * 1000;
const T0 = Date.parse('2026-12-01T09:00:00Z');
const right = (n: number) => Array.from({ length: n }, () => ({ correct: true }));
const mix = (r: number, w: number) => [
  ...right(r),
  ...Array.from({ length: w }, () => ({ correct: false })),
];

/** A fake clock that only moves forward. */
function clock(start = T0) {
  let now = start;
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
      return now;
    },
  };
}

describe('revision schedule (fake clock)', () => {
  it('mastery → 7-day check → 30-day check → retained', () => {
    const c = clock();
    let s: RevisionSlot = scheduleOnMastery(c.now());
    expect(s).toEqual({ stage: 1, nextAt: T0 + 7 * DAY });

    // Day 6: not due; a revision set changes nothing.
    c.advance(6 * DAY);
    expect(isRevisionDue(s, c.now())).toBe(false);
    expect(nextRevision(s, 'pass', c.now())).toBe(s);

    // Day 7: due; pass → stage 2, 30 days from the check.
    c.advance(DAY);
    expect(isRevisionDue(s, c.now())).toBe(true);
    s = nextRevision(s, revisionOutcome(right(5)), c.now());
    expect(s).toEqual({ stage: 2, nextAt: T0 + 37 * DAY });

    // Day 36: not yet; day 40 (3 days late): still due, pass → retained.
    c.advance(29 * DAY);
    expect(isRevisionDue(s, c.now())).toBe(false);
    c.advance(4 * DAY);
    expect(isRevisionDue(s, c.now())).toBe(true);
    s = nextRevision(s, 'pass', c.now());
    expect(s).toEqual({ stage: REVISION.retained, nextAt: null });

    // Retained: never due again.
    c.advance(400 * DAY);
    expect(isRevisionDue(s, c.now())).toBe(false);
  });

  it('a failed check goes back to the 7-day check from the day it failed', () => {
    const c = clock();
    let s = scheduleOnMastery(c.now());
    c.advance(7 * DAY);
    s = nextRevision(s, 'pass', c.now());
    c.advance(31 * DAY);
    s = nextRevision(s, revisionOutcome(mix(2, 3)), c.now());
    expect(s).toEqual({ stage: 1, nextAt: T0 + 45 * DAY });
    // ...and the ladder starts again.
    c.advance(7 * DAY);
    s = nextRevision(s, 'pass', c.now());
    expect(s).toEqual({ stage: 2, nextAt: T0 + 75 * DAY });
  });

  it('too few items of the concept is not a check', () => {
    const s = scheduleOnMastery(T0);
    expect(revisionOutcome(right(2))).toBe('tooFew');
    expect(nextRevision(s, 'tooFew', T0 + 8 * DAY)).toBe(s);
  });

  it('pass needs 80 % of at least 3 (4 of 5 passes, 3 of 5 fails)', () => {
    expect(revisionOutcome(mix(4, 1))).toBe('pass');
    expect(revisionOutcome(mix(3, 2))).toBe('fail');
    expect(revisionOutcome(right(3))).toBe('pass');
  });

  it('may be done up to 12 hours early, not more', () => {
    const s = scheduleOnMastery(T0);
    expect(isRevisionDue(s, T0 + 7 * DAY - 12 * H)).toBe(true);
    expect(isRevisionDue(s, T0 + 7 * DAY - 13 * H)).toBe(false);
    expect(isRevisionDue({ stage: 0, nextAt: T0 }, T0 + DAY)).toBe(false);
    expect(isRevisionDue({ stage: 1, nextAt: null }, T0)).toBe(false);
  });
});

describe('Prepare: due for revision', () => {
  const row = (id: string, stage: number, at: number | null): RevisionRow => ({
    conceptId: id,
    state: 'mastered',
    stage,
    nextReviewAt: at === null ? null : new Date(at).toISOString(),
  });

  it('splits due / upcoming / retained, longest overdue first, soonest next', () => {
    const now = T0;
    const m = revisionModel(
      [
        row('b', 1, now - DAY),
        row('a', 2, now - 5 * DAY),
        row('c', 1, now + 6 * H),
        row('d', 2, now + 20 * DAY),
        row('e', 1, now + 2 * DAY),
        row('f', 3, null),
        row('g', 0, null),
      ],
      now,
    );
    expect(m.due.map((r) => r.conceptId)).toEqual(['a', 'b', 'c']);
    expect(m.upcoming.map((r) => r.conceptId)).toEqual(['e', 'd']);
    expect(m.retained).toBe(1);
  });

  it('moves as the clock moves', () => {
    const c = clock();
    const rows = [row('x', 1, T0 + 7 * DAY)];
    expect(revisionModel(rows, c.now()).due).toHaveLength(0);
    expect(daysUntil(rows[0]!.nextReviewAt!, c.now())).toBe(7);
    c.advance(7 * DAY);
    expect(revisionModel(rows, c.now()).due).toHaveLength(1);
    expect(daysUntil(rows[0]!.nextReviewAt!, c.now())).toBe(0);
  });
});

describe('retention measures', () => {
  it('7- and 30-day rates from rollup rows', () => {
    const r = retentionRates([
      { stage: 1, checks: 10, passed: 8 },
      { stage: 1, checks: 10, passed: 7 },
      { stage: 2, checks: 4, passed: 2 },
    ]);
    expect(r.day7).toEqual({ checks: 20, passed: 15, rate: 0.75 });
    expect(r.day30.rate).toBe(0.5);
    expect(retentionRates([]).day7.rate).toBeNull();
  });
});
