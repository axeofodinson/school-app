// Per-device settings that belong to no user (ns/device/*). Shared-device mode
// is an admin toggle per device (LMS_AUDIT §3.4). It is a convenience setting,
// not a security control: RLS still decides what each signed-in user can read.
import { deviceStore } from '@school/core';

import { deviceKV, initSessionStorage, setSessionStorageShared } from '../../lib/storage';

const store = deviceStore(deviceKV);
const SHARED_KEY = 'sharedMode';

let current = false;
let loaded: Promise<boolean> | null = null;

/** Read the flag once at start-up and release the session storage. */
export function loadDeviceSettings(): Promise<boolean> {
  loaded ??= store
    .getItem(SHARED_KEY)
    .catch(() => null)
    .then((v) => {
      current = v === '1';
      initSessionStorage(current);
      return current;
    });
  return loaded;
}

export function isSharedMode(): boolean {
  return current;
}

export async function saveSharedMode(on: boolean): Promise<void> {
  await loadDeviceSettings();
  await setSessionStorageShared(on);
  await store.setItem(SHARED_KEY, on ? '1' : '0');
  current = on;
}
