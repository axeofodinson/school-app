// Offline Learn packs on web (Chromebooks, Windows): IndexedDB, which holds
// many MB where localStorage stops at ~5 MB. One object store, key → string.
// Where IndexedDB is unavailable (private window), everything reads as empty
// and a download reports it couldn't save. Android: packStore.ts.
import type { PackStore } from '@school/core';

const DB = 'learn-packs';
const STORE = 'kv';
let opening: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  if (!opening) {
    opening = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') return reject(new Error('no IndexedDB'));
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error ?? new Error('IndexedDB open failed'));
    });
    opening.catch(() => (opening = null));
  }
  return opening;
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const tx = d.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error ?? new Error('IndexedDB failed'));
        tx.onabort = () => reject(tx.error ?? new Error('IndexedDB aborted'));
      }),
  );
}

export const packStore: PackStore = {
  async get(key) {
    try {
      const v = await run('readonly', (s) => s.get(key));
      return typeof v === 'string' ? v : null;
    } catch {
      return null;
    }
  },
  async put(key, value) {
    await run('readwrite', (s) => s.put(value, key));
  },
  async remove(key) {
    await run('readwrite', (s) => s.delete(key)).catch(() => undefined);
  },
  async keys(prefix) {
    try {
      const range = IDBKeyRange.bound(prefix, prefix + '￿');
      const ks = await run('readonly', (s) => s.getAllKeys(range));
      return ks.map(String);
    } catch {
      return [];
    }
  },
};
