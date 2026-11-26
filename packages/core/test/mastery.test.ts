import { describe, expect, it } from 'vitest';

import {
  diagnosticSize,
  MASTERY_DEFAULTS,
  masteryFromEvents,
  pickDiagnostic,
  type DiagnosticPoolItem,
  type MasteryEvent,
  type MasteryState,
} from '../src/mastery';
import diagnosticCases from './fixtures/diagnostic-cases.json';
import masteryCases from './fixtures/mastery-cases.json';

// The same vectors run in SQL (db/test/019_smoke.sql): client and server agree.
describe('masteryFromEvents (shared vectors with db/019 mastery_eval)', () => {
  for (const c of masteryCases) {
    it(c.note, () => {
      const cfg = { ...MASTERY_DEFAULTS, ...(('cfg' in c ? c.cfg : {}) as object) };
      const prev = ('prev' in c ? c.prev : null) as MasteryState | null;
      expect(masteryFromEvents(c.events as MasteryEvent[], cfg, prev)).toEqual(c.expect);
    });
  }

  it('does not mutate its input', () => {
    const ev: MasteryEvent[] = [
      { q: 'b', c: true, d: 1, t: 2, i: 0 },
      { q: 'a', c: true, d: 1, t: 1, i: 0 },
    ];
    const copy = JSON.parse(JSON.stringify(ev));
    masteryFromEvents(ev);
    expect(ev).toEqual(copy);
  });
});

describe('pickDiagnostic (shared vectors with db/019 diagnostic_pick)', () => {
  for (const c of diagnosticCases) {
    it(c.note, () => {
      expect(pickDiagnostic(c.pool as DiagnosticPoolItem[], c.n)).toEqual(c.expect);
    });
  }

  it('covers every concept before repeating one, at school size', () => {
    const pool: DiagnosticPoolItem[] = [];
    for (let k = 0; k < 6; k++)
      for (let j = 0; j < 20; j++)
        pool.push({
          q: `q${k}-${String(j).padStart(2, '0')}`,
          concept: `c${k}`,
          order: k,
          d: (j % 3) + 1,
          seen: j % 4 === 0 ? j * 10 : null,
        });
    const picked = pickDiagnostic(pool, 30);
    expect(picked).toHaveLength(30);
    expect(new Set(picked).size).toBe(30);
    const firstSix = picked.slice(0, 6).map((q) => q.split('-')[0]);
    expect(new Set(firstSix).size).toBe(6);
    // Each concept gets 5, and never a seen item while an unseen one is left.
    const byConcept = new Map<string, string[]>();
    for (const q of picked) {
      const k = q.split('-')[0]!;
      byConcept.set(k, [...(byConcept.get(k) ?? []), q]);
    }
    for (const qs of byConcept.values()) {
      expect(qs).toHaveLength(5);
      for (const q of qs) expect(pool.find((p) => p.q === q)!.seen).toBeNull();
    }
  });
});

describe('diagnosticSize', () => {
  it('uses the default, the topic size or the request, clamped', () => {
    expect(diagnosticSize(null, null, 4, 100)).toBe(30);
    expect(diagnosticSize(12, null, 4, 100)).toBe(12);
    expect(diagnosticSize(12, 40, 4, 100)).toBe(40);
    expect(diagnosticSize(null, 2, 1, 100)).toBe(5);
    expect(diagnosticSize(null, 500, 1, 100)).toBe(60);
  });
  it('never fewer than the concepts, never more than the pool', () => {
    expect(diagnosticSize(5, null, 9, 100)).toBe(9);
    expect(diagnosticSize(null, null, 4, 17)).toBe(17);
    expect(diagnosticSize(null, null, 0, 0)).toBe(0);
  });
});
