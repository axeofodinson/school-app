// Unsent work sealed at rest (prompt 61, TEST_PLAN O-5): a learner's queue
// namespace is encrypted per learner, readable only with that learner's key.
import { describe, expect, it } from 'vitest';

import {
  createDraftStore,
  createSyncQueue,
  isSealed,
  memoryStore,
  QUEUE_KEY,
  sealedStore,
  userQueueStore,
  wipeUserNamespace,
  type Cipher,
} from '../src';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

// A toy cipher per learner (the app uses AES-GCM): reversible only with the
// same secret and context, so wrong keys and moved values fail like GCM does.
function toyCipher(secret: string): Cipher {
  const tag = (ctx: string) => `${secret}|${ctx}|`;
  return {
    seal: async (p, ctx) => Buffer.from(tag(ctx) + p, 'utf8').toString('base64'),
    open: async (s, ctx) => {
      const t = Buffer.from(s, 'base64').toString('utf8');
      if (!t.startsWith(tag(ctx))) throw new Error('bad tag');
      return t.slice(tag(ctx).length);
    },
  };
}

describe('sealed queue namespace', () => {
  it('stores nothing readable; the owner reads it back', async () => {
    const device = memoryStore();
    const ns = sealedStore(userQueueStore(device, A), async () => toyCipher('kA'));
    const q = createSyncQueue(ns);
    await q.enqueue('submission', 'e:a', { q1: 'secret answer' });
    const raw = device.dump()[`ns/u/${A}/queue/${QUEUE_KEY}`]!;
    expect(isSealed(raw)).toBe(true);
    expect(raw).not.toContain('secret answer');
    expect((await q.items())[0]!.payload).toEqual({ q1: 'secret answer' });
  });

  it('O-5: A signs out with unsent work; B on the same device reads nothing; A gets it back', async () => {
    const device = memoryStore();
    const nsA = () => sealedStore(userQueueStore(device, A), async () => toyCipher('kA'));
    await createSyncQueue(nsA()).enqueue('practice_attempt', 'p1', { right: 3 });
    await createDraftStore(nsA()).save('e:b', { q2: 'draft' });
    await wipeUserNamespace(device, A);

    // B's namespace is empty, and A's sealed values don't open with B's key.
    const nsB = sealedStore(userQueueStore(device, B), async () => toyCipher('kB'));
    expect(await createSyncQueue(nsB).items()).toEqual([]);
    const stolen = sealedStore(userQueueStore(device, A), async () => toyCipher('kB'));
    expect(await createSyncQueue(stolen).items()).toEqual([]);
    expect(Object.values(device.dump()).join('')).not.toContain('right');

    // A signs in again on this device: the queue and draft are all there.
    expect(await createSyncQueue(nsA()).items()).toHaveLength(1);
    expect((await createDraftStore(nsA()).load('e:b'))?.value).toEqual({ q2: 'draft' });
  });

  it('a value moved to another key does not open', async () => {
    const device = memoryStore();
    const ns = sealedStore(userQueueStore(device, A), async () => toyCipher('kA'));
    await ns.setItem('one', 'x');
    const raw = await userQueueStore(device, A).getItem('one');
    await userQueueStore(device, A).setItem('two', raw!);
    expect(await ns.getItem('two')).toBeNull();
  });

  it('values from before sealing still read, and are sealed on the next write', async () => {
    const device = memoryStore();
    await userQueueStore(device, A).setItem('old', 'plain');
    const ns = sealedStore(userQueueStore(device, A), async () => toyCipher('kA'));
    expect(await ns.getItem('old')).toBe('plain');
    await ns.setItem('old', 'plain2');
    expect(isSealed(await userQueueStore(device, A).getItem('old'))).toBe(true);
  });

  it('no cipher on this platform (or a failing one): stored plainly, never lost', async () => {
    const device = memoryStore();
    const none = sealedStore(userQueueStore(device, A), async () => null);
    await none.setItem('k', 'v');
    expect(await userQueueStore(device, A).getItem('k')).toBe('v');
    const broken: Cipher = {
      seal: async () => {
        throw new Error('no key');
      },
      open: async () => 'x',
    };
    const failing = sealedStore(userQueueStore(device, A), async () => broken);
    await failing.setItem('k2', 'v2');
    expect(await failing.getItem('k2')).toBe('v2');
    const throwing = sealedStore(userQueueStore(device, A), () => Promise.reject(new Error('x')));
    await throwing.setItem('k3', 'v3');
    expect(await throwing.getItem('k3')).toBe('v3');
  });

  it('a sealed value whose key is gone reads as nothing (not an error)', async () => {
    const device = memoryStore();
    await sealedStore(userQueueStore(device, A), async () => toyCipher('kA')).setItem('k', 'v');
    expect(await sealedStore(userQueueStore(device, A), async () => null).getItem('k')).toBeNull();
    expect(await userQueueStore(device, A).keys()).toEqual(['k']);
  });
});
