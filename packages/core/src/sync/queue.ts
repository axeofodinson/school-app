// The durable sync queue (LMS_AUDIT §3.3), grown from the old
// src/lib/attemptStore.js pending queue. One queue per user: the app hands in
// that user's queue namespace (auth/storage userQueueStore), which survives
// sign-out and is never read by another user on a shared device.
//
// Each item carries a client UUID that the sender uses as the server row id, and
// a `key` (its identity, e.g. "enrollment:assessment"). Re-queueing the same
// key replaces the payload but KEEPS the id, so a write that already landed
// before its response was lost comes back as a duplicate, never a second row.
//
// Pure helpers first (unit-tested), then createSyncQueue() which persists the
// list after every change and runs the senders.
import type { ScopedStore } from '../auth/storage';
import { classifySendError, type SendError, type SendOutcome } from './errors';
import { uuidv4, type RandomBytes } from './uuid';

export type SyncState = 'pending' | 'rejected';

export interface SyncItem<P = unknown> {
  /** Client UUID; senders use it as the server row's primary key. */
  id: string;
  /** Which sender handles it, e.g. 'submission'. */
  kind: string;
  /** Identity within the kind; re-queueing the same key replaces the payload. */
  key: string;
  payload: P;
  createdAt: number;
  /** Bumped on every payload change (guards against dropping a newer payload mid-send). */
  version: number;
  attempts: number;
  /** Earliest time (ms) of the next try. */
  nextAt: number;
  state: SyncState;
  lastError?: string;
}

export interface BackoffOptions {
  baseMs?: number;
  maxMs?: number;
}
export const BACKOFF_BASE_MS = 2_000;
export const BACKOFF_MAX_MS = 5 * 60_000;

// ---- Pure helpers -------------------------------------------------------------

/**
 * Delay before try number `attempts + 1`: exponential (2 s, 4 s, 8 s … capped at
 * 5 min) with "equal jitter" (half fixed, half random) so 40 lab devices that
 * reconnect together don't retry in lockstep. `rand` is in [0, 1).
 */
export function backoffMs(attempts: number, rand: number, opts: BackoffOptions = {}): number {
  const base = opts.baseMs ?? BACKOFF_BASE_MS;
  const max = opts.maxMs ?? BACKOFF_MAX_MS;
  const n = Math.max(1, Math.floor(attempts));
  const exp = Math.min(max, base * 2 ** Math.min(n - 1, 30));
  const r = Math.min(Math.max(rand, 0), 1);
  return Math.round(exp / 2 + (exp / 2) * r);
}

/** Add an item, or replace the payload of the one with the same kind + key (id kept). */
export function upsertItem<P>(queue: readonly SyncItem<P>[], item: SyncItem<P>): SyncItem<P>[] {
  const i = queue.findIndex((q) => q.kind === item.kind && q.key === item.key);
  if (i === -1) return [...queue, item];
  const prev = queue[i]!;
  const next: SyncItem<P> = {
    ...prev,
    payload: item.payload,
    version: prev.version + 1,
    attempts: 0,
    nextAt: item.nextAt,
    state: 'pending',
  };
  delete next.lastError;
  return queue.map((q, j) => (j === i ? next : q));
}

export function removeItem<P>(queue: readonly SyncItem<P>[], id: string): SyncItem<P>[] {
  return queue.filter((q) => q.id !== id);
}

/** Pending items whose time has come, oldest first. */
export function dueItems<P>(queue: readonly SyncItem<P>[], now: number): SyncItem<P>[] {
  return queue
    .filter((q) => q.state === 'pending' && q.nextAt <= now)
    .sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * Record what happened to one send. ok / duplicate remove the item, unless its
 * payload changed while it was in flight (then it stays, to be sent again).
 * retry backs off; reject keeps it, marked, for a person to see.
 */
export function applyOutcome<P>(
  queue: readonly SyncItem<P>[],
  id: string,
  sentVersion: number,
  outcome: SendOutcome,
  now: number,
  rand: number,
  error?: string,
  opts?: BackoffOptions,
): SyncItem<P>[] {
  const item = queue.find((q) => q.id === id);
  if (!item) return [...queue];
  if (outcome === 'ok' || outcome === 'duplicate') {
    return item.version === sentVersion ? removeItem(queue, id) : [...queue];
  }
  const attempts = item.attempts + 1;
  const next: SyncItem<P> =
    outcome === 'retry'
      ? { ...item, attempts, nextAt: now + backoffMs(attempts, rand, opts) }
      : { ...item, attempts, state: 'rejected' };
  if (error) next.lastError = error;
  return queue.map((q) => (q.id === id ? next : q));
}

/** Rejected items go back to pending (a person tapped "try again"). */
export function requeueRejected<P>(queue: readonly SyncItem<P>[], now: number): SyncItem<P>[] {
  return queue.map((q) =>
    q.state === 'rejected' ? { ...q, state: 'pending', attempts: 0, nextAt: now } : q,
  );
}

export interface QueueSummary {
  pending: number;
  rejected: number;
  /** Earliest nextAt among pending items (null = nothing pending). */
  nextAt: number | null;
}

export function summarize(queue: readonly SyncItem[]): QueueSummary {
  let pending = 0;
  let rejected = 0;
  let nextAt: number | null = null;
  for (const q of queue) {
    if (q.state === 'rejected') rejected++;
    else {
      pending++;
      nextAt = nextAt === null ? q.nextAt : Math.min(nextAt, q.nextAt);
    }
  }
  return { pending, rejected, nextAt };
}

function isItem(x: unknown): x is SyncItem {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.kind === 'string' &&
    typeof o.key === 'string' &&
    'payload' in o &&
    typeof o.createdAt === 'number' &&
    typeof o.nextAt === 'number' &&
    (o.state === 'pending' || o.state === 'rejected')
  );
}

/** Read a stored queue; unreadable storage reads as empty, odd entries are skipped. */
export function parseQueue(raw: string | null): SyncItem[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v.filter(isItem).map((q) => ({
      ...q,
      version: typeof q.version === 'number' ? q.version : 1,
      attempts: typeof q.attempts === 'number' ? q.attempts : 0,
    }));
  } catch {
    return [];
  }
}

// ---- The persisted queue --------------------------------------------------------

export const QUEUE_KEY = 'sync.v1';

/** Sends one item; return an outcome, or throw / return an error to be classified. */
export type Sender = (item: SyncItem) => Promise<SendOutcome | SendError | null>;

export interface FlushResult {
  sent: number;
  duplicates: number;
  retrying: number;
  rejected: number;
  /** Items still on this device after the pass (pending + rejected). */
  remaining: number;
  /** Stopped early because the connection looks down. */
  offline: boolean;
}

export interface SyncQueue {
  enqueue<P>(kind: string, key: string, payload: P): Promise<SyncItem<P>>;
  items(): Promise<SyncItem[]>;
  find(kind: string, key: string): Promise<SyncItem | null>;
  /** Send every due item. Concurrent calls share one pass. `force` ignores backoff. */
  flush(senders: Record<string, Sender>, opts?: { force?: boolean }): Promise<FlushResult>;
  retryRejected(): Promise<void>;
  summary(): Promise<QueueSummary>;
  /** Called after every change; returns an unsubscribe. */
  subscribe(fn: (items: readonly SyncItem[]) => void): () => void;
}

export interface SyncQueueOptions {
  now?: () => number;
  rand?: () => number;
  randomBytes?: RandomBytes;
  backoff?: BackoffOptions;
}

function toOutcome(r: SendOutcome | SendError | null): SendOutcome {
  if (typeof r === 'string') return r;
  return classifySendError(r);
}

function errText(r: unknown): string | undefined {
  if (!r || typeof r !== 'object') return undefined;
  const e = r as SendError;
  return [e.code, e.message].filter(Boolean).join(' ').slice(0, 200) || undefined;
}

export function createSyncQueue(store: ScopedStore, opts: SyncQueueOptions = {}): SyncQueue {
  const now = opts.now ?? Date.now;
  const rand = opts.rand ?? Math.random;
  const listeners = new Set<(items: readonly SyncItem[]) => void>();
  // Serialises read-modify-write so two writers never lose each other's change.
  let lock: Promise<unknown> = Promise.resolve();
  let flushing: Promise<FlushResult> | null = null;

  const read = async () => parseQueue(await store.getItem(QUEUE_KEY));
  function mutate<T>(fn: (q: SyncItem[]) => { next: SyncItem[]; out: T }): Promise<T> {
    const run = lock.then(async () => {
      const { next, out } = fn(await read());
      // Throws when storage is full: the caller must know the write isn't durable.
      await store.setItem(QUEUE_KEY, JSON.stringify(next));
      for (const l of listeners) l(next);
      return out;
    });
    lock = run.catch(() => undefined);
    return run;
  }

  async function pass(senders: Record<string, Sender>, force: boolean): Promise<FlushResult> {
    const res: FlushResult = {
      sent: 0,
      duplicates: 0,
      retrying: 0,
      rejected: 0,
      remaining: 0,
      offline: false,
    };
    const due = force
      ? (await read())
          .filter((q) => q.state === 'pending')
          .sort((a, b) => a.createdAt - b.createdAt)
      : dueItems(await read(), now());
    for (const item of due) {
      const send = senders[item.kind];
      if (!send) continue; // another screen's kind; left for its own sender
      let r: SendOutcome | SendError | null;
      try {
        r = await send(item);
      } catch (e) {
        r = (e ?? { message: 'unknown' }) as SendError;
      }
      const outcome = toOutcome(r);
      await mutate((q) => ({
        next: applyOutcome(
          q,
          item.id,
          item.version,
          outcome,
          now(),
          rand(),
          errText(r),
          opts.backoff,
        ),
        out: null,
      }));
      if (outcome === 'ok') res.sent++;
      else if (outcome === 'duplicate') res.duplicates++;
      else if (outcome === 'reject') res.rejected++;
      else {
        res.retrying++;
        // Connection looks down: nothing else will get through this pass.
        res.offline = true;
        break;
      }
    }
    res.remaining = (await read()).length;
    return res;
  }

  return {
    enqueue<P>(kind: string, key: string, payload: P) {
      return mutate((q) => {
        const t = now();
        const fresh: SyncItem<P> = {
          id: uuidv4(opts.randomBytes),
          kind,
          key,
          payload,
          createdAt: t,
          version: 1,
          attempts: 0,
          nextAt: t,
          state: 'pending',
        };
        const next = upsertItem(q as SyncItem<P>[], fresh);
        const item = next.find((x) => x.kind === kind && x.key === key)!;
        return { next: next as SyncItem[], out: item };
      });
    },
    items: read,
    async find(kind, key) {
      return (await read()).find((q) => q.kind === kind && q.key === key) ?? null;
    },
    flush(senders, o) {
      if (!flushing) {
        flushing = pass(senders, o?.force ?? false).finally(() => {
          flushing = null;
        });
      }
      return flushing;
    },
    retryRejected() {
      return mutate((q) => ({ next: requeueRejected(q, now()), out: undefined }));
    },
    async summary() {
      return summarize(await read());
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
