// Pure grade-entry helpers — the parsing, merge, and "is a reason required" rules
// behind the console grading screen, isolated here so they can be pinned by a
// check that runs on a laptop with no device and no database (see
// scripts/verify-grading.mjs, wired as `npm run verify:grading`). A grade is the
// most consequential thing this app records for a child (CLAUDE.md rule 3), so
// the rules that gate writing one are trustworthy and changeable in one file.
//
// The DB is the real boundary: db/013's record_grade() re-validates everything
// here (score range, reason-on-correction, authorization). These helpers keep the
// UI honest and give fast, local feedback; they never stand in for the RPC.
//
// ESM (matching the rest of src/), runnable by plain `node` via the package.json
// alongside aggregate.js ({"type":"module"}).

// Parse a score string against an optional total. Returns { value } on success or
// { error } with an i18n key under console.grading.errors. Accepts a whole number
// or up to two decimals (matches submissions.score numeric(6,2)); rejects blanks,
// negatives, junk, and anything above the assessment's total when it has one.
export function parseScore(str, total) {
  const s = String(str ?? '').trim();
  if (!s) return { error: 'scoreRequired' };
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return { error: 'scoreInvalid' };
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return { error: 'scoreInvalid' };
  const t = Number(total);
  if (Number.isFinite(t) && t > 0 && n > t) return { error: 'scoreRange' };
  return { value: n };
}

// Whether a reason must be supplied to save. Only corrections need one: entering a
// FIRST grade (no current score) is free, but changing an existing score to a
// different value requires a reason so the audit trail is useful (rule 3).
// Re-saving the same value is not a change, so it needs no reason.
export function reasonRequired(currentScore, newValue) {
  if (currentScore == null) return false;
  return Number(newValue) !== Number(currentScore);
}

// Classify a roster entry for display: no submission row yet, submitted but not
// marked, or graded.
export function gradeState(submission) {
  if (!submission) return 'notSubmitted';
  if (submission.score == null) return 'ungraded';
  return 'graded';
}

// Merge active enrollments with their submissions (keyed by enrollment_id) into
// the roster rows the screen renders. Enrollment order is preserved (the caller
// sorts). A student with no submission row still appears — a teacher can enter a
// first grade for them (e.g. a paper worksheet from a file assessment).
export function buildRoster(enrollments, submissions) {
  const byEnrollment = new Map();
  for (const s of submissions || []) byEnrollment.set(s.enrollment_id, s);
  return (enrollments || []).map((e) => ({
    enrollmentId: e.id,
    rollNumber: e.roll_number ?? null,
    student: e.student ?? null,
    submission: byEnrollment.get(e.id) ?? null,
  }));
}
