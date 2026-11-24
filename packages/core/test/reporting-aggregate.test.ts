// Every case from scripts/verify-report-aggregate.mjs against the core port, then
// the old src/reporting/aggregate.js and the port side by side on the same
// fixtures (the verify fixtures plus 300 seeded random report cards).
import { describe, expect, it } from 'vitest';

import {
  assessmentPercent,
  buildReport,
  cognitiveBreakdown,
  weightedAggregate,
  type ReportAssessment,
} from '../src/reporting';
import { legacy, rng } from './legacy';

describe('assessmentPercent', () => {
  it('half marks -> 50', () => expect(assessmentPercent(10, 20)).toBe(50));
  it('full marks -> 100', () => expect(assessmentPercent(20, 20)).toBe(100));
  it('ungraded -> null', () => expect(assessmentPercent(null, 20)).toBeNull());
  it('zero-mark test -> null', () => expect(assessmentPercent(5, 0)).toBeNull());
  it('null total -> null', () => expect(assessmentPercent(5, null)).toBeNull());
});

describe('weightedAggregate', () => {
  it('weighted mean of two tests -> 73', () =>
    expect(
      weightedAggregate([
        { score: 8, totalMarks: 10, weightage: 30 },
        { score: 5, totalMarks: 10, weightage: 10 },
      ]),
    ).toEqual({
      percent: 73,
      weighted: true,
      gradedCount: 2,
      totalCount: 2,
      ungradedCount: 0,
      countedWeightage: 40,
    }));
  it('equal weights -> simple mean 65', () =>
    expect(
      weightedAggregate([
        { score: 8, totalMarks: 10, weightage: 20 },
        { score: 5, totalMarks: 10, weightage: 20 },
      ]).percent,
    ).toBe(65));
  it('ungraded test is ignored', () =>
    expect(
      weightedAggregate([
        { score: 8, totalMarks: 10, weightage: 30 },
        { score: null, totalMarks: 10, weightage: 50 },
      ]),
    ).toEqual({
      percent: 80,
      weighted: true,
      gradedCount: 1,
      totalCount: 2,
      ungradedCount: 1,
      countedWeightage: 30,
    }));
  it('zero-weight test excluded from percent but counted graded', () =>
    expect(
      weightedAggregate([
        { score: 9, totalMarks: 10, weightage: 10 },
        { score: 4, totalMarks: 10, weightage: 0 },
      ]),
    ).toEqual({
      percent: 90,
      weighted: true,
      gradedCount: 2,
      totalCount: 2,
      ungradedCount: 0,
      countedWeightage: 10,
    }));
  it('no weights -> unweighted mean, weighted:false', () =>
    expect(
      weightedAggregate([
        { score: 3, totalMarks: 4, weightage: 0 },
        { score: 1, totalMarks: 4, weightage: 0 },
      ]),
    ).toEqual({
      percent: 50,
      weighted: false,
      gradedCount: 2,
      totalCount: 2,
      ungradedCount: 0,
      countedWeightage: 0,
    }));
  it('all ungraded -> null percent', () =>
    expect(weightedAggregate([{ score: null, totalMarks: 10, weightage: 20 }])).toEqual({
      percent: null,
      weighted: false,
      gradedCount: 0,
      totalCount: 1,
      ungradedCount: 1,
      countedWeightage: 0,
    }));
  it('empty -> null percent', () =>
    expect(weightedAggregate([])).toEqual({
      percent: null,
      weighted: false,
      gradedCount: 0,
      totalCount: 0,
      ungradedCount: 0,
      countedWeightage: 0,
    }));
  it('numeric strings from PostgREST (numeric columns) work', () =>
    expect(weightedAggregate([{ score: '8.00', totalMarks: 10, weightage: '30.00' }]).percent).toBe(
      80,
    ));
});

describe('cognitiveBreakdown', () => {
  it('recall vs conceptual split by marks', () =>
    expect(
      cognitiveBreakdown([
        { cognitiveLevel: 'recall', marks: 4 },
        { cognitiveLevel: 'understand', marks: 3 },
        { cognitiveLevel: 'apply', marks: 2 },
        { cognitiveLevel: 'analyze', marks: 1 },
      ]),
    ).toEqual({
      totalMarks: 10,
      levels: [
        { level: 'recall', marks: 4, share: 40 },
        { level: 'understand', marks: 3, share: 30 },
        { level: 'apply', marks: 2, share: 20 },
        { level: 'analyze', marks: 1, share: 10 },
      ],
      recall: { marks: 4, share: 40 },
      conceptual: { marks: 6, share: 60 },
    }));
  it('shares are complementary under rounding', () => {
    const b = cognitiveBreakdown([
      { cognitiveLevel: 'recall', marks: 1 },
      { cognitiveLevel: 'apply', marks: 2 },
    ]);
    expect({ recall: b.recall.share, conceptual: b.conceptual.share }).toEqual({
      recall: 33,
      conceptual: 67,
    });
  });
  it('unknown level and non-positive marks ignored', () =>
    expect(
      cognitiveBreakdown([
        { cognitiveLevel: 'recall', marks: 5 },
        { cognitiveLevel: 'synthesize', marks: 99 },
        { cognitiveLevel: 'apply', marks: 0 },
      ]),
    ).toEqual({
      totalMarks: 5,
      levels: [
        { level: 'recall', marks: 5, share: 100 },
        { level: 'understand', marks: 0, share: 0 },
        { level: 'apply', marks: 0, share: 0 },
        { level: 'analyze', marks: 0, share: 0 },
      ],
      recall: { marks: 5, share: 100 },
      conceptual: { marks: 0, share: 0 },
    }));
  it('no questions -> null shares', () =>
    expect(cognitiveBreakdown([])).toEqual({
      totalMarks: 0,
      levels: [
        { level: 'recall', marks: 0, share: null },
        { level: 'understand', marks: 0, share: null },
        { level: 'apply', marks: 0, share: null },
        { level: 'analyze', marks: 0, share: null },
      ],
      recall: { marks: 0, share: null },
      conceptual: { marks: 0, share: null },
    }));
  it('prototype keys are not levels (old code would corrupt; port ignores)', () =>
    expect(cognitiveBreakdown([{ cognitiveLevel: 'toString', marks: 3 }]).totalMarks).toBe(0));
});

const FIXTURE: ReportAssessment[] = [
  {
    id: 'a1',
    title: 'Physics Ch.1 Test',
    type: 'test',
    subject: { id: 's-phy', name: 'Physics' },
    weightage: 30,
    totalMarks: 10,
    score: 8,
    questions: [
      { cognitiveLevel: 'recall', marks: 2 },
      { cognitiveLevel: 'apply', marks: 8 },
    ],
  },
  {
    id: 'a2',
    title: 'Physics Quiz',
    type: 'quiz',
    subject: { id: 's-phy', name: 'Physics' },
    weightage: 10,
    totalMarks: 10,
    score: 5,
    questions: [{ cognitiveLevel: 'recall', marks: 5 }],
  },
  {
    id: 'a3',
    title: 'Maths Exam',
    type: 'exam',
    subject: { id: 's-math', name: 'Maths' },
    weightage: 20,
    totalMarks: 20,
    score: null,
    questions: [
      { cognitiveLevel: 'understand', marks: 10 },
      { cognitiveLevel: 'analyze', marks: 10 },
    ],
  },
];

describe('buildReport', () => {
  const report = buildReport({ assessments: FIXTURE });
  it('overall percent -> 73', () => expect(report.overall.percent).toBe(73));
  it('overall counts', () =>
    expect(report.overall).toMatchObject({ gradedCount: 2, totalCount: 3, ungradedCount: 1 }));
  it('subjects sorted by name', () =>
    expect(
      report.subjects.map((s) => ({
        name: s.name,
        percent: s.percent,
        gradedCount: s.gradedCount,
      })),
    ).toEqual([
      { name: 'Maths', percent: null, gradedCount: 0 },
      { name: 'Physics', percent: 73, gradedCount: 2 },
    ]));
  it('cognitive totals', () =>
    expect({
      totalMarks: report.cognitive.totalMarks,
      recall: report.cognitive.recall,
      conceptual: report.cognitive.conceptual,
    }).toEqual({
      totalMarks: 35,
      recall: { marks: 7, share: 20 },
      conceptual: { marks: 28, share: 80 },
    }));
  it('missing subject folds into one null bucket', () => {
    const r = buildReport({
      assessments: [{ id: 'x', subject: null, weightage: 0, totalMarks: 4, score: 2 }],
    });
    expect(r.subjects).toEqual([expect.objectContaining({ id: null, name: null, percent: 50 })]);
  });
  it('no input -> empty report', () => expect(buildReport().overall.totalCount).toBe(0));
});

// ---- parity with the old app -------------------------------------------------

function randomReport(seed: number): ReportAssessment[] {
  const r = rng(seed);
  const subjects = [
    { id: 's1', name: 'Maths' },
    { id: 's2', name: 'English' },
    { id: 's3', name: 'اردو' },
    null,
  ];
  const levels = ['recall', 'understand', 'apply', 'analyze', 'unknown', null];
  return Array.from({ length: r.int(0, 12) }, (_, i) => {
    const total = r.pick([0, null, 5, 10, 20, 25, 50, 75, 100]);
    const t = total ?? 10;
    return {
      id: `a${i}`,
      subject: r.pick(subjects),
      weightage: r.pick([0, null, 5, 10, 12.5, 20, 33.33, '15.00']),
      totalMarks: total,
      score:
        r.next() < 0.25 ? null : r.pick([0, t, Math.round(r.next() * t * 100) / 100, `${t / 2}`]),
      questions: Array.from({ length: r.int(0, 6) }, () => ({
        cognitiveLevel: r.pick(levels),
        marks: r.pick([0, -1, 1, 2, 3, 5, '4']),
      })),
    } as ReportAssessment;
  });
}

describe('parity with src/reporting/aggregate.js', () => {
  it('verify fixture: identical report', async () => {
    const old = await legacy('src/reporting/aggregate.js');
    expect(buildReport({ assessments: FIXTURE })).toEqual(
      old.buildReport!({ assessments: FIXTURE }),
    );
  });
  it('300 seeded random report cards: identical buildReport / weightedAggregate', async () => {
    const old = await legacy('src/reporting/aggregate.js');
    for (let seed = 1; seed <= 300; seed++) {
      const assessments = randomReport(seed);
      expect(buildReport({ assessments }), `seed ${seed}`).toEqual(
        old.buildReport!({ assessments }),
      );
      const items = assessments.map((a) => ({
        score: a.score,
        totalMarks: a.totalMarks,
        weightage: a.weightage,
      }));
      expect(weightedAggregate(items)).toEqual(old.weightedAggregate!(items));
    }
  });
});
