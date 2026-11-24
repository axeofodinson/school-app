// In-progress answers, saved on every change so a dropped connection or a killed
// app never loses work (old attemptStore saveDraft/loadDraft). Drafts live in
// the user's queue namespace: like unsent writes, they are that student's work,
// survive a shared-device sign-out (idle logout in the lab) and are never visible
// to the next student (DECISIONS #68).
import type { ScopedStore } from '../auth/storage';

export interface Draft<T> {
  value: T;
  savedAt: number;
}

const PREFIX = 'drafts/';
const SAFE_KEY = /^[A-Za-z0-9:_-]{1,200}$/;

function draftKey(key: string): string {
  if (!SAFE_KEY.test(key)) throw new Error('invalid draft key');
  return PREFIX + key;
}

export interface DraftStore {
  load<T>(key: string): Promise<Draft<T> | null>;
  save<T>(key: string, value: T): Promise<void>;
  clear(key: string): Promise<void>;
  /** Keys of every saved draft. */
  keys(): Promise<string[]>;
}

export function createDraftStore(store: ScopedStore, now: () => number = Date.now): DraftStore {
  return {
    async load<T>(key: string) {
      try {
        const raw = await store.getItem(draftKey(key));
        if (!raw) return null;
        const v = JSON.parse(raw) as Draft<T>;
        return v && typeof v === 'object' && 'value' in v ? v : null;
      } catch {
        return null;
      }
    },
    async save<T>(key: string, value: T) {
      await store.setItem(draftKey(key), JSON.stringify({ value, savedAt: now() }));
    },
    async clear(key) {
      await store.removeItem(draftKey(key));
    },
    async keys() {
      return (await store.keys())
        .filter((k) => k.startsWith(PREFIX))
        .map((k) => k.slice(PREFIX.length));
    },
  };
}
