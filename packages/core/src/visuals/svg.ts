// SVG safety + budget check for lesson visuals and imported figures (prompt 21;
// prompt 33's renderers reuse it). SVG is markup, so anything that can run code,
// load something from outside or hide a document inside is refused, and the
// file must fit `visualBudget` (DESIGN_SYSTEM §7b.5, §7b.7).
//
// This is a CHECK, not a rewrite: an unsafe SVG is reported and never stored, so
// what a reviewer sees is exactly what students get. It is an allowlist: only
// the drawing elements below are accepted, and attributes are screened for
// event handlers, outside links and CSS that loads things.
//
// Pure string scanning (no DOM): runs the same in Node tests, the browser and
// React Native.
import { visualBudget } from '../design/tokens';

export type SvgProblem =
  | 'notSvg'
  | 'doctype'
  | 'element'
  | 'eventAttr'
  | 'externalHref'
  | 'scriptUrl'
  | 'styleUrl'
  | 'tooBig'
  | 'tooManyElements';

export interface SvgCheck {
  ok: boolean;
  problems: { problem: SvgProblem; detail?: string }[];
  bytes: number;
  elements: number;
  /** Every id="…" in the file (scene layers must name one of these). */
  ids: Set<string>;
}

/** Drawing elements a lesson visual may use. Anything else is refused. */
export const SVG_ALLOWED_ELEMENTS: ReadonlySet<string> = new Set([
  'svg',
  'g',
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'text',
  'tspan',
  'title',
  'desc',
  'defs',
  'lineargradient',
  'radialgradient',
  'stop',
  'clippath',
  'mask',
  'marker',
  'pattern',
  'symbol',
  'use',
  'style',
]);

const HREF_ATTRS = new Set(['href', 'xlink:href', 'src']);

export function utf8Bytes(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      n += 4;
      i++;
    } else n += 3;
  }
  return n;
}

const decodeEntities = (s: string) =>
  s
    .replace(/&#x([0-9a-f]+);?/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);?/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&colon;/gi, ':')
    .replace(/&tab;|&newline;/gi, '');

/** CSS (a style attribute or <style> body) that loads or runs something. */
function cssProblem(css: string): SvgProblem | null {
  const c = decodeEntities(css).replace(/\\/g, '').toLowerCase();
  if (/@import/.test(c)) return 'styleUrl';
  if (/expression\s*\(|javascript:|behavior\s*:|-moz-binding/.test(c)) return 'scriptUrl';
  // url(#id) points inside the file (gradients, clip paths); anything else loads.
  const urls = c.match(/url\s*\(([^)]*)\)/g) ?? [];
  for (const u of urls) {
    const inner = u
      .replace(/^url\s*\(/, '')
      .replace(/\)$/, '')
      .trim()
      .replace(/^['"]|['"]$/g, '');
    if (!inner.startsWith('#')) return 'styleUrl';
  }
  return null;
}

const TAG_RE = /<\s*(\/?)\s*([a-zA-Z][\w:.-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
const ATTR_RE = /([^\s=/>]+)\s*(?:=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

export function checkSvg(svg: string): SvgCheck {
  const problems: SvgCheck['problems'] = [];
  const add = (problem: SvgProblem, detail?: string) => {
    if (!problems.some((p) => p.problem === problem && p.detail === detail))
      problems.push(detail === undefined ? { problem } : { problem, detail });
  };
  const ids = new Set<string>();
  const bytes = utf8Bytes(svg);
  let elements = 0;

  const src = svg.replace(/<!--[\s\S]*?-->/g, '').trim();
  if (/<!DOCTYPE|<!ENTITY|<!\[CDATA\[/i.test(src)) add('doctype');
  const body = src.replace(/^<\?xml[^>]*\?>\s*/i, '');
  if (!/^<svg[\s>/]/i.test(body)) add('notSvg');

  let inStyle = false;
  let styleStart = 0;
  for (const m of body.matchAll(TAG_RE)) {
    const closing = m[1] === '/';
    const name = (m[2] ?? '').toLowerCase();
    if (closing) {
      if (name === 'style' && inStyle) {
        const css = body.slice(styleStart, m.index);
        const p = cssProblem(css);
        if (p) add(p, 'style');
        inStyle = false;
      }
      continue;
    }
    elements++;
    if (!SVG_ALLOWED_ELEMENTS.has(name)) add('element', name);
    if (name === 'style') {
      inStyle = true;
      styleStart = (m.index ?? 0) + m[0].length;
    }
    const attrs = m[3] ?? '';
    for (const a of attrs.matchAll(ATTR_RE)) {
      const an = (a[1] ?? '').toLowerCase();
      const av = a[3] ?? a[4] ?? a[5] ?? '';
      if (!an) continue;
      if (an.startsWith('on')) add('eventAttr', an);
      if (an === 'id' && av) ids.add(av);
      const decoded = decodeEntities(av)
        .replace(/\s/g, '')
        // eslint-disable-next-line no-control-regex -- control characters hide `javascript:`
        .replace(/[\u0000-\u001f]/g, '')
        .toLowerCase();
      if (/^(javascript|vbscript|data):/.test(decoded) || decoded.includes('javascript:')) {
        add('scriptUrl', an);
      } else if (HREF_ATTRS.has(an) && av && !av.trim().startsWith('#')) {
        add('externalHref', an);
      }
      if (
        an === 'style' ||
        an === 'fill' ||
        an === 'stroke' ||
        an === 'filter' ||
        an === 'mask' ||
        an === 'clip-path'
      ) {
        const p = cssProblem(av);
        if (p) add(p, an);
      }
      // <animate attributeName="href"> / <set to="javascript:…"> are refused as
      // elements already; this catches the same trick on allowed ones.
      if (an === 'attributename' && /href/i.test(av)) add('externalHref', an);
    }
  }
  if (inStyle) {
    const p = cssProblem(body.slice(styleStart));
    if (p) add(p, 'style');
  }

  if (bytes > visualBudget.svgMaxKb * 1024) add('tooBig');
  if (elements > visualBudget.svgMaxElements) add('tooManyElements');
  return { ok: problems.length === 0, problems, bytes, elements, ids };
}
