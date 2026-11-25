// Grading reads + the one grade write. Every score goes through db/013's
// record_grade() RPC (never a direct write to submissions.score; db/026 refuses
// those), which checks the caller, the class and the range, demands a reason
// for a correction and appends the old + new value to submission_grade_edits.
// RLS: staff see everything, a teacher only classes they teach; students never
// read the history.
import {
  AUTO_MARK_REASON,
  buildOverdueDashboard,
  buildRoster,
  gradeRpcError,
  isoDaysBefore,
  OVERDUE_DAYS,
  sortRoster,
  type GradeRpcError,
  type OverdueCard,
  type RosterRow,
} from '@school/core';

import { supabase } from '../../lib/supabase';
import {
  classifyError,
  fail,
  notConfigured,
  ok,
  type ApiErrorKind,
  type PgError,
  type Result,
} from '../../lib/result';

export interface RosterStudent {
  id: string;
  full_name: string;
  student_code: string;
}

export interface GradeSubmission {
  id: string;
  enrollment_id: string;
  score: number | null;
  submitted_at: string | null;
  graded_at: string | null;
  edit_count: number;
  last_edited_at: string | null;
}

export type GradeRow = RosterRow<RosterStudent, GradeSubmission>;

interface EnrollmentRow {
  id: string;
  roll_number: number | null;
  student: RosterStudent | null;
}
interface SubmissionRow extends Omit<GradeSubmission, 'score'> {
  score: number | string | null;
}

const SUB_COLUMNS = 'id, enrollment_id, score, submitted_at, graded_at, edit_count, last_edited_at';
const toSub = (r: SubmissionRow): GradeSubmission => ({
  ...r,
  score: r.score == null ? null : Number(r.score),
  edit_count: r.edit_count ?? 0,
});

/** The class's active roster (roll order) merged with this assessment's submissions. */
export async function loadRoster(
  classId: string,
  yearId: string,
  assessmentId: string,
): Promise<Result<GradeRow[]>> {
  if (!supabase) return notConfigured;
  const [enr, subs] = await Promise.all([
    supabase
      .from('enrollments')
      .select('id, roll_number, student:students(id, full_name, student_code)')
      .eq('class_id', classId)
      .eq('year_id', yearId)
      .eq('status', 'active')
      .overrideTypes<EnrollmentRow[], { merge: false }>(),
    supabase
      .from('submissions')
      .select(SUB_COLUMNS)
      .eq('assessment_id', assessmentId)
      .overrideTypes<SubmissionRow[], { merge: false }>(),
  ]);
  if (enr.error) return fail(enr.error);
  if (subs.error) return fail(subs.error);
  return ok(buildRoster(sortRoster(enr.data ?? []), (subs.data ?? []).map(toSub)));
}

/** Why a save failed: one of record_grade()'s refusals, or a transport/RLS kind. */
export type GradeSaveError = GradeRpcError | ApiErrorKind;

export async function recordGrade(
  enrollmentId: string,
  assessmentId: string,
  score: number,
  reason: string,
): Promise<{ ok: true; data: GradeSubmission } | { ok: false; error: GradeSaveError }> {
  if (!supabase) return notConfigured;
  try {
    const { data, error } = await supabase
      .rpc('record_grade', {
        p_enrollment_id: enrollmentId,
        p_assessment_id: assessmentId,
        p_score: score,
        p_reason: reason.trim(),
      })
      .overrideTypes<SubmissionRow, { merge: false }>();
    if (error) return { ok: false, error: gradeRpcError(error.message) ?? classifyError(error) };
    return ok(toSub(data as SubmissionRow));
  } catch (e) {
    return { ok: false, error: classifyError(e as PgError) };
  }
}

export interface GradeEdit {
  id: string;
  prev_score: number | null;
  new_score: number | null;
  reason: string;
  edited_at: string;
  /** The server's auto-mark on submit (db/018), not a person. */
  auto: boolean;
}

/** Every change to one grade, newest first (staff + the class's teacher only). */
export async function loadHistory(submissionId: string): Promise<Result<GradeEdit[]>> {
  if (!supabase) return notConfigured;
  const { data, error } = await supabase
    .from('submission_grade_edits')
    .select('id, prev_score, new_score, reason, edited_at, edited_by')
    .eq('submission_id', submissionId)
    .order('edited_at', { ascending: false });
  if (error) return fail(error);
  return ok(
    (data ?? []).map((r) => ({
      id: r.id,
      reason: r.reason,
      edited_at: r.edited_at,
      prev_score: r.prev_score == null ? null : Number(r.prev_score),
      new_score: r.new_score == null ? null : Number(r.new_score),
      auto: r.edited_by == null && r.reason === AUTO_MARK_REASON,
    })),
  );
}

// ---- overdue assignments --------------------------------------------------------

export interface OverdueStudent {
  id: string;
  class_id: string;
  roll_number: number | null;
  student: { full_name: string; student_code: string } | null;
}

interface OverdueAssessmentRow {
  id: string;
  title: string;
  class_id: string;
  scheduled_on: string | null;
  subject: { name: string } | null;
  class: { name: string } | null;
}

/**
 * Published assignments ≥ OVERDUE_DAYS past due in `classIds`, with the active
 * students who haven't turned them in. Three scoped reads, then the core join
 * (the same rule the old app's dashboard used).
 */
export async function loadOverdue(
  yearId: string,
  classIds: readonly string[],
  today: string,
): Promise<Result<OverdueCard<OverdueStudent>[]>> {
  if (!supabase) return notConfigured;
  if (!classIds.length) return ok([]);
  const as = await supabase
    .from('assessments')
    .select('id, title, class_id, scheduled_on, subject:subjects(name), class:classes(name)')
    .eq('year_id', yearId)
    .eq('type', 'assignment')
    .eq('status', 'published')
    .in('class_id', classIds)
    .not('scheduled_on', 'is', null)
    .lte('scheduled_on', isoDaysBefore(today, OVERDUE_DAYS))
    .order('scheduled_on', { ascending: true })
    .overrideTypes<OverdueAssessmentRow[], { merge: false }>();
  if (as.error) return fail(as.error);
  const assessments = as.data ?? [];
  if (!assessments.length) return ok([]);

  const classes = [...new Set(assessments.map((a) => a.class_id))];
  const [enr, subs] = await Promise.all([
    supabase
      .from('enrollments')
      .select('id, class_id, roll_number, student:students(full_name, student_code)')
      .eq('year_id', yearId)
      .eq('status', 'active')
      .in('class_id', classes)
      .overrideTypes<OverdueStudent[], { merge: false }>(),
    supabase
      .from('submissions')
      .select('assessment_id, enrollment_id, submitted_at')
      .in(
        'assessment_id',
        assessments.map((a) => a.id),
      ),
  ]);
  if (enr.error) return fail(enr.error);
  if (subs.error) return fail(subs.error);
  return ok(
    buildOverdueDashboard({
      assessments: assessments.map((a) => ({
        id: a.id,
        title: a.title,
        class_id: a.class_id,
        scheduled_on: a.scheduled_on,
        className: a.class?.name ?? '',
        subjectName: a.subject?.name ?? '',
      })),
      enrollments: enr.data ?? [],
      submissions: subs.data ?? [],
      today,
    }),
  );
}

/** Today on this device as YYYY-MM-DD (the school's local date, not UTC). */
export function localToday(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ---- student report card ---------------------------------------------------------

export interface CognitiveRow {
  assessment_id: string;
  marks: number;
  question: { cognitive_level: string | null } | null;
}

/**
 * The cognitive make-up of the student's tests (marks per question + level),
 * from the server's student_paper_levels() (db/018): published or closed tests
 * of the student's own class. Students can't read `questions` directly.
 */
export async function loadCognitive(
  assessmentIds: readonly string[],
): Promise<Result<CognitiveRow[]>> {
  if (!supabase) return notConfigured;
  if (!assessmentIds.length) return ok([]);
  const { data, error } = await supabase
    .rpc('student_paper_levels', { p_assessment_ids: [...assessmentIds] })
    .retry(false);
  if (error) return fail(error);
  return ok(
    (data ?? []).map((r) => ({
      assessment_id: r.assessment_id,
      marks: r.marks,
      question: { cognitive_level: r.cognitive_level },
    })),
  );
}
