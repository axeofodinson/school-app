// The student's durable queue on this device (packages/core sync), and when it
// sends: on start, when the app comes back to the foreground, when the browser
// says it is online again, and when an item's backoff ends. One queue per user
// (their queue namespace survives sign-out; only their next sign-in flushes it).
// Drives the SyncStatusPill: icon + words, never colour alone.
import {
  attemptKey,
  SUBMISSION_KIND,
  type DraftStore,
  type Responses,
  type SubmissionPayload,
  type SyncItem,
} from '@school/core';
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';

import { userQueueStores } from '../../lib/userQueue';
import { useOfflineExamSync } from '../exams/useOfflineExamSync';
import { useQueueRunner } from '../../lib/useQueueRunner';
import type { SyncStatus } from '../../ui';
import { useAuth } from '../auth/AuthProvider';
import { PRACTICE_KIND, sendPracticeAttempt } from '../practice/api';
import { sendSubmission } from './api';

// Practice sets ride along (sent from every student screen). The status pill
// counts everything still on this device: tests, practice sets, and offline
// exams handed in but not sent (prompt 61: sync status visible everywhere).
export const STUDENT_SENDERS = {
  [SUBMISSION_KIND]: sendSubmission,
  [PRACTICE_KIND]: sendPracticeAttempt,
};

export type SubmitResult = 'submitted' | 'queued' | 'rejected' | 'error';

interface AttemptSyncValue {
  drafts: DraftStore | null;
  items: readonly SyncItem[];
  status: SyncStatus;
  pending: number;
  /** Bumps whenever something reached the server (lists reload on it). */
  syncedTick: number;
  flushNow(): Promise<void>;
  submit(enrollmentId: string, assessmentId: string, responses: Responses): Promise<SubmitResult>;
}

const Ctx = createContext<AttemptSyncValue | null>(null);

export function AttemptSyncProvider({ children }: { children: ReactNode }) {
  const { session, queueStorage } = useAuth();
  const userId = session?.user.id ?? null;
  const stores = useMemo(() => (userId ? userQueueStores(userId) : null), [userId]);
  const runner = useQueueRunner(stores?.queue ?? null, STUDENT_SENDERS);
  const { items, syncedTick, flush } = runner;
  const exams = useOfflineExamSync(queueStorage, syncedTick);
  const pending = runner.pending + exams.waiting;
  const status: SyncStatus =
    runner.status === 'idle' || runner.status === 'saved'
      ? exams.waiting > 0
        ? 'offline'
        : exams.justSent
          ? 'saved'
          : runner.status
      : runner.status;
  const runnerFlushNow = runner.flushNow;
  const sendExams = exams.send;
  const flushNow = useCallback(async () => {
    await runnerFlushNow();
    await sendExams();
  }, [runnerFlushNow, sendExams]);

  const submit = useCallback<AttemptSyncValue['submit']>(
    async (enrollmentId, assessmentId, responses) => {
      if (!stores) return 'error';
      const key = attemptKey(enrollmentId, assessmentId);
      const payload: SubmissionPayload = {
        enrollment_id: enrollmentId,
        assessment_id: assessmentId,
        responses,
        submitted_at: new Date().toISOString(),
      };
      try {
        await stores.queue.enqueue(SUBMISSION_KIND, key, payload);
      } catch {
        return 'error'; // storage full: nothing is saved, keep the draft and say so
      }
      // The submission now holds the answers; the draft has done its job.
      await stores.drafts.clear(key).catch(() => undefined);
      await flush(true);
      // A pass already running when we queued didn't include this item: one more.
      let left = await stores.queue.find(SUBMISSION_KIND, key);
      if (left && left.state === 'pending' && left.attempts === 0) {
        await flush(true);
        left = await stores.queue.find(SUBMISSION_KIND, key);
      }
      if (!left) return 'submitted';
      return left.state === 'rejected' ? 'rejected' : 'queued';
    },
    [stores, flush],
  );

  const value = useMemo<AttemptSyncValue>(
    () => ({
      drafts: stores?.drafts ?? null,
      items,
      status,
      pending,
      syncedTick,
      flushNow,
      submit,
    }),
    [stores, items, status, pending, syncedTick, flushNow, submit],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAttemptSync(): AttemptSyncValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAttemptSync must be used inside <AttemptSyncProvider>');
  return v;
}

/** The queued submission for one attempt, if any. */
export function useQueuedAttempt(enrollmentId: string | null, assessmentId: string) {
  const { items } = useAttemptSync();
  if (!enrollmentId) return null;
  const key = attemptKey(enrollmentId, assessmentId);
  return items.find((i) => i.kind === SUBMISSION_KIND && i.key === key) ?? null;
}
