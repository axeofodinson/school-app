// Per-user storage namespaces for shared devices (LMS_AUDIT §3.4, CLAUDE.md
// "per-user storage namespaces, nothing leaks between students").
//
// One device-wide key-value store (AsyncStorage on Android, localStorage on web)
// is split into:
//   ns/device/<key>           device settings (shared mode, motion, language)
//   ns/u/<userId>/<key>       one learner's cache and drafts
//   ns/u/<userId>/queue/<key> that learner's unsynced writes (the sync queue)
// Signing out wipes the user's namespace EXCEPT the queue, which stays isolated
// under that user id: only that user's next sign-in on this device sees it.
// Pure TS: the app passes its platform store in; tests pass memoryStore().

/** The subset of AsyncStorage this module needs. */
export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  /** Every key in the store (AsyncStorage.getAllKeys). */
  getAllKeys(): Promise<readonly string[]>;
}

/** A scoped view: keys are relative to the namespace. */
export interface ScopedStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

export const NS_ROOT = 'ns/';
export const DEVICE_PREFIX = `${NS_ROOT}device/`;
export const USER_PREFIX = `${NS_ROOT}u/`;
/** Sub-namespace that survives sign-out (the per-user sync queue). */
export const QUEUE_SEGMENT = 'queue/';

/** User ids are Supabase uuids; anything else could escape its namespace. */
const USER_ID = /^[A-Za-z0-9-]{1,64}$/;

export function assertUserId(userId: string): void {
  if (!USER_ID.test(userId)) throw new Error('invalid user id for a storage namespace');
}

function assertKey(key: string): void {
  if (!key) throw new Error('storage key must not be empty');
}

export function userPrefix(userId: string): string {
  assertUserId(userId);
  return `${USER_PREFIX}${userId}/`;
}

function scoped(base: KeyValueStore, prefix: string): ScopedStore {
  return {
    getItem: (key) => {
      assertKey(key);
      return base.getItem(prefix + key);
    },
    setItem: (key, value) => {
      assertKey(key);
      return base.setItem(prefix + key, value);
    },
    removeItem: (key) => {
      assertKey(key);
      return base.removeItem(prefix + key);
    },
    keys: async () =>
      (await base.getAllKeys())
        .filter((k) => k.startsWith(prefix))
        .map((k) => k.slice(prefix.length)),
  };
}

/** Storage for one signed-in user. Use this for anything that belongs to a learner. */
export function userStore(base: KeyValueStore, userId: string): ScopedStore {
  return scoped(base, userPrefix(userId));
}

/** That user's sync queue (survives sign-out; never read by another user). */
export function userQueueStore(base: KeyValueStore, userId: string): ScopedStore {
  return scoped(base, userPrefix(userId) + QUEUE_SEGMENT);
}

/** Device-wide settings that belong to no user. */
export function deviceStore(base: KeyValueStore): ScopedStore {
  return scoped(base, DEVICE_PREFIX);
}

function isQueueKey(key: string): boolean {
  if (!key.startsWith(USER_PREFIX)) return false;
  const rest = key.slice(USER_PREFIX.length);
  const slash = rest.indexOf('/');
  return slash > 0 && rest.slice(slash + 1).startsWith(QUEUE_SEGMENT);
}

async function removeAll(base: KeyValueStore, keys: readonly string[]): Promise<number> {
  for (const k of keys) await base.removeItem(k);
  return keys.length;
}

/**
 * Sign-out wipe: removes everything in the user's namespace except their queue.
 * Returns how many keys were removed.
 */
export async function wipeUserNamespace(base: KeyValueStore, userId: string): Promise<number> {
  const prefix = userPrefix(userId);
  const doomed = (await base.getAllKeys()).filter((k) => k.startsWith(prefix) && !isQueueKey(k));
  return removeAll(base, doomed);
}

/**
 * Shared-device safety net, run at every sign-in: if an earlier sign-out never
 * finished (app killed, tab closed, idle logout while offline), remove every
 * OTHER user's non-queue data so the new user cannot see it.
 */
export async function purgeOtherUsers(base: KeyValueStore, currentUserId: string): Promise<number> {
  const mine = userPrefix(currentUserId);
  const doomed = (await base.getAllKeys()).filter(
    (k) => k.startsWith(USER_PREFIX) && !k.startsWith(mine) && !isQueueKey(k),
  );
  return removeAll(base, doomed);
}

/** User ids that still hold an unsynced queue on this device. */
export async function usersWithQueues(base: KeyValueStore): Promise<string[]> {
  const ids = new Set<string>();
  for (const k of await base.getAllKeys()) {
    if (!isQueueKey(k)) continue;
    const rest = k.slice(USER_PREFIX.length);
    ids.add(rest.slice(0, rest.indexOf('/')));
  }
  return [...ids].sort();
}

/** In-memory store: tests, and the session store in shared-device mode. */
export function memoryStore(initial: Record<string, string> = {}): KeyValueStore & {
  dump(): Record<string, string>;
} {
  const map = new Map(Object.entries(initial));
  return {
    getItem: async (k) => map.get(k) ?? null,
    setItem: async (k, v) => {
      map.set(k, v);
    },
    removeItem: async (k) => {
      map.delete(k);
    },
    getAllKeys: async () => [...map.keys()],
    dump: () => Object.fromEntries(map),
  };
}
