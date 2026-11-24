// Device storage plumbing.
//   deviceKV        AsyncStorage (localStorage on web): device settings + per-user
//                   namespaces (packages/core auth/storage).
//   sessionStorage  where the Supabase session lives: SecureStore on Android
//                   (chunked, values > 2 KB), localStorage on web, and memory only
//                   in shared-device mode (no remembered session).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { chunkedStore, memoryStore, type KeyValueStore, type SimpleStore } from '@school/core';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const isWeb = Platform.OS === 'web';
/** Static web export renders without `window`; storage must not be touched there. */
const hasWindow = typeof window !== 'undefined';

export const deviceKV: KeyValueStore = {
  getItem: (k) => AsyncStorage.getItem(k),
  setItem: (k, v) => AsyncStorage.setItem(k, v),
  removeItem: (k) => AsyncStorage.removeItem(k),
  getAllKeys: () => AsyncStorage.getAllKeys(),
};

const noStore: SimpleStore = {
  getItem: async () => null,
  setItem: async () => undefined,
  removeItem: async () => undefined,
};

const webLocalStorage: SimpleStore = {
  getItem: async (k) => {
    try {
      return window.localStorage.getItem(k);
    } catch {
      return null; // blocked storage (private window): behave as signed out
    }
  },
  setItem: async (k, v) => {
    try {
      window.localStorage.setItem(k, v);
    } catch {
      // Quota / blocked: the session still works for this tab via memory.
    }
  },
  removeItem: async (k) => {
    try {
      window.localStorage.removeItem(k);
    } catch {
      // ignore
    }
  },
};

const secure: SimpleStore = chunkedStore({
  getItem: (k) => SecureStore.getItemAsync(k),
  setItem: (k, v) => SecureStore.setItemAsync(k, v),
  removeItem: (k) => SecureStore.deleteItemAsync(k),
});

/** Where a remembered session lives on this platform. */
const persistent: SimpleStore = isWeb ? (hasWindow ? webLocalStorage : noStore) : secure;
/** Shared mode: the session lives only as long as the app process / tab. */
const volatile = memoryStore();

let shared = false;
let resolveReady: () => void = () => undefined;
const ready = new Promise<void>((r) => (resolveReady = r));
/** Keys Supabase has used, so a mode switch can move or clear them. */
const seen = new Set<string>();

function active(): SimpleStore {
  return shared ? volatile : persistent;
}

/** Supabase `auth.storage`. Waits until the device's shared-mode flag is known. */
export const sessionStorage: SimpleStore = {
  async getItem(k) {
    await ready;
    seen.add(k);
    return active().getItem(k);
  },
  async setItem(k, v) {
    await ready;
    seen.add(k);
    return active().setItem(k, v);
  },
  async removeItem(k) {
    await ready;
    seen.add(k);
    return active().removeItem(k);
  },
};

/** Called once at start-up with the saved flag (before this, session reads wait). */
export function initSessionStorage(sharedMode: boolean): void {
  shared = sharedMode;
  resolveReady();
}

/**
 * Switch where the session is kept. Turning shared mode on moves the current
 * session into memory and deletes the remembered copy, so nothing survives a
 * restart; turning it off keeps the current session in memory until the next
 * sign-in writes it to persistent storage.
 */
export async function setSessionStorageShared(on: boolean): Promise<void> {
  await ready;
  if (on === shared) return;
  if (on) {
    for (const k of seen) {
      const v = await persistent.getItem(k);
      if (v !== null) await volatile.setItem(k, v);
      await persistent.removeItem(k);
    }
  } else {
    for (const k of seen) {
      const v = await volatile.getItem(k);
      if (v !== null) await persistent.setItem(k, v);
      await volatile.removeItem(k);
    }
  }
  shared = on;
}

/** Belt and braces after sign-out: no session copy anywhere on the device. */
export async function clearSessionCopies(): Promise<void> {
  await ready;
  for (const k of seen) {
    await volatile.removeItem(k);
    await persistent.removeItem(k);
  }
}
