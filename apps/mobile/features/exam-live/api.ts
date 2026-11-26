// Teacher's live exam + results (prompt 51, db/035). Everything is an RPC that
// checks the teacher teaches this class + subject (or is staff): exam_live for
// the roster, exam_item_analysis for per-question numbers (keys included, so
// never reachable by students), exam_void_session and exam_confirm. Scores reach
// grades only through exam_confirm → record_grade ('Exam result', audited).
//
// Realtime: one channel per open live view, on exam_sessions filtered to this
// assessment (RLS applies). Each change only triggers a throttled refetch of
// exam_live, so 40 students saving answers cost one socket and a few reads.
import type { ItemNumbers, LiveRow } from '@school/core';

import { classifyError, fail, notConfigured, ok, type Result } from '../../lib/result';
import { supabase } from '../../lib/supabase';
import { isMissingSchema } from '../learn/api';

export type Ready<T> = T | 'notReady';

export interface LiveStudent extends LiveRow {
  enrollmentId: string;
  name: string;
  code: string | null;
  sessionId: string | null;
  deadlineAt: string | null;
  submittedAt: string | null;
  score: number | null;
  total: number | null;
  voidReason: string | null;
  answered: number;
  flags: number;
  late: number;
}

export interface ExamLive {
  title: string;
  mode: string;
  status: string;
  joinCode: string | null;
  closesAt: string | null;
  confirmedAt: string | null;
  serverNow: string;
  questions: number;
  totalMarks: number;
  students: LiveStudent[];
}

type Json = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

export function parseLive(d: Json): ExamLive {
  const rows = Array.isArray(d.students) ? (d.students as Json[]) : [];
  return {
    title: str(d.title) ?? '',
    mode: str(d.mode) ?? 'standard',
    status: str(d.status) ?? 'draft',
    joinCode: str(d.join_code),
    closesAt: str(d.closes_at),
    confirmedAt: str(d.confirmed_at),
    serverNow: str(d.server_now) ?? new Date().toISOString(),
    questions: num(d.questions) ?? 0,
    totalMarks: num(d.total_marks) ?? 0,
    students: rows.map((r) => ({
      enrollmentId: str(r.enrollment_id) ?? '',
      name: str(r.student_name) ?? '',
      code: str(r.student_code),
      sessionId: str(r.session_id),
      status: str(r.status),
      startedAt: str(r.started_at),
      lastSeenAt: str(r.last_seen_at),
      deadlineAt: str(r.deadline_at),
      submittedAt: str(r.submitted_at),
      score: num(r.score),
      total: num(r.total),
      voidReason: str(r.void_reason),
      answered: num(r.answered) ?? 0,
      flags: num(r.flags) ?? 0,
      late: num(r.late) ?? 0,
    })),
  };
}

export async function loadExamLive(assessmentId: string): Promise<Result<Ready<ExamLive>>> {
  if (!supabase) return notConfigured;
  const r = await supabase.rpc('exam_live', { p_assessment: assessmentId }).retry(false);
  if (r.error) {
    if (isMissingSchema(r.error)) return ok('notReady');
    if ((r.error.message ?? '').includes('not_your_class'))
      return { ok: false, error: 'forbidden' };
    return fail(r.error);
  }
  return ok<Ready<ExamLive>>(parseLive((r.data ?? {}) as Json));
}

export interface ItemRow extends ItemNumbers {
  questionId: string;
  marks: number;
  type: string;
  body: unknown;
  conceptEn: string | null;
  conceptUr: string | null;
  answered: number;
  toMark: number;
}

export interface ItemAnalysis {
  papers: number;
  items: ItemRow[];
}

export async function loadItemAnalysis(assessmentId: string): Promise<Result<Ready<ItemAnalysis>>> {
  if (!supabase) return notConfigured;
  const r = await supabase.rpc('exam_item_analysis', { p_assessment: assessmentId }).retry(false);
  if (r.error) {
    if (isMissingSchema(r.error)) return ok('notReady');
    if ((r.error.message ?? '').includes('not_your_class'))
      return { ok: false, error: 'forbidden' };
    return fail(r.error);
  }
  const d = (r.data ?? {}) as Json;
  const items = Array.isArray(d.items) ? (d.items as Json[]) : [];
  return ok<Ready<ItemAnalysis>>({
    papers: num(d.papers) ?? 0,
    items: items.map((x) => {
      const choices: Record<string, number> = {};
      if (x.choices && typeof x.choices === 'object') {
        for (const [k, v] of Object.entries(x.choices as Json)) choices[k] = num(v) ?? 0;
      }
      return {
        questionId: str(x.question_id) ?? '',
        marks: num(x.marks) ?? 0,
        type: str(x.type) ?? '',
        body: x.body,
        key: x.key,
        conceptEn: str(x.concept_en),
        conceptUr: str(x.concept_ur),
        answered: num(x.answered) ?? 0,
        correct: num(x.correct) ?? 0,
        toMark: num(x.to_mark) ?? 0,
        papers: num(x.papers) ?? 0,
        choices,
      };
    }),
  });
}

export type ExamActionError =
  'reasonRequired' | 'alreadyConfirmed' | 'stillRunning' | 'forbidden' | 'network' | 'unknown';

function actionError(e: { message?: string; code?: string }): ExamActionError {
  const m = e.message ?? '';
  if (m.includes('reason_required')) return 'reasonRequired';
  if (m.includes('already_confirmed')) return 'alreadyConfirmed';
  if (m.includes('exam_still_running')) return 'stillRunning';
  if (m.includes('not_your_class')) return 'forbidden';
  const k = classifyError(e);
  return k === 'network' || k === 'forbidden' ? k : 'unknown';
}

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: ExamActionError };

export async function voidSession(sessionId: string, reason: string): Promise<ActionResult<true>> {
  if (!supabase) return { ok: false, error: 'unknown' };
  const r = await supabase
    .rpc('exam_void_session', { p_session: sessionId, p_reason: reason })
    .retry(false);
  if (r.error) return { ok: false, error: actionError(r.error) };
  return { ok: true, data: true };
}

export interface Confirmed {
  graded: number;
  followUps: number;
}

export async function confirmExam(assessmentId: string): Promise<ActionResult<Confirmed>> {
  if (!supabase) return { ok: false, error: 'unknown' };
  const r = await supabase.rpc('exam_confirm', { p_assessment: assessmentId }).retry(false);
  if (r.error) return { ok: false, error: actionError(r.error) };
  const d = (r.data ?? {}) as Json;
  return { ok: true, data: { graded: num(d.graded) ?? 0, followUps: num(d.follow_ups) ?? 0 } };
}

/**
 * Hear changes to this exam's sessions. Returns the unsubscribe. The socket
 * evaluates RLS with the JWT it holds, so set it before subscribing.
 */
export function watchExamSessions(assessmentId: string, onChange: () => void): () => void {
  if (!supabase) return () => undefined;
  const client = supabase;
  let cancelled = false;
  let channel: ReturnType<typeof client.channel> | null = null;
  void (async () => {
    const s = await client.auth.getSession().catch(() => null);
    const token = s?.data.session?.access_token;
    if (token) await Promise.resolve(client.realtime.setAuth(token)).catch(() => undefined);
    if (cancelled) return;
    channel = client
      .channel(`exam-live:${assessmentId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'exam_sessions',
          filter: `assessment_id=eq.${assessmentId}`,
        },
        () => onChange(),
      )
      .subscribe();
  })();
  return () => {
    cancelled = true;
    if (channel) void client.removeChannel(channel);
  };
}
