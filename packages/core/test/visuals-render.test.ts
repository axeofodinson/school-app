import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  checkBlock,
  checkSvg,
  chartYRange,
  compileExpr,
  evalExpr,
  motionAt,
  niceScale,
  parseChart,
  parseExpr,
  parseScene,
  parseWidget,
  pathPoints,
  pieSlices,
  plotPath,
  runProgram,
  sameFraction,
  sceneStates,
  simplify,
  sliceScene,
  snap,
  svgBox,
  validateImportFile,
} from '../src';

const sample = JSON.parse(
  readFileSync(new URL('../samples/class9-physics-motion.json', import.meta.url), 'utf8'),
) as { lesson: { blocks: Record<string, unknown>[] } };
const byType = (t: string) => sample.lesson.blocks.find((b) => b.type === t)!;

describe('sample topic (Class 9 Physics, motion)', () => {
  it('imports cleanly and has a scene, a chart and a widget', () => {
    const r = validateImportFile(sample);
    expect(r.report.issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(parseScene(byType('scene'))).not.toBeNull();
    expect(parseChart(byType('chart'))).not.toBeNull();
    expect(parseWidget(byType('widget'))?.spec?.widget).toBe('motion_graph');
  });
  it('every visual has alt text and captions in both languages', () => {
    for (const b of sample.lesson.blocks) {
      if (!['scene', 'chart', 'widget'].includes(String(b.type))) continue;
      const alt = b.alt as { en: string; ur: string };
      expect(alt.en && alt.ur).toBeTruthy();
      for (const s of (b.steps as { caption: { en: string; ur: string } }[] | undefined) ?? [])
        expect(s.caption.en && s.caption.ur).toBeTruthy();
    }
  });
});

describe('sliceScene', () => {
  const svg =
    '<svg viewBox="0 0 100 50" width="200"><defs><linearGradient id="g1"/></defs>' +
    '<rect x="0" y="0" width="100" height="10"/>' +
    '<g transform="translate(5,0)"><circle id="a" cx="10" cy="10" r="5"/><rect x="1" y="1" width="2" height="2"/></g>' +
    '<g id="b"><g id="inner"><path d="M0 0 L10 10"/></g></g><text x="1" y="40">hi</text></svg>';
  it('keeps paint order, re-opens ancestors, copies defs, drops width', () => {
    const r = sliceScene(svg, ['a', 'b'])!;
    expect(r.viewBox).toEqual([0, 0, 100, 50]);
    expect(r.slices.map((s) => s.layer)).toEqual([null, 'a', null, 'b', null]);
    const a = r.slices[1]!.svg;
    expect(a).toContain('<g transform="translate(5,0)"><circle id="a"');
    expect(a).toContain('linearGradient');
    expect(a).not.toContain('width="200"');
    expect(r.slices[2]!.svg).toContain('<rect x="1"');
    expect(r.slices[3]!.svg).toContain('id="inner"');
    for (const s of r.slices) expect(checkSvg(s.svg).ok).toBe(true);
  });
  it('drops empty static slices and refuses non-svg', () => {
    const r = sliceScene('<svg viewBox="0 0 1 1"><g id="x"><rect/></g></svg>', ['x'])!;
    expect(r.slices.map((s) => s.layer)).toEqual(['x']);
    expect(sliceScene('<div/>', [])).toBeNull();
    expect(sliceScene('<svg><g id="x"/></svg>', ['x'])).toBeNull(); // no size
  });
});

describe('scene states and pivots', () => {
  it('each step builds on the one before', () => {
    const s = sceneStates(
      ['car', 'tag'],
      [
        { set: { tag: { opacity: 0 } } },
        { set: { car: { x: 60 } } },
        { set: { tag: { opacity: 1 } } },
      ],
    );
    expect(s[1]).toEqual({
      car: { x: 60, y: 0, scale: 1, rotate: 0, opacity: 1 },
      tag: { x: 0, y: 0, scale: 1, rotate: 0, opacity: 0 },
    });
    expect(s[2]!.car!.x).toBe(60);
    expect(s[2]!.tag!.opacity).toBe(1);
  });
  it('estimates a box from shapes, paths and translate', () => {
    expect(
      svgBox('<g transform="translate(10 0)"><rect x="0" y="0" width="10" height="4"/></g>'),
    ).toEqual([10, 0, 20, 4]);
    expect(pathPoints('M10 10 l5 0 v5 h-5 z')).toContainEqual([15, 15]);
    expect(svgBox('<g/>')).toBeNull();
  });
  it('refuses a scene with a script, unknown layer or too many steps', () => {
    const ok = byType('scene');
    expect(
      parseScene({
        ...ok,
        svg: '<svg viewBox="0 0 1 1"><script>alert(1)</script><g id="car"/></svg>',
      }),
    ).toBeNull();
    expect(parseScene({ ...ok, layers: ['nope'] })).toBeNull();
    expect(parseScene({ ...ok, steps: Array(9).fill({ caption: 'x' }) })).toBeNull();
    expect(parseScene({ ...ok, steps: [{ caption: 'x', set: { car: { left: 3 } } }] })).toBeNull();
    const s = parseScene({ ...ok, pivots: { car: [1, 2] } })!;
    expect(s.pivots.car).toEqual([1, 2]);
    expect(s.states).toHaveLength(4);
  });
});

describe('charts', () => {
  it('nice scales', () => {
    expect(niceScale(0, 50).ticks).toEqual([0, 20, 40, 60]);
    expect(niceScale(0, 9.3).ticks).toEqual([0, 2.5, 5, 7.5, 10]);
    expect(niceScale(3, 3).min).toBeLessThan(3);
    expect(niceScale(NaN, 1).ticks).toEqual([0, 1]);
  });
  it('bars start at zero; series lengths must match x', () => {
    const c = parseChart({ type: 'chart', alt: 'x', kind: 'bar', series: [{ values: [5, 7] }] })!;
    expect(chartYRange(c).min).toBe(0);
    expect(
      parseChart({
        type: 'chart',
        alt: 'x',
        kind: 'bar',
        x: { values: [1] },
        series: [{ values: [5, 7] }],
      }),
    ).toBeNull();
    expect(
      parseChart({ type: 'chart', alt: 'x', kind: 'radar', series: [{ values: [1] }] }),
    ).toBeNull();
  });
  it('pie slices add up to a full turn and ignore negatives', () => {
    const p = pieSlices([1, 1, 2, -4]);
    expect(p[2]!.share).toBe(0.5);
    expect(p[3]!.end).toBeCloseTo(Math.PI * 2);
  });
});

describe('widgets', () => {
  it('function_graph compiles to a program the stack machine agrees with', () => {
    const w = parseWidget({
      type: 'widget',
      alt: 'x',
      widget: 'function_graph',
      params: {
        expr: 'm*x^2 - sin(c) + max(x, 1)/2',
        sliders: { m: [-5, 5, 1, 2], c: [0, 3, 0.5, 1] },
      },
    })!;
    expect(w.spec?.widget).toBe('function_graph');
    if (w.spec?.widget !== 'function_graph') return;
    for (const x of [-3, 0, 0.5, 4]) {
      const env = { m: 2, c: 1, x };
      expect(runProgram(w.spec.program, [2, 1, x])).toBeCloseTo(evalExpr(w.spec.expr, env));
    }
    const e = parseExpr('-x + abs(x) * pi', ['x']);
    if (e.ok) expect(runProgram(compileExpr(e.expr, ['x']), [-2])).toBeCloseTo(2 + 2 * Math.PI);
  });
  it('refuses unsafe or broken params, never evaluating text', () => {
    const bad = (params: unknown, widget = 'function_graph') =>
      parseWidget({ type: 'widget', alt: 'x', widget, params })!.spec;
    expect(bad({ expr: 'constructor.constructor("alert(1)")()' })).toBeNull();
    expect(bad({ expr: 'x', sliders: { m: [5, -5, 1, 0] } })).toBeNull();
    expect(bad({ min: 0, max: 1, step: 0.0001 }, 'number_line')).toBeNull();
    expect(parseWidget({ type: 'widget', widget: 'teleporter' })).toBeNull();
    expect(parseWidget({ type: 'widget', widget: 'circuit', params: {} })!.spec).toBeNull();
  });
  it('plots with breaks where the function leaves the box', () => {
    const d = plotPath((x) => 1 / x, -1, 1, -5, 5, 100, 100, 20);
    expect(d.match(/M/g)!.length).toBeGreaterThanOrEqual(2);
    expect(plotPath((x) => x, 0, 1, 0, 1, 10, 10, 1)).toBe('M0.0 10.0L10.0 0.0');
  });
  it('snaps, simplifies fractions and models braking motion', () => {
    expect(snap(2.26, 0, 5, 0.5)).toBe(2.5);
    expect(snap(99, 0, 5, 0.5)).toBe(5);
    expect(simplify(6, 8)).toEqual([3, 4]);
    expect(sameFraction(1, 2, 2, 4)).toBe(true);
    expect(sameFraction(1, 3, 33, 100)).toBe(false);
    expect(motionAt(2, 1, 4)).toEqual({ s: 16, v: 6 });
    expect(motionAt(4, -1, 10)).toEqual({ s: 8, v: 0 }); // stops at t = 4, never reverses
  });
  it('the importer accepts what the renderers read', () => {
    const issues = checkBlock(byType('widget'), 'b', {
      conceptKeys: new Set(['speed', 'graphs', 'accel']),
    });
    expect(issues.filter((i) => i.severity === 'error')).toEqual([]);
  });
});

describe('app worklet copies match core', async () => {
  const vm = await import('../../../apps/mobile/features/learn/widgets/vm');
  it('runProgramW / plotProgramW / distanceAtW agree with runProgram / plotPath / motionAt', () => {
    const e = parseExpr(
      'a*sin(x) + max(x, 0)^2 / (1 + abs(b)) - floor(x) + sqrt(4) - ln(e) + log(100)',
      ['a', 'b', 'x'],
    );
    if (!e.ok) throw new Error('parse');
    const p = compileExpr(e.expr, ['a', 'b', 'x']);
    for (const x of [-2.5, 0, 1.25, 3])
      expect(vm.runProgramW(p, [2, -1, x])).toBeCloseTo(runProgram(p, [2, -1, x]));
    expect(vm.plotProgramW(p, [2, -1], -3, 3, -5, 5, 200, 100, 40)).toBe(
      plotPath((x) => runProgram(p, [2, -1, x]), -3, 3, -5, 5, 200, 100, 40),
    );
    for (const [u, a, t] of [
      [2, 1, 3],
      [4, -1, 9],
      [0, 2, 1.5],
    ] as const) {
      expect(vm.distanceAtW(u, a, t)).toBeCloseTo(motionAt(u, a, t).s);
      expect(vm.speedAtW(u, a, t)).toBeCloseTo(motionAt(u, a, t).v);
    }
  });
});
