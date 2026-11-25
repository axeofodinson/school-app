// LaTeX → SVG in the browser, once per distinct expression, at import time
// (CLAUDE.md: no runtime KaTeX/MathJax WebViews in the app). MathJax's 2 MB
// browser bundle is NOT in the app bundle: it is copied into `public/vendor`
// by scripts/vendor-mathjax.mjs and loaded from our own origin on this screen
// only, the first time a file with maths is checked (the school network blocks
// some CDNs).
import type { MathRender } from '@school/core';

export const MATH_AVAILABLE = true;

const SRC = '/vendor/mathjax/tex-svg.js';

type MathJaxGlobal = {
  tex2svg?: (tex: string, opts?: { display?: boolean }) => { innerHTML: string } | null;
  startup?: { promise?: Promise<unknown> };
  tex?: unknown;
};

declare global {
  // The MathJax bundle reads its config off window.
  var MathJax: MathJaxGlobal | undefined;
}

let loading: Promise<MathRender | null> | null = null;

function injectOnce(): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SRC}"]`);
    if (existing) {
      if (globalThis.MathJax?.tex2svg) resolve();
      else existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('mathjax')), { once: true });
      return;
    }
    globalThis.MathJax = {
      ...(globalThis.MathJax ?? {}),
      // Fonts are drawn as paths, so nothing else is fetched.
      tex: { packages: { '[+]': ['ams'] } },
    } as MathJaxGlobal;
    const s = document.createElement('script');
    s.src = SRC;
    s.async = true;
    s.addEventListener('load', () => resolve(), { once: true });
    s.addEventListener('error', () => reject(new Error('mathjax')), { once: true });
    document.head.appendChild(s);
  });
}

/** Null when MathJax could not be loaded: the screen then says maths can't be checked. */
export async function loadMathRender(): Promise<MathRender | null> {
  loading ??= (async () => {
    try {
      await injectOnce();
      await globalThis.MathJax?.startup?.promise;
      const tex2svg = globalThis.MathJax?.tex2svg;
      if (!tex2svg) return null;
      return (tex, display) => {
        try {
          const node = tex2svg(tex, { display });
          const html = node?.innerHTML ?? '';
          if (!html || /data-mjx-error|<merror/.test(html)) return { ok: false, error: 'tex' };
          return { ok: true, svg: html };
        } catch {
          return { ok: false, error: 'render' };
        }
      };
    } catch {
      loading = null;
      return null;
    }
  })();
  return loading;
}
