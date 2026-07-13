// Push registration — turns OS notification permission + an Expo push token
// into a row in public.push_tokens for the signed-in student.
//
// The message row (public.messages) is always the durable record; push is
// best-effort delivery on top. So everything here fails soft: no permission, no
// network, not a real device — we return a status and never throw into the UI.
// The in-app inbox still shows the message next time the app opens.
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';

import { supabase } from './supabase';

// How the app treats a notification that arrives while it is FOREGROUNDED.
// The OS banner is suppressed on purpose: the in-app themed toast
// (src/notifications/Toast.js, fed by addNotificationReceivedListener in
// NotificationsProvider) is the foreground surface now, and showing both
// would double-bang the same message. Sound still plays so it's audible
// mid-use. Background/killed delivery is untouched — that stays the OS tray.
// Registered at module load so it's set before any notification can arrive.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: false,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// The EAS project id the Expo push service keys tokens to. Pulled from the
// bundled Expo config (app.json extra.eas.projectId).
function getProjectId() {
  return (
    Constants?.expoConfig?.extra?.eas?.projectId ??
    Constants?.easConfig?.projectId ??
    null
  );
}

// A compact, non-identifying description of the device, stored alongside the
// token so staff can tell a student's phones apart and so we know which OEMs
// need the battery-optimization nudge.
function deviceInfo() {
  return {
    os: Platform.OS,
    osVersion: Device.osVersion ?? null,
    brand: Device.brand ?? null,
    manufacturer: Device.manufacturer ?? null,
    modelName: Device.modelName ?? null,
  };
}

// Ensure an Android notification channel exists. Android drops notifications
// with no channel; iOS ignores this. Safe to call every launch.
async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'School messages',
      importance: Notifications.AndroidImportance.DEFAULT,
      lightColor: '#55a049',
    });
  } catch {
    // Non-fatal — channel setup failing just means default handling.
  }
}

// Register this device for push and upsert its token for `studentId`.
//
// Returns one of:
//   { status: 'granted', token }   — permission on, token stored (or attempted)
//   { status: 'denied' }           — OS permission is off → caller shows inbox-only
//   { status: 'undetermined' }     — couldn't ask / not asked yet
//   { status: 'unsupported' }      — simulator / no push hardware
//   { status: 'error' }            — token fetch or upsert failed (offline etc.)
//
// Never throws. Idempotent: re-registering the same install upserts on the
// unique token, refreshing device_info and clearing any stale disabled_at.
export async function registerForPushNotifications(studentId) {
  if (!studentId) return { status: 'undetermined' };

  // Push tokens only exist on real hardware; a simulator has none.
  if (!Device.isDevice) return { status: 'unsupported' };

  await ensureAndroidChannel();

  // Read current permission; ask only if it hasn't been decided yet, so we
  // never re-prompt a user who already said no (that's the inbox's job).
  let settings;
  try {
    settings = await Notifications.getPermissionsAsync();
    if (settings.status === 'undetermined') {
      settings = await Notifications.requestPermissionsAsync();
    }
  } catch {
    return { status: 'error' };
  }

  if (settings.status !== 'granted') {
    return { status: settings.status === 'denied' ? 'denied' : 'undetermined' };
  }

  // Permission is on — get the Expo push token.
  let token;
  try {
    const projectId = getProjectId();
    const result = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    token = result?.data;
  } catch {
    return { status: 'error' };
  }
  if (!token) return { status: 'error' };

  // Upsert on the unique token: a returning device refreshes its row (and, if it
  // was previously marked dead, comes back to life) instead of duplicating.
  try {
    const { error } = await supabase
      .from('push_tokens')
      .upsert(
        {
          student_id: studentId,
          token,
          device_info: deviceInfo(),
          disabled_at: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'token' }
      );
    if (error) return { status: 'error', token };
  } catch {
    return { status: 'error', token };
  }

  return { status: 'granted', token };
}

// Re-read the OS permission without asking for it. Used when the app returns to
// the foreground, so an inbox-only student who enabled notifications in Settings
// gets registered without a re-prompt.
export async function getNotificationPermissionStatus() {
  try {
    const settings = await Notifications.getPermissionsAsync();
    return settings.status; // 'granted' | 'denied' | 'undetermined'
  } catch {
    return 'undetermined';
  }
}
