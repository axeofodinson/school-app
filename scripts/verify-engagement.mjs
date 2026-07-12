// Verification for the engagement math (src/engagement/engagement.js) — the
// attendance streak and finished-test medal rules behind "My journey". Known
// inputs, exact expected outputs, no device/network/database (CLAUDE.md:
// "verify math ... write a check proving the numbers").
//
// Run:  npm run verify:engagement   (or: node scripts/verify-engagement.mjs)
// Exits 0 when every case passes, 1 otherwise, so it can gate a commit or CI.

import {
  MILESTONES,
  attendanceStreak,
  earnedMilestones,
  nextMilestone,
  milestoneProgress,
  crossedMilestone,
} from '../src/engagement/engagement.js';

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

const day = (on_date, status) => ({ on_date, status });

// ── attendanceStreak ───────────────────────────────────────────────────────
console.log('attendanceStreak');
check('no records -> 0/0', attendanceStreak([]), { current: 0, best: 0 });
check('null records -> 0/0', attendanceStreak(null), { current: 0, best: 0 });
check(
  'three present days -> 3/3',
  attendanceStreak([
    day('2026-03-02', 'present'),
    day('2026-03-03', 'present'),
    day('2026-03-04', 'present'),
  ]),
  { current: 3, best: 3 }
);
check(
  'unsorted input is sorted by date first',
  attendanceStreak([
    day('2026-03-04', 'present'),
    day('2026-03-02', 'present'),
    day('2026-03-03', 'present'),
  ]),
  { current: 3, best: 3 }
);
check(
  'late still counts as showing up',
  attendanceStreak([day('2026-03-02', 'present'), day('2026-03-03', 'late')]),
  { current: 2, best: 2 }
);
check(
  'absent breaks the run but best survives',
  attendanceStreak([
    day('2026-03-02', 'present'),
    day('2026-03-03', 'present'),
    day('2026-03-04', 'present'),
    day('2026-03-05', 'absent'),
    day('2026-03-06', 'present'),
  ]),
  { current: 1, best: 3 }
);
check(
  'trailing absent -> current 0, best kept',
  attendanceStreak([
    day('2026-03-02', 'present'),
    day('2026-03-03', 'present'),
    day('2026-03-04', 'absent'),
  ]),
  { current: 0, best: 2 }
);
check(
  'leave neither breaks nor grows the run',
  attendanceStreak([
    day('2026-03-02', 'present'),
    day('2026-03-03', 'leave'),
    day('2026-03-04', 'present'),
  ]),
  { current: 2, best: 2 }
);
check(
  'only leave days -> 0/0',
  attendanceStreak([day('2026-03-02', 'leave'), day('2026-03-03', 'leave')]),
  { current: 0, best: 0 }
);
check(
  'unknown status is skipped like leave',
  attendanceStreak([day('2026-03-02', 'present'), day('2026-03-03', 'excursion')]),
  { current: 1, best: 1 }
);
check(
  'rows without a date are ignored',
  attendanceStreak([day('2026-03-02', 'present'), { status: 'present' }]),
  { current: 1, best: 1 }
);

// ── medal ladder ───────────────────────────────────────────────────────────
console.log('milestones');
check(
  'ladder is strictly increasing',
  MILESTONES.every((m, i) => i === 0 || m.count > MILESTONES[i - 1].count),
  true
);
check('0 tests -> nothing earned', earnedMilestones(0), []);
check(
  '1 test -> first medal',
  earnedMilestones(1).map((m) => m.key),
  ['first']
);
check(
  '12 tests -> four medals',
  earnedMilestones(12).map((m) => m.key),
  ['first', 'three', 'five', 'ten']
);
check(
  'next at 0 is first (1 test)',
  nextMilestone(0),
  { count: 1, key: 'first' }
);
check('next at 5 is ten', nextMilestone(5), { count: 10, key: 'ten' });
check('next after the whole ladder is null', nextMilestone(50), null);
check('non-numeric count -> next is first', nextMilestone(undefined), {
  count: 1,
  key: 'first',
});

console.log('milestoneProgress');
check('0 of 1 -> 0%', milestoneProgress(0), 0);
check('1 test -> at "first", 0% toward three', milestoneProgress(1), 0);
check('2 of 1..3 -> halfway', milestoneProgress(2), 50);
check('4 of 3..5 -> halfway', milestoneProgress(4), 50);
check('15 of 10..20 -> halfway', milestoneProgress(15), 50);
check('ladder done -> full bar', milestoneProgress(50), 100);
check('beyond the ladder stays full', milestoneProgress(80), 100);

console.log('crossedMilestone');
check('0 -> 1 crosses first', crossedMilestone(0, 1), { count: 1, key: 'first' });
check('4 -> 5 crosses five', crossedMilestone(4, 5), { count: 5, key: 'five' });
check('5 -> 6 crosses nothing', crossedMilestone(5, 6), null);
check(
  'a jump crossing several reports the highest',
  crossedMilestone(0, 4),
  { count: 3, key: 'three' }
);
check('no movement -> nothing', crossedMilestone(7, 7), null);

// ── result ─────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
