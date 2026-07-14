// Verification for the grade-entry helpers (src/reporting/grading.js).
//
// Feeds KNOWN inputs and asserts EXACT outputs, so the rules that gate writing a
// grade — score parsing/range, when a reason is required, how the roster merges —
// are trustworthy before a teacher marks a child (CLAUDE.md: "verify math"). No
// device, no network, no database — pure functions in, expected values out.
//
// Run:  npm run verify:grading      (or: node scripts/verify-grading.mjs)
// Exit code is 0 when every case passes, 1 on the first failing assertion.

import {
  parseScore,
  reasonRequired,
  gradeState,
  buildRoster,
} from '../src/reporting/grading.js';

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

// ── parseScore (total = 20) ────────────────────────────────────────────────
console.log('parseScore');
check('whole number in range', parseScore('15', 20), { value: 15 });
check('two decimals', parseScore('12.50', 20), { value: 12.5 });
check('zero is allowed', parseScore('0', 20), { value: 0 });
check('full marks', parseScore('20', 20), { value: 20 });
check('above total -> range', parseScore('21', 20), { error: 'scoreRange' });
check('blank -> required', parseScore('', 20), { error: 'scoreRequired' });
check('whitespace -> required', parseScore('   ', 20), { error: 'scoreRequired' });
check('negative -> invalid', parseScore('-3', 20), { error: 'scoreInvalid' });
check('three decimals -> invalid', parseScore('1.234', 20), { error: 'scoreInvalid' });
check('letters -> invalid', parseScore('12a', 20), { error: 'scoreInvalid' });
// No total (file assessment): any non-negative number passes, no upper bound.
check('no total -> no ceiling', parseScore('999', null), { value: 999 });
check('total 0 -> no ceiling', parseScore('50', 0), { value: 50 });

// ── reasonRequired ─────────────────────────────────────────────────────────
console.log('reasonRequired');
check('first grade needs no reason', reasonRequired(null, 15), false);
check('changing a grade needs a reason', reasonRequired(15, 18), true);
check('re-saving same value needs none', reasonRequired(15, 15), false);
check('same value, string vs number', reasonRequired(15, '15'), false);

// ── gradeState ─────────────────────────────────────────────────────────────
console.log('gradeState');
check('no submission', gradeState(null), 'notSubmitted');
check('submitted, unmarked', gradeState({ score: null }), 'ungraded');
check('marked', gradeState({ score: 12 }), 'graded');
check('zero is marked', gradeState({ score: 0 }), 'graded');

// ── buildRoster ────────────────────────────────────────────────────────────
console.log('buildRoster');
const enrollments = [
  { id: 'e1', roll_number: 1, student: { full_name: 'Aisha', student_code: 'S-001' } },
  { id: 'e2', roll_number: 2, student: { full_name: 'Bilal', student_code: 'S-002' } },
  { id: 'e3', roll_number: null, student: { full_name: 'Zoya', student_code: 'S-003' } },
];
const submissions = [
  { enrollment_id: 'e1', score: 18, submitted_at: '2026-07-01T09:00:00Z' },
  { enrollment_id: 'e3', score: null, submitted_at: '2026-07-02T09:00:00Z' },
];
const roster = buildRoster(enrollments, submissions);
check('roster length', roster.length, 3);
check('e1 graded', gradeState(roster[0].submission), 'graded');
check('e2 has no submission', roster[1].submission, null);
check('e2 state notSubmitted', gradeState(roster[1].submission), 'notSubmitted');
check('e3 ungraded', gradeState(roster[2].submission), 'ungraded');
check('preserves student join', roster[0].student.full_name, 'Aisha');
check('null roll preserved', roster[2].rollNumber, null);
check('empty inputs -> empty roster', buildRoster(null, null), []);

// ── summary ────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
