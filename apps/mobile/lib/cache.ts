// Device copies of server reads, in the signed-in user's namespace (cache/ keys,
// wiped at sign-out). Unreadable or full storage behaves as "no copy".
import type { ScopedStore } from '@school/core';

export async function readCache<T>(store: ScopedStore | null, key: string): Promise<T | null> {
  if (!store) return null;
  try {
    const raw = await store.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function writeCache(store: ScopedStore | null, key: string, value: unknown) {
  if (!store) return;
  await store.setItem(key, JSON.stringify(value)).catch(() => undefined);
}
