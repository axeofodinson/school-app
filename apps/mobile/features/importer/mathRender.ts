// Pre-rendering LaTeX needs MathJax, which only the web console loads
// (features/importer/mathRender.web.ts). On a phone or tablet the importer
// screen says to use a computer, so this stub is never used for a real import.
import type { MathRender } from '@school/core';

export const MATH_AVAILABLE = false;

export async function loadMathRender(): Promise<MathRender | null> {
  return null;
}
