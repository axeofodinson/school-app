// Every case from scripts/verify-markdown.mjs, plus parity with the old parser.
import { describe, expect, it } from 'vitest';

import { isSafeHref, parseInline, parseMarkdown } from '../src/markdown';
import { legacy } from './legacy';

describe('parseInline', () => {
  it('plain text', () => expect(parseInline('hello world')).toEqual([{ text: 'hello world' }]));
  it('bold', () =>
    expect(parseInline('a **b** c')).toEqual([
      { text: 'a ' },
      { text: 'b', bold: true },
      { text: ' c' },
    ]));
  it('italic star', () => expect(parseInline('*x*')).toEqual([{ text: 'x', italic: true }]));
  it('italic underscore', () => expect(parseInline('_y_')).toEqual([{ text: 'y', italic: true }]));
  it('inline code', () =>
    expect(parseInline('use `code` here')).toEqual([
      { text: 'use ' },
      { text: 'code', code: true },
      { text: ' here' },
    ]));
  it('link', () =>
    expect(parseInline('see [docs](https://x.y)')).toEqual([
      { text: 'see ' },
      { text: 'docs', href: 'https://x.y' },
    ]));
  it('bold not double-italic', () =>
    expect(parseInline('**bold**')).toEqual([{ text: 'bold', bold: true }]));
  it('code around stars', () =>
    expect(parseInline('`**not bold**`')).toEqual([{ text: '**not bold**', code: true }]));
});

describe('parseMarkdown', () => {
  it('heading levels', () =>
    expect(parseMarkdown('# Big\n### Small')).toEqual([
      { type: 'heading', level: 1, spans: [{ text: 'Big' }] },
      { type: 'heading', level: 3, spans: [{ text: 'Small' }] },
    ]));
  it('paragraph joins wrapped lines', () =>
    expect(parseMarkdown('one\ntwo\n\nthree')).toEqual([
      { type: 'paragraph', spans: [{ text: 'one two' }] },
      { type: 'paragraph', spans: [{ text: 'three' }] },
    ]));
  it('unordered list', () =>
    expect(parseMarkdown('- a\n- b')).toEqual([
      { type: 'list', ordered: false, items: [[{ text: 'a' }], [{ text: 'b' }]] },
    ]));
  it('ordered list', () =>
    expect(parseMarkdown('1. first\n2. second')).toEqual([
      { type: 'list', ordered: true, items: [[{ text: 'first' }], [{ text: 'second' }]] },
    ]));
  it('blockquote folds lines', () =>
    expect(parseMarkdown('> q1\n> q2')).toEqual([{ type: 'quote', spans: [{ text: 'q1 q2' }] }]));
  it('fenced code verbatim', () =>
    expect(parseMarkdown('```\nx = 1\n**kept**\n```')).toEqual([
      { type: 'code', text: 'x = 1\n**kept**' },
    ]));
  it('mixed doc', () =>
    expect(parseMarkdown('# Title\n\nDo **this**:\n\n- one\n- two')).toEqual([
      { type: 'heading', level: 1, spans: [{ text: 'Title' }] },
      { type: 'paragraph', spans: [{ text: 'Do ' }, { text: 'this', bold: true }, { text: ':' }] },
      { type: 'list', ordered: false, items: [[{ text: 'one' }], [{ text: 'two' }]] },
    ]));
  it('empty input -> no blocks', () => expect(parseMarkdown('')).toEqual([]));
  it('null input -> no blocks', () => expect(parseMarkdown(null)).toEqual([]));
});

describe('isSafeHref', () => {
  it.each([
    ['https://x.y', true],
    ['http://x.y', true],
    ['mailto:a@b.c', true],
    ['javascript:alert(1)', false],
    ['file:///etc/passwd', false],
    ['', false],
  ])('%s -> %s', (h, want) => expect(isSafeHref(h)).toBe(want));
});

describe('parity with src/markdown/parse.js', () => {
  it('identical blocks on a worksheet in English + Urdu', async () => {
    const old = await legacy('src/markdown/parse.js');
    const docs = [
      '# Worksheet 3\n\nName: ____\n\n1. Add **7 + 5**\n2. Solve `x + 2 = 5`\n\n> Show _all_ working\n\n```\n12\n+ 9\n```',
      '## سوالات\n\n- پہلا **سوال**\n- دوسرا [لنک](https://example.com)\n\nآخری بات',
      'a\r\nb\r\n\r\n* c\n* d\n```\nunclosed',
      '',
    ];
    for (const d of docs) expect(parseMarkdown(d)).toEqual(old.parseMarkdown!(d));
  });
});
