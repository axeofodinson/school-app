// Generated assessments + live exams (prompt 50, db/020). The draw pool and every
// exam step are RPCs: the server owns the clock, the paper (order and options
// shuffled per student), saves, grading and the join code. Answer keys never
// reach a student. Teachers create the assessment rows through the builder's
// api (RLS), so a draw is just a normal assessment with a blueprint.
import { normaliseBlueprint, type Blueprint, type DrawItem } from '@school/core';

import { classifyError, fail, notConfigured, ok, type Result } from '../../lib/result';
import { supabase } from '../../lib/supabase';
import { isMissingSchema } from '../learn/api';

export type Ready<T> = T | 'notReady';

/** Approved exam-scope items of a subject with this class's recent use. */
export async function loadDrawPool(
  classId: string,
  subjectId: string,
): Promise<Result<Ready<DrawItem[]>>> {
  if (!supabase) return notConfigured;
  const r = await supabase
    .rpc('exam_draw_pool', { p_class: classId, p_subject: subjectId })
    .retry(false);
  if (r.error) return isMissingSchema(r.error) ? ok('notReady') : fail(r.error);
  return ok<Ready<DrawItem[]>>(
    (r.data ?? []).map((x) => ({
      id: x.id,
      version: x.version,
      chapterId: x.chapter_id,
      topicId: x.topic_id,
      difficulty: x.difficulty,
      lastUsedAt: x.last_used_at,
    })),
  );
}

/** The blueprint of the last generated assessment for this class + subject. */
export async function lastBlueprint(classId: string, subjectId: string): Promise<Blueprint | null> {
  if (!supabase) return null;
  const r = await supabase
    .from('assessments')
    .select('blueprint')
    .eq('class_id', classId)
    .eq('subject_id', subjectId)
    .not('blueprint', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
    .retry(false);
  return r.data?.blueprint ? normaliseBlueprint(r.data.blueprint) : null;
}

/** Store the blueprint (and minutes) on a freshly created assessment. */
export async function saveBlueprint(
  assessmentId: string,
  blueprint: Blueprint,
): Promise<Result<true>> {
  if (!supabase) return notConfigured;
  const r = await supabase
    .from('assessments')
    .update({
      blueprint: blueprint as unknown as never,
      duration_seconds: blueprint.minutes * 60,
    })
    .eq('id', assessmentId)
    .select('id');
  if (r.error) return fail(r.error);
  return r.data?.length ? ok(true) : { ok: false, error: 'forbidden' };
}

/** Pin each drawn question's version on the assessment (history is never rewritten). */
export async function pinVersions(
  assessmentId: string,
  picks: readonly { questionId: string; version: number }[],
): Promise<Result<true>> {
  if (!supabase) return notConfigured;
  for (const p of picks) {
    const r = await supabase
      .from('assessment_questions')
      .update({ question_version: p.version })
      .eq('assessment_id', assessmentId)
      .eq('question_id', p.questionId);
    if (r.error) return fail(r.error);
  }
  return ok(true);
}

export type LaunchError = 'notYours' | 'noQuestions' | 'closed' | 'network' | 'unknown';
export interface Launched {
  joinCode: string;
  durationSeconds: number;
}

export async function launchExam(
  assessmentId: string,
  minutes: number | null,
): Promise<{ ok: true; data: Launched } | { ok: false; error: LaunchError }> {
  if (!supabase) return { ok: false, error: 'unknown' };
  const r = await supabase
    .rpc('exam_launch', { p_assessment: assessmentId, p_minutes: minutes ?? undefined })
    .retry(false);
  if (r.error) {
    const m = r.error.message ?? '';
    if (m.includes('not_your_class')) return { ok: false, error: 'notYours' };
    if (m.includes('exam_no_questions')) return { ok: false, error: 'noQuestions' };
    if (m.includes('exam_closed')) return { ok: false, error: 'closed' };
    return { ok: false, error: classifyError(r.error) === 'network' ? 'network' : 'unknown' };
  }
  const d = r.data as { join_code: string; duration_seconds: number };
  return { ok: true, data: { joinCode: d.join_code, durationSeconds: d.duration_seconds } };
}

export async function endExam(assessmentId: string): Promise<Result<number>> {
  if (!supabase) return notConfigured;
  const r = await supabase.rpc('exam_end', { p_assessment: assessmentId }).retry(false);
  if (r.error) return fail(r.error);
  return ok(Number((r.data as { closed_sessions?: number })?.closed_sessions ?? 0));
}

/** A live exam as the teacher sees it on the builder. */
export interface LiveState {
  mode: string;
  joinCode: string | null;
  durationSeconds: number | null;
  opensAt: string | null;
  closesAt: string | null;
  started: number;
  submitted: number;
}

export async function loadLiveState(assessmentId: string): Promise<Result<Ready<LiveState>>> {
  if (!supabase) return notConfigured;
  const [a, s] = await Promise.all([
    supabase
      .from('assessments')
      .select('mode, join_code, duration_seconds, opens_at, closes_at')
      .eq('id', assessmentId)
      .maybeSingle()
      .retry(false),
    supabase.from('exam_sessions').select('status').eq('assessment_id', assessmentId).retry(false),
  ]);
  const err = a.error ?? s.error;
  if (err) return isMissingSchema(err) ? ok('notReady') : fail(err);
  if (!a.data) return { ok: false, error: 'forbidden' };
  const rows = s.data ?? [];
  return ok({
    mode: a.data.mode,
    joinCode: a.data.join_code,
    durationSeconds: a.data.duration_seconds,
    opensAt: a.data.opens_at,
    closesAt: a.data.closes_at,
    started: rows.length,
    submitted: rows.filter((x) => x.status !== 'in_progress').length,
  });
}

// ───────────────────────────── student ─────────────────────────────

export interface LiveExam {
  assessmentId: string;
  title: string;
  subjectName: string | null;
  durationSeconds: number | null;
  sessionStatus: 'in_progress' | 'submitted' | 'auto_submitted' | 'void' | null;
}

export interface FinishedExam {
  assessmentId: string;
  title: string;
  score: number | null;
  total: number | null;
}

export interface ExamOverview {
  live: LiveExam[];
  finished: FinishedExam[];
  /** Exam-mode assessment ids: the Tests list leaves them to this section. */
  examIds: string[];
}

export async function loadExamOverview(classId: string): Promise<Result<Ready<ExamOverview>>> {
  if (!supabase) return notConfigured;
  const db = supabase;
  const [live, ids, mine] = await Promise.all([
    db.rpc('my_live_exams').retry(false),
    db
      .from('assessments')
      .select('id, title')
      .eq('class_id', classId)
      .neq('mode', 'standard')
      .limit(300)
      .retry(false),
    db.from('exam_sessions').select('assessment_id, status, score, total').limit(300).retry(false),
  ]);
  const err = live.error ?? ids.error ?? mine.error;
  if (err) return isMissingSchema(err) ? ok('notReady') : fail(err);
  const liveRows = (live.data ?? []) as unknown as {
    assessment_id: string;
    title: string;
    subject_name: string | null;
    duration_seconds: number | null;
    session_status: LiveExam['sessionStatus'];
  }[];
  const liveIds = new Set(liveRows.map((x) => x.assessment_id));
  const titles = new Map((ids.data ?? []).map((x) => [x.id, x.title]));
  const finished: FinishedExam[] = (mine.data ?? [])
    .filter((x) => x.status !== 'in_progress' && x.status !== 'void' && titles.has(x.assessment_id))
    .filter((x) => !liveIds.has(x.assessment_id) || x.status !== 'in_progress')
    .map((x) => ({
      assessmentId: x.assessment_id,
      title: titles.get(x.assessment_id) ?? '',
      score: x.score == null ? null : Number(x.score),
      total: x.total == null ? null : Number(x.total),
    }));
  const done = new Set(finished.map((f) => f.assessmentId));
  return ok({
    live: liveRows
      .filter((x) => !done.has(x.assessment_id))
      .map((x) => ({
        assessmentId: x.assessment_id,
        title: x.title,
        subjectName: x.subject_name,
        durationSeconds: x.duration_seconds,
        sessionStatus: x.session_status,
      })),
    finished,
    examIds: [...titles.keys()],
  });
}

export type JoinError = 'unknown_code' | 'network' | 'other';
export async function joinExam(
  code: string,
): Promise<{ ok: true; assessmentId: string } | { ok: false; error: JoinError }> {
  if (!supabase) return { ok: false, error: 'other' };
  const r = await supabase.rpc('exam_join', { p_code: code }).retry(false);
  if (r.error) {
    if ((r.error.message ?? '').includes('exam_code_unknown'))
      return { ok: false, error: 'unknown_code' };
    return { ok: false, error: classifyError(r.error) === 'network' ? 'network' : 'other' };
  }
  return { ok: true, assessmentId: (r.data as { assessment_id: string }).assessment_id };
}

export interface ExamQuestion {
  id: string;
  version: number;
  type: string;
  marks: number;
  body: unknown;
}

export interface ExamPaper {
  sessionId: string;
  status: 'in_progress' | 'submitted' | 'auto_submitted' | 'void';
  title: string;
  deadlineAt: string;
  serverNow: string;
  questions: ExamQuestion[];
  answers: Record<string, unknown>;
  score: number | null;
  total: number | null;
}

export type StartError =
  'notOpen' | 'closed' | 'notAvailable' | 'notEnrolled' | 'network' | 'unknown';

export async function startExam(
  assessmentId: string,
): Promise<{ ok: true; data: ExamPaper } | { ok: false; error: StartError }> {
  if (!supabase) return { ok: false, error: 'unknown' };
  const r = await supabase.rpc('start_exam_session', { p_assessment: assessmentId }).retry(false);
  if (r.error) {
    const m = r.error.message ?? '';
    if (m.includes('exam_not_open')) return { ok: false, error: 'notOpen' };
    if (m.includes('exam_closed')) return { ok: false, error: 'closed' };
    if (m.includes('not_enrolled')) return { ok: false, error: 'notEnrolled' };
    if (m.includes('exam_not_available') || isMissingSchema(r.error))
      return { ok: false, error: 'notAvailable' };
    return { ok: false, error: classifyError(r.error) === 'network' ? 'network' : 'unknown' };
  }
  const d = r.data as Record<string, unknown>;
  const qs = (d.questions as Record<string, unknown>[] | null) ?? [];
  return {
    ok: true,
    data: {
      sessionId: String(d.session_id),
      status: d.status as ExamPaper['status'],
      title: String(d.title ?? ''),
      deadlineAt: String(d.deadline_at),
      serverNow: String(d.server_now),
      questions: qs.map((q) => ({
        id: String(q.q),
        version: Number(q.v),
        type: String(q.type),
        marks: Number(q.marks ?? 1),
        body: q.body,
      })),
      answers: (d.answers as Record<string, unknown>) ?? {},
      score: d.score == null ? null : Number(d.score),
      total: d.total == null ? null : Number(d.total),
    },
  };
}

/** 'saved' | 'late' (refused after the deadline) | 'retry' (network; try again). */
export async function saveExamAnswer(
  sessionId: string,
  questionId: string,
  value: string | boolean | null,
  at: number,
): Promise<'saved' | 'late' | 'retry'> {
  if (!supabase) return 'retry';
  const r = await supabase
    .rpc('save_exam_answer', {
      p_session: sessionId,
      p_question: questionId,
      p_answer: value as never,
      p_client_at: new Date(at).toISOString(),
    })
    .retry(false);
  if (r.error) return 'retry';
  return (r.data as { accepted?: boolean })?.accepted ? 'saved' : 'late';
}

export interface ExamResult {
  status: string;
  score: number | null;
  total: number | null;
  questions: number;
  answered: number;
  toMark: number;
}

export async function submitExam(sessionId: string): Promise<Result<ExamResult>> {
  if (!supabase) return notConfigured;
  const r = await supabase.rpc('submit_exam_session', { p_session: sessionId }).retry(false);
  if (r.error) return fail(r.error);
  const d = r.data as Record<string, unknown>;
  return ok({
    status: String(d.status),
    score: d.score == null ? null : Number(d.score),
    total: d.total == null ? null : Number(d.total),
    questions: Number(d.questions ?? 0),
    answered: Number(d.answered ?? 0),
    toMark: Number(d.to_mark ?? 0),
  });
}

export type ExamEventKind = 'blur' | 'hidden' | 'fullscreen_exit' | 'reconnect' | 'resume';

/** Best effort: an integrity signal for the teacher's live view (monitoring, not lockdown). */
export async function logExamEvent(sessionId: string, kind: ExamEventKind): Promise<void> {
  if (!supabase) return;
  await supabase
    .rpc('log_exam_event', { p_session: sessionId, p_kind: kind })
    .retry(false)
    .then(
      () => undefined,
      () => undefined,
    );
}
