// Android push registration (prompt 15). Expo push token -> public.push_tokens
// (db/010). Fails soft: no permission, no network, an emulator or a build without
// Firebase set up all return a status; the message is in the inbox regardless.
// The web build has no push (push.web.ts); it gets Realtime toasts instead.
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from '../../lib/supabase';

export type PushStatus = 'granted' | 'denied' | 'unsupported' | 'error';

export const PUSH_SUPPORTED = Platform.OS === 'android';

/** This app run registered a token for the signed-in student (so sign-out switches it off). */
let registered = false;

// A push that arrives while the app is open is shown by the in-app toast
// (MessagesProvider), so the OS banner is suppressed for the foreground.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

async function ensureChannel() {
  // Android drops notifications that name no existing channel.
  await Notifications.setNotificationChannelAsync('messages', {
    name: 'School messages',
    importance: AndroidImportance.HIGH,
  });
}

/** Ask for permission (once) and store this install's token for the signed-in student. */
export async function registerPush(): Promise<PushStatus> {
  if (!PUSH_SUPPORTED || !supabase || !Device.isDevice) return 'unsupported';
  try {
    await ensureChannel();
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      ({ status } = await Notifications.requestPermissionsAsync());
    }
    if (status !== 'granted') return 'denied';
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    if (!projectId) return 'error';
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    // db/029: the token is assigned to the signed-in student, also when this
    // install was last used by another student (shared device).
    const { error } = await supabase.rpc('register_push_token', {
      p_token: token,
      p_device_info: {
        os: Platform.OS,
        osVersion: Device.osVersion,
        brand: Device.brand,
        model: Device.modelName,
      },
    });
    registered = !error;
    return error ? 'error' : 'granted';
  } catch {
    return 'error';
  }
}

/** Stop pushing to this install for the signed-out student (shared Chromebooks / phones). */
export async function unregisterPush(): Promise<void> {
  if (!registered || !supabase) return;
  registered = false;
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    if (!projectId) return;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await supabase.rpc('disable_push_token', { p_token: token });
  } catch {
    // Best effort.
  }
}

/** Tapping a notification (app in the background or closed) opens the inbox. */
export function onNotificationTap(open: () => void): () => void {
  if (!PUSH_SUPPORTED) return () => undefined;
  const sub = Notifications.addNotificationResponseReceivedListener(() => open());
  // Cold start from a tap.
  Notifications.getLastNotificationResponseAsync()
    .then((r) => {
      if (r) open();
    })
    .catch(() => undefined);
  return () => sub.remove();
}

/** A push that arrives while the app is open (shown as a toast, not an OS banner). */
export function onForegroundPush(
  show: (m: { id: string; title: string; body: string }) => void,
): () => void {
  if (!PUSH_SUPPORTED) return () => undefined;
  const sub = Notifications.addNotificationReceivedListener((n) => {
    const c = n.request.content;
    const id = (c.data as { messageId?: unknown } | null)?.messageId;
    if (typeof id === 'string') show({ id, title: c.title ?? '', body: c.body ?? '' });
  });
  return () => sub.remove();
}
