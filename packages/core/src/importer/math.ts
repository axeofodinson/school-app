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
