// Checks for lesson blocks, text and visual (DATABASE_DESIGN §4, DESIGN_SYSTEM
// §7b). Used by the importer (prompt 21); renderers (30/33) can trust a stored
// block because nothing unchecked gets in.
import { visualBudget, visualBlockTypes, widgetCatalogue } from '../design/tokens';
import type { Issue, IssueCode, Severity } from '../importer/types';

import { parseExpr } from './expr';
import { checkSvg } from './svg';

export const TEXT_BLOCK_TYPES = [
  'objectives',
  'intro',
  'simple',
  'detailed',
  'worked_example',
  'misconception',
  'quick_check',
  'application',
  'summary',
] as const;

export const CHART_KINDS = ['bar', 'line', 'pie', 'scatter', 'table'] as const;
const SCENE_PROPS = new Set(['x', 'y', 'scale', 'rotate', 'opacity']);

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

export interface BlockContext {
  /** Concept keys defined in the file. */
  conceptKeys: ReadonlySet<string>;
  /** Exam items may only carry static figures and charts. */
  examSafe?: boolean;
}

/** en required (error), ur missing = warning (translation is flagged, never passed). */
function bilingual(v: unknown, path: string, missing: IssueCode, out: Issue[], q?: number): void {
  const push = (severity: Severity, code: IssueCode) =>
    out.push(q === undefined ? { severity, code, path } : { severity, code, path, q });
  if (typeof v === 'string') {
    if (!v.trim()) push('error', missing);
    else push('warning', 'urMissing');
    return;
  }
  if (!isObj(v) || (!str(v.en) && !str(v.ur))) {
    push('error', missing);
    return;
  }
  if (!str(v.en)) push('warning', 'enMissing');
  if (!str(v.ur)) push('warning', 'urMissing');
}

function svgIssues(svg: unknown, path: string, out: Issue[], q?: number): Set<string> | null {
  const add = (code: IssueCode, detail?: string) => {
    const i: Issue = { severity: 'error', code, path };
    if (q !== undefined) i.q = q;
    if (detail !== undefined) i.detail = detail;
    out.push(i);
  };
  if (typeof svg !== 'string' || !svg.trim()) {
    add('svgMissing');
    return null;
  }
  const c = checkSvg(svg);
  for (const p of c.problems) {
    if (p.problem === 'tooBig') add('svgTooBig', String(Math.ceil(c.bytes / 1024)));
    else if (p.problem === 'tooManyElements') add('svgTooManyElements', String(c.elements));
    else add('svgUnsafe', p.detail ? `${p.problem}:${p.detail}` : p.problem);
  }
  return c.ids;
}

/** Check one block. `path` is where it sits, e.g. `lesson.blocks[3]`. */
export function checkBlock(block: unknown, path: string, ctx: BlockContext, q?: number): Issue[] {
  const out: Issue[] = [];
  const err = (code: IssueCode, p = path, detail?: string) => {
    const i: Issue = { severity: 'error', code, path: p };
    if (q !== undefined) i.q = q;
    if (detail !== undefined) i.detail = detail;
    out.push(i);
  };
  const warn = (code: IssueCode, p = path, detail?: string) => {
    const i: Issue = { severity: 'warning', code, path: p };
    if (q !== undefined) i.q = q;
    if (detail !== undefined) i.detail = detail;
    out.push(i);
  };
  if (!isObj(block)) {
    err('wrongType');
    return out;
  }
  const type = str(block.type);
  const cid = block.concept_id;
  if (cid !== undefined && cid !== null && !ctx.conceptKeys.has(String(cid))) {
    err('lessonConceptUnknown', `${path}.concept_id`, String(cid));
  }

  if ((TEXT_BLOCK_TYPES as readonly string[]).includes(type)) {
    if (ctx.examSafe) err('notExamSafe', `${path}.type`, type);
    bilingual({ en: block.en, ur: block.ur }, path, 'textMissing', out, q);
    return out;
  }
  // Older drafts used `visual` + `media`: read as a figure (DATABASE_DESIGN §4).
  const vtype = type === 'visual' ? 'figure' : type;
  if (!(visualBlockTypes as readonly string[]).includes(vtype)) {
    err('blockTypeUnknown', `${path}.type`, type || '—');
    return out;
  }
  if (ctx.examSafe && vtype !== 'figure' && vtype !== 'chart') {
    err('notExamSafe', `${path}.type`, vtype);
    return out;
  }
  bilingual(block.alt, `${path}.alt`, 'altMissing', out, q);

  switch (vtype) {
    case 'figure': {
      const svg = block.svg ?? block.media;
      const hasImage = typeof block.image === 'string' && block.image.trim() !== '';
      if (svg !== undefined && hasImage) err('imageOrSvg');
      else if (!hasImage) svgIssues(svg, `${path}.svg`, out, q);
      const hs = Array.isArray(block.hotspots) ? block.hotspots : [];
      hs.forEach((h, i) => {
        const hp = `${path}.hotspots[${i}]`;
        if (!isObj(h) || !inUnit(h.x) || !inUnit(h.y)) err('hotspotRange', hp);
        else bilingual(h.label, `${hp}.label`, 'textMissing', out, q);
      });
      break;
    }
    case 'scene': {
      const ids = svgIssues(block.svg, `${path}.svg`, out, q);
      const layers = Array.isArray(block.layers) ? block.layers.map(String) : [];
      if (layers.length > visualBudget.maxMovingLayers)
        err('sceneTooManyLayers', `${path}.layers`, String(layers.length));
      if (ids) {
        for (const l of layers) if (!ids.has(l)) err('sceneLayerMissing', `${path}.layers`, l);
      }
      const steps = Array.isArray(block.steps) ? block.steps : [];
      if (steps.length < 1 || steps.length > visualBudget.maxSceneSteps)
        err('sceneSteps', `${path}.steps`, String(steps.length));
      steps.forEach((s, i) => {
        const sp = `${path}.steps[${i}]`;
        if (!isObj(s)) return err('wrongType', sp);
        bilingual(s.caption, `${sp}.caption`, 'captionMissing', out, q);
        if (
          s.ms !== undefined &&
          (typeof s.ms !== 'number' || s.ms < 0 || s.ms > visualBudget.stepMaxMs)
        )
          err('stepTooLong', `${sp}.ms`, String(s.ms));
        if (isObj(s.set)) {
          for (const [layer, props] of Object.entries(s.set)) {
            if (!layers.includes(layer)) err('sceneLayerUnknown', `${sp}.set`, layer);
            if (!isObj(props)) err('wrongType', `${sp}.set.${layer}`);
            else
              for (const [k, v] of Object.entries(props))
                if (!SCENE_PROPS.has(k) || typeof v !== 'number' || !Number.isFinite(v))
                  err('badValue', `${sp}.set.${layer}.${k}`);
          }
        }
      });
      break;
    }
    case 'chart': {
      const kind = str(block.kind);
      if (!(CHART_KINDS as readonly string[]).includes(kind))
        err('chartKind', `${path}.kind`, kind || '—');
      const x = isObj(block.x) ? block.x : {};
      const xs = Array.isArray(x.values) ? x.values : null;
      const series = Array.isArray(block.series) ? block.series : [];
      if (series.length === 0) err('required', `${path}.series`);
      series.forEach((s, i) => {
        const sp = `${path}.series[${i}]`;
        if (!isObj(s) || !Array.isArray(s.values)) return err('required', `${sp}.values`);
        if (!s.values.every((v) => typeof v === 'number' && Number.isFinite(v)))
          err('badValue', `${sp}.values`);
        if (xs && kind !== 'pie' && s.values.length !== xs.length)
          err('chartSeriesLength', `${sp}.values`, `${s.values.length}/${xs.length}`);
      });
      break;
    }
    case 'widget': {
      const w = str(block.widget);
      if (!(widgetCatalogue as readonly string[]).includes(w))
        err('widgetUnknown', `${path}.widget`, w || '—');
      const params = isObj(block.params) ? block.params : {};
      const sliders = isObj(params.sliders) ? Object.keys(params.sliders) : [];
      if (params.expr !== undefined || w === 'function_graph') {
        const r = parseExpr(typeof params.expr === 'string' ? params.expr : '', [...sliders, 'x']);
        if (!r.ok) err('exprInvalid', `${path}.params.expr`, r.detail ?? r.error);
      }
      if (block.task !== undefined) bilingual(block.task, `${path}.task`, 'textMissing', out, q);
      break;
    }
    case 'compare': {
      for (const side of ['left', 'right'] as const) {
        const s = block[side];
        const sp = `${path}.${side}`;
        if (!isObj(s)) {
          err('required', sp);
          continue;
        }
        bilingual(s.title, `${sp}.title`, 'textMissing', out, q);
        if (s.svg !== undefined) svgIssues(s.svg, `${sp}.svg`, out, q);
      }
      break;
    }
    case 'video': {
      if (!/^[\w-]{11}$/.test(str(block.youtube_id))) err('youtubeId', `${path}.youtube_id`);
      if (!isObj(block.transcript)) warn('transcriptMissing', `${path}.transcript`);
      break;
    }
    case 'lottie':
      err('lottieUnsupported', `${path}.type`);
      break;
  }
  return out;
}

function inUnit(v: unknown): boolean {
  return typeof v === 'number' && v >= 0 && v <= 1;
}
