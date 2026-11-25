// Student side of assessments (db/005 + db/025 RLS, db/018 RPC): my enrollment
// this year, my class's published assessments, a paper's questions (student_paper(),
// never the answer key; the server marks auto-markable papers on insert),
// my submissions, and the one write: inserting a submission with the queue's
// client UUID as its id. RLS is the boundary; these filters only keep the list tidy.
//
// Reads fall back to the last good copy in the user's namespace when offline,
// so a reopened app still shows the list and the paper (cache/ keys; wiped at sign-out).
import {
  classifySendError,
  submissionRow,
  type AttemptQuestion,
  type ScopedStore,
  type SendOutcome,
  type SubmissionPayload,
  type SyncItem,
} from '@school/core';

import { readCache, writeCache } from '../../lib/cache';
import { supabase } from '../../lib/supabase';
import {
  classifyError,
  fail,
  notConfigured,
  ok,
  type PgError,
  type Result,
} from '../../lib/result';

export interface MyEnrollment {
  id: string;
  classId: string;
  yearId: string;
  className: string;
  yearLabel: string;
}

/** Why there is no enrollment to show tests for. */
export type NoClass = 'noYear' | 'noEnrollment';

export interface StudentAssessment {
  id: string;
  title: string;
  type: string;
  status: 'published' | 'closed';
  subjectName: string;
  totalMarks: number | null;
  scheduledOn: string | null;
  questionCount: number;
  /** Report card inputs (prompt 12). Absent in a device copy saved before 12. */
  subjectId?: string | null;
  weightage?: number;
  /** 'file' worksheets (db/014): the uploaded file to view. */
  file?: { path: string | null; name: string | null; mime: string | null } | null;
}

export interface MySubmission {
  id: string;
  assessmentId: string;
  score: number | null;
  submittedAt: string | null;
  gradedAt: string | null;
}

export interface Home {
  enrollment: MyEnrollment | NoClass;
  assessments: StudentAssessment[];
  submissions: MySubmission[];
  /** Shown from the device copy because the network failed. */
  fromCache: boolean;
}

const HOME_CACHE = 'cache/attempts.home';
const paperCache = (assessmentId: string) => `cache/attempts.paper.${assessmentId}`;

interface EnrollmentRow {
  id: string;
  class_id: string;
  year_id: string;
  class: { name: string } | null;
}
interface AssessmentRow {
  id: string;
  title: string;
  type: string;
  status: string;
  total_marks: number | null;
  scheduled_on: string | null;
  weightage: number | string | null;
  subject_id: string | null;
  file_path: string | null;
  file_name: string | null;
  file_mime: string | null;
  subject: { name: string } | null;
  items: { question_id: string }[] | null;
}
interface SubmissionRow {
  id: string;
  assessment_id: string;
  score: number | string | null;
  submitted_at: string | null;
  graded_at: string | null;
}

function toSubmission(r: SubmissionRow): MySubmission {
  return {
    id: r.id,
    assessmentId: r.assessment_id,
    score: r.score == null ? null : Number(r.score),
    submittedAt: r.submitted_at,
    gradedAt: r.graded_at,
  };
}

/** Throws a PgError so loadHome can tell offline from a real failure. */
async function fetchHome(): Promise<Omit<Home, 'fromCache'>> {
  const db = supabase!;
  const year = await db
    .from('academic_years')
    .select('id, label')
    .eq('is_current', true)
    .maybeSingle()
    // No built-in retries: offline, the device copy shows at once (Retry button otherwise).
    .retry(false);
  if (year.error) throw year.error;
  if (!year.data) return { enrollment: 'noYear', assessments: [], submissions: [] };

  const enr = await db
    .from('enrollments')
    .select('id, class_id, year_id, class:classes(name)')
    .eq('year_id', year.data.id)
    .eq('status', 'active')
    .maybeSingle()
    .retry(false)
    .overrideTypes<EnrollmentRow | null, { merge: false }>();
  if (enr.error) throw enr.error;
  if (!enr.data) return { enrollment: 'noEnrollment', assessments: [], submissions: [] };
  const e = enr.data;

  const [as, subs] = await Promise.all([
    db
      .from('assessments')
      .select(
        'id, title, type, status, total_marks, scheduled_on, weightage, subject_id, ' +
          'file_path, file_name, file_mime, ' +
          'subject:subjects(name), items:assessment_questions(question_id)',
      )
      .eq('class_id', e.class_id)
      .eq('year_id', e.year_id)
      .in('status', ['published', 'closed'])
      .order('created_at', { ascending: false })
      .limit(300)
      .retry(false)
      .overrideTypes<AssessmentRow[], { merge: false }>(),
    db
      .from('submissions')
      .select('id, assessment_id, score, submitted_at, graded_at')
      .eq('enrollment_id', e.id)
      .retry(false)
      .overrideTypes<SubmissionRow[], { merge: false }>(),
  ]);
  if (as.error) throw as.error;
  if (subs.error) throw subs.error;

  return {
    enrollment: {
      id: e.id,
      classId: e.class_id,
      yearId: e.year_id,
      className: e.class?.name ?? '',
      yearLabel: year.data.label,
    },
    assessments: (as.data ?? []).map((a) => ({
      id: a.id,
      title: a.title,
      type: a.type,
      status: a.status === 'closed' ? ('closed' as const) : ('published' as const),
      subjectName: a.subject?.name ?? '',
      totalMarks: a.total_marks,
      scheduledOn: a.scheduled_on,
      questionCount: a.items?.length ?? 0,
      subjectId: a.subject_id,
      weightage: Number(a.weightage ?? 0),
      file: a.type === 'file' ? { path: a.file_path, name: a.file_name, mime: a.file_mime } : null,
    })),
    submissions: (subs.data ?? []).map(toSubmission),
  };
}

/** Enrollment + assessments + submissions; the device copy when offline. */
export async function loadHome(cache: ScopedStore | null): Promise<Result<Home>> {
  if (!supabase) return notConfigured;
  try {
    const home = await fetchHome();
    await writeCache(cache, HOME_CACHE, home);
    return ok({ ...home, fromCache: false });
  } catch (e) {
    const kind = classifyError(e as PgError);
    if (kind === 'network') {
      const cached = await readCache<Omit<Home, 'fromCache'>>(cache, HOME_CACHE);
      if (cached) return ok({ ...cached, fromCache: true });
    }
    return fail(e as PgError);
  }
}

export interface Paper {
  questions: AttemptQuestion[];
  fromCache: boolean;
}

/**
 * A paper's questions in order, from the server's student_paper() (db/018).
 * Students can't read `questions` (answer keys) any more; the function returns
 * id, type, body and marks only, for a published paper of their own class.
 */
export async function loadPaper(
  assessmentId: string,
  cache: ScopedStore | null,
): Promise<Result<Paper>> {
  if (!supabase) return notConfigured;
  const { data, error } = await supabase
    .rpc('student_paper', { p_assessment_id: assessmentId })
    .retry(false);
  if (!error) {
    const questions: AttemptQuestion[] = (data ?? []).map((r) => ({
      id: r.question_id,
      type: r.type,
      body: r.body,
      marks: r.marks,
    }));
    await writeCache(cache, paperCache(assessmentId), questions);
    return ok({ questions, fromCache: false });
  }
  if (classifyError(error) === 'network') {
    const cached = await readCache<AttemptQuestion[]>(cache, paperCache(assessmentId));
    if (cached) return ok({ questions: cached, fromCache: true });
  }
  return fail(error);
}

/**
 * The queue's sender for 'submission' items. Plain insert (no select back), so
 * a retry of a row that already landed hits the client-UUID primary key or the
 * (enrollment, assessment) unique key and reads as a duplicate: exactly one row.
 */
export async function sendSubmission(item: SyncItem): Promise<SendOutcome> {
  if (!supabase) return 'retry';
  try {
    const { error } = await supabase
      .from('submissions')
      .insert(submissionRow(item as SyncItem<SubmissionPayload>));
    return classifySendError(error);
  } catch (e) {
    return classifySendError(e as PgError);
  }
}
