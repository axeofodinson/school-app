// Sealing a learner's unsent work at rest (LMS_AUDIT §3.3 "logout before sync
// finishes": the queue stays encrypted in an isolated namespace). A wrapper
// around a ScopedStore that encrypts every value with that learner's key; keys
// stay readable (ids only). The platform supplies the cipher: on the web a
// non-extractable AES-GCM key per learner in IndexedDB; where the platform has
// none (Android, whose app storage is private and encrypted by the OS), values
// are stored as they are. Never loses a write: if sealing fails the value is
// kept unsealed rather than dropped (unsent answers matter more than secrecy
// from the next student, who still can't reach them through the app).
import type { ScopedStore } from '../auth/storage';

/** Encrypts one value; `context` (the storage key) is bound in, so a sealed value can't be moved. */
export interface Cipher {
  seal(plain: string, context: string): Promise<string>;
  open(sealed: string, context: string): Promise<string>;
}

export const SEALED_PREFIX = 'sealed1:';

export function isSealed(raw: string | null): boolean {
  return typeof raw === 'string' && raw.startsWith(SEALED_PREFIX);
}

/**
 * `cipher` is asked for lazily (key lookup is async) and may return null when
 * the platform has no way to seal: then values are stored plainly. Values
 * written before sealing existed are read as they are and sealed on the next write.
 */
export function sealedStore(inner: ScopedStore, cipher: () => Promise<Cipher | null>): ScopedStore {
  const get = () => cipher().catch(() => null);
  return {
    async getItem(key) {
      const raw = await inner.getItem(key);
      if (raw === null || !isSealed(raw)) return raw;
      const c = await get();
      if (!c) return null; // sealed on a device whose key is gone: unreadable
      try {
        return await c.open(raw.slice(SEALED_PREFIX.length), key);
      } catch {
        return null;
      }
    },
    async setItem(key, value) {
      const c = await get();
      let out = value;
      if (c) {
        try {
          out = SEALED_PREFIX + (await c.seal(value, key));
        } catch {
          out = value;
        }
      }
      await inner.setItem(key, out);
    },
    removeItem: (key) => inner.removeItem(key),
    keys: () => inner.keys(),
  };
}
