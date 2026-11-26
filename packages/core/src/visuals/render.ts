// What the lesson renderers (prompt 33) need from a stored visual block, as pure
// data: a zod-checked spec per block type, the scene SVG split into layers, the
// state of every layer at every step, chart scales, and the maths behind the
// first widgets. The importer (blocks.ts) already refused anything unsafe; the
// renderers parse again so a block that somehow got in broken shows its text
// version instead of crashing (DESIGN_SYSTEM §7b).
import { z } from 'zod';

import { visualBudget, widgetCatalogue } from '../design/tokens';
import { parseExpr, type Expr } from './expr';
import { checkSvg } from './svg';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

const Bi = z.unknown(); // {en, ur} or a string; read with pickLang
const Num = z.number().finite();

// ───────────────────────────── scene ─────────────────────────────

export interface LayerState {
  x: number;
  y: number;
  scale: number;
  rotate: number;
  opacity: number;
}
export const LAYER_REST: Readonly<LayerState> = { x: 0, y: 0, scale: 1, rotate: 0, opacity: 1 };

const LayerSet = z
  .object({
    x: Num.optional(),
    y: Num.optional(),
    scale: Num.min(0.05).max(20).optional(),
    rotate: Num.min(-3600).max(3600).optional(),
    opacity: Num.min(0).max(1).optional(),
  })
  .strict();

export const SceneBlockSchema = z.object({
  type: z.literal('scene'),
  alt: Bi,
  svg: z.string().min(1),
  layers: z.array(z.string().min(1)).max(visualBudget.maxMovingLayers),
  steps: z
    .array(
      z.object({
        caption: Bi,
        ms: Num.min(0).max(visualBudget.stepMaxMs).optional(),
        set: z.record(z.string(), LayerSet).optional(),
      }),
    )
    .min(1)
    .max(visualBudget.maxSceneSteps),
  /** Optional turning point per layer, in SVG units (default: the layer's box centre). */
  pivots: z.record(z.string(), z.tuple([Num, Num])).optional(),
  predict_question_id: z.string().nullable().optional(),
});

export interface SceneSlice {
  /** null = static drawing between layers. */
  layer: string | null;
  /** A complete, standalone SVG document for this slice (same viewBox as the scene). */
  svg: string;
}

export interface SceneSpec {
  alt: unknown;
  viewBox: [number, number, number, number];
  slices: SceneSlice[];
  layers: string[];
  pivots: Record<string, [number, number]>;
  steps: { caption: unknown; ms: number | null }[];
  /** Every layer's state at each step (each step builds on the one before). */
  states: Record<string, LayerState>[];
  predictQuestionId: string | null;
}

/** Each step's `set` applies on top of the step before; step 0 on top of rest. */
export function sceneStates(
  layers: readonly string[],
  steps: readonly { set?: Record<string, Partial<LayerState>> | undefined }[],
): Record<string, LayerState>[] {
  let cur: Record<string, LayerState> = Object.fromEntries(
    layers.map((l) => [l, { ...LAYER_REST }]),
  );
  return steps.map((s) => {
    const next: Record<string, LayerState> = {};
    for (const l of layers) next[l] = { ...cur[l]!, ...(s.set?.[l] ?? {}) };
    cur = next;
    return next;
  });
}

export function parseScene(block: unknown): SceneSpec | null {
  const r = SceneBlockSchema.safeParse(block);
  if (!r.success) return null;
  const b = r.data;
  const check = checkSvg(b.svg);
  if (!check.ok) return null;
  if (!b.layers.every((l) => check.ids.has(l))) return null;
  for (const s of b.steps)
    for (const l of Object.keys(s.set ?? {})) if (!b.layers.includes(l)) return null;
  const split = sliceScene(b.svg, b.layers);
  if (!split) return null;
  const pivots: Record<string, [number, number]> = {};
  for (const sl of split.slices) {
    if (!sl.layer) continue;
    const given = b.pivots?.[sl.layer];
    const box = given ? null : svgBox(sl.svg);
    const [vx, vy, vw, vh] = split.viewBox;
    pivots[sl.layer] =
      given ?? (box ? [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2] : [vx + vw / 2, vy + vh / 2]);
  }
  return {
    alt: b.alt,
    viewBox: split.viewBox,
    slices: split.slices,
    layers: b.layers,
    pivots,
    steps: b.steps.map((s) => ({ caption: s.caption, ms: s.ms ?? null })),
    states: sceneStates(b.layers, b.steps),
    predictQuestionId: b.predict_question_id ?? null,
  };
}

const TAG = /<\s*(\/?)\s*([a-zA-Z][\w:.-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)\s*>/g;
const idOf = (attrs: string) => /(?:^|\s)id\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(attrs);

function viewBoxOf(rootAttrs: string): [number, number, number, number] | null {
  const vb =
    /viewBox\s*=\s*["']\s*([-\d.eE]+)[\s,]+([-\d.eE]+)[\s,]+([-\d.eE]+)[\s,]+([-\d.eE]+)\s*["']/.exec(
      rootAttrs,
    );
  if (vb) {
    const v = vb.slice(1, 5).map(Number) as [number, number, number, number];
    if (v.every(Number.isFinite) && v[2] > 0 && v[3] > 0) return v;
  }
  const w = /\swidth\s*=\s*["']([\d.]+)/.exec(rootAttrs);
  const h = /\sheight\s*=\s*["']([\d.]+)/.exec(rootAttrs);
  if (w && h && Number(w[1]) > 0 && Number(h[1]) > 0) return [0, 0, Number(w[1]), Number(h[1])];
  return null;
}

/**
 * Split a scene SVG into an ordered stack of standalone SVGs: static drawing,
 * then a layer, then static drawing… Each layer can then move as one view
 * (transform + opacity, composited, no re-render) while the paint order stays
 * exactly as authored. Ancestors of a layer are re-opened in its slice so their
 * transforms and styles still apply; <defs> and <style> go into every slice.
 * Parsed once per block. Null when the markup is not an <svg> with a size.
 */
export function sliceScene(
  svg: string,
  layers: readonly string[],
): { viewBox: [number, number, number, number]; slices: SceneSlice[] } | null {
  const src = svg.replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*<\?xml[^>]*\?>\s*/i, '');
  const want = new Set(layers);
  const tags = [...src.matchAll(TAG)];
  const root = tags[0];
  if (!root || root[1] || root[2]!.toLowerCase() !== 'svg') return null;
  const rootAttrs = root[3] ?? '';
  const viewBox = viewBoxOf(rootAttrs);
  if (!viewBox) return null;
  const xmlns = /xmlns\s*=/.test(rootAttrs) ? '' : ' xmlns="http://www.w3.org/2000/svg"';
  const kept = rootAttrs.replace(/\s(width|height|viewBox)\s*=\s*("[^"]*"|'[^']*')/g, '');
  const open = `<svg${kept}${xmlns} viewBox="${viewBox.join(' ')}">`;

  let head = '';
  const slices: SceneSlice[] = [];
  const stack: { name: string; tag: string }[] = [];
  let chunk = '';
  let has = false;
  let cursor = root.index! + root[0].length;
  let layer: { id: string; depth: number; body: string } | null = null;
  const wrapOpen = () => stack.map((s) => s.tag).join('');
  const wrapClose = () =>
    [...stack]
      .reverse()
      .map((s) => `</${s.name}>`)
      .join('');
  const flushStatic = () => {
    if (has) slices.push({ layer: null, svg: chunk + wrapClose() });
    chunk = wrapOpen();
    has = false;
  };

  for (let i = 1; i < tags.length; i++) {
    const m = tags[i]!;
    const at = m.index!;
    if (at < cursor) continue; // inside a skipped <defs>/<style>
    const between = src.slice(cursor, at);
    const closing = m[1] === '/';
    const name = m[2]!;
    const lname = name.toLowerCase();
    const selfClose = m[4] === '/';
    const attrs = m[3] ?? '';

    if (layer) {
      layer.body += between + m[0];
      if (!closing && !selfClose) layer.depth++;
      if (closing) layer.depth--;
      cursor = at + m[0].length;
      if (layer.depth === 0) {
        slices.push({ layer: layer.id, svg: wrapOpen() + layer.body + wrapClose() });
        layer = null;
        chunk = wrapOpen();
        has = false;
      }
      continue;
    }
    if (between.trim()) has = true;
    chunk += between;
    cursor = at + m[0].length;

    if (closing) {
      if (lname === 'svg' && stack.length === 0) break;
      stack.pop();
      chunk += m[0];
      continue;
    }
    if ((lname === 'defs' || lname === 'style') && !selfClose) {
      const end = src.toLowerCase().indexOf(`</${lname}>`, cursor);
      if (end < 0) return null;
      head += m[0] + src.slice(cursor, end) + `</${name}>`;
      cursor = end + lname.length + 3;
      continue;
    }
    const id = idOf(attrs);
    const lid = id ? (id[1] ?? id[2] ?? '') : '';
    if (lid && want.has(lid)) {
      flushStatic();
      if (selfClose) {
        slices.push({ layer: lid, svg: wrapOpen() + m[0] + wrapClose() });
        chunk = wrapOpen();
      } else layer = { id: lid, depth: 1, body: m[0] };
      continue;
    }
    chunk += m[0];
    if (!selfClose) stack.push({ name, tag: m[0] });
    else if (lname !== 'title' && lname !== 'desc') has = true;
    if (!selfClose && lname !== 'g' && lname !== 'title' && lname !== 'desc') has = true;
  }
  if (layer) return null;
  if (has) slices.push({ layer: null, svg: chunk + wrapClose() });
  return {
    viewBox,
    slices: slices.map((s) => ({ layer: s.layer, svg: `${open}${head}${s.svg}</svg>` })),
  };
}

/**
 * A rough bounding box [x0, y0, x1, y1] of everything drawn in an SVG fragment,
 * in user units (shapes, lines, points, text anchors and path coordinates, with
 * a layer's own `translate(…)`). Good enough for a turning point; authors can
 * set `pivots` when it isn't.
 */
export function svgBox(svg: string): [number, number, number, number] | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const add = (x: number, y: number, dx = 0, dy = 0) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    x0 = Math.min(x0, x + dx);
    y0 = Math.min(y0, y + dy);
    x1 = Math.max(x1, x + dx);
    y1 = Math.max(y1, y + dy);
  };
  const shift: [number, number][] = [];
  for (const m of svg.matchAll(TAG)) {
    const name = m[2]!.toLowerCase();
    if (m[1] === '/') {
      if (name === 'g') shift.pop();
      continue;
    }
    if (name === 'svg' || name === 'defs') continue;
    const a = (k: string) => {
      const r = new RegExp(`(?:^|\\s)${k}\\s*=\\s*["']\\s*([-\\d.eE]+)`).exec(m[3] ?? '');
      return r ? Number(r[1]) : 0;
    };
    const tr = /transform\s*=\s*["'][^"']*translate\(\s*([-\d.eE]+)[\s,]*([-\d.eE]+)?/.exec(
      m[3] ?? '',
    );
    const base = shift[shift.length - 1] ?? [0, 0];
    const own: [number, number] = tr
      ? [base[0] + Number(tr[1]), base[1] + Number(tr[2] ?? 0)]
      : base;
    if (name === 'g' && m[4] !== '/') {
      shift.push(own);
      continue;
    }
    const [dx, dy] = own;
    switch (name) {
      case 'rect':
        add(a('x'), a('y'), dx, dy);
        add(a('x') + a('width'), a('y') + a('height'), dx, dy);
        break;
      case 'circle':
        add(a('cx') - a('r'), a('cy') - a('r'), dx, dy);
        add(a('cx') + a('r'), a('cy') + a('r'), dx, dy);
        break;
      case 'ellipse':
        add(a('cx') - a('rx'), a('cy') - a('ry'), dx, dy);
        add(a('cx') + a('rx'), a('cy') + a('ry'), dx, dy);
        break;
      case 'line':
        add(a('x1'), a('y1'), dx, dy);
        add(a('x2'), a('y2'), dx, dy);
        break;
      case 'text':
        add(a('x'), a('y'), dx, dy);
        break;
      case 'polygon':
      case 'polyline': {
        const pts = /points\s*=\s*["']([^"']*)/.exec(m[3] ?? '');
        const n = (pts?.[1] ?? '').match(/-?[\d.]+(?:e[-+]?\d+)?/gi)?.map(Number) ?? [];
        for (let i = 0; i + 1 < n.length; i += 2) add(n[i]!, n[i + 1]!, dx, dy);
        break;
      }
      case 'path': {
        const d = /\sd\s*=\s*["']([^"']*)/.exec(m[3] ?? '');
        for (const [px, py] of pathPoints(d?.[1] ?? '')) add(px, py, dx, dy);
        break;
      }
    }
  }
  return x0 <= x1 ? [x0, y0, x1, y1] : null;
}

const ARGS: Record<string, number> = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };

/** End points (and control points) of a path, absolute. */
export function pathPoints(d: string): [number, number][] {
  const out: [number, number][] = [];
  const toks = d.match(/[a-df-z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? [];
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  let cmd = '';
  let i = 0;
  while (i < toks.length) {
    if (/^[a-z]$/i.test(toks[i]!)) cmd = toks[i++]!;
    const lc = cmd.toLowerCase();
    const n = ARGS[lc];
    if (n === undefined) return out;
    if (n === 0) {
      x = sx;
      y = sy;
      if (i < toks.length && !/^[a-z]$/i.test(toks[i]!)) i++;
      continue;
    }
    const v = toks.slice(i, i + n).map(Number);
    if (v.length < n || v.some((k) => !Number.isFinite(k))) return out;
    i += n;
    const rel = cmd !== cmd.toUpperCase();
    const ox = rel ? x : 0;
    const oy = rel ? y : 0;
    if (lc === 'h') x = ox + v[0]!;
    else if (lc === 'v') y = oy + v[0]!;
    else {
      for (let k = lc === 'a' ? 5 : 0; k + 1 < n; k += 2) out.push([ox + v[k]!, oy + v[k + 1]!]);
      x = ox + v[n - 2]!;
      y = oy + v[n - 1]!;
    }
    out.push([x, y]);
    if (lc === 'm') {
      sx = x;
      sy = y;
      cmd = rel ? 'l' : 'L';
    }
  }
  return out;
}

// ───────────────────────────── chart ─────────────────────────────

export const ChartBlockSchema = z.object({
  type: z.literal('chart'),
  alt: Bi,
  kind: z.enum(['bar', 'line', 'pie', 'scatter', 'table']),
  x: z
    .object({
      label: Bi.optional(),
      unit: z.string().optional(),
      values: z
        .array(z.union([z.string(), Num]))
        .max(60)
        .optional(),
    })
    .optional(),
  y: z
    .object({
      label: Bi.optional(),
      unit: z.string().optional(),
      min: Num.optional(),
      max: Num.optional(),
    })
    .optional(),
  series: z
    .array(
      z.object({
        name: Bi.optional(),
        values: z.array(Num).min(1).max(60),
        role: z.enum(['focus', 'highlight', 'result']).optional(),
      }),
    )
    .min(1)
    .max(6),
  reveal: z.enum(['none', 'series', 'points']).optional(),
});
export type ChartSpec = z.infer<typeof ChartBlockSchema>;

export function parseChart(block: unknown): ChartSpec | null {
  const r = ChartBlockSchema.safeParse(block);
  if (!r.success) return null;
  const c = r.data;
  const n = c.x?.values?.length;
  if (n !== undefined && c.kind !== 'pie' && c.series.some((s) => s.values.length !== n))
    return null;
  return c;
}

/** Round axis ticks ("nice numbers") that cover [min, max], always including 0 for bars. */
export function niceScale(min: number, max: number, maxTicks = 5) {
  if (!Number.isFinite(min) || !Number.isFinite(max))
    return { min: 0, max: 1, step: 1, ticks: [0, 1] };
  if (min === max) {
    const pad = Math.abs(min) || 1;
    min -= pad;
    max += pad;
  }
  const raw = (max - min) / Math.max(1, maxTicks - 1);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const f = raw / mag;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
  const lo = Math.floor(min / step + 1e-9) * step;
  const hi = Math.ceil(max / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Number(v.toFixed(10)));
  return { min: lo, max: hi, step, ticks };
}

/** The value range a chart's y axis must show (bars and lines start at 0 unless told). */
export function chartYRange(c: ChartSpec) {
  const all = c.series.flatMap((s) => s.values);
  let lo = Math.min(...all);
  let hi = Math.max(...all);
  if (c.kind === 'bar' || c.kind === 'line') lo = Math.min(0, lo);
  if (c.y?.min !== undefined) lo = c.y.min;
  if (c.y?.max !== undefined) hi = c.y.max;
  return niceScale(lo, hi);
}

/** x positions for line/scatter: numeric x values when every one is a number, else their index. */
export function chartXs(c: ChartSpec): number[] {
  const xs = c.x?.values ?? c.series[0]!.values.map((_, i) => i);
  return xs.every((v) => typeof v === 'number') ? (xs as number[]) : xs.map((_, i) => i);
}

/** Pie slices from the first series: start/end angle in radians, clockwise from 12 o'clock. */
export function pieSlices(values: readonly number[]) {
  const vals = values.map((v) => Math.max(0, v));
  const total = vals.reduce((a, b) => a + b, 0);
  let at = 0;
  return vals.map((v) => {
    const a0 = at;
    at += total > 0 ? (v / total) * Math.PI * 2 : 0;
    return { start: a0, end: at, share: total > 0 ? v / total : 0 };
  });
}

/** A number for a label: up to 2 decimals, no trailing zeros. */
export function fmtNum(v: number): string {
  if (!Number.isFinite(v)) return '—';
  const r = Math.round(v * 100) / 100;
  return String(Object.is(r, -0) ? 0 : r);
}

// ───────────────────────────── widgets ─────────────────────────────

/** [min, max, step, start] (DATABASE_DESIGN §4). */
const Range = z.tuple([Num, Num, Num.positive(), Num]).refine(([a, b]) => a < b, 'min < max');

export interface SliderSpec {
  name: string;
  min: number;
  max: number;
  step: number;
  value: number;
}

export function snap(v: number, min: number, max: number, step: number): number {
  const c = Math.min(max, Math.max(min, v));
  const k = Math.round((c - min) / step);
  return Number(Math.min(max, min + k * step).toFixed(6));
}

const toSliders = (s: Record<string, [number, number, number, number]> | undefined): SliderSpec[] =>
  Object.entries(s ?? {}).map(([name, [min, max, step, value]]) => ({
    name,
    min,
    max,
    step,
    value: snap(value, min, max, step),
  }));

const Pair = z.tuple([Num, Num]).refine(([a, b]) => a < b, 'min < max');

const FunctionGraphParams = z.object({
  expr: z.string(),
  sliders: z.record(z.string().regex(/^[a-zA-Z]\w{0,7}$/), Range).optional(),
  x: Pair.optional(),
  y: Pair.optional(),
});
const FractionBarsParams = z.object({
  bars: z
    .array(
      z.object({ den: z.number().int().min(1).max(24), shaded: z.number().int().min(0).max(24) }),
    )
    .min(1)
    .max(4)
    .optional(),
  max_den: z.number().int().min(2).max(24).optional(),
});
const NumberLineParams = z.object({
  min: Num,
  max: Num,
  step: Num.positive(),
  start: Num.optional(),
  jump: Num.optional(),
  target: Num.optional(),
});
const MotionGraphParams = z.object({
  /** Starting speed (m/s) and acceleration (m/s²); sliders may name u and/or a. */
  u: Num.optional(),
  a: Num.optional(),
  t: z.number().positive().max(60).optional(),
  sliders: z.record(z.enum(['u', 'a']), Range).optional(),
  graph: z.enum(['distance', 'speed']).optional(),
});

export type WidgetSpec =
  | {
      widget: 'function_graph';
      expr: Expr;
      program: number[];
      vars: string[];
      sliders: SliderSpec[];
      x: [number, number];
      y: [number, number];
    }
  | { widget: 'fraction_bars'; bars: { den: number; shaded: number }[]; maxDen: number }
  | {
      widget: 'number_line';
      min: number;
      max: number;
      step: number;
      start: number;
      jump: number | null;
      target: number | null;
    }
  | {
      widget: 'motion_graph';
      sliders: SliderSpec[];
      u: number;
      a: number;
      t: number;
      graph: 'distance' | 'speed';
    };

/** Widgets built so far; the rest of `widgetCatalogue` shows its text version. */
export const BUILT_WIDGETS = [
  'function_graph',
  'fraction_bars',
  'number_line',
  'motion_graph',
] as const;

export interface WidgetBlock {
  alt: unknown;
  task: unknown;
  predictQuestionId: string | null;
  spec: WidgetSpec | null;
  /** The catalogue name, even when not built yet. */
  widget: string;
}

export function parseWidget(block: unknown): WidgetBlock | null {
  if (!isObj(block) || block.type !== 'widget') return null;
  const widget = typeof block.widget === 'string' ? block.widget : '';
  if (!(widgetCatalogue as readonly string[]).includes(widget)) return null;
  const base = {
    alt: block.alt,
    task: block.task,
    predictQuestionId:
      typeof block.predict_question_id === 'string' ? block.predict_question_id : null,
    widget,
  };
  return { ...base, spec: widgetSpec(widget, isObj(block.params) ? block.params : {}) };
}

function widgetSpec(widget: string, params: Obj): WidgetSpec | null {
  switch (widget) {
    case 'function_graph': {
      const r = FunctionGraphParams.safeParse(params);
      if (!r.success) return null;
      const sliders = toSliders(r.data.sliders);
      const names = sliders.map((s) => s.name);
      const e = parseExpr(r.data.expr, [...names, 'x']);
      if (!e.ok) return null;
      const x = r.data.x ?? [-10, 10];
      return {
        widget,
        expr: e.expr,
        program: compileExpr(e.expr, [...names, 'x']),
        vars: names,
        sliders,
        x,
        y: r.data.y ?? x,
      };
    }
    case 'fraction_bars': {
      const r = FractionBarsParams.safeParse(params);
      if (!r.success) return null;
      const bars = (
        r.data.bars ?? [
          { den: 2, shaded: 1 },
          { den: 4, shaded: 0 },
        ]
      ).map((b) => ({ den: b.den, shaded: Math.min(b.shaded, b.den) }));
      return { widget, bars, maxDen: r.data.max_den ?? 12 };
    }
    case 'number_line': {
      const r = NumberLineParams.safeParse(params);
      if (!r.success || r.data.min >= r.data.max) return null;
      const { min, max, step } = r.data;
      if ((max - min) / step > 200) return null;
      return {
        widget,
        min,
        max,
        step,
        start: snap(r.data.start ?? min, min, max, step),
        jump: r.data.jump ?? null,
        target: r.data.target ?? null,
      };
    }
    case 'motion_graph': {
      const r = MotionGraphParams.safeParse(params);
      if (!r.success) return null;
      const sliders = toSliders(r.data.sliders);
      const at = (k: 'u' | 'a', d: number) =>
        sliders.find((s) => s.name === k)?.value ?? r.data[k] ?? d;
      return {
        widget,
        sliders,
        u: at('u', 2),
        a: at('a', 0),
        t: r.data.t ?? 10,
        graph: r.data.graph ?? 'distance',
      };
    }
    default:
      return null;
  }
}

/** Greatest common divisor (fractions are shown simplified: 2/4 = 1/2). */
export function gcd(a: number, b: number): number {
  a = Math.abs(Math.trunc(a));
  b = Math.abs(Math.trunc(b));
  while (b) [a, b] = [b, a % b];
  return a || 1;
}

/** n/d in lowest terms. */
export function simplify(n: number, d: number): [number, number] {
  const g = gcd(n, d);
  return [n / g, d / g];
}

/** a/b = c/d, exactly (integers, no floating point). */
export function sameFraction(a: number, b: number, c: number, d: number): boolean {
  return a * d === c * b;
}

/** Distance and speed of uniformly accelerated motion at time t (s = ut + ½at², v = u + at), never below 0. */
export function motionAt(u: number, a: number, t: number) {
  // If it slows to a stop, it stays stopped (a car braking doesn't reverse).
  const tStop = a < 0 && u > 0 ? -u / a : Infinity;
  const tt = Math.min(t, tStop);
  const v = Math.max(0, u + a * tt);
  const s = Math.max(0, u * tt + 0.5 * a * tt * tt);
  return { s, v };
}

/** The furthest the object gets by time T (graph and track scale). */
export function motionRange(sliders: readonly SliderSpec[], u: number, a: number, t: number) {
  const uMax = Math.max(u, ...sliders.filter((s) => s.name === 'u').map((s) => s.max));
  const aMax = Math.max(a, ...sliders.filter((s) => s.name === 'a').map((s) => s.max));
  const end = motionAt(uMax, aMax, t);
  return { sMax: Math.max(1, end.s), vMax: Math.max(1, end.v) };
}

// ───────────────────────────── expression program ─────────────────────────────
// The widget redraws its curve on the UI thread, where the recursive evaluator
// can't run. compileExpr flattens a checked tree into a postfix program of
// numbers; runProgram is the stack machine. The app keeps a worklet copy of
// runProgram (features/learn/widgets/vm.ts) checked against this one in tests.

export const OP = {
  num: 1,
  var: 2,
  neg: 3,
  add: 4,
  sub: 5,
  mul: 6,
  div: 7,
  pow: 8,
  fn: 9,
} as const;
export const FN_CODES = [
  'sin',
  'cos',
  'tan',
  'sqrt',
  'abs',
  'ln',
  'log',
  'exp',
  'floor',
  'ceil',
  'round',
  'min',
  'max',
] as const;

/** Postfix program: [OP.num, v] [OP.var, slot] [OP.neg] [OP.add] … [OP.fn, code]. Slots follow `vars`. */
export function compileExpr(e: Expr, vars: readonly string[]): number[] {
  const out: number[] = [];
  const walk = (n: Expr): void => {
    switch (n.k) {
      case 'num':
        out.push(OP.num, n.v);
        return;
      case 'var': {
        const slot = vars.indexOf(n.name);
        if (slot < 0) out.push(OP.num, NaN);
        else out.push(OP.var, slot);
        return;
      }
      case 'neg':
        walk(n.a);
        out.push(OP.neg);
        return;
      case 'call':
        n.args.forEach(walk);
        out.push(OP.fn, FN_CODES.indexOf(n.fn));
        return;
      case 'bin':
        walk(n.a);
        walk(n.b);
        out.push({ '+': OP.add, '-': OP.sub, '*': OP.mul, '/': OP.div, '^': OP.pow }[n.op]);
        return;
    }
  };
  walk(e);
  return out;
}

/** Reference stack machine for compileExpr's programs (the app's worklet must match it). */
export function runProgram(p: readonly number[], slots: readonly number[]): number {
  const st: number[] = [];
  let i = 0;
  while (i < p.length) {
    const op = p[i++]!;
    if (op === OP.num) st.push(p[i++]!);
    else if (op === OP.var) st.push(slots[p[i++]!] ?? NaN);
    else if (op === OP.neg) st.push(-st.pop()!);
    else if (op === OP.fn) {
      const f = p[i++]!;
      if (f >= 11) {
        const b = st.pop()!;
        const a = st.pop()!;
        st.push(f === 11 ? Math.min(a, b) : Math.max(a, b));
      } else {
        const a = st.pop()!;
        st.push(
          [
            Math.sin,
            Math.cos,
            Math.tan,
            Math.sqrt,
            Math.abs,
            Math.log,
            Math.log10,
            Math.exp,
            Math.floor,
            Math.ceil,
            Math.round,
          ][f]!(a),
        );
      }
    } else {
      const b = st.pop()!;
      const a = st.pop()!;
      st.push(
        op === OP.add
          ? a + b
          : op === OP.sub
            ? a - b
            : op === OP.mul
              ? a * b
              : op === OP.div
                ? a / b
                : a ** b,
      );
    }
  }
  return st.length === 1 ? st[0]! : NaN;
}

/**
 * An SVG path for y = f(x) over [x0, x1] in a w × h box whose y range is [y0, y1].
 * Breaks the line where f is undefined or jumps off the box (tan, 1/x), so no
 * false vertical lines. Pure arithmetic, mirrored by the app's worklet.
 */
export function plotPath(
  f: (x: number) => number,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  w: number,
  h: number,
  samples = 160,
): string {
  let d = '';
  let pen = false;
  const span = y1 - y0;
  for (let i = 0; i <= samples; i++) {
    const x = x0 + ((x1 - x0) * i) / samples;
    const y = f(x);
    const ok = Number.isFinite(y) && y >= y0 - span * 2 && y <= y1 + span * 2;
    if (!ok) {
      pen = false;
      continue;
    }
    const px = ((x - x0) / (x1 - x0)) * w;
    const py = h - ((y - y0) / span) * h;
    d += `${pen ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`;
    pen = true;
  }
  return d;
}
