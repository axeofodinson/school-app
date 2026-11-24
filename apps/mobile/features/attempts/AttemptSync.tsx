// The student's durable queue on this device (packages/core sync), and when it
// sends: on start, when the app comes back to the foreground, when the browser
// says it is online again, and when an item's backoff ends. One queue per user
// (their queue namespace survives sign-out; only their next sign-in flushes it).
// Drives the SyncStatusPill: icon + words, never colour alone.
import {
  attemptKey,
  createDraftStore,
  createSyncQueue,
  SUBMISSION_KIND,
  summarize,
  userQueueStore,
  type DraftStore,
  type Responses,
  type SubmissionPayload,
  type SyncItem,
  type SyncQueue,
} from '@school/core';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState, Platform } from 'react-native';

import { deviceKV } from '../../lib/storage';
import type { SyncStatus } from '../../ui';
import { useAuth } from '../auth/AuthProvider';
import { sendSubmission } from './api';

const SENDERS = { [SUBMISSION_KIND]: sendSubmission };
/** Never wait longer than this between automatic tries (native has no "online" event). */
const MAX_WAIT_MS = 60_000;

/** One queue + draft store per user per app run, so every screen shares one lock. */
const perUser = new Map<string, { queue: SyncQueue; drafts: DraftStore }>();
function storesFor(userId: string) {
  let s = perUser.get(userId);
  if (!s) {
    const ns = userQueueStore(deviceKV, userId);
    s = { queue: createSyncQueue(ns), drafts: createDraftStore(ns) };
    perUser.set(userId, s);
  }
  return s;
}

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
  const stores = useMemo(() => (userId ? storesFor(userId) : null), [userId]);
  // Tagged with the stores they came from, so another user's list never shows.
  const [loaded, setLoaded] = useState<{ owner: object; items: readonly SyncItem[] } | null>(null);
  const items = useMemo(
    () => (loaded && stores && loaded.owner === stores ? loaded.items : []),
    [loaded, stores],
  );
  const [flushing, setFlushing] = useState(false);
  const [offline, setOffline] = useState(false);
  const [justSent, setJustSent] = useState(false);
  const [syncedTick, setSyncedTick] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(
    async (force = false) => {
      if (!stores) return;
      setFlushing(true);
      try {
        const r = await stores.queue.flush(SENDERS, { force });
        setOffline(r.offline);
        if (r.sent + r.duplicates > 0) {
          setJustSent(true);
          setSyncedTick((n) => n + 1);
        }
      } finally {
        setFlushing(false);
      }
    },
    [stores],
  );

  // Load + follow the queue; flush once on start.
  useEffect(() => {
    if (!stores) return;
    let live = true;
    const set = (q: readonly SyncItem[]) => live && setLoaded({ owner: stores, items: q });
    stores.queue.items().then(set);
    const off = stores.queue.subscribe(set);
    // Next tick: the first pass's state updates don't belong to this render.
    Promise.resolve()
      .then(() => flush(true))
      .catch(() => undefined);
    return () => {
      live = false;
      off();
    };
  }, [stores, flush]);

  // Foreground / back online → try now, ignoring backoff.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') flush(true).catch(() => undefined);
    });
    let removeOnline = () => {};
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const on = () => flush(true).catch(() => undefined);
      window.addEventListener('online', on);
      removeOnline = () => window.removeEventListener('online', on);
    }
    return () => {
      sub.remove();
      removeOnline();
    };
  }, [flush]);

  // Wake up when the next backoff ends (capped, so a reconnect is noticed within a minute).
  const summary = useMemo(() => summarize(items), [items]);
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (summary.nextAt === null || flushing) return;
    const wait = Math.min(MAX_WAIT_MS, Math.max(1_000, summary.nextAt - Date.now()));
    timer.current = setTimeout(() => flush().catch(() => undefined), wait);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [summary.nextAt, flushing, flush]);

  const flushNow = useCallback(async () => {
    if (!stores) return;
    await stores.queue.retryRejected();
    await flush(true);
  }, [stores, flush]);

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

  let status: SyncStatus = 'idle';
  if (flushing && summary.pending > 0) status = 'syncing';
  else if (summary.rejected > 0) status = 'error';
  else if (summary.pending > 0) status = offline ? 'offline' : 'syncing';
  else if (justSent) status = 'saved';

  const value = useMemo<AttemptSyncValue>(
    () => ({
      drafts: stores?.drafts ?? null,
      items,
      status,
      pending: summary.pending + summary.rejected,
      syncedTick,
      flushNow,
      submit,
    }),
    [stores, items, status, summary.pending, summary.rejected, syncedTick, flushNow, submit],
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
