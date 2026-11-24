// Small Markdown parser for teacher-uploaded worksheets (file assessments,
// db/014): a .md string → flat block tokens the app renders with its own Text
// primitives. No markdown library (no CDN, small bundle). Covers the worksheet
// subset: headings, paragraphs, bold/italic, inline code + fences, links,
// blockquotes, bullet/numbered lists; anything else is plain text.
//
// Ported from the old app's src/markdown/parse.js (frozen); identical output,
// pinned by test/markdown.test.ts (every scripts/verify-markdown.mjs case).

export interface Span {
  text: string;
  bold?: true;
  italic?: true;
  code?: true;
  href?: string;
}

export type MdBlock =
  | { type: 'heading'; level: number; spans: Span[] }
  | { type: 'paragraph'; spans: Span[] }
  | { type: 'quote'; spans: Span[] }
  | { type: 'code'; text: string }
  | { type: 'list'; ordered: boolean; items: Span[][] };

// Earliest match wins; order only breaks ties (code/bold before italic).
const INLINE_PATTERNS = [
  { type: 'code', re: /`([^`]+)`/ },
  { type: 'bold', re: /\*\*([^*]+)\*\*/ },
  { type: 'link', re: /\[([^\]]+)\]\(([^)\s]+)\)/ },
  { type: 'italicStar', re: /\*([^*]+)\*/ },
  { type: 'italicUnderscore', re: /_([^_]+)_/ },
] as const;

/** One line of inline markdown → spans (always at least one). */
export function parseInline(text: string | null | undefined): Span[] {
  const spans: Span[] = [];
  let rest = String(text ?? '');
  while (rest.length) {
    let best: { type: string; m: RegExpExecArray } | null = null;
    for (const p of INLINE_PATTERNS) {
      const m = p.re.exec(rest);
      if (m && (best === null || m.index < best.m.index)) best = { type: p.type, m };
    }
    if (!best) {
      spans.push({ text: rest });
      break;
    }
    const { type, m } = best;
    if (m.index > 0) spans.push({ text: rest.slice(0, m.index) });
    if (type === 'code') spans.push({ text: m[1]!, code: true });
    else if (type === 'bold') spans.push({ text: m[1]!, bold: true });
    else if (type === 'link') spans.push({ text: m[1]!, href: m[2]! });
    else spans.push({ text: m[1]!, italic: true });
    rest = rest.slice(m.index + m[0].length);
  }
  return spans.length ? spans : [{ text: '' }];
}

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const QUOTE_RE = /^>\s?/;
const LIST_RE = /^\s*([-*]|\d+\.)\s+/;
const ORDERED_RE = /^\s*\d+\.\s+/;
const FENCE_RE = /^```/;

export function parseMarkdown(src: string | null | undefined): MdBlock[] {
  const lines = String(src ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n');
  const blocks: MdBlock[] = [];
  let i = 0;
  const at = (n: number) => lines[n]!;

  while (i < lines.length) {
    const line = at(i);

    if (FENCE_RE.test(line.trim())) {
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !FENCE_RE.test(at(i).trim())) {
        body.push(at(i));
        i += 1;
      }
      i += 1;
      blocks.push({ type: 'code', text: body.join('\n') });
      continue;
    }

    if (line.trim() === '') {
      i += 1;
      continue;
    }

    const h = HEADING_RE.exec(line);
    if (h) {
      blocks.push({ type: 'heading', level: h[1]!.length, spans: parseInline(h[2]!.trim()) });
      i += 1;
      continue;
    }

    if (QUOTE_RE.test(line)) {
      const q: string[] = [];
      while (i < lines.length && QUOTE_RE.test(at(i))) {
        q.push(at(i).replace(QUOTE_RE, ''));
        i += 1;
      }
      blocks.push({ type: 'quote', spans: parseInline(q.join(' ')) });
      continue;
    }

    if (LIST_RE.test(line)) {
      const ordered = ORDERED_RE.test(line);
      const items: Span[][] = [];
      while (i < lines.length && LIST_RE.test(at(i))) {
        items.push(parseInline(at(i).replace(LIST_RE, '')));
        i += 1;
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }

    const para: string[] = [];
    while (
      i < lines.length &&
      at(i).trim() !== '' &&
      !FENCE_RE.test(at(i).trim()) &&
      !HEADING_RE.test(at(i)) &&
      !QUOTE_RE.test(at(i)) &&
      !LIST_RE.test(at(i))
    ) {
      para.push(at(i));
      i += 1;
    }
    blocks.push({ type: 'paragraph', spans: parseInline(para.join(' ')) });
  }
  return blocks;
}

/** Only http(s) and mailto links are opened; anything else renders as text. */
export function isSafeHref(href: string | null | undefined): boolean {
  return typeof href === 'string' && /^(https?:\/\/|mailto:)/i.test(href.trim());
}
