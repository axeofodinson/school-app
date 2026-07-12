// Engagement math — the pure rules behind the student app's light reward
// layer ("My journey"): the attendance streak and the finished-test medals.
// No I/O here; everything takes plain data in and returns plain data out, so
// scripts/verify-engagement.mjs can prove the numbers (CLAUDE.md: verify math).
//
// Healthy-by-design rules, deliberate and non-negotiable:
//   * Rewards measure EFFORT the child controls — tests finished, days shown
//     up — never scores or ranks. Grading is a separate teacher pass and stays
//     out of the reward loop entirely.
//   * Nothing is ever taken away. A streak that ends just quietly restarts;
//     the best streak is kept so past effort is never erased. There is no
//     "you lost X" state anywhere in this module.
//   * Excused leave never breaks a streak (a sick day is not a failure), and
//     the streak only counts days the teacher actually marked — weekends and
//     holidays simply don't exist to it.
//   * The medal ladder is short, finite, and fully visible: no randomness, no
//     timers, no comparing children to each other.

// Finished-test medals, in order. `key` maps to the localized name in
// locales/*.json under student.journey.milestones.<key> — the names live
// there, never here (no hardcoded user-facing text).
export const MILESTONES = [
  { count: 1, key: 'first' },
  { count: 3, key: 'three' },
  { count: 5, key: 'five' },
  { count: 10, key: 'ten' },
  { count: 20, key: 'twenty' },
  { count: 30, key: 'thirty' },
  { count: 50, key: 'fifty' },
];

// Attendance streak from the student's marked days ([{ on_date, status }], any
// order). Walking marked days chronologically:
//   present / late  -> the run grows (late still means the child showed up)
//   leave           -> skipped: neither grows nor breaks the run
//   absent          -> the run resets (quietly — callers never phrase this as loss)
// Returns { current, best }: `current` is the run ending at the most recent
// marked day, `best` the longest run ever — kept so a reset never erases effort.
export function attendanceStreak(records) {
  const days = (Array.isArray(records) ? records : [])
    .filter((r) => r && typeof r.on_date === 'string')
    .sort((a, b) => (a.on_date < b.on_date ? -1 : a.on_date > b.on_date ? 1 : 0));

  let run = 0;
  let best = 0;
  for (const day of days) {
    if (day.status === 'present' || day.status === 'late') {
      run += 1;
      if (run > best) best = run;
    } else if (day.status === 'absent') {
      run = 0;
    }
    // 'leave' (and anything unknown): skip — no growth, no break.
  }
  return { current: run, best };
}

// Every medal earned at `count` finished tests, in ladder order.
export function earnedMilestones(count) {
  const n = Number(count) || 0;
  return MILESTONES.filter((m) => n >= m.count);
}

// The next medal to aim for, or null when the ladder is complete. Only this
// one is ever shown ahead — a single warm goal, not a wall of locked content.
export function nextMilestone(count) {
  const n = Number(count) || 0;
  return MILESTONES.find((m) => n < m.count) ?? null;
}

// Fill (0..100) for the journey bar: progress from the last earned medal to
// the next one. A finished ladder reads as a full bar.
export function milestoneProgress(count) {
  const n = Math.max(0, Number(count) || 0);
  const next = nextMilestone(n);
  if (!next) return 100;
  const earned = earnedMilestones(n);
  const prev = earned.length > 0 ? earned[earned.length - 1].count : 0;
  return ((n - prev) / (next.count - prev)) * 100;
}

// The medal crossed by going from prevCount to newCount finished tests (the
// highest one, if several), or null. Drives the one-shot "new medal!" moment
// on the submit celebration.
export function crossedMilestone(prevCount, newCount) {
  const a = Number(prevCount) || 0;
  const b = Number(newCount) || 0;
  const crossed = MILESTONES.filter((m) => a < m.count && b >= m.count);
  return crossed.length > 0 ? crossed[crossed.length - 1] : null;
}
