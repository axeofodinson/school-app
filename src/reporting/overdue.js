// Overdue-assignments math — the ONE place the "who hasn't submitted" dashboard
// is computed. Everything here is PURE: no React, no network, no Supabase. It
// takes plain rows in (assessments, enrollments, submissions — the exact shapes
// the screen fetches) and returns plain cards out, so the numbers can be pinned
// by a check that runs on a laptop with no device and no database (see
// scripts/verify-overdue.mjs, wired as `npm run verify:overdue`).
//
// WHY ISOLATED: "is this overdue, and who is missing" is a rule (10 days, active
// enrollments only, a submitted_at-bearing attempt counts). When the rule moves,
// this module is the whole blast radius — the screen and the check both read
// their answer from here, so a change is one edit plus one re-run.
//
// This module is ESM (matching the rest of src/), made runnable by plain `node`
// via the tiny reporting/package.json ({"type":"module"}), so the verification
// script imports it directly with no build step.

// An assignment is "overdue" once its due date is this many days (or more) in the
// past. The due date is assessments.scheduled_on — the only date an assessment
// carries (db/setup.sql). One constant so the query cutoff, the UI copy, and this
// math never drift.
export const OVERDUE_DAYS = 10;

// Whole days between two YYYY-MM-DD dates (to - from), computed at UTC midnight so
// it never drifts by DST. Returns null for a missing/invalid input rather than a
// NaN that would silently read as "not overdue".
export function daysBetweenISO(fromISO, toISO) {
  if (!fromISO || !toISO) return null;
  const from = new Date(`${fromISO}T00:00:00Z`).getTime();
  const to = new Date(`${toISO}T00:00:00Z`).getTime();
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.round((to - from) / 86400000);
}

// True when an assignment due on `scheduledOn` is at least `days` days past `today`.
// A null/blank due date is never overdue (an undated assignment has no deadline to
// miss).
export function isOverdue(scheduledOn, today, days = OVERDUE_DAYS) {
  const d = daysBetweenISO(scheduledOn, today);
  return d != null && d >= days;
}

// Order a roster: by roll number ascending (unnumbered students last), then by
// name. Same rule as AttendanceScreen / EnrollmentScreen so rosters read the same
// everywhere.
export function compareRoster(a, b) {
  const ra = a.roll_number;
  const rb = b.roll_number;
  if (ra != null && rb != null && ra !== rb) return ra - rb;
  if (ra != null && rb == null) return -1;
  if (ra == null && rb != null) return 1;
  const na = a.student?.full_name || '';
  const nb = b.student?.full_name || '';
  return na.localeCompare(nb);
}

// Build the dashboard cards from already-fetched rows. PURE join, no filtering by
// type/status (the query scopes to published assignments — that is RLS/SQL's job);
// this layer owns the "overdue?" date rule and the missing-student set difference.
//
//   assessments: [{ id, title, class_id, scheduled_on, className, subjectName }]
//   enrollments: [{ id, class_id, roll_number, student: { full_name, student_code } }]
//                — ACTIVE enrollments only (the caller filters status = 'active').
//   submissions: [{ assessment_id, enrollment_id, submitted_at }]
//   today:       YYYY-MM-DD
//
// A student counts as having submitted an assignment when a submissions row exists
// for their enrollment + that assignment WITH submitted_at set (a real turned-in
// attempt; a score-only row is not a submitted attempt). Missing = the assignment's
// active roster minus those who submitted. Returns one card per OVERDUE assignment,
// in the input order, each with daysOverdue, totalActive, and the sorted missing
// list.
export function buildOverdueDashboard({
  assessments = [],
  enrollments = [],
  submissions = [],
  today,
  overdueDays = OVERDUE_DAYS,
}) {
  // Active roster grouped by class, sorted once.
  const rosterByClass = new Map();
  for (const e of enrollments) {
    if (!rosterByClass.has(e.class_id)) rosterByClass.set(e.class_id, []);
    rosterByClass.get(e.class_id).push(e);
  }
  for (const list of rosterByClass.values()) list.sort(compareRoster);

  // enrollment ids that submitted each assignment (submitted_at must be set).
  const submittedByAssessment = new Map();
  for (const s of submissions) {
    if (!s.submitted_at) continue;
    if (!submittedByAssessment.has(s.assessment_id)) {
      submittedByAssessment.set(s.assessment_id, new Set());
    }
    submittedByAssessment.get(s.assessment_id).add(s.enrollment_id);
  }

  const cards = [];
  for (const a of assessments) {
    if (!isOverdue(a.scheduled_on, today, overdueDays)) continue;
    const roster = rosterByClass.get(a.class_id) ?? [];
    const submitted = submittedByAssessment.get(a.id) ?? new Set();
    const missing = roster.filter((e) => !submitted.has(e.id));
    cards.push({
      id: a.id,
      title: a.title,
      scheduled_on: a.scheduled_on,
      className: a.className ?? '',
      subjectName: a.subjectName ?? '',
      daysOverdue: daysBetweenISO(a.scheduled_on, today),
      totalActive: roster.length,
      missing,
    });
  }
  return cards;
}
