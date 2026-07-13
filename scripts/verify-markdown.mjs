// Verification for the lightweight Markdown parser (src/markdown/parse.js).
//
// A file assessment can be a markdown worksheet; it must render FORMATTED, not as
// raw text (acceptance criterion). This pins the block/inline tokenisation with
// known inputs so the renderer always gets the shape it expects. No device, no
// network — pure functions in, expected values out.
//
// Run:  npm run verify:markdown      (or: node scripts/verify-markdown.mjs)

import { parseMarkdown, parseInline } from '../src/markdown/parse.js';

let passed = 0;
let failed = 0;

function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failed += 1;
    console.error(`  FAIL ${label}\n         expected ${e}\n         actual   ${a}`);
  }
}

// ── parseInline ────────────────────────────────────────────────────────────
console.log('parseInline');
check('plain text', parseInline('hello world'), [{ text: 'hello world' }]);
check('bold', parseInline('a **b** c'), [
  { text: 'a ' },
  { text: 'b', bold: true },
  { text: ' c' },
]);
check('italic star', parseInline('*x*'), [{ text: 'x', italic: true }]);
check('italic underscore', parseInline('_y_'), [{ text: 'y', italic: true }]);
check('inline code', parseInline('use `code` here'), [
  { text: 'use ' },
  { text: 'code', code: true },
  { text: ' here' },
]);
check('link', parseInline('see [docs](https://x.y)'), [
  { text: 'see ' },
  { text: 'docs', href: 'https://x.y' },
]);
// Bold beats italic at the same spot (** not mistaken for two singles).
check('bold not double-italic', parseInline('**bold**'), [{ text: 'bold', bold: true }]);
// Code beats bold (backticks win).
check('code around stars', parseInline('`**not bold**`'), [
  { text: '**not bold**', code: true },
]);

// ── parseMarkdown blocks ───────────────────────────────────────────────────
console.log('parseMarkdown');
check('heading levels', parseMarkdown('# Big\n### Small'), [
  { type: 'heading', level: 1, spans: [{ text: 'Big' }] },
  { type: 'heading', level: 3, spans: [{ text: 'Small' }] },
]);

check('paragraph joins wrapped lines', parseMarkdown('one\ntwo\n\nthree'), [
  { type: 'paragraph', spans: [{ text: 'one two' }] },
  { type: 'paragraph', spans: [{ text: 'three' }] },
]);

check('unordered list', parseMarkdown('- a\n- b'), [
  { type: 'list', ordered: false, items: [[{ text: 'a' }], [{ text: 'b' }]] },
]);

check('ordered list', parseMarkdown('1. first\n2. second'), [
  { type: 'list', ordered: true, items: [[{ text: 'first' }], [{ text: 'second' }]] },
]);

check('blockquote folds lines', parseMarkdown('> q1\n> q2'), [
  { type: 'quote', spans: [{ text: 'q1 q2' }] },
]);

check('fenced code verbatim', parseMarkdown('```\nx = 1\n**kept**\n```'), [
  { type: 'code', text: 'x = 1\n**kept**' },
]);

check('mixed doc', parseMarkdown('# Title\n\nDo **this**:\n\n- one\n- two'), [
  { type: 'heading', level: 1, spans: [{ text: 'Title' }] },
  { type: 'paragraph', spans: [{ text: 'Do ' }, { text: 'this', bold: true }, { text: ':' }] },
  { type: 'list', ordered: false, items: [[{ text: 'one' }], [{ text: 'two' }]] },
]);

check('empty input -> no blocks', parseMarkdown(''), []);
check('null input -> no blocks', parseMarkdown(null), []);

// ── summary ────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
