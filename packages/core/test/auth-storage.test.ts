import { describe, expect, it } from 'vitest';

import {
  chunkedStore,
  createIdleClock,
  deviceStore,
  memoryStore,
  purgeOtherUsers,
  SHARED_IDLE_TIMEOUT_MS,
  userQueueStore,
  usersWithQueues,
  userStore,
  wipeUserNamespace,
} from '../src/auth';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

describe('per-user storage namespaces', () => {
  it('keeps users apart', async () => {
    const base = memoryStore();
    await userStore(base, A).setItem('draft', 'alpha');
    await userStore(base, B).setItem('draft', 'beta');
    expect(await userStore(base, A).getItem('draft')).toBe('alpha');
    expect(await userStore(base, B).getItem('draft')).toBe('beta');
    expect(await userStore(base, A).keys()).toEqual(['draft']);
  });

  it('rejects user ids that could escape the namespace', () => {
    const base = memoryStore();
    for (const bad of ['', '../x', 'a/b', 'x'.repeat(65), 'a b']) {
      expect(() => userStore(base, bad)).toThrow();
    }
    expect(() => userStore(base, A).getItem('')).toThrow();
  });

  it('sign-out wipe removes the user data but keeps their unsynced queue', async () => {
    const base = memoryStore({ 'app.locale': 'ur' });
    await userStore(base, A).setItem('cache/lesson-1', '{}');
    await userStore(base, A).setItem('profile', 'Ali');
    await userQueueStore(base, A).setItem('0001', '{"answer":3}');
    await userStore(base, B).setItem('profile', 'Sara');
    await deviceStore(base).setItem('sharedMode', '1');

    expect(await wipeUserNamespace(base, A)).toBe(2);

    expect(await userStore(base, A).keys()).toEqual(['queue/0001']);
    expect(await userQueueStore(base, A).getItem('0001')).toBe('{"answer":3}');
    // Other users, device settings and non-namespaced keys are untouched.
    expect(await userStore(base, B).getItem('profile')).toBe('Sara');
    expect(await deviceStore(base).getItem('sharedMode')).toBe('1');
    expect(await base.getItem('app.locale')).toBe('ur');
  });

  it('a queue key only counts under the queue/ segment', async () => {
    const base = memoryStore();
    await userStore(base, A).setItem('queued-thing', 'x'); // not the queue
    await userStore(base, A).setItem('notes/queue/1', 'y'); // not the queue either
    await wipeUserNamespace(base, A);
    expect(base.dump()).toEqual({});
  });

  it('next sign-in purges any leftover data of other users, but not their queues', async () => {
    const base = memoryStore();
    await userStore(base, A).setItem('profile', 'Ali'); // sign-out never finished
    await userQueueStore(base, A).setItem('0001', 'pending');
    await userStore(base, B).setItem('profile', 'Sara');

    expect(await purgeOtherUsers(base, B)).toBe(1);

    expect(await userStore(base, A).keys()).toEqual(['queue/0001']);
    expect(await userStore(base, B).getItem('profile')).toBe('Sara');
    expect(await usersWithQueues(base)).toEqual([A]);
  });

  it('S-1 shape: after switch, the next student sees nothing of the previous one', async () => {
    const base = memoryStore();
    await userStore(base, A).setItem('results', 'A results');
    await userQueueStore(base, A).setItem('q1', 'A answer');
    await wipeUserNamespace(base, A); // switch student
    await purgeOtherUsers(base, B); // B signs in
    const visibleToB = await userStore(base, B).keys();
    expect(visibleToB).toEqual([]);
    // A's queue is only reachable through A's own namespace.
    expect(Object.values(base.dump())).toEqual(['A answer']);
  });
});

describe('chunked secure store', () => {
  it('round-trips values larger than one chunk and cleans up shorter rewrites', async () => {
    const inner = memoryStore();
    const store = chunkedStore(inner, 10);
    const long = 'x'.repeat(35);
    await store.setItem('sb-ref-auth-token', long);
    expect(await store.getItem('sb-ref-auth-token')).toBe(long);
    expect(Object.keys(inner.dump()).length).toBe(5); // 4 chunks + count

    await store.setItem('sb-ref-auth-token', 'short');
    expect(await store.getItem('sb-ref-auth-token')).toBe('short');
    expect(Object.keys(inner.dump()).sort()).toEqual([
      'sb-ref-auth-token.0',
      'sb-ref-auth-token.n',
    ]);

    await store.removeItem('sb-ref-auth-token');
    expect(inner.dump()).toEqual({});
    expect(await store.getItem('sb-ref-auth-token')).toBeNull();
  });

  it('stores the empty string and treats a torn write as no value', async () => {
    const inner = memoryStore();
    const store = chunkedStore(inner, 4);
    await store.setItem('k', '');
    expect(await store.getItem('k')).toBe('');
    await store.setItem('k', 'abcdefgh');
    await inner.removeItem('k.1');
    expect(await store.getItem('k')).toBeNull();
  });

  it('refuses keys SecureStore cannot hold', async () => {
    const store = chunkedStore(memoryStore());
    await expect(store.setItem('bad key/1', 'v')).rejects.toThrow();
  });
});

describe('idle clock', () => {
  it('times out after 10 minutes without activity', () => {
    const c = createIdleClock(SHARED_IDLE_TIMEOUT_MS, 0);
    expect(c.isIdle(SHARED_IDLE_TIMEOUT_MS - 1)).toBe(false);
    c.touch(5 * 60_000);
    expect(c.isIdle(SHARED_IDLE_TIMEOUT_MS)).toBe(false);
    expect(c.remainingMs(SHARED_IDLE_TIMEOUT_MS)).toBe(5 * 60_000);
    expect(c.isIdle(15 * 60_000)).toBe(true);
    expect(c.remainingMs(20 * 60_000)).toBe(0);
  });

  it('ignores out-of-order touches and rejects bad timeouts', () => {
    const c = createIdleClock(1000, 500);
    c.touch(100);
    expect(c.isIdle(1500)).toBe(true);
    expect(() => createIdleClock(0, 0)).toThrow();
  });
});
