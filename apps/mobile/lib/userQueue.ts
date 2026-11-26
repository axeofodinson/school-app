// One durable sync queue (packages/core sync) + draft store per user per app
// run, shared by every feature that queues writes (student attempts, teacher
// attendance), so all of them go through one lock on one stored list. The
// namespace is sealed per learner where the platform allows (lib/sealing).
import {
  createDraftStore,
  createSyncQueue,
  sealedStore,
  userQueueStore,
  type DraftStore,
  type ScopedStore,
  type SyncQueue,
} from '@school/core';

import { sealingFor } from './sealing';
import { deviceKV } from './storage';

export interface UserQueueStores {
  queue: SyncQueue;
  drafts: DraftStore;
}

const namespaces = new Map<string, ScopedStore>();
const perUser = new Map<string, UserQueueStores>();

/** This learner's queue namespace (survives sign-out; sealed where possible). */
export function queueNamespace(userId: string): ScopedStore {
  let ns = namespaces.get(userId);
  if (!ns) {
    ns = sealedStore(userQueueStore(deviceKV, userId), sealingFor(userId));
    namespaces.set(userId, ns);
  }
  return ns;
}

export function userQueueStores(userId: string): UserQueueStores {
  let s = perUser.get(userId);
  if (!s) {
    const ns = queueNamespace(userId);
    s = { queue: createSyncQueue(ns), drafts: createDraftStore(ns) };
    perUser.set(userId, s);
  }
  return s;
}
