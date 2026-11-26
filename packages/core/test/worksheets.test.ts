// Worksheets (prompt 70, TEST_PLAN F-6): A/B sets differ in order, keys match.
import { describe, expect, it } from 'vitest';

import {
  lessonMathKeys,
  makeSet,
  pickWorksheet,
  worksheetHtml,
  worksheetKind,
  type WorksheetLabels,
  type WorksheetPoolItem,
} from '../src';

const mcq = (n: number, topic: string): WorksheetPoolItem => ({
  questionId: `m${String(n).padStart(2, '0')}`,
  version: 1,
  topicId: topic,
  type: 'mcq',
  body: {
    stem: { en: `What is ${n} + ${n}?`, ur: `${n} جمع ${n} کتنے ہیں؟` },
    options: ['A', 'B', 'C', 'D'].map((k, j) => ({ key: k, text: String(n * 2 + j) })),
  },
  answer: { correct: 'A' },
});
const tf = (n: number, topic: string): WorksheetPoolItem => ({
  questionId: `t${n}`,
  version: 2,
  topicId: topic,
  type: 'true_false',
  body: { stem: `Statement ${n}` },
  answer: { correct: n % 2 === 0 },
});
const short = (n: number, topic: string, blank = false): WorksheetPoolItem => ({
  questionId: `s${n}`,
  version: 1,
  topicId: topic,
  type: 'short_text',
  body: { stem: blank ? `The capital is ____ (${n})` : `Name a city (${n})` },
  answer: { correct: 'Lahore', also: ['lahore city'] },
});

const POOL: WorksheetPoolItem[] = [
  ...Array.from({ length: 8 }, (_, i) => mcq(i + 1, i < 4 ? 'tA' : 'tB')),
  ...Array.from({ length: 4 }, (_, i) => tf(i + 1, i < 2 ? 'tA' : 'tB')),
  short(1, 'tA', true),
  short(2, 'tB', true),
  short(3, 'tA'),
  { ...mcq(99, 'tC'), questionId: 'other-topic' },
  { questionId: 'img', version: 1, topicId: 'tA', type: 'tap_image', body: {}, answer: {} },
];
const ALL = ['mcq', 'true_false', 'fill_blank', 'short_answer'] as const;

describe('worksheet kinds', () => {
  it('maps question types to what prints', () => {
    expect(worksheetKind('mcq', {})).toBe('mcq');
    expect(worksheetKind('true_false', {})).toBe('true_false');
    expect(worksheetKind('short_text', { stem: 'Fill ___ here' })).toBe('fill_blank');
    expect(worksheetKind('short_text', { stem: { en: 'x', ur: 'خالی جگہ ……' } })).toBe(
      'fill_blank',
    );
    expect(worksheetKind('numeric', { stem: 'How many?' })).toBe('short_answer');
    expect(worksheetKind('tap_image', {})).toBeNull();
    expect(worksheetKind('match', {})).toBeNull();
  });
});

describe('pickWorksheet', () => {
  it('takes topics in turn, keeps only chosen topics and kinds, and is seeded', () => {
    const spec = { topicIds: ['tA', 'tB'], kinds: ALL, count: 10 };
    const p = pickWorksheet(POOL, spec, 42);
    expect(p.items).toHaveLength(10);
    expect(p.available).toBe(15);
    expect(p.short).toBe(0);
    const byTopic = p.items.reduce<Record<string, number>>(
      (m, i) => ({ ...m, [i.topicId]: (m[i.topicId] ?? 0) + 1 }),
      {},
    );
    expect(byTopic).toEqual({ tA: 5, tB: 5 });
    expect(p.items.some((i) => i.questionId === 'other-topic' || i.questionId === 'img')).toBe(
      false,
    );
    expect(pickWorksheet(POOL, spec, 42).items).toEqual(p.items);
    expect(pickWorksheet(POOL, spec, 43).items.map((i) => i.questionId)).not.toEqual(
      p.items.map((i) => i.questionId),
    );
    // Sections in a fixed order.
    const order = p.items.map((i) => ALL.indexOf(i.kind));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('says how many are short instead of making a smaller sheet silently', () => {
    const p = pickWorksheet(POOL, { topicIds: ['tA'], kinds: ['true_false'], count: 5 }, 1);
    expect(p.items).toHaveLength(2);
    expect(p.short).toBe(3);
  });
});

describe('sets A and B (F-6)', () => {
  const items = pickWorksheet(POOL, { topicIds: ['tA', 'tB'], kinds: ALL, count: 14 }, 7).items;
  const A = makeSet(items, 7, 'A');
  const B = makeSet(items, 7, 'B');

  it('have the same questions in a different order', () => {
    expect(A.questions.map((q) => q.questionId).sort()).toEqual(
      B.questions.map((q) => q.questionId).sort(),
    );
    expect(A.questions.map((q) => q.questionId)).not.toEqual(B.questions.map((q) => q.questionId));
    expect(A.questions.map((q) => q.n)).toEqual(A.questions.map((_, i) => i + 1));
  });

  it('keys match: each set’s letter points at the correct option text', () => {
    for (const s of [A, B]) {
      for (const q of s.questions) {
        const src = items.find((i) => i.questionId === q.questionId)!;
        if (q.kind === 'mcq') {
          const right = (src.body as { options: { key: string; text: string }[] }).options.find(
            (o) => o.key === 'A',
          )!.text;
          const chosen = q.options.find((o) => o.letter === q.key)!;
          expect(chosen.text).toBe(right);
          expect(q.options.map((o) => o.letter)).toEqual(['A', 'B', 'C', 'D']);
        } else {
          expect(q.key).toEqual((src.answer as { correct: unknown }).correct);
        }
      }
    }
    // The options move between sets, so the letters differ somewhere.
    const letters = (s: typeof A) =>
      s.questions
        .filter((q) => q.kind === 'mcq')
        .sort((a, b) => (a.questionId < b.questionId ? -1 : 1))
        .map((q) => q.key);
    expect(letters(A)).not.toEqual(letters(B));
  });

  it('is the same every time for the same code', () => {
    expect(makeSet(items, 7, 'B')).toEqual(B);
  });

  it('B never repeats A’s order when anything can move', () => {
    const two = items.filter((i) => i.kind === 'true_false').slice(0, 2);
    for (let seed = 0; seed < 50; seed++) {
      const a = makeSet(two, seed, 'A').questions.map((q) => q.questionId);
      const b = makeSet(two, seed, 'B').questions.map((q) => q.questionId);
      expect(b).not.toEqual(a);
    }
  });
});

describe('worksheetHtml', () => {
  const labels: WorksheetLabels = {
    school: 'Al-Syed <High> School',
    title: 'Sets & maps',
    subtitle: 'Class 9-A · Mathematics',
    set: (s) => `Set ${s}`,
    name: 'Name',
    roll: 'Roll no.',
    date: 'Date',
    sections: {
      mcq: 'Choose the right answer',
      true_false: 'True or false',
      fill_blank: 'Fill in the blanks',
      short_answer: 'Short answers',
    },
    true: 'True',
    false: 'False',
    key: (s) => `Answer key · Set ${s}`,
    also: 'Also accept',
    code: 'WS-0007',
  };
  const items = pickWorksheet(POOL, { topicIds: ['tA', 'tB'], kinds: ALL, count: 14 }, 7).items;
  const sets = [makeSet(items, 7, 'A'), makeSet(items, 7, 'B')];

  it('makes an A4 document: two sets, then their keys, all text escaped', () => {
    const html = worksheetHtml({ sets, withKey: true, lang: 'en' }, labels);
    expect(html).toContain('size: A4');
    expect(html.match(/class="page"/g)).toHaveLength(2);
    expect(html.match(/class="page key"/g)).toHaveLength(2);
    expect(html).toContain('Al-Syed &lt;High&gt; School');
    expect(html).toContain('Answer key · Set B');
    expect(html).toContain('Also accept: lahore city');
    expect(html).not.toContain('<High>');
  });

  it('prints Urdu right to left, and maths as an image (never markup)', () => {
    const withMath: typeof items = [
      {
        ...items[0]!,
        body: { stem: 'Solve $x^2 = 4$ <script>' },
      },
    ];
    const html = worksheetHtml(
      {
        sets: [makeSet(withMath, 1, 'A')],
        withKey: false,
        lang: 'ur',
      },
      labels,
    );
    const key = lessonMathKeys('Solve $x^2 = 4$')[0]!;
    const drawn = worksheetHtml(
      {
        sets: [makeSet(withMath, 1, 'A')],
        withKey: false,
        lang: 'en',
        math: { [key]: '<svg id="s"/>' },
      },
      labels,
    );
    expect(drawn).toContain('<img class="m" alt="x^2 = 4" src="data:image/svg+xml;charset=utf-8,');
    expect(drawn).not.toContain('<svg');
    expect(html).toContain('dir="rtl"');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('<code dir="ltr">x^2 = 4</code>'); // no SVG for it: TeX shown
    const ur = worksheetHtml(
      { sets: [makeSet(items, 7, 'A')], withKey: false, lang: 'ur' },
      labels,
    );
    expect(ur).toContain('جمع');
  });
});
