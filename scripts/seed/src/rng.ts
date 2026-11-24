// Deterministic pseudo-randomness. Every stream is keyed by a string, so adding
// a new stream never shifts the values an existing one produces.
import { createHash } from 'node:crypto';

export interface Rng {
  /** float in [0, 1) */
  next(): number;
  /** integer in [min, max] */
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  chance(p: number): boolean;
  shuffle<T>(items: readonly T[]): T[];
}

function seed32(key: string): number {
  return createHash('sha1').update(key).digest().readUInt32LE(0);
}

/** mulberry32: small, fast, good enough for fake data. */
export function rng(key: string): Rng {
  let a = seed32(key);
  const next = (): number => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number): number => min + Math.floor(next() * (max - min + 1));
  return {
    next,
    int,
    pick: (items) => {
      if (items.length === 0) throw new Error('pick from empty list');
      return items[int(0, items.length - 1)]!;
    },
    chance: (p) => next() < p,
    shuffle: (items) => {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = int(0, i);
        [out[i], out[j]] = [out[j]!, out[i]!];
      }
      return out;
    },
  };
}
