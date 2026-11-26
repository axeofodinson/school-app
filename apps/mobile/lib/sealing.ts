// Native (Android, incl. Chromebooks via Play Store): no cipher. App storage is
// private to the app and encrypted by the OS (file-based encryption); the
// per-user namespace keeps students apart inside the app. See sealing.web.ts.
import type { Cipher } from '@school/core';

export function sealingFor(_userId: string): () => Promise<Cipher | null> {
  return async () => null;
}
