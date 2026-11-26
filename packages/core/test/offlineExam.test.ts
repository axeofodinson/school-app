// Offline exam clock and verdicts with a fake clock (TEST_PLAN OX-2; O-2 kill
// mid-exam, O-6 deadline while offline). The verdict rule matches db/038
// (db/test/038_smoke.sql OX-1).
import { describe, expect, it } from 'vitest';

import {
  offlineRemainingMs,
  offlineStage,
  startClock,
  stopClock,
  tickClock,
  uploadAnswers,
  uploadVerdict,
} from '../src';

const MIN = 60_000;
const T0 = Date.parse('2026-12-01T09:00:00Z');

describe('offline exam clock', () => {
  it('counts monotonic time while the app runs, even if the date is changed', () => {
    let c = startClock(T0, 1000, 'run1');
    c = tickClock(c, T0 + 5 * MIN, 1000 + 5 * MIN, 'run1');
    expect(c.elapsedMs).toBe(5 * MIN);
    // The student sets the device clock back an hour: the exam clock keeps going.
    c = tickClock(c, T0 - 55 * MIN, 1000 + 6 * MIN, 'run1');
    expect(c.elapsedMs).toBe(6 * MIN);
    expect(c.anomalies).toBe(1);
  });

  it('counts the time away when the app was killed (closing does not pause the exam)', () => {
    let c = startClock(T0, 500, 'run1');
    c = tickClock(c, T0 + 4 * MIN, 500 + 4 * MIN, 'run1');
    // App killed; reopened 3 minutes later (new run, monotonic restarted at 0).
    c = tickClock(c, T0 + 7 * MIN, 20, 'run2');
    expect(c.elapsedMs).toBe(7 * MIN);
    c = tickClock(c, T0 + 8 * MIN, 20 + MIN, 'run2');
    expect(c.elapsedMs).toBe(8 * MIN);
    expect(c.anomalies).toBe(0);
  });

  it('a wall clock set backwards while the app was closed adds nothing and is flagged', () => {
    let c = startClock(T0, 0, 'run1');
    c = tickClock(c, T0 + 10 * MIN, 10 * MIN, 'run1');
    c = tickClock(c, T0 - 60 * MIN, 5, 'run2');
    expect(c.elapsedMs).toBe(10 * MIN);
    expect(c.anomalies).toBe(1);
  });

  it('time up and stop', () => {
    let c = startClock(T0, 0, 'r');
    c = tickClock(c, T0 + 19 * MIN, 19 * MIN, 'r');
    expect(offlineRemainingMs(c, 20 * MIN)).toBe(MIN);
    c = tickClock(c, T0 + 25 * MIN, 25 * MIN, 'r');
    expect(offlineRemainingMs(c, 20 * MIN)).toBe(0);
    c = stopClock(c, T0 + 25 * MIN, 25 * MIN, 'r');
    const after = tickClock(c, T0 + 90 * MIN, 90 * MIN, 'r');
    expect(after).toBe(c); // stopped: never moves again
  });
});

describe('upload verdict (db/038 rule)', () => {
  const base = {
    sessionOpen: true,
    receivedAt: T0,
    deadlineAt: T0 + 60 * MIN,
    graceMs: 30_000,
    elapsedMs: 15 * MIN,
    durationMs: 20 * MIN,
  };
  it('in time and within the duration → accepted', () => {
    expect(uploadVerdict(base)).toBe('accepted');
    expect(uploadVerdict({ ...base, elapsedMs: 20 * MIN + 30_000 })).toBe('accepted');
  });
  it('over the duration + grace → over_time', () => {
    expect(uploadVerdict({ ...base, elapsedMs: 20 * MIN + 30_001 })).toBe('over_time');
  });
  it('O-6: the window closed while offline → late (stored, not graded)', () => {
    expect(uploadVerdict({ ...base, receivedAt: T0 + 61 * MIN })).toBe('late');
    expect(uploadVerdict({ ...base, sessionOpen: false, receivedAt: T0 + 61 * MIN })).toBe('late');
  });
  it('handed in already → already_closed', () => {
    expect(uploadVerdict({ ...base, sessionOpen: false })).toBe('already_closed');
  });
});

describe('offline exam stage', () => {
  const closesAt = T0 + 24 * 60 * MIN;
  const d = 20 * MIN;
  it('ready → taking → toSend → sent', () => {
    expect(offlineStage({ clock: null, durationMs: d, closesAt, now: T0, sent: false })).toBe(
      'ready',
    );
    let c = startClock(T0, 0, 'r');
    expect(offlineStage({ clock: c, durationMs: d, closesAt, now: T0, sent: false })).toBe(
      'taking',
    );
    c = tickClock(c, T0 + d, d, 'r');
    expect(offlineStage({ clock: c, durationMs: d, closesAt, now: T0 + d, sent: false })).toBe(
      'toSend',
    );
    expect(offlineStage({ clock: c, durationMs: d, closesAt, now: T0 + d, sent: true })).toBe(
      'sent',
    );
  });
  it('never started before the window closed → expired', () => {
    expect(
      offlineStage({ clock: null, durationMs: d, closesAt, now: closesAt + 1, sent: false }),
    ).toBe('expired');
  });
});

describe('upload answers', () => {
  it('only answered questions, trimmed to 500 characters', () => {
    const long = 'x'.repeat(600);
    expect(uploadAnswers({ a: 'A', b: null, c: '  ', d: true, e: long, f: undefined })).toEqual({
      a: 'A',
      d: true,
      e: 'x'.repeat(500),
    });
  });
});
