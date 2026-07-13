// Verification for the overdue-assignments math (src/reporting/overdue.js).
//
// Feeds KNOWN inputs and asserts the EXACT outputs, so the admin dashboard's
// "who hasn't submitted" list is trustworthy before anyone chases a student
// (CLAUDE.md: "verify math ... write a check proving the numbers"). No device, no
// network, no database — pure functions in, expected values out.
//
// Run:  npm run verify:overdue      (or: node scripts/verify-overdue.mjs)
// Exit code is 0 when every case passes, 1 on the first failing assertion, so it
// can gate a commit or CI.

import {
  daysBetweenISO,
  isOverdue,
  buildOverdueDashboard,
} from '../src/reporting/overdue.js';

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

const TODAY = '2026-07-13';

// ── daysBetweenISO ─────────────────────────────────────────────────────────
console.log('daysBetweenISO');
check('12 days', daysBetweenISO('2026-07-01', TODAY), 12);
check('same day -> 0', daysBetweenISO(TODAY, TODAY), 0);
check('spans a month boundary', daysBetweenISO('2026-06-30', TODAY), 13);
check('missing from -> null', daysBetweenISO(null, TODAY), null);
check('blank from -> null', daysBetweenISO('', TODAY), null);

// ── isOverdue (threshold = 10) ─────────────────────────────────────────────
console.log('isOverdue');
// due exactly 10 days ago is the first day it counts as overdue.
check('due 10 days ago -> overdue', isOverdue('2026-07-03', TODAY), true);
check('due 9 days ago -> not yet', isOverdue('2026-07-04', TODAY), false);
check('due today -> not overdue', isOverdue(TODAY, TODAY), false);
check('no due date -> not overdue', isOverdue(null, TODAY), false);
check('custom threshold 3', isOverdue('2026-07-10', TODAY, 3), true);

// ── buildOverdueDashboard ──────────────────────────────────────────────────
console.log('buildOverdueDashboard');

// Two classes; three published assignments (one of them not yet overdue).
const assessments = [
  { id: 'a1', title: 'Maths HW 1', class_id: 'C1', scheduled_on: '2026-07-01', className: 'Class 5', subjectName: 'Maths' }, // 12 days overdue
  { id: 'a2', title: 'Science HW', class_id: 'C2', scheduled_on: '2026-07-10', className: 'Class 6', subjectName: 'Science' }, //  3 days — NOT overdue
  { id: 'a3', title: 'Maths HW 2', class_id: 'C1', scheduled_on: '2026-07-03', className: 'Class 5', subjectName: 'Maths' }, // 10 days overdue
];

// Active roster. C1 has three (out of roll order + one unnumbered); C2 has one.
const enrollments = [
  { id: 'e1', class_id: 'C1', roll_number: 2, student: { full_name: 'Bilal', student_code: 'S-002' } },
  { id: 'e2', class_id: 'C1', roll_number: 1, student: { full_name: 'Aisha', student_code: 'S-001' } },
  { id: 'e3', class_id: 'C1', roll_number: null, student: { full_name: 'Zoya', student_code: 'S-003' } },
  { id: 'e4', class_id: 'C2', roll_number: 1, student: { full_name: 'Omar', student_code: 'S-004' } },
];

// Submissions: a1 has one real attempt (e2) and one score-only row (e1, no
// submitted_at — must NOT count as submitted); a3 has one real attempt (e3).
const submissions = [
  { assessment_id: 'a1', enrollment_id: 'e2', submitted_at: '2026-07-02T09:00:00Z' },
  { assessment_id: 'a1', enrollment_id: 'e1', submitted_at: null }, // score-only, not a submitted attempt
  { assessment_id: 'a3', enrollment_id: 'e3', submitted_at: '2026-07-04T09:00:00Z' },
];

// Reduce the rich cards to a compact, readable shape for exact assertion.
function summarize(cards) {
  return cards.map((c) => ({
    id: c.id,
    className: c.className,
    subjectName: c.subjectName,
    daysOverdue: c.daysOverdue,
    totalActive: c.totalActive,
    missing: c.missing.map((m) => m.id),
  }));
}

const cards = buildOverdueDashboard({ assessments, enrollments, submissions, today: TODAY });

// a2 is excluded (only 3 days late); a1 and a3 remain, in input order.
check(
  'only overdue assignments, in input order',
  cards.map((c) => c.id),
  ['a1', 'a3']
);

check(
  'per-assignment missing lists (roll-sorted, score-only row not counted)',
  summarize(cards),
  [
    {
      id: 'a1',
      className: 'Class 5',
      subjectName: 'Maths',
      daysOverdue: 12,
      totalActive: 3,
      // roster sorted e2(roll1), e1(roll2), e3(no roll); e2 submitted -> missing e1, e3.
      // e1's score-only row (submitted_at null) does NOT clear them.
      missing: ['e1', 'e3'],
    },
    {
      id: 'a3',
      className: 'Class 5',
      subjectName: 'Maths',
      daysOverdue: 10,
      totalActive: 3,
      // e3 submitted -> missing e2, e1 (roll order).
      missing: ['e2', 'e1'],
    },
  ]
);

// Everyone submitted -> empty missing list, still a card.
check(
  'all submitted -> no missing students',
  summarize(
    buildOverdueDashboard({
      assessments: [assessments[2]], // a3, class C1
      enrollments: enrollments.filter((e) => e.class_id === 'C1'),
      submissions: [
        { assessment_id: 'a3', enrollment_id: 'e1', submitted_at: '2026-07-04T00:00:00Z' },
        { assessment_id: 'a3', enrollment_id: 'e2', submitted_at: '2026-07-04T00:00:00Z' },
        { assessment_id: 'a3', enrollment_id: 'e3', submitted_at: '2026-07-04T00:00:00Z' },
      ],
      today: TODAY,
    })
  ),
  [{ id: 'a3', className: 'Class 5', subjectName: 'Maths', daysOverdue: 10, totalActive: 3, missing: [] }]
);

// A class with no active enrollments -> totalActive 0, nobody flagged.
check(
  'empty roster -> totalActive 0, no missing',
  summarize(
    buildOverdueDashboard({
      assessments: [assessments[0]], // a1, class C1
      enrollments: [], // no active students
      submissions: [],
      today: TODAY,
    })
  ),
  [{ id: 'a1', className: 'Class 5', subjectName: 'Maths', daysOverdue: 12, totalActive: 0, missing: [] }]
);

// No overdue assignments at all -> empty dashboard.
check(
  'nothing overdue -> empty dashboard',
  buildOverdueDashboard({ assessments: [assessments[1]], enrollments, submissions, today: TODAY }),
  []
);

// ── summary ────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
