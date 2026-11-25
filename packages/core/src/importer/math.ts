// LaTeX in imported text (`$…$` inline, `$$…$$` display) is pre-rendered to
// SVG at import (CLAUDE.md: no runtime KaTeX WebViews). Each distinct
// expression is rendered once and stored once, bank-wide, in `math_svgs`
// keyed by its TeX (db/031, DECISIONS #103): the same `$x$` in 3,000
// questions costs one row, not 3,000 copies inside question bodies.
//
// The renderer is injected (MathJax on the web importer, MathJax in Node
// tests), so this file stays pure.

/** Positions of unescaped `$` (`\$` is a literal dollar sign). No regex lookbehind: Hermes. */
function dollars(text: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\\') i++;
    else if (text[i] === '$') out.push(i);
  }
  return out;
}

export const MAX_TEX_LENGTH = 500;

export interface MathSegment {
  tex: string;
  display: boolean;
}

/** Every TeX expression in a piece of text, in order. */
export function extractMath(text: string): MathSegment[] {
  const out: MathSegment[] = [];
  const d = dollars(text);
  let k = 0;
  while (k < d.length) {
    const at = d[k]!;
    const display = d[k + 1] === at + 1;
    const open = display ? k + 2 : k + 1;
    // The closing delimiter: `$$` for display, the next `$` for inline.
    let close = -1;
    for (let j = open; j < d.length; j++) {
      if (!display || d[j + 1] === d[j]! + 1) {
        close = j;
        break;
      }
    }
    if (close < 0) break;
    const start = at + (display ? 2 : 1);
    const tex = text.slice(start, d[close]).trim();
    if (tex && (display || !tex.includes('\n'))) out.push({ tex, display });
    k = close + (display ? 2 : 1);
  }
  return out;
}

export type MathPart =
  { kind: 'text'; text: string } | { kind: 'math'; tex: string; display: boolean; key: string };

/**
 * Text cut into plain runs and maths, in order, for showing a stored question
 * (review queue): each maths part is drawn from its `math_svgs` row by `key`,
 * or shown as its TeX when there is none. `\$` in plain runs becomes `$`.
 */
export function splitMath(text: string): MathPart[] {
  const out: MathPart[] = [];
  const push = (t: string) => {
    const clean = t.replace(/\\\$/g, '$');
    if (!clean) return;
    const last = out[out.length - 1];
    if (last?.kind === 'text') last.text += clean;
    else out.push({ kind: 'text', text: clean });
  };
  const d = dollars(text);
  let k = 0;
  let from = 0;
  while (k < d.length) {
    const at = d[k]!;
    const display = d[k + 1] === at + 1;
    const open = display ? k + 2 : k + 1;
    let close = -1;
    for (let j = open; j < d.length; j++) {
      if (!display || d[j + 1] === d[j]! + 1) {
        close = j;
        break;
      }
    }
    if (close < 0) break;
    const tex = text.slice(at + (display ? 2 : 1), d[close]).trim();
    const end = d[close]! + (display ? 2 : 1);
    if (tex && (display || !tex.includes('\n'))) {
      push(text.slice(from, at));
      out.push({ kind: 'math', tex, display, key: mathKey({ tex, display }) });
      from = end;
    }
    k = close + (display ? 2 : 1);
  }
  push(text.slice(from));
  return out;
}

/** A MathJax SVG's size in ex (its width/height attributes), for laying it out in text. */
export function mathSvgSizeEx(svg: string): { width: number; height: number; valign: number } {
  const num = (re: RegExp) => {
    const m = re.exec(svg);
    return m ? Number(m[1]) : NaN;
  };
  const w = num(/\swidth="(-?[\d.]+)ex"/);
  const h = num(/\sheight="(-?[\d.]+)ex"/);
  const v = num(/vertical-align:\s*(-?[\d.]+)ex/);
  return {
    width: Number.isFinite(w) && w > 0 ? w : 4,
    height: Number.isFinite(h) && h > 0 ? h : 2,
    valign: Number.isFinite(v) ? v : 0,
  };
}

/** An odd number of unescaped `$` usually means a missing closing `$`. */
export function mathUnbalanced(text: string): boolean {
  return dollars(text).length % 2 === 1;
}

/** The key a stored rendering is found by: the TeX with spacing tidied. */
export function mathKey(seg: MathSegment): string {
  return `${seg.display ? 'D:' : ''}${seg.tex.replace(/\s+/g, ' ')}`;
}

export type MathRender = (
  tex: string,
  display: boolean,
) => { ok: true; svg: string } | { ok: false; error: string };

/**
 * Make a stored SVG smaller without changing how it draws: MathJax's data-*
 * bookkeeping, ARIA hints (the text alternative is the TeX itself) and
 * redundant whitespace go.
 */
export function compactMathSvg(svg: string): string {
  return svg
    .replace(/\s(data-[\w-]+|role|focusable|aria-hidden)="[^"]*"/g, '')
    .replace(/>\s+</g, '><')
    .trim();
}
