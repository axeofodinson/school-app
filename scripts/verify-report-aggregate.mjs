// Verification for the reporting aggregate math (src/reporting/aggregate.js).
//
// Feeds KNOWN inputs and asserts the EXACT outputs, so the numbers on a child's
// report card are trustworthy before anyone sees a grade (CLAUDE.md: "verify
// math ... write a check proving the numbers"). No device, no network, no
// database — pure functions in, expected values out.
//
// Run:  npm run verify:report        (or: node scripts/verify-report-aggregate.mjs)
// Exit code is 0 when every case passes, 1 on the first failing assertion, so it
// can gate a commit or CI.

import {
  assessmentPercent,
  weightedAggregate,
  cognitiveBreakdown,
  buildReport,
} from '../src/reporting/aggregate.js';

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

// ── assessmentPercent ──────────────────────────────────────────────────────
console.log('assessmentPercent');
check('half marks -> 50%', assessmentPercent(10, 20), 50);
check('full marks -> 100%', assessmentPercent(20, 20), 100);
check('ungraded (score null) -> null', assessmentPercent(null, 20), null);
check('zero-mark test -> null', assessmentPercent(5, 0), null);
check('null total -> null', assessmentPercent(5, null), null);

// ── weightedAggregate ──────────────────────────────────────────────────────
console.log('weightedAggregate');

// Two marked tests: 80% at weight 30, 50% at weight 10.
//   (0.30·80 + 0.10·50) / (0.30 + 0.10) = (24 + 5)/0.4 = 29/0.4 = 72.5 -> 73
check(
  'weighted mean of two tests -> 73',
  weightedAggregate([
    { score: 8, totalMarks: 10, weightage: 30 }, // 80%
    { score: 5, totalMarks: 10, weightage: 10 }, // 50%
  ]),
  {
    percent: 73,
    weighted: true,
    gradedCount: 2,
    totalCount: 2,
    ungradedCount: 0,
    countedWeightage: 40,
  }
);

// Weight actually matters: same two percents, equal weights -> plain mean 65.
check(
  'equal weights -> simple mean 65',
  weightedAggregate([
    { score: 8, totalMarks: 10, weightage: 20 }, // 80%
    { score: 5, totalMarks: 10, weightage: 20 }, // 50%
  ]).percent,
  65
);

// An ungraded test in the mix must not move the number: only the 80% counts.
check(
  'ungraded test is ignored',
  weightedAggregate([
    { score: 8, totalMarks: 10, weightage: 30 }, // 80%
    { score: null, totalMarks: 10, weightage: 50 }, // not marked yet
  ]),
  {
    percent: 80,
    weighted: true,
    gradedCount: 1,
    totalCount: 2,
    ungradedCount: 1,
    countedWeightage: 30,
  }
);

// A zero-weight graded test counts as graded but not toward the weighted %.
//   only the weight-10 90% drives the percent; the weight-0 40% is excluded.
check(
  'zero-weight test excluded from percent but counted graded',
  weightedAggregate([
    { score: 9, totalMarks: 10, weightage: 10 }, // 90%, counts
    { score: 4, totalMarks: 10, weightage: 0 }, //  40%, weight 0 -> excluded
  ]),
  {
    percent: 90,
    weighted: true,
    gradedCount: 2,
    totalCount: 2,
    ungradedCount: 0,
    countedWeightage: 10,
  }
);

// No weights set anywhere -> honest fallback to a plain mean, flagged unweighted.
//   (75% + 25%) / 2 = 50
check(
  'no weights -> unweighted mean, weighted:false',
  weightedAggregate([
    { score: 3, totalMarks: 4, weightage: 0 }, // 75%
    { score: 1, totalMarks: 4, weightage: 0 }, // 25%
  ]),
  {
    percent: 50,
    weighted: false,
    gradedCount: 2,
    totalCount: 2,
    ungradedCount: 0,
    countedWeightage: 0,
  }
);

// Nothing marked yet -> null percent, honest counts.
check('all ungraded -> null percent', weightedAggregate([{ score: null, totalMarks: 10, weightage: 20 }]), {
  percent: null,
  weighted: false,
  gradedCount: 0,
  totalCount: 1,
  ungradedCount: 1,
  countedWeightage: 0,
});

check('empty -> null percent', weightedAggregate([]), {
  percent: null,
  weighted: false,
  gradedCount: 0,
  totalCount: 0,
  ungradedCount: 0,
  countedWeightage: 0,
});

// ── cognitiveBreakdown ─────────────────────────────────────────────────────
console.log('cognitiveBreakdown');

// 10 marks total: 4 recall, 6 conceptual (3 understand + 2 apply + 1 analyze).
//   recall 40%, conceptual 60% (complement).
check(
  'recall vs conceptual split by marks',
  cognitiveBreakdown([
    { cognitiveLevel: 'recall', marks: 4 },
    { cognitiveLevel: 'understand', marks: 3 },
    { cognitiveLevel: 'apply', marks: 2 },
    { cognitiveLevel: 'analyze', marks: 1 },
  ]),
  {
    totalMarks: 10,
    levels: [
      { level: 'recall', marks: 4, share: 40 },
      { level: 'understand', marks: 3, share: 30 },
      { level: 'apply', marks: 2, share: 20 },
      { level: 'analyze', marks: 1, share: 10 },
    ],
    recall: { marks: 4, share: 40 },
    conceptual: { marks: 6, share: 60 },
  }
);

// Rounding: recall 1 of 3 -> 33%, conceptual is the complement 67% (not 67 from
// its own rounding of 66.67, but 100−33 — so the two never drift apart).
check(
  'recall/conceptual shares are complementary under rounding',
  (() => {
    const b = cognitiveBreakdown([
      { cognitiveLevel: 'recall', marks: 1 },
      { cognitiveLevel: 'apply', marks: 2 },
    ]);
    return { recall: b.recall.share, conceptual: b.conceptual.share };
  })(),
  { recall: 33, conceptual: 67 }
);

// Unknown level and zero/negative marks are ignored.
check(
  'unknown level and non-positive marks ignored',
  cognitiveBreakdown([
    { cognitiveLevel: 'recall', marks: 5 },
    { cognitiveLevel: 'synthesize', marks: 99 }, // not a real level
    { cognitiveLevel: 'apply', marks: 0 }, // no marks
  ]),
  {
    totalMarks: 5,
    levels: [
      { level: 'recall', marks: 5, share: 100 },
      { level: 'understand', marks: 0, share: 0 },
      { level: 'apply', marks: 0, share: 0 },
      { level: 'analyze', marks: 0, share: 0 },
    ],
    recall: { marks: 5, share: 100 },
    conceptual: { marks: 0, share: 0 },
  }
);

check('no questions -> null shares', cognitiveBreakdown([]), {
  totalMarks: 0,
  levels: [
    { level: 'recall', marks: 0, share: null },
    { level: 'understand', marks: 0, share: null },
    { level: 'apply', marks: 0, share: null },
    { level: 'analyze', marks: 0, share: null },
  ],
  recall: { marks: 0, share: null },
  conceptual: { marks: 0, share: null },
});

// ── buildReport (end-to-end) ───────────────────────────────────────────────
console.log('buildReport');

const report = buildReport({
  assessments: [
    {
      id: 'a1',
      title: 'Physics Ch.1 Test',
      type: 'test',
      subject: { id: 's-phy', name: 'Physics' },
      weightage: 30,
      totalMarks: 10,
      score: 8, // 80%
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
      score: 5, // 50%
      questions: [{ cognitiveLevel: 'recall', marks: 5 }],
    },
    {
      id: 'a3',
      title: 'Maths Exam',
      type: 'exam',
      subject: { id: 's-math', name: 'Maths' },
      weightage: 20,
      totalMarks: 20,
      score: null, // not marked yet
      questions: [
        { cognitiveLevel: 'understand', marks: 10 },
        { cognitiveLevel: 'analyze', marks: 10 },
      ],
    },
  ],
});

// Overall: only the two graded Physics tests count (Maths is ungraded).
//   (30·80 + 10·50)/40 = 2900/40 = 72.5 -> 73
check('report overall percent -> 73', report.overall.percent, 73);
check('report overall counts', {
  gradedCount: report.overall.gradedCount,
  totalCount: report.overall.totalCount,
  ungradedCount: report.overall.ungradedCount,
}, { gradedCount: 2, totalCount: 3, ungradedCount: 1 });

// Per-subject, sorted by name: Maths (all ungraded -> null), then Physics (73).
check('report subjects', report.subjects.map((s) => ({ name: s.name, percent: s.percent, gradedCount: s.gradedCount })), [
  { name: 'Maths', percent: null, gradedCount: 0 },
  { name: 'Physics', percent: 73, gradedCount: 2 },
]);

// Cognitive across ALL assessments' questions (tested make-up, incl. the
// ungraded exam): 35 marks total — recall 7 (2+5), conceptual 28 (8 apply +
// 10 understand + 10 analyze). recall 20%, conceptual 80%.
check('report cognitive totals', {
  totalMarks: report.cognitive.totalMarks,
  recall: report.cognitive.recall,
  conceptual: report.cognitive.conceptual,
}, {
  totalMarks: 35,
  recall: { marks: 7, share: 20 },
  conceptual: { marks: 28, share: 80 },
});

// ── summary ────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
