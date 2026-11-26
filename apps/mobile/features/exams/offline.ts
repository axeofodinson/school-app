// Offline exams on the device (prompt 60, db/038). The downloaded paper (no
// answers), the device clock and the answers live in the student's QUEUE
// namespace, which survives sign-out (an idle sign-out on a shared Chromebook
// must not lose an exam) and is never visible to another student. One upload
// at the end, retried until the server answers; the same upload id every time,
// so a retry is free.
import {
  stopClock,
  tickClock,
  uploadAnswers,
  type ExamValue,
  type OfflineClock,
  type OfflineVerdict,
  type ScopedStore,
  uuidv4,
} from '@school/core';

import { classifyError } from '../../lib/result';
import { supabase } from '../../lib/supabase';
import { isMissingSchema } from '../learn/api';
import type { ExamQuestion } from './api';

const PREFIX = 'offexam/';
const key = (assessmentId: string) => `${PREFIX}${assessmentId}`;

export interface OfflineUploadResult {
  verdict: OfflineVerdict;
  score: number | null;
  total: number | null;
  questions: number;
  answered: number;
  toMark: number;
}

export interface OfflineExamCopy {
  assessmentId: string;
  sessionId: string;
  title: string;
  questions: ExamQuestion[];
  durationMs: number;
  graceMs: number;
  /** The window's end (ISO): download here, take it any time before. */
  closesAt: string;
  downloadedAt: string;
  clock: OfflineClock | null;
  answers: Record<string, ExamValue>;
  /** Times the student left the app while taking it (monitoring only). */
  hidden?: number;
  /** Made when the paper is finished; the same id on every retry. */
  uploadId: string | null;
  result: OfflineUploadResult | null;
}

/** This app run (monotonic readings only compare within one run). */
export const RUN_ID = uuidv4();
export const monoNow = () =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

export async function readOffline(
  store: ScopedStore | null,
  assessmentId: string,
): Promise<OfflineExamCopy | null> {
  if (!store) return null;
  try {
    const raw = await store.getItem(key(assessmentId));
    return raw ? (JSON.parse(raw) as OfflineExamCopy) : null;
  } catch {
    return null;
  }
}

export async function writeOffline(store: ScopedStore | null, copy: OfflineExamCopy) {
  if (!store) return;
  await store.setItem(key(copy.assessmentId), JSON.stringify(copy)).catch(() => undefined);
}

/** Every offline exam saved on this device for this student. */
export async function listOffline(store: ScopedStore | null): Promise<OfflineExamCopy[]> {
  if (!store) return [];
  const keys = (await store.keys().catch(() => [] as string[])).filter((k) => k.startsWith(PREFIX));
  const out: OfflineExamCopy[] = [];
  for (const k of keys) {
    const c = await readOffline(store, k.slice(PREFIX.length));
    if (c) out.push(c);
  }
  return out;
}

export async function removeOffline(store: ScopedStore | null, assessmentId: string) {
  await store?.removeItem(key(assessmentId)).catch(() => undefined);
}

/** Move the clock to now (and stop it when asked). */
export function clockNow(c: OfflineExamCopy, stop = false): OfflineExamCopy {
  if (!c.clock) return c;
  const f = stop ? stopClock : tickClock;
  return { ...c, clock: f(c.clock, Date.now(), monoNow(), RUN_ID) };
}

export type DownloadError =
  'notOpen' | 'closed' | 'notAvailable' | 'notEnrolled' | 'network' | 'unknown';

/** While online: the paper without answers, kept on this device. */
export async function downloadOffline(
  store: ScopedStore | null,
  assessmentId: string,
): Promise<{ ok: true; copy: OfflineExamCopy } | { ok: false; error: DownloadError }> {
  if (!supabase) return { ok: false, error: 'unknown' };
  const r = await supabase
    .rpc('exam_offline_download', { p_assessment: assessmentId })
    .retry(false);
  if (r.error) {
    const m = r.error.message ?? '';
    if (m.includes('exam_not_open')) return { ok: false, error: 'notOpen' };
    if (m.includes('exam_closed')) return { ok: false, error: 'closed' };
    if (m.includes('not_enrolled')) return { ok: false, error: 'notEnrolled' };
    if (m.includes('exam_not_available') || isMissingSchema(r.error))
      return { ok: false, error: 'notAvailable' };
    return { ok: false, error: classifyError(r.error) === 'network' ? 'network' : 'unknown' };
  }
  const d = r.data as unknown as Record<string, unknown>;
  const prev = await readOffline(store, assessmentId);
  const qs = (d.questions as Record<string, unknown>[] | null) ?? [];
  const copy: OfflineExamCopy = {
    assessmentId,
    sessionId: String(d.session_id),
    title: String(d.title ?? ''),
    questions: qs.map((q) => ({
      id: String(q.q),
      version: Number(q.v),
      type: String(q.type),
      marks: Number(q.marks ?? 1),
      body: q.body,
    })),
    durationMs: Number(d.duration_seconds ?? 3600) * 1000,
    graceMs: Number(d.grace_seconds ?? 30) * 1000,
    closesAt: String(d.deadline_at ?? d.closes_at),
    downloadedAt: new Date().toISOString(),
    // A copy already on this device keeps its clock and answers (same session).
    clock: prev?.sessionId === String(d.session_id) ? prev.clock : null,
    answers: prev?.sessionId === String(d.session_id) ? prev.answers : {},
    uploadId: prev?.sessionId === String(d.session_id) ? prev.uploadId : null,
    result: null,
  };
  // Already handed in or closed on the server: nothing to take.
  if (d.status !== 'in_progress' && !copy.questions.length) {
    return { ok: false, error: 'closed' };
  }
  await writeOffline(store, copy);
  return { ok: true, copy };
}

/** 'retry' = no answer from the server yet (offline); try again later. */
export async function uploadOffline(
  c: OfflineExamCopy,
  deviceId?: string,
): Promise<OfflineUploadResult | 'retry' | 'refused'> {
  if (!supabase || !c.clock || !c.uploadId) return 'retry';
  const r = await supabase
    .rpc('exam_offline_submit', {
      p_upload: c.uploadId,
      p_session: c.sessionId,
      p_answers: uploadAnswers(c.answers) as never,
      p_elapsed_ms: Math.round(c.clock.elapsedMs),
      p_started_at: new Date(c.clock.startedAt).toISOString(),
      p_finished_at: new Date(c.clock.stoppedAt ?? Date.now()).toISOString(),
      p_device: deviceId,
      p_flags: { hidden: c.hidden ?? 0, clock_back: c.clock.anomalies } as never,
    })
    .retry(false);
  if (r.error) return classifyError(r.error) === 'network' ? 'retry' : 'refused';
  const d = r.data as unknown as Record<string, unknown>;
  return {
    verdict: d.verdict as OfflineVerdict,
    score: d.score == null ? null : Number(d.score),
    total: d.total == null ? null : Number(d.total),
    questions: Number(d.questions ?? 0),
    answered: Number(d.answered ?? 0),
    toMark: Number(d.to_mark ?? 0),
  };
}

/** Send every finished, unsent offline exam on this device (Tests tab, reconnect). */
export async function flushOffline(store: ScopedStore | null): Promise<number> {
  let sent = 0;
  for (const c of await listOffline(store)) {
    if (c.result || !c.uploadId || !c.clock?.stoppedAt) continue;
    const r = await uploadOffline(c);
    if (r === 'retry') break; // still offline: stop here
    if (r === 'refused') continue;
    await writeOffline(store, { ...c, result: r });
    sent++;
  }
  return sent;
}
