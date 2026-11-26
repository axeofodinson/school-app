import { describe, expect, it, vi } from 'vitest';

import {
  average,
  choiceRows,
  itemFlag,
  liveCounts,
  liveStatus,
  scoreBands,
  stemText,
  throttle,
  topDistractor,
} from '../src/examResults';

const NOW = Date.parse('2026-11-26T10:00:00Z');

describe('live status', () => {
  it('reads each row', () => {
    expect(liveStatus({ status: null, lastSeenAt: null, startedAt: null }, NOW)).toBe('notJoined');
    expect(liveStatus({ status: 'void', lastSeenAt: null, startedAt: null }, NOW)).toBe('void');
    expect(liveStatus({ status: 'auto_submitted', lastSeenAt: null, startedAt: null }, NOW)).toBe(
      'handedIn',
    );
    expect(
      liveStatus(
        { status: 'in_progress', lastSeenAt: '2026-11-26T09:59:30Z', startedAt: null },
        NOW,
      ),
    ).toBe('writing');
    expect(
      liveStatus(
        { status: 'in_progress', lastSeenAt: null, startedAt: '2026-11-26T09:50:00Z' },
        NOW,
      ),
    ).toBe('idle');
  });
  it('counts', () => {
    const c = liveCounts(
      [
        { status: null, lastSeenAt: null, startedAt: null },
        { status: 'submitted', lastSeenAt: null, startedAt: null },
        { status: 'in_progress', lastSeenAt: '2026-11-26T09:59:59Z', startedAt: null },
      ],
      NOW,
    );
    expect(c).toEqual({ notJoined: 1, writing: 1, idle: 0, handedIn: 1, void: 0 });
  });
});

describe('item analysis', () => {
  it('flags easy, hard and trap items only with enough papers', () => {
    expect(itemFlag({ papers: 4, correct: 0, choices: { B: 4 }, key: 'A' })).toBeNull();
    expect(itemFlag({ papers: 10, correct: 9, choices: { A: 9, B: 1 }, key: 'A' })).toBe('easy');
    expect(
      itemFlag({ papers: 10, correct: 2, choices: { A: 2, B: 2, C: 2, D: 2 }, key: 'A' }),
    ).toBe('hard');
    expect(itemFlag({ papers: 10, correct: 4, choices: { A: 4, C: 5, B: 1 }, key: 'A' })).toBe(
      'trap',
    );
    expect(
      itemFlag({ papers: 10, correct: 6, choices: { A: 6, B: 2, C: 2 }, key: 'A' }),
    ).toBeNull();
  });
  it('names the top distractor', () => {
    expect(
      topDistractor({ papers: 6, correct: 2, choices: { A: 2, C: 3, B: 1 }, key: 'A' }),
    ).toEqual({
      key: 'C',
      count: 3,
    });
    expect(topDistractor({ papers: 2, correct: 2, choices: { A: 2 }, key: 'A' })).toBeNull();
    expect(
      topDistractor({ papers: 3, correct: 1, choices: { true: 1, false: 2 }, key: true }),
    ).toEqual({ key: 'false', count: 2 });
  });
  it('bands and averages scores', () => {
    expect(scoreBands([0, 3, 5, 9, 10], 10)).toEqual([1, 1, 1, 0, 2]);
    expect(scoreBands([1], 0)).toEqual([0, 0, 0, 0, 0]);
    expect(average([8, 6, 7])).toBe(7);
    expect(average([])).toBeNull();
  });
});

describe('throttle', () => {
  it('runs at most once per window and always lands the last call', () => {
    vi.useFakeTimers();
    let t = 0;
    const fn = vi.fn();
    const th = throttle(fn, 1000, () => t);
    th();
    expect(fn).toHaveBeenCalledTimes(1);
    th();
    th();
    expect(fn).toHaveBeenCalledTimes(1);
    t = 1000;
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(2);
    th.cancel();
    vi.useRealTimers();
  });
});

describe('item text', () => {
  it('reads the stem or the prompt', () => {
    expect(stemText({ stem: '2 + 2 = ?' }, 'ur')).toBe('2 + 2 = ?');
    expect(stemText({ prompt: { en: 'Tap the cat', ur: 'بلی پر ٹیپ کرو' } }, 'ur')).toBe(
      'بلی پر ٹیپ کرو',
    );
    expect(stemText(null, 'en')).toBe('');
  });
  it('lists every option, picked or not, with the key marked', () => {
    const rows = choiceRows(
      'mcq',
      {
        options: [
          { key: 'A', text: '4' },
          { key: 'B', text: '5' },
          { key: 'C', text: '6' },
        ],
      },
      { A: 3, C: 2, Z: 1 },
      'A',
    );
    expect(rows.map((r) => [r.key, r.count, r.correct])).toEqual([
      ['A', 3, true],
      ['B', 0, false],
      ['C', 2, false],
      ['Z', 1, false],
    ]);
    expect(choiceRows('true_false', {}, { false: 2 }, true).map((r) => r.count)).toEqual([0, 2]);
  });
});
