import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

import {
  addBankMatches,
  buildImportPlan,
  extractMath,
  findInFileMatches,
  mathUnbalanced,
  normaliseText,
  parseImportText,
  planChunks,
  questionMatchKey,
  renderMath,
  reportSummary,
  similarity,
  trigrams,
  validateImportFile,
  type Issue,
  type MathRender,
} from '../src';

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`./fixtures/importer/${name}`, import.meta.url), 'utf8'));
const codes = (issues: Issue[], q?: number) =>
  issues.filter((i) => q === undefined || i.q === q).map((i) => i.code);
const errors = (issues: Issue[]) => issues.filter((i) => i.severity === 'error');

let n = 0;
const newId = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;

/** A renderer that accepts balanced braces only (enough for the rules here). */
const fakeRender: MathRender = (tex) => {
  let depth = 0;
  for (const c of tex) {
    if (c === '{') depth++;
    if (c === '}') depth--;
    if (depth < 0) break;
  }
  return depth === 0
    ? { ok: true, svg: `<svg data-x="1" role="img"> <path d="M0 0"/> </svg>` }
    : { ok: false, error: 'braces' };
};

describe('good file', () => {
  it('passes with no errors and imports every question as a draft-ready row', () => {
    const v = validateImportFile(fixture('good-topic.json'));
    expect(errors(v.report.issues)).toEqual([]);
    expect(v.report.fileOk).toBe(true);
    expect(v.report.counts).toMatchObject({
      questions: 6,
      ready: 6,
      errors: 0,
      duplicates: 0,
      concepts: 3,
      lessonBlocks: 6,
    });
    expect(v.report.lessons).toEqual([
      { kind: 'lesson', concept: null, blocks: 5, ok: true },
      { kind: 'alternative', concept: 'c2', blocks: 1, ok: true },
    ]);
    expect(v.file?.testData).toBe(true);
    const mcq = v.file!.questions[0]!;
    expect(mcq.body.stem).toEqual({ en: 'Solve $2x + 3 = 7$.', ur: '$2x + 3 = 7$ حل کریں۔' });
    expect(mcq.answer).toEqual({ correct: 'A' });
    expect(mcq.languageComplete).toBe(true);
    expect(v.file!.questions[4]!.answer).toEqual({
      correct: 'divide by 3',
      also: ['divide both sides by 3'],
    });
  });

  it('renders each distinct expression once, compacted', () => {
    const v = validateImportFile(fixture('good-topic.json'));
    const calls: string[] = [];
    const m = renderMath(v, (tex, d) => {
      calls.push(tex);
      return fakeRender(tex, d);
    });
    expect(new Set(calls).size).toBe(calls.length);
    expect(m.svgs.get('2x + 3 = 7')).toBe('<svg><path d="M0 0"/></svg>');
    expect(v.report.counts.mathExpressions).toBe(m.svgs.size);
    expect(v.report.counts.ready).toBe(6);
  });

  it('plans N drafts with client ids, concept ids and chunks', () => {
    const v = validateImportFile(fixture('good-topic.json'));
    const m = renderMath(v, fakeRender);
    const plan = buildImportPlan({
      file: v.file!,
      report: v.report,
      chapterId: 'ch-1',
      origin: 'ai',
      sourceNote: '  C1 run 1 ',
      fileName: 'good-topic.json',
      skipSimilar: false,
      existing: { topics: [], concepts: [], lessons: [] },
      math: m.svgs,
      newId,
    });
    expect(plan.topic?.title_en).toBe('Solving linear equations');
    expect(plan.concepts).toHaveLength(3);
    expect(plan.questions).toHaveLength(6);
    expect(plan.batch).toMatchObject({
      origin: 'ai',
      source_note: 'C1 run 1',
      chapter_id: 'ch-1',
      is_test_data: true,
    });
    const c2 = plan.concepts[1]!.id;
    expect(plan.prereqs).toContainEqual({
      concept_id: c2,
      requires_concept_id: plan.concepts[0]!.id,
    });
    expect(plan.questions[2]!.concept_id).toBe(c2);
    // lesson concept keys become concept ids
    const scene = plan.lessons[0]!.blocks[1] as { concept_id: string };
    expect(scene.concept_id).toBe(plan.concepts[0]!.id);
    expect(plan.lessons[1]).toMatchObject({ kind: 'alternative', concept_id: c2 });
    const chunks = planChunks({ ...plan, questions: Array(450).fill(plan.questions[0]) }, 200);
    expect(chunks.map((c) => [c.questions.length, c.final, c.concepts.length])).toEqual([
      [200, false, 3],
      [200, false, 0],
      [50, true, 0],
    ]);
    expect(chunks.every((c) => c.batch.id === plan.batch.id)).toBe(true);
    expect(reportSummary(v.report, 6).counts.imported).toBe(6);
  });

  it('reuses an existing topic, its concepts and lesson by title', () => {
    const v = validateImportFile(fixture('good-topic.json'));
    const plan = buildImportPlan({
      file: v.file!,
      report: v.report,
      chapterId: 'ch-1',
      origin: 'human',
      skipSimilar: false,
      existing: {
        topics: [
          { id: 't-old', title_en: 'solving  LINEAR equations', status: 'active', sort_order: 3 },
        ],
        concepts: [
          {
            id: 'c-old',
            topic_id: 't-old',
            title_en: 'Balancing both sides!',
            status: 'active',
            sort_order: 0,
          },
        ],
        lessons: [{ topic_id: 't-old', kind: 'lesson', concept_id: null, status: 'draft' }],
      },
      newId,
    });
    expect(plan.topic).toBeNull();
    expect(plan.batch.topic_id).toBe('t-old');
    expect(plan.concepts.map((c) => c.sort_order)).toEqual([1, 2]);
    expect(plan.questions[0]!.concept_id).toBe('c-old');
    expect(plan.lessons.map((l) => l.kind)).toEqual(['alternative']);
    expect(plan.reuse).toEqual({ topic: true, concepts: 1, lessonsSkipped: 1 });
  });
});

describe('bad question fixtures', () => {
  const v = validateImportFile(fixture('bad-questions.json'));
  const rows = v.report.rows;
  it('keeps the file importable and leaves only the failing questions out', () => {
    expect(v.report.fileOk).toBe(true);
    expect(rows.map((r) => r.status)).toEqual([
      'error',
      'error',
      'error',
      'error',
      'error',
      'error',
      'error',
      'error',
      'error',
      'error',
      'ok',
      'error',
      'ok',
    ]);
  });
  it.each([
    [0, 'correctMissing'],
    [1, 'correctNotSingle'],
    [2, 'cognitiveMissing'],
    [3, 'conceptUnknown'],
    [4, 'difficultyRange'],
    [5, 'optionKeyDuplicate'],
    [6, 'optionsCount'],
    [7, 'typeUnsupported'],
    [8, 'answerInvalid'],
    [9, 'stemMissing'],
    [11, 'svgUnsafe'],
  ])('question %i reports %s', (q, code) => {
    expect(codes(errors(v.report.issues), q)).toContain(code);
  });
  it('flags (not fails) a missing translation and explanation', () => {
    expect(codes(v.report.issues, 12)).toEqual(expect.arrayContaining(['urMissing']));
    expect(codes(errors(v.report.issues), 12)).toEqual([]);
    expect(v.file!.questions.find((q) => q.index === 12)!.languageComplete).toBe(false);
    expect(codes(v.report.issues, 10)).toContain('explanationMissing');
  });
  it('a question whose maths will not render becomes an error row', () => {
    const v2 = validateImportFile(fixture('bad-questions.json'));
    renderMath(v2, fakeRender);
    expect(v2.report.rows[10]!.status).toBe('error');
    expect(codes(v2.report.issues, 10)).toContain('mathError');
    expect(v2.file!.questions.map((q) => q.index)).toEqual([12]);
    expect(v2.report.counts.ready).toBe(1);
  });
});

describe('bad lesson fixture', () => {
  const v = validateImportFile(fixture('bad-lesson.json'));
  const lessonCodes = codes(errors(v.report.issues).filter((i) => i.path.startsWith('lesson')));
  it.each([
    'altMissing',
    'sceneLayerMissing',
    'captionMissing',
    'stepTooLong',
    'sceneLayerUnknown',
    'widgetUnknown',
    'exprInvalid',
    'chartKind',
    'chartSeriesLength',
    'svgUnsafe',
    'lessonConceptUnknown',
    'blockTypeUnknown',
  ])('reports %s', (code) => expect(lessonCodes).toContain(code));
  it('keeps the lesson out but still imports the question', () => {
    expect(v.report.lessons).toEqual([{ kind: 'lesson', concept: null, blocks: 8, ok: false }]);
    expect(v.report.fileOk).toBe(true);
    expect(v.file!.lessons).toEqual([]);
    expect(v.report.rows[0]!.status).toBe('ok');
  });
});

describe('bad concepts fixture', () => {
  it('stops the whole file on a duplicate key or a prerequisite loop', () => {
    const v = validateImportFile(fixture('bad-concepts.json'));
    expect(v.report.fileOk).toBe(false);
    expect(v.file).toBeNull();
    expect(codes(errors(v.report.issues))).toEqual(
      expect.arrayContaining(['conceptKeyDuplicate', 'requiresLoop']),
    );
  });
  it('reports schema problems with a path', () => {
    const v = validateImportFile({ topic: { title_en: '' }, concepts: [], questions: 'x' });
    expect(v.file).toBeNull();
    const paths = errors(v.report.issues).map((i) => `${i.code}@${i.path}`);
    expect(paths).toEqual(
      expect.arrayContaining([
        'required@topic.title_en',
        'required@concepts',
        'wrongType@questions',
      ]),
    );
  });
  it('refuses non-JSON, oversized files and too many questions', () => {
    expect(parseImportText('{oops').ok).toBe(false);
    expect(parseImportText('﻿{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
    expect(codes(validateImportFile({}, { bytes: 11 * 1024 * 1024 }).report.issues)).toEqual([
      'tooLarge',
    ]);
    const many = {
      topic: { title_en: 'T' },
      concepts: [{ key: 'c', title_en: 'C' }],
      questions: Array(2001).fill({}),
    };
    expect(codes(validateImportFile(many).report.issues)).toEqual(['tooManyQuestions']);
  });
});

describe('duplicates', () => {
  it('normalises case, spacing, punctuation, Urdu marks and digits', () => {
    expect(normaliseText('  Solve: 2X + 3 = 7! ')).toBe('solve 2x 3 7');
    expect(normaliseText('۲ + ۳')).toBe('2 3');
    expect(normaliseText('کِتاب، کتاب')).toBe('کتاب کتاب');
  });
  it('options are part of the key, in any order', () => {
    const a = {
      stem: { en: 'Which is prime?' },
      options: [
        { key: 'A', text: '4' },
        { key: 'B', text: '7' },
      ],
    };
    const b = {
      stem: 'which is PRIME',
      options: [
        { key: 'A', text: { en: '7' } },
        { key: 'B', text: '4' },
      ],
    };
    const c = {
      stem: 'Which is prime?',
      options: [
        { key: 'A', text: '9' },
        { key: 'B', text: '11' },
      ],
    };
    expect(questionMatchKey(a)).toBe(questionMatchKey(b));
    expect(questionMatchKey(a)).not.toBe(questionMatchKey(c));
  });
  it('trigram similarity matches pg_trgm on a known pair', () => {
    // select similarity('word', 'two words') = 0.36363637 in Postgres 16
    expect(similarity(trigrams('word'), trigrams('two words'))).toBeCloseTo(0.3636, 3);
    expect(similarity(trigrams('abc'), trigrams('abc'))).toBe(1);
  });
  it('re-importing the same file flags every question as a duplicate', () => {
    const v = validateImportFile(fixture('good-topic.json'));
    const bank = v.file!.questions.map((q, i) => ({
      idx: i,
      question_id: `bank-${i}`,
      body: q.body,
    }));
    const again = validateImportFile(fixture('good-topic.json'));
    addBankMatches(again, bank);
    expect(again.report.rows.every((r) => r.status === 'duplicate')).toBe(true);
    expect(again.report.counts).toMatchObject({ ready: 0, duplicates: 6 });
    const plan = buildImportPlan({
      file: again.file!,
      report: again.report,
      chapterId: 'ch',
      origin: 'ai',
      skipSimilar: false,
      existing: { topics: [], concepts: [], lessons: [] },
      newId,
    });
    expect(plan.questions).toHaveLength(0);
  });
  it('a near copy is similar: imported unless left out', () => {
    const v = validateImportFile(fixture('good-topic.json'));
    const body = structuredClone(v.file!.questions[3]!.body);
    body.stem.en = body.stem.en.replace('Bilal has 3x', 'Bilal has 3x marbles');
    addBankMatches(v, [{ idx: 3, question_id: 'bank-x', body }]);
    expect(v.report.rows[3]!.status).toBe('similar');
    expect(v.report.rows[3]!.match).toMatchObject({ where: 'bank', ref: 'bank-x' });
    expect(codes(v.report.issues, 3)).toContain('similarInBank');
    const base = {
      file: v.file!,
      report: v.report,
      chapterId: 'c',
      origin: 'ai' as const,
      existing: { topics: [], concepts: [], lessons: [] },
      newId,
    };
    expect(buildImportPlan({ ...base, skipSimilar: false }).questions).toHaveLength(6);
    expect(buildImportPlan({ ...base, skipSimilar: true }).questions).toHaveLength(5);
  });
  it('finds repeats inside one file, fast enough for 2,000 questions', () => {
    const keys = Array.from(
      { length: 2000 },
      (_, i) => `question number ${i} about solving equations with ${i * 7} apples`,
    );
    keys.push(keys[10]!);
    const t0 = performance.now();
    const m = findInFileMatches(keys);
    expect(performance.now() - t0).toBeLessThan(3000);
    expect(m).toContainEqual({ of: 2000, match: 10, similarity: 1, exact: true });
  });
  it('flags a duplicate inside the file as an error row', () => {
    const f = fixture('good-topic.json') as { questions: unknown[] };
    f.questions.push(structuredClone(f.questions[0]));
    const v = validateImportFile(f);
    expect(v.report.rows[6]!.status).toBe('duplicate');
    expect(v.report.rows[6]!.match).toMatchObject({ where: 'file', ref: '0' });
  });
});

describe('maths', () => {
  it('extracts inline and display maths, ignoring \\$', () => {
    expect(extractMath('Cost \\$5, solve $x+1=2$ and $$\\frac{a}{b}$$.')).toEqual([
      { tex: 'x+1=2', display: false },
      { tex: '\\frac{a}{b}', display: true },
    ]);
    expect(mathUnbalanced('one $x here')).toBe(true);
    expect(mathUnbalanced('fine $x$ and \\$3')).toBe(false);
  });
  it('real MathJax renders to an SVG the checker accepts', async () => {
    const require = createRequire(import.meta.url);
    const { mathjax } = require('mathjax-full/js/mathjax.js');
    const { TeX } = require('mathjax-full/js/input/tex.js');
    const { SVG } = require('mathjax-full/js/output/svg.js');
    const { liteAdaptor } = require('mathjax-full/js/adaptors/liteAdaptor.js');
    const { RegisterHTMLHandler } = require('mathjax-full/js/handlers/html.js');
    const adaptor = liteAdaptor();
    RegisterHTMLHandler(adaptor);
    const doc = mathjax.document('', {
      InputJax: new TeX({ packages: ['base', 'ams'] }),
      OutputJax: new SVG({ fontCache: 'none' }),
    });
    const render: MathRender = (tex, display) => {
      const s: string = adaptor.innerHTML(doc.convert(tex, { display }));
      return /data-mjx-error|<merror/.test(s) ? { ok: false, error: 'tex' } : { ok: true, svg: s };
    };
    const v = validateImportFile(fixture('bad-questions.json'));
    const m = renderMath(v, render);
    expect(v.report.rows[10]!.status).toBe('error');
    const { checkSvg } = await import('../src');
    const good = validateImportFile(fixture('good-topic.json'));
    const gm = renderMath(good, render);
    expect(gm.svgs.size).toBeGreaterThan(5);
    for (const svg of gm.svgs.values()) expect(checkSvg(svg).problems).toEqual([]);
    expect(m.svgs.size).toBe(0);
  });
});
