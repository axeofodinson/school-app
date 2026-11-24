// Grade-entry helpers: the parsing, merge and "is a reason required" rules behind
// the grading screen. Ported from the old app's src/reporting/grading.js (kept
// frozen there); behaviour is identical and pinned by test/grading.test.ts, which
// carries every case from scripts/verify-grading.mjs.
//
// The DB is the real boundary: db/013's record_grade() re-validates everything
// here (score range, reason-on-correction, authorization). These helpers keep the
// UI honest and give fast feedback; they never stand in for the RPC.

/** i18n keys under `console.grading.errors`. */
export type ScoreError = 'scoreRequired' | 'scoreInvalid' | 'scoreRange';

export type ParseScoreResult = { value: number } | { error: ScoreError };

/**
 * Parse a score string against an optional total. Accepts a whole number or up
 * to two decimals (matches submissions.score numeric(6,2)); rejects blanks,
 * negatives, junk, and anything above the total when the total is positive.
 */
export function parseScore(
  str: string | number | null | undefined,
  total?: number | string | null,
): ParseScoreResult {
  const s = String(str ?? '').trim();
  if (!s) return { error: 'scoreRequired' };
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return { error: 'scoreInvalid' };
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return { error: 'scoreInvalid' };
  const t = Number(total);
  if (Number.isFinite(t) && t > 0 && n > t) return { error: 'scoreRange' };
  return { value: n };
}

/**
 * Only corrections need a reason: a first grade is free, changing an existing
 * score to a different value needs one (CLAUDE.md rule 3). Re-saving the same
 * value is not a change.
 */
export function reasonRequired(
  currentScore: number | string | null | undefined,
  newValue: number | string,
): boolean {
  if (currentScore == null) return false;
  return Number(newValue) !== Number(currentScore);
}

export type GradeState = 'notSubmitted' | 'ungraded' | 'graded';

export interface SubmissionLike {
  enrollment_id?: string;
  score: number | null;
}

export function gradeState(submission: SubmissionLike | null | undefined): GradeState {
  if (!submission) return 'notSubmitted';
  if (submission.score == null) return 'ungraded';
  return 'graded';
}

export interface EnrollmentLike<TStudent> {
  id: string;
  roll_number?: number | null;
  student?: TStudent | null;
}

export interface RosterRow<TStudent, TSubmission> {
  enrollmentId: string;
  rollNumber: number | null;
  student: TStudent | null;
  submission: TSubmission | null;
}

/**
 * Merge active enrollments with their submissions (keyed by enrollment_id).
 * Enrollment order is preserved; a student with no submission still appears so
 * a teacher can enter a first grade.
 */
export function buildRoster<TStudent, TSubmission extends { enrollment_id: string }>(
  enrollments: readonly EnrollmentLike<TStudent>[] | null | undefined,
  submissions: readonly TSubmission[] | null | undefined,
): RosterRow<TStudent, TSubmission>[] {
  const byEnrollment = new Map<string, TSubmission>();
  for (const s of submissions ?? []) byEnrollment.set(s.enrollment_id, s);
  return (enrollments ?? []).map((e) => ({
    enrollmentId: e.id,
    rollNumber: e.roll_number ?? null,
    student: e.student ?? null,
    submission: byEnrollment.get(e.id) ?? null,
  }));
}

// ---- record_grade() errors + the "graded before the attempt" warning --------

/** Stable messages db/013 record_grade() raises; the screen maps each to an i18n key. */
export const GRADE_RPC_ERRORS = [
  'reason_required',
  'not_authorized',
  'assessment_not_found',
  'enrollment_class_mismatch',
  'score_required',
  'score_out_of_range',
] as const;
export type GradeRpcError = (typeof GRADE_RPC_ERRORS)[number];

/** Which record_grade() refusal a PostgREST error message carries, if any. */
export function gradeRpcError(message: string | null | undefined): GradeRpcError | null {
  const m = String(message ?? '').toLowerCase();
  return GRADE_RPC_ERRORS.find((k) => m.includes(k)) ?? null;
}

/**
 * True when entering a grade now would shut out the student's online attempt:
 * record_grade() creates the (enrollment, assessment) submission row, and the
 * student's later attempt then hits the unique key and is dropped as a
 * duplicate (its responses are never stored). Applies to question papers that
 * are still open; a file worksheet has no online attempt to lose.
 */
export function gradeBlocksAttempt(
  assessment: { type: string; status: string },
  submission: SubmissionLike | null | undefined,
): boolean {
  return !submission && assessment.type !== 'file' && assessment.status === 'published';
}

/** Show a score without trailing-zero noise: 15, 12.5 (numeric(6,2) arrives as "15.00"). */
export function fmtScore(score: number | string | null | undefined): string {
  if (score == null || score === '') return '';
  const n = Number(score);
  return Number.isFinite(n) ? String(n) : String(score);
}

/** Roll number ascending (unnumbered last), then name: the grading roster order. */
export function sortRoster<
  T extends { roll_number?: number | null; student?: { full_name?: string | null } | null },
>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    const ra = a.roll_number ?? null;
    const rb = b.roll_number ?? null;
    if (ra == null && rb == null) {
      return (a.student?.full_name ?? '').localeCompare(b.student?.full_name ?? '');
    }
    if (ra == null) return 1;
    if (rb == null) return -1;
    return ra - rb;
  });
}
