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
import { useQueueRunner } from '../../lib/useQueueRunner';
import type { SyncStatus } from '../../ui';
import { useAuth } from '../auth/AuthProvider';
import { PRACTICE_KIND, sendPracticeAttempt } from '../practice/api';
import { sendSubmission } from './api';

// Practice sets ride along (sent from every student screen), but the tests pill
// counts only test submissions.
const SENDERS = { [SUBMISSION_KIND]: sendSubmission, [PRACTICE_KIND]: sendPracticeAttempt };
const COUNTED = [SUBMISSION_KIND];

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
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const stores = useMemo(() => (userId ? userQueueStores(userId) : null), [userId]);
  const { items, status, pending, syncedTick, flush, flushNow } = useQueueRunner(
    stores?.queue ?? null,
    SENDERS,
    COUNTED,
  );

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
