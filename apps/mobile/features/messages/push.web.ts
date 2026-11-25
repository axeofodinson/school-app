// Web / Chromebook browser: no Expo push (prompt 15). Messages reach the open app
// as a toast over Realtime (MessagesProvider) and sit in the inbox otherwise.
export type PushStatus = 'granted' | 'denied' | 'unsupported' | 'error';

export const PUSH_SUPPORTED = false;

export async function registerPush(): Promise<PushStatus> {
  return 'unsupported';
}

export async function unregisterPush(): Promise<void> {}

export function onNotificationTap(_open: () => void): () => void {
  return () => undefined;
}

export function onForegroundPush(
  _show: (m: { id: string; title: string; body: string }) => void,
): () => void {
  return () => undefined;
}
