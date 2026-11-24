// Loads a frozen old-app module (src/, plain ESM JS) so parity tests can run the
// old and new code on the same fixtures. Dynamic import keeps tsc out of the
// untyped JS; the old file is read, never changed.
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function legacy(rel: string): Promise<Record<string, (...args: any[]) => any>> {
  return import(/* @vite-ignore */ pathToFileURL(ROOT + rel).href);
}

/** Small deterministic PRNG (mulberry32) so fuzzed fixtures are reproducible. */
export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: <T>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)]!,
  };
}
