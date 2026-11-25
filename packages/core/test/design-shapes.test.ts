// Tile shape morph (DECISIONS #126): seamless loop, forward-only turns, smooth ends.
import { describe, expect, it } from 'vitest';
import { morphHold, morphKeyframes, morphPose, morphSequence, shapePoses } from '../src/design';

const { angles, scales } = morphKeyframes();
const n = morphSequence.length;

describe('tile shape morph', () => {
  it('lands on every shape of the sequence (mod 90°) and returns to the start', () => {
    expect(angles).toHaveLength(n + 1);
    for (let i = 0; i <= n; i++) {
      const pose = shapePoses[morphSequence[i % n]!];
      angles[i]!.forEach((a, k) => expect(((a % 90) + 90) % 90).toBe(pose.angles[k]));
      expect(scales[i]).toBe(pose.scale);
    }
  });

  it('only turns forward, less than a quarter turn per step', () => {
    for (let i = 1; i <= n; i++)
      angles[i]!.forEach((a, k) => {
        const turn = a - angles[i - 1]![k]!;
        expect(turn).toBeGreaterThanOrEqual(0);
        expect(turn).toBeLessThan(90);
      });
  });

  it('is seamless across the loop restart and holds at each step start', () => {
    const end = morphPose(n - 1e-9, angles, scales, morphHold);
    const start = morphPose(0, angles, scales, morphHold);
    expect((((end.a1 - start.a1) % 90) + 90) % 90).toBeCloseTo(0, 5);
    expect(end.scale).toBeCloseTo(start.scale, 5);
    const held = morphPose(1 + morphHold / 2, angles, scales, morphHold);
    expect(held.a1).toBe(angles[1]![1]);
  });

  it('starts and settles with zero speed (no kick)', () => {
    const t0 = 1 + morphHold;
    const a = morphPose(t0, angles, scales, morphHold).a1;
    const b = morphPose(t0 + 1e-4, angles, scales, morphHold).a1;
    expect(Math.abs(b - a)).toBeLessThan(1e-6);
    const c = morphPose(2 - 1e-4, angles, scales, morphHold).a1;
    expect(Math.abs(angles[2]![1]! - c)).toBeLessThan(1e-6);
  });
});
