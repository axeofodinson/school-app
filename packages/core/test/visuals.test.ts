import { describe, expect, it } from 'vitest';

import { checkBlock, checkSvg, evalExpr, parseExpr } from '../src';

const ok =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><defs><linearGradient id="g"/></defs><g id="car"><rect fill="url(#g)" width="4" height="4"/></g><use href="#car"/><text id="t">Hi</text></svg>';

describe('checkSvg', () => {
  it('accepts a plain drawing and collects ids', () => {
    const c = checkSvg(ok);
    expect(c.problems).toEqual([]);
    expect([...c.ids]).toEqual(['g', 'car', 't']);
    expect(c.elements).toBe(7);
  });
  it.each([
    ['<svg><script>alert(1)</script></svg>', 'element'],
    ['<svg><foreignObject><div/></foreignObject></svg>', 'element'],
    ['<svg><image href="x.png"/></svg>', 'element'],
    ['<svg onload="x()"/>', 'eventAttr'],
    ['<svg><rect ONCLICK="x()"/></svg>', 'eventAttr'],
    ['<svg><use href="https://evil.example/a.svg#x"/></svg>', 'externalHref'],
    ['<svg><use xlink:href="other.svg#x"/></svg>', 'externalHref'],
    ['<svg><a href="javascript:alert(1)"/></svg>', 'scriptUrl'],
    ['<svg><use href="jav&#x61;script:alert(1)"/></svg>', 'scriptUrl'],
    ['<svg><use href="java\tscript:alert(1)"/></svg>', 'scriptUrl'],
    ['<svg><use href="data:image/svg+xml;base64,AAA"/></svg>', 'scriptUrl'],
    ['<svg><rect style="fill:url(https://x.example/a)"/></svg>', 'styleUrl'],
    ['<svg><style>@import url(x.css);</style></svg>', 'styleUrl'],
    ['<svg><style>rect{background:url(//x)}</style></svg>', 'styleUrl'],
    ['<!DOCTYPE svg [<!ENTITY x "y">]><svg/>', 'doctype'],
    ['<div>not svg</div>', 'notSvg'],
  ])('refuses %s', (svg, problem) => {
    expect(checkSvg(svg).problems.map((p) => p.problem)).toContain(problem);
  });
  it('enforces visualBudget (60 KB, 400 elements)', () => {
    const many = `<svg>${'<rect/>'.repeat(400)}</svg>`;
    expect(checkSvg(many).problems.map((p) => p.problem)).toEqual(['tooManyElements']);
    const big = `<svg><path d="${'M0 0 '.repeat(13000)}"/></svg>`;
    expect(checkSvg(big).problems.map((p) => p.problem)).toEqual(['tooBig']);
  });
  it('ignores comments and an XML declaration', () => {
    expect(checkSvg('<?xml version="1.0"?><!-- <script> --><svg/>').problems).toEqual([]);
  });
});

describe('parseExpr', () => {
  const vars = ['m', 'c', 'x'];
  it('parses and evaluates with implicit multiplication and powers', () => {
    const r = parseExpr('m*x + c', vars);
    expect(r.ok && evalExpr(r.expr, { m: 2, x: 3, c: 1 })).toBe(7);
    const r2 = parseExpr('2x^2 - 3(x + 1) + sqrt(16) + -x', ['x']);
    expect(r2.ok && evalExpr(r2.expr, { x: 2 })).toBe(8 - 9 + 4 - 2);
    const r3 = parseExpr('2^3^2', []);
    expect(r3.ok && evalExpr(r3.expr, {})).toBe(512);
    const r4 = parseExpr('max(1, pi)', []);
    expect(r4.ok && evalExpr(r4.expr, {})).toBeCloseTo(Math.PI);
  });
  it.each([
    ['', 'empty'],
    ['alert(1)', 'unknownName'],
    ['constructor', 'unknownName'],
    ['x +', 'unexpected'],
    ['(x', 'unexpected'],
    ['x; y', 'unexpected'],
    ['max(1)', 'arity'],
    ['x'.repeat(201), 'tooLong'],
    ['('.repeat(60) + 'x' + ')'.repeat(60), 'tooLong'],
  ])('refuses %j (%s)', (src, error) => {
    const r = parseExpr(src, ['x']);
    expect(r.ok ? null : r.error).toBe(error);
  });
});

describe('checkBlock', () => {
  const ctx = { conceptKeys: new Set(['c1']) };
  it('accepts a text block and flags a missing translation', () => {
    const issues = checkBlock({ type: 'simple', concept_id: 'c1', en: 'Hi' }, 'b', ctx);
    expect(issues.map((i) => `${i.severity}:${i.code}`)).toEqual(['warning:urMissing']);
  });
  it('exam items take only static figures and charts', () => {
    const scene = {
      type: 'scene',
      alt: { en: 'a', ur: 'ب' },
      svg: ok,
      layers: ['car'],
      steps: [{ caption: { en: 'x', ur: 'ی' } }],
    };
    expect(checkBlock(scene, 'b', ctx).filter((i) => i.severity === 'error')).toEqual([]);
    expect(checkBlock(scene, 'b', { ...ctx, examSafe: true }).map((i) => i.code)).toEqual([
      'notExamSafe',
    ]);
  });
  it('video needs an 11-character YouTube id', () => {
    const v = { type: 'video', alt: { en: 'a', ur: 'ب' }, youtube_id: 'abc' };
    expect(checkBlock(v, 'b', ctx).map((i) => i.code)).toEqual(['youtubeId', 'transcriptMissing']);
  });
});
