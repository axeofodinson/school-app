// Worklet copies of the pure maths in @school/core/visuals/render.ts, so widget
// geometry is redrawn on the UI thread every frame (DESIGN_SYSTEM.md §7b.4:
// drawing, not animation). Keep in step with core: runProgram, plotPath,
// motionAt. The core versions are unit-tested, and
// packages/core/test/visuals-render.test.ts checks these copies give the same answers.
import { OP } from '@school/core';

const NUM = OP.num;
const VAR = OP.var;
const NEG = OP.neg;
const ADD = OP.add;
const SUB = OP.sub;
const MUL = OP.mul;
const DIV = OP.div;
const FN = OP.fn;

export function runProgramW(p: readonly number[], slots: readonly number[]): number {
  'worklet';
  const st: number[] = [];
  let i = 0;
  while (i < p.length) {
    const op = p[i++]!;
    if (op === NUM) st.push(p[i++]!);
    else if (op === VAR) st.push(slots[p[i++]!] ?? NaN);
    else if (op === NEG) st.push(-st.pop()!);
    else if (op === FN) {
      const f = p[i++]!;
      if (f >= 11) {
        const b = st.pop()!;
        const a = st.pop()!;
        st.push(f === 11 ? Math.min(a, b) : Math.max(a, b));
      } else {
        const a = st.pop()!;
        let r = NaN;
        if (f === 0) r = Math.sin(a);
        else if (f === 1) r = Math.cos(a);
        else if (f === 2) r = Math.tan(a);
        else if (f === 3) r = Math.sqrt(a);
        else if (f === 4) r = Math.abs(a);
        else if (f === 5) r = Math.log(a);
        else if (f === 6) r = Math.log10(a);
        else if (f === 7) r = Math.exp(a);
        else if (f === 8) r = Math.floor(a);
        else if (f === 9) r = Math.ceil(a);
        else if (f === 10) r = Math.round(a);
        st.push(r);
      }
    } else {
      const b = st.pop()!;
      const a = st.pop()!;
      st.push(
        op === ADD ? a + b : op === SUB ? a - b : op === MUL ? a * b : op === DIV ? a / b : a ** b,
      );
    }
  }
  return st.length === 1 ? st[0]! : NaN;
}

/** y = program(sliders…, x) as an SVG path in a w × h box (see core plotPath). */
export function plotProgramW(
  p: readonly number[],
  slots: readonly number[],
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  w: number,
  h: number,
  samples: number,
): string {
  'worklet';
  let d = '';
  let pen = false;
  const span = y1 - y0;
  const env = slots.slice();
  env.push(0);
  const xi = env.length - 1;
  for (let i = 0; i <= samples; i++) {
    const x = x0 + ((x1 - x0) * i) / samples;
    env[xi] = x;
    const y = runProgramW(p, env);
    if (!(y === y) || !isFinite(y) || y < y0 - span * 2 || y > y1 + span * 2) {
      pen = false;
      continue;
    }
    const px = ((x - x0) / (x1 - x0)) * w;
    const py = h - ((y - y0) / span) * h;
    d += (pen ? 'L' : 'M') + px.toFixed(1) + ' ' + py.toFixed(1);
    pen = true;
  }
  return d;
}

/** Distance at time t, uniformly accelerated, stopping rather than reversing (core motionAt). */
export function distanceAtW(u: number, a: number, t: number): number {
  'worklet';
  const tStop = a < 0 && u > 0 ? -u / a : Infinity;
  const tt = Math.min(t, tStop);
  return Math.max(0, u * tt + 0.5 * a * tt * tt);
}

export function speedAtW(u: number, a: number, t: number): number {
  'worklet';
  const tStop = a < 0 && u > 0 ? -u / a : Infinity;
  return Math.max(0, u + a * Math.min(t, tStop));
}
