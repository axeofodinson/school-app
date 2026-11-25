/**
 * Shape morph for the mosaic tiles (sign-in tile row, the mosaic mark). Pure data +
 * math so it is unit-tested in Node; apps/mobile/ui/MorphTile.tsx evaluates `morphPose`
 * inside a Reanimated worklet every frame (no React renders while it moves).
 *
 * Every shape is the union of three rounded squares ("petals") turned and scaled about
 * the tile centre, so the morph is transform-only (CLAUDE.md Motion rules):
 *   square  = three petals at 0°       diamond = three at 45°
 *   star    = 0° + 45° (8 points)       rosette = 0° + 30° + 60° (12 soft lobes)
 * A square looks the same every 90°, so petals only ever turn forward and each loop
 * ends exactly 90° × k past where it started: the restart is invisible.
 */

export type ShapeName = 'square' | 'star' | 'diamond' | 'rosette';

export interface ShapePose {
  /** Petal angles in degrees (three petals). */
  angles: readonly [number, number, number];
  /** Uniform scale so every shape covers about the same area. */
  scale: number;
}

export const shapePoses: Record<ShapeName, ShapePose> = {
  square: { angles: [0, 0, 0], scale: 1 },
  star: { angles: [0, 45, 45], scale: 0.88 },
  diamond: { angles: [45, 45, 45], scale: 0.8 },
  rosette: { angles: [0, 30, 60], scale: 0.86 },
};

/** The loop order: each step changes the silhouette clearly but calmly. */
export const morphSequence: readonly ShapeName[] = ['square', 'star', 'diamond', 'rosette'];

/**
 * Share of each step spent holding the shape before it starts to turn into the next.
 * The rest is the morph itself (smootherstep: zero speed and zero acceleration at
 * both ends, so a tile never "kicks" when it starts or settles).
 */
export const morphHold = 0.4;

/** How far apart neighbouring tiles are in the loop, in steps (a slow rolling wave). */
export const morphPhaseStep = 1.25;

/**
 * Cumulative petal angles per keyframe: row i is shape i of the sequence, and the extra
 * last row is the first shape again, reached by turning forward. Each petal turns by
 * 0–89° per step (the smallest forward turn that lands on the next shape).
 */
export function morphKeyframes(sequence: readonly ShapeName[] = morphSequence): {
  angles: number[][];
  scales: number[];
} {
  const angles: number[][] = [];
  const scales: number[] = [];
  let prev = [...shapePoses[sequence[0]!].angles];
  angles.push(prev);
  scales.push(shapePoses[sequence[0]!].scale);
  for (let i = 1; i <= sequence.length; i++) {
    const pose = shapePoses[sequence[i % sequence.length]!];
    const next = pose.angles.map((target, k) => {
      const from = prev[k]!;
      const turn = (((target - from) % 90) + 90) % 90;
      return from + turn;
    });
    angles.push(next);
    scales.push(pose.scale);
    prev = next;
  }
  return { angles, scales };
}

/**
 * The pose at loop position `p` (in steps, any real number; wraps). Must stay a
 * worklet: called on the UI thread with plain arrays from `morphKeyframes`.
 */
export function morphPose(
  p: number,
  angles: number[][],
  scales: number[],
  hold: number,
): { a0: number; a1: number; a2: number; scale: number } {
  'worklet';
  const n = scales.length - 1;
  const q = ((p % n) + n) % n;
  const step = Math.floor(q);
  const f = q - step;
  const t = f <= hold ? 0 : (f - hold) / (1 - hold);
  const e = t * t * t * (t * (t * 6 - 15) + 10);
  const from = angles[step]!;
  const to = angles[step + 1]!;
  return {
    a0: from[0]! + (to[0]! - from[0]!) * e,
    a1: from[1]! + (to[1]! - from[1]!) * e,
    a2: from[2]! + (to[2]! - from[2]!) * e,
    scale: scales[step]! + (scales[step + 1]! - scales[step]!) * e,
  };
}
