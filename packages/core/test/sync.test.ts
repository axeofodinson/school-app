// The durable queue (LMS_AUDIT §3.3). Carries the old attemptStore behaviour
// (de-dupe on enrollment+assessment, duplicates count as success, offline keeps
// the item, hard errors are kept not dropped) plus client UUIDs, backoff and the
// per-user namespace. The "kill the app" cases rebuild the queue from storage.
import { describe, expect, it } from 'vitest';

import {
  applyOutcome,
  backoffMs,
  BACKOFF_MAX_MS,
  classifySendError,
  createDraftStore,
  createSyncQueue,
  dueItems,
  isConflictError,
  isNetworkError,
  isUuid,
  memoryStore,
  parseQueue,
  QUEUE_KEY,
  removeItem,
  requeueRejected,
  summarize,
  upsertItem,
  userQueueStore,
  userStore,
  uuidv4,
  wipeUserNamespace,
  type Sender,
  type SyncItem,
} from '../src';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

function item(over: Partial<SyncItem> = {}): SyncItem {
  return {
    id: 'id-1',
    kind: 'submission',
    key: 'e1:a1',
    payload: { n: 1 },
    createdAt: 1000,
    version: 1,
    attempts: 0,
    nextAt: 1000,
    state: 'pending',
    ...over,
  };
}

describe('error classification (old attemptStore cases)', () => {
  it.each([
    [{ name: 'AuthRetryableFetchError' }, true],
    [{ status: 0 }, true],
    [{ message: 'Network request failed' }, true],
    [{ message: 'TypeError: Failed to fetch' }, true],
    [{ message: 'request timeout' }, true],
    [{ message: 'connect ECONNREFUSED' }, true],
    [{ message: 'Load failed' }, true],
    [{ message: 'new row violates row-level security policy', code: '42501' }, false],
    [null, false],
  ])('isNetworkError(%j) = %s', (e, want) => expect(isNetworkError(e)).toBe(want));

  it.each([
    [{ code: '23505' }, true],
    [{ status: 409 }, true],
    [{ message: 'duplicate key value violates unique constraint' }, true],
    [{ message: 'already exists' }, true],
    [{ code: '42501' }, false],
    [undefined, false],
  ])('isConflictError(%j) = %s', (e, want) => expect(isConflictError(e)).toBe(want));

  it.each([
    [null, 'ok'],
    [{ code: '23505', status: 409 }, 'duplicate'],
    [{ message: 'Failed to fetch' }, 'retry'],
    [{ status: 503, message: 'Service Unavailable' }, 'retry'],
    [{ status: 429 }, 'retry'],
    [{ status: 401, code: 'PGRST301', message: 'JWT expired' }, 'retry'],
    [{ status: 403, code: '42501', message: 'row-level security' }, 'reject'],
    [{ status: 400, code: '23514', message: 'check constraint' }, 'reject'],
    [
      { name: 'TypeError', message: "Cannot read properties of undefined (reading 'id')" },
      'reject',
    ],
  ])('classifySendError(%j) = %s', (e, want) => expect(classifySendError(e)).toBe(want));
});

describe('client UUIDs', () => {
  it('are v4 and distinct', () => {
    const ids = new Set(Array.from({ length: 200 }, () => uuidv4()));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(isUuid(id)).toBe(true);
    expect(uuidv4()[14]).toBe('4');
  });
  it('fall back to Math.random without Web Crypto', () => {
    const id = uuidv4((n) => new Uint8Array(n).fill(255));
    expect(id).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
    expect(isUuid('not-a-uuid')).toBe(false);
  });
});

describe('backoff', () => {
  it('doubles from 2 s with equal jitter, capped at 5 min', () => {
    expect(backoffMs(1, 0)).toBe(1000);
    expect(backoffMs(1, 0.999999)).toBe(2000);
    expect(backoffMs(2, 1)).toBe(4000);
    expect(backoffMs(3, 0.5)).toBe(6000);
    expect(backoffMs(30, 1)).toBe(BACKOFF_MAX_MS);
    expect(backoffMs(1000, 0)).toBe(BACKOFF_MAX_MS / 2);
  });
  it('never returns less than half the step (no lockstep, no hammering)', () => {
    for (let n = 1; n < 12; n++) {
      expect(backoffMs(n, 0)).toBeGreaterThanOrEqual(backoffMs(n, 1) / 2);
    }
  });
  it('is tolerant of odd input', () => {
    expect(backoffMs(0, -5)).toBe(1000);
    expect(backoffMs(1, 7, { baseMs: 100, maxMs: 150 })).toBe(100);
  });
});

describe('pure queue helpers', () => {
  it('re-submitting the same attempt never queues it twice: latest payload, same id', () => {
    let q = upsertItem([], item());
    q = upsertItem(q, item({ id: 'id-2', key: 'e1:a2' }));
    q = upsertItem(q, item({ id: 'id-3', payload: { n: 2 }, nextAt: 5000 }));
    expect(q).toHaveLength(2);
    expect(q[0]).toMatchObject({ id: 'id-1', payload: { n: 2 }, version: 2, nextAt: 5000 });
  });
  it('the same key in another kind is a different item', () => {
    const q = upsertItem([item()], item({ id: 'x', kind: 'practice' }));
    expect(q).toHaveLength(2);
  });
  it('re-queueing a rejected item makes it pending again', () => {
    const q = upsertItem([item({ state: 'rejected', attempts: 3, lastError: 'x' })], item());
    expect(q[0]).toMatchObject({ state: 'pending', attempts: 0 });
    expect(q[0]!.lastError).toBeUndefined();
  });
  it('removeItem / dueItems', () => {
    const q = [
      item({ id: 'late', createdAt: 3, nextAt: 9000 }),
      item({ id: 'b', key: 'k2', createdAt: 2 }),
      item({ id: 'a', key: 'k3', createdAt: 1 }),
      item({ id: 'r', key: 'k4', state: 'rejected' }),
    ];
    expect(dueItems(q, 5000).map((x) => x.id)).toEqual(['a', 'b']);
    expect(removeItem(q, 'b').map((x) => x.id)).toEqual(['late', 'a', 'r']);
  });
  it('applyOutcome: ok and duplicate remove; retry backs off; reject keeps it', () => {
    const q = [item()];
    expect(applyOutcome(q, 'id-1', 1, 'ok', 0, 0)).toEqual([]);
    expect(applyOutcome(q, 'id-1', 1, 'duplicate', 0, 0)).toEqual([]);
    const r = applyOutcome(q, 'id-1', 1, 'retry', 10_000, 0, 'offline');
    expect(r[0]).toMatchObject({
      attempts: 1,
      nextAt: 11_000,
      state: 'pending',
      lastError: 'offline',
    });
    const j = applyOutcome(q, 'id-1', 1, 'reject', 10_000, 0, '42501');
    expect(j[0]).toMatchObject({ state: 'rejected', attempts: 1, lastError: '42501' });
    expect(applyOutcome(q, 'missing', 1, 'ok', 0, 0)).toEqual(q);
  });
  it('a payload changed during the send is not dropped by the old send’s success', () => {
    const q = [item({ version: 2 })];
    expect(applyOutcome(q, 'id-1', 1, 'ok', 0, 0)).toHaveLength(1);
  });
  it('requeueRejected + summarize', () => {
    const q = [item({ nextAt: 50 }), item({ id: 'b', key: 'b', state: 'rejected', nextAt: 1 })];
    expect(summarize(q)).toEqual({ pending: 1, rejected: 1, nextAt: 50 });
    expect(summarize(requeueRejected(q, 7))).toEqual({ pending: 2, rejected: 0, nextAt: 7 });
    expect(summarize([])).toEqual({ pending: 0, rejected: 0, nextAt: null });
  });
  it('parseQueue survives junk', () => {
    expect(parseQueue(null)).toEqual([]);
    expect(parseQueue('{oops')).toEqual([]);
    expect(parseQueue('{"a":1}')).toEqual([]);
    const legacy = { ...item() } as Partial<SyncItem>;
    delete legacy.version;
    const parsed = parseQueue(JSON.stringify([legacy, { id: 1 }, null]));
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.version).toBe(1);
  });
});

/** A fake server: one row per (key), like submissions' unique(enrollment, assessment). */
function fakeServer() {
  const rows = new Map<string, { id: string; payload: unknown }>();
  let online = true;
  let loseResponses = false;
  const send: Sender = async (it) => {
    if (!online) return { message: 'Failed to fetch' };
    if (rows.has(it.key)) return { code: '23505', message: 'duplicate key value' };
    rows.set(it.key, { id: it.id, payload: it.payload });
    if (loseResponses) throw new TypeError('Network request failed'); // landed, reply lost
    return null;
  };
  return {
    rows,
    send,
    setOnline: (v: boolean) => (online = v),
    setLoseResponses: (v: boolean) => (loseResponses = v),
  };
}

function clock(start = 0) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe('createSyncQueue', () => {
  it('airplane mode: answer, kill app, reopen, reconnect → exactly one row', async () => {
    const device = memoryStore();
    const server = fakeServer();
    const c = clock(1000);
    server.setOnline(false);

    // Session 1: submit while offline.
    let q = createSyncQueue(userQueueStore(device, A), { now: c.now, rand: () => 0 });
    const queued = await q.enqueue('submission', 'e1:a1', { answers: 3 });
    let r = await q.flush({ submission: server.send });
    expect(r).toMatchObject({ sent: 0, retrying: 1, offline: true, remaining: 1 });
    // Tapping submit again offline still holds one item (and tries again now).
    await q.enqueue('submission', 'e1:a1', { answers: 3 });
    expect(await q.items()).toHaveLength(1);
    expect((await q.flush({ submission: server.send })).retrying).toBe(1);

    // Kill the app: a brand-new queue object over the same device storage.
    q = createSyncQueue(userQueueStore(device, A), { now: c.now, rand: () => 0 });
    expect((await q.items())[0]!.id).toBe(queued.id);

    // Reconnect, but before backoff ends: nothing is sent yet.
    server.setOnline(true);
    r = await q.flush({ submission: server.send });
    expect(r.sent).toBe(0);
    c.advance(60_000);
    r = await q.flush({ submission: server.send });
    expect(r).toMatchObject({ sent: 1, remaining: 0 });
    expect(server.rows.size).toBe(1);
    expect(server.rows.get('e1:a1')!.id).toBe(queued.id);

    // Another flush (another tab / device wake-up) does nothing.
    r = await q.flush({ submission: server.send }, { force: true });
    expect(r).toMatchObject({ sent: 0, remaining: 0 });
    expect(server.rows.size).toBe(1);
  });

  it('a lost response is retried and comes back as a duplicate: still one row', async () => {
    const device = memoryStore();
    const server = fakeServer();
    const c = clock();
    const q = createSyncQueue(userQueueStore(device, A), { now: c.now, rand: () => 0 });
    await q.enqueue('submission', 'e1:a1', {});
    server.setLoseResponses(true);
    expect((await q.flush({ submission: server.send })).retrying).toBe(1);
    server.setLoseResponses(false);
    c.advance(10_000);
    const r = await q.flush({ submission: server.send });
    expect(r).toMatchObject({ duplicates: 1, remaining: 0 });
    expect(server.rows.size).toBe(1);
  });

  it('a hard refusal (RLS) is kept and shown, never silently dropped', async () => {
    const q = createSyncQueue(memoryStore() && userQueueStore(memoryStore(), A));
    await q.enqueue('submission', 'e1:other-class', {});
    const deny: Sender = async () => ({
      status: 403,
      code: '42501',
      message: 'row-level security',
    });
    const r = await q.flush({ submission: deny });
    expect(r).toMatchObject({ rejected: 1, remaining: 1 });
    expect(await q.summary()).toMatchObject({ pending: 0, rejected: 1 });
    // Rejected items aren't retried automatically…
    expect((await q.flush({ submission: deny }, { force: true })).rejected).toBe(0);
    // …only when someone asks.
    await q.retryRejected();
    expect(await q.summary()).toMatchObject({ pending: 1, rejected: 0 });
  });

  it('offline stops the pass early; hard errors do not', async () => {
    const q = createSyncQueue(userQueueStore(memoryStore(), A), { now: () => 0 });
    await q.enqueue('submission', 'k1', 1);
    await q.enqueue('submission', 'k2', 2);
    await q.enqueue('submission', 'k3', 3);
    const seen: string[] = [];
    const send: Sender = async (it) => {
      seen.push(it.key);
      if (it.key === 'k1') return 'reject';
      if (it.key === 'k2') return 'retry';
      return 'ok';
    };
    const r = await q.flush({ submission: send });
    expect(seen).toEqual(['k1', 'k2']);
    expect(r).toMatchObject({ rejected: 1, retrying: 1, offline: true, remaining: 3 });
  });

  it('a thrown sender error is classified; unknown kinds are left alone', async () => {
    const q = createSyncQueue(userQueueStore(memoryStore(), A), { now: () => 0 });
    await q.enqueue('practice', 'p1', 1);
    await q.enqueue('submission', 's1', 1);
    const r = await q.flush({
      submission: async () => {
        throw { status: 400, code: '22P02', message: 'invalid input' };
      },
    });
    expect(r).toMatchObject({ rejected: 1, remaining: 2 });
    const items = await q.items();
    const practice = items.find((x) => x.kind === 'practice')!;
    expect(practice.state).toBe('pending');
    // Skipped kinds are pushed back so a nextAt-driven timer doesn't spin on them.
    expect(practice.nextAt).toBe(BACKOFF_MAX_MS);
    expect(items.find((x) => x.kind === 'submission')!.lastError).toBe('22P02 invalid input');
  });

  it('concurrent flushes share one pass (no double send)', async () => {
    const q = createSyncQueue(userQueueStore(memoryStore(), A));
    await q.enqueue('submission', 'k', 1);
    let calls = 0;
    const send: Sender = async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 5));
      return null;
    };
    const [a, b] = await Promise.all([
      q.flush({ submission: send }),
      q.flush({ submission: send }),
    ]);
    expect(calls).toBe(1);
    expect(a).toBe(b);
  });

  it('concurrent enqueues are not lost', async () => {
    const q = createSyncQueue(userQueueStore(memoryStore(), A));
    await Promise.all(Array.from({ length: 20 }, (_, i) => q.enqueue('submission', `k${i}`, i)));
    expect(await q.items()).toHaveLength(20);
  });

  it('notifies subscribers on change', async () => {
    const q = createSyncQueue(userQueueStore(memoryStore(), A));
    const sizes: number[] = [];
    const off = q.subscribe((items) => sizes.push(items.length));
    await q.enqueue('submission', 'k', 1);
    await q.flush({ submission: async () => null });
    off();
    await q.enqueue('submission', 'k2', 1);
    expect(sizes).toEqual([1, 0]);
  });

  it('full storage fails the enqueue loudly (the caller must not claim it is saved)', async () => {
    const base = memoryStore();
    const store = userQueueStore(base, A);
    const broken = { ...store, setItem: async () => Promise.reject(new Error('QuotaExceeded')) };
    const q = createSyncQueue(broken);
    await expect(q.enqueue('submission', 'k', 1)).rejects.toThrow('QuotaExceeded');
    // The queue still works afterwards (the lock is not poisoned).
    const ok = createSyncQueue(store);
    await ok.enqueue('submission', 'k', 1);
    expect(await ok.items()).toHaveLength(1);
  });
});

describe('per-user namespace on a shared device', () => {
  it('one student never sees another’s queue or drafts; sign-out keeps both for the owner', async () => {
    const device = memoryStore();
    const qa = createSyncQueue(userQueueStore(device, A));
    await qa.enqueue('submission', 'ea:x', { who: 'A' });
    await createDraftStore(userQueueStore(device, A)).save('ea:y', { q1: 'B' });
    await userStore(device, A).setItem('cache/questions', '[]');

    const qb = createSyncQueue(userQueueStore(device, B));
    expect(await qb.items()).toEqual([]);
    expect(await createDraftStore(userQueueStore(device, B)).keys()).toEqual([]);

    await wipeUserNamespace(device, A); // A signs out
    expect(await userStore(device, A).getItem('cache/questions')).toBeNull();
    expect(await createSyncQueue(userQueueStore(device, A)).items()).toHaveLength(1);
    expect(await createDraftStore(userQueueStore(device, A)).load('ea:y')).toMatchObject({
      value: { q1: 'B' },
    });
    expect(await device.getItem(`ns/u/${A}/queue/${QUEUE_KEY}`)).not.toBeNull();
  });
});

describe('drafts', () => {
  it('save / load / clear / keys, with a timestamp', async () => {
    const d = createDraftStore(userQueueStore(memoryStore(), A), () => 42);
    expect(await d.load('e1:a1')).toBeNull();
    await d.save('e1:a1', { q1: 'A', q2: true });
    expect(await d.load('e1:a1')).toEqual({ value: { q1: 'A', q2: true }, savedAt: 42 });
    expect(await d.keys()).toEqual(['e1:a1']);
    await d.clear('e1:a1');
    expect(await d.load('e1:a1')).toBeNull();
  });
  it('rejects keys that could escape the drafts folder', async () => {
    const d = createDraftStore(userQueueStore(memoryStore(), A));
    await expect(d.save('../x', 1)).rejects.toThrow('invalid draft key');
  });
  it('a corrupt draft reads as none', async () => {
    const s = userQueueStore(memoryStore(), A);
    await s.setItem('drafts/k', '{bad');
    expect(await createDraftStore(s).load('k')).toBeNull();
  });
});
