// One durable sync queue (packages/core sync) + draft store per user per app
// run, shared by every feature that queues writes (student attempts, teacher
// attendance), so all of them go through one lock on one stored list.
import {
  createDraftStore,
  createSyncQueue,
  userQueueStore,
  type DraftStore,
  type SyncQueue,
} from '@school/core';

import { deviceKV } from './storage';

export interface UserQueueStores {
  queue: SyncQueue;
  drafts: DraftStore;
}

const perUser = new Map<string, UserQueueStores>();

export function userQueueStores(userId: string): UserQueueStores {
  let s = perUser.get(userId);
  if (!s) {
    const ns = userQueueStore(deviceKV, userId);
    s = { queue: createSyncQueue(ns), drafts: createDraftStore(ns) };
    perUser.set(userId, s);
  }
  return s;
}
