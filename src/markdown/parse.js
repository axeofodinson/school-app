// Lightweight Markdown parser — turns a .md string into a flat list of block
// tokens the <Markdown> component renders with the app's own Text primitives. We
// deliberately DON'T pull a heavy markdown library (CLAUDE.md: no CDN-dependent
// libs; bundle/vendor small). This covers the common worksheet subset — headings,
// paragraphs, bold/italic, inline code + code fences, links, blockquotes, and
// bullet/numbered lists — and treats anything else as plain text rather than
// crashing.
//
// Pure and dependency-free, so it can be pinned by scripts/verify-markdown.mjs
// (`npm run verify:markdown`). ESM via the package.json alongside this file.
//
// Block token shapes:
//   { type: 'heading', level, spans }
//   { type: 'paragraph', spans }
//   { type: 'quote', spans }
//   { type: 'code', text }
//   { type: 'list', ordered, items: [spans, ...] }
// where `spans` is an array of { text, bold?, italic?, code?, href? }.

// Inline patterns, tried left-to-right; the earliest match in the string wins, so
// order only breaks ties at the same index (code/bold before italic so `**` and
// backticks aren't mistaken for single-emphasis). No nesting inside a span — the
// inner text is taken literally, which is plenty for worksheet prose.
const INLINE_PATTERNS = [
  { type: 'code', re: /`([^`]+)`/ },
  { type: 'bold', re: /\*\*([^*]+)\*\*/ },
  { type: 'link', re: /\[([^\]]+)\]\(([^)\s]+)\)/ },
  { type: 'italicStar', re: /\*([^*]+)\*/ },
  { type: 'italicUnderscore', re: /_([^_]+)_/ },
];

// Parse one line of inline markdown into styled spans. Always returns at least one
// span so a caller can map without a length guard.
export function parseInline(text) {
  const spans = [];
  let rest = String(text ?? '');
  while (rest.length) {
    let best = null;
    for (const p of INLINE_PATTERNS) {
      const m = p.re.exec(rest);
      if (m && (best === null || m.index < best.m.index)) best = { p, m };
    }
    if (!best) {
      spans.push({ text: rest });
      break;
    }
    const { p, m } = best;
    if (m.index > 0) spans.push({ text: rest.slice(0, m.index) });
    if (p.type === 'code') spans.push({ text: m[1], code: true });
    else if (p.type === 'bold') spans.push({ text: m[1], bold: true });
    else if (p.type === 'link') spans.push({ text: m[1], href: m[2] });
    else spans.push({ text: m[1], italic: true });
    rest = rest.slice(m.index + m[0].length);
  }
  return spans.length ? spans : [{ text: '' }];
}

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const QUOTE_RE = /^>\s?/;
const LIST_RE = /^\s*([-*]|\d+\.)\s+/;
const ORDERED_RE = /^\s*\d+\.\s+/;
const FENCE_RE = /^```/;

// Parse a full markdown document into block tokens.
export function parseMarkdown(src) {
  const lines = String(src ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block — everything until the closing fence, verbatim.
    if (FENCE_RE.test(line.trim())) {
      const body = [];
      i += 1;
      while (i < lines.length && !FENCE_RE.test(lines[i].trim())) {
        body.push(lines[i]);
        i += 1;
      }
      i += 1; // consume the closing fence (or run off the end)
      blocks.push({ type: 'code', text: body.join('\n') });
      continue;
    }

    if (line.trim() === '') {
      i += 1;
      continue;
    }

    const h = HEADING_RE.exec(line);
    if (h) {
      blocks.push({ type: 'heading', level: h[1].length, spans: parseInline(h[2].trim()) });
      i += 1;
      continue;
    }

    // Blockquote — fold consecutive '>' lines into one quote.
    if (QUOTE_RE.test(line)) {
      const q = [];
      while (i < lines.length && QUOTE_RE.test(lines[i])) {
        q.push(lines[i].replace(QUOTE_RE, ''));
        i += 1;
      }
      blocks.push({ type: 'quote', spans: parseInline(q.join(' ')) });
      continue;
    }

    // List — consecutive bullet or numbered items become one list block.
    if (LIST_RE.test(line)) {
      const ordered = ORDERED_RE.test(line);
      const items = [];
      while (i < lines.length && LIST_RE.test(lines[i])) {
        items.push(parseInline(lines[i].replace(LIST_RE, '')));
        i += 1;
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }

    // Paragraph — gather until a blank line or the start of another block.
    const para = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !FENCE_RE.test(lines[i].trim()) &&
      !HEADING_RE.test(lines[i]) &&
      !QUOTE_RE.test(lines[i]) &&
      !LIST_RE.test(lines[i])
    ) {
      para.push(lines[i]);
      i += 1;
    }
    blocks.push({ type: 'paragraph', spans: parseInline(para.join(' ')) });
  }

  return blocks;
}
