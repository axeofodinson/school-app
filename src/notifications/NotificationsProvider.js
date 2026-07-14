// NotificationsProvider — the student app's messaging layer.
//
// Two jobs, both student-only (staff/teacher accounts have no student_id and are
// a no-op here):
//   1. Register this device for push on launch (and re-check when the app comes
//      back to the foreground, so a student who enables notifications in Settings
//      gets picked up without a re-prompt).
//   2. Back the in-app inbox: load the messages RLS says this student may see
//      (school / their class / them), cache them for offline, and track how many
//      are unread via a locally-stored "last read" timestamp.
//
// The inbox is the fallback the task calls for: if OS notification permission is
// denied (or the push never arrived), the message is still here next app open.
// Reads are cache-first so the bell/badge paint instantly and offline.
//
// Live delivery while the app is OPEN goes through the in-app toast (two
// sources, one banner):
//   * foreground push  — Notifications.addNotificationReceivedListener
//   * Supabase Realtime — INSERT on public.messages (db/012 adds the table to
//     the realtime publication; RLS still decides who receives which rows)
// Both dispatch through useToast(); the toast queue dedupes by message id, so
// a message that arrives on both paths shows exactly one banner.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { useToast } from './ToastProvider';
import { t } from '../i18n';
import {
  registerForPushNotifications,
  getNotificationPermissionStatus,
} from '../lib/push';

const NotificationsContext = createContext(null);

// Per-student storage keys — a shared device could host more than one student
// login over time, so the cache and read-marker are namespaced by student id.
const messagesKey = (sid) => `inbox.messages.${sid}`;
const lastReadKey = (sid) => `inbox.lastReadAt.${sid}`;

// How many messages are newer than the last time the student opened the inbox.
function countUnread(messages, lastReadAt) {
  if (!lastReadAt) return messages.length;
  const cutoff = new Date(lastReadAt).getTime();
  return messages.filter((m) => new Date(m.created_at).getTime() > cutoff).length;
}

export function NotificationsProvider({ children }) {
  const { studentId, session } = useAuth();
  const { showToast } = useToast();

  const [messages, setMessages] = useState([]);
  const [lastReadAt, setLastReadAt] = useState(null);
  // 'unknown' until we've read the OS setting; then granted/denied/undetermined.
  const [permission, setPermission] = useState('unknown');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  // Bumped when a toast is tapped; the student home watches it and opens the
  // inbox. A counter (not a boolean) so every tap fires, even back-to-back.
  const [inboxRequest, setInboxRequest] = useState(0);

  const appState = useRef(AppState.currentState);

  // ---- Cache-first load of this student's messages ----
  const loadFromCache = useCallback(async (sid) => {
    try {
      const [rawMsgs, rawRead] = await Promise.all([
        AsyncStorage.getItem(messagesKey(sid)),
        AsyncStorage.getItem(lastReadKey(sid)),
      ]);
      if (rawMsgs) setMessages(JSON.parse(rawMsgs));
      if (rawRead) setLastReadAt(rawRead);
    } catch {
      // Corrupt/empty cache — fall through to the network read.
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!studentId) return;
    setLoading(true);
    setLoadError(false);
    const { data, error } = await supabase
      .from('messages')
      .select('id, scope, target_id, title, body, created_at')
      .order('created_at', { ascending: false })
      .limit(100);
    setLoading(false);
    if (error) {
      setLoadError(true); // keep whatever the cache gave us
      return;
    }
    const rows = data ?? [];
    setMessages(rows);
    try {
      await AsyncStorage.setItem(messagesKey(studentId), JSON.stringify(rows));
    } catch {
      // Cache write failure is non-fatal; state is still updated in memory.
    }
  }, [studentId]);

  // Register for push + read permission. Kept separate so foregrounding can
  // re-run it cheaply.
  const syncPush = useCallback(async () => {
    if (!studentId) return;
    const result = await registerForPushNotifications(studentId);
    if (result.status === 'granted') setPermission('granted');
    else if (result.status === 'denied') setPermission('denied');
    else {
      // unsupported / undetermined / error — reflect the raw OS setting.
      setPermission(await getNotificationPermissionStatus());
    }
  }, [studentId]);

  // Boot for a student session: cache → network → push registration.
  useEffect(() => {
    if (!studentId) {
      setMessages([]);
      setLastReadAt(null);
      setPermission('unknown');
      return;
    }
    let active = true;
    (async () => {
      await loadFromCache(studentId);
      if (!active) return;
      refresh();
      syncPush();
    })();
    return () => {
      active = false;
    };
    // session id in deps so a re-login as a different student re-boots the inbox.
  }, [studentId, session?.user?.id, loadFromCache, refresh, syncPush]);

  // On return to the foreground, refresh messages and re-check push permission.
  useEffect(() => {
    if (!studentId) return undefined;
    const sub = AppState.addEventListener('change', (next) => {
      const wasBackground = appState.current.match(/inactive|background/);
      appState.current = next;
      if (wasBackground && next === 'active') {
        refresh();
        syncPush();
      }
    });
    return () => sub.remove();
  }, [studentId, refresh, syncPush]);

  // ---- Live delivery → in-app toast ----

  // Tap-to-navigate: the toast layer is global but screen switching is local
  // state on the student home, so we signal instead of navigating directly.
  const requestInbox = useCallback(() => {
    setInboxRequest((n) => n + 1);
  }, []);

  // One dispatch for both live sources. Dedupe by message id happens inside
  // the toast queue, so push + Realtime for the same row = one banner.
  const toastMessage = useCallback(
    ({ id, title, body }) => {
      showToast({
        id: id ? `msg:${id}` : undefined,
        title: title || t('common.toast.newMessage'),
        body: body || '',
        icon: '🔔',
        onPress: requestInbox,
      });
    },
    [showToast, requestInbox]
  );

  // Drop a just-arrived row straight into the inbox state + cache, so the
  // badge and list are already correct when the student opens them — no
  // second network round-trip for a row we're holding.
  const absorbMessage = useCallback(
    (row) => {
      if (!row?.id) return;
      setMessages((prev) => {
        if (prev.some((m) => m.id === row.id)) return prev;
        const next = [
          {
            id: row.id,
            scope: row.scope,
            target_id: row.target_id ?? null,
            title: row.title,
            body: row.body,
            created_at: row.created_at,
          },
          ...prev,
        ];
        AsyncStorage.setItem(messagesKey(studentId), JSON.stringify(next)).catch(
          () => {} // cache write failure is non-fatal, state already updated
        );
        return next;
      });
    },
    [studentId]
  );

  // Source 1: a push arriving while the app is FOREGROUNDED. This listener is
  // what makes foreground pushes visible at all — without it they sat silently
  // in the tray until tapped. The OS banner is suppressed for foreground
  // (src/lib/push.js) because this toast is now that surface.
  useEffect(() => {
    if (!studentId) return undefined;
    const sub = Notifications.addNotificationReceivedListener((notification) => {
      const content = notification?.request?.content;
      if (!content) return;
      toastMessage({
        id: content.data?.messageId ?? null,
        title: content.title,
        body: content.body,
      });
      // The row is already in the DB (push follows the insert) — refresh so
      // the inbox/badge agree with the banner.
      refresh();
    });
    return () => sub.remove();
  }, [studentId, toastMessage, refresh]);

  // Source 2: Supabase Realtime on public.messages. This is the
  // permission-INDEPENDENT path — it fires while the app is open no matter what
  // the OS notification setting is, which is what makes the in-app toast work
  // when push can't reach the device (permission denied, simulator, Expo Go).
  //
  // Realtime evaluates the messages RLS AS THE CONNECTED USER, so the socket
  // must carry this student's JWT or every INSERT is filtered out and the
  // subscription silently receives nothing. supabase-js pushes the token to the
  // socket on SIGNED_IN / TOKEN_REFRESHED, but NOT when a session is merely
  // restored from storage on launch (that's INITIAL_SESSION, which the auth
  // client handles separately — see AuthProvider). Without this, a returning
  // student's socket sits on the anon key and no toast ever arrives. Set it
  // explicitly, and re-run when the access token changes so it stays current.
  useEffect(() => {
    if (!studentId) return undefined;
    const token = session?.access_token;
    if (token) {
      // setAuth resolves to a promise in some versions; we don't need its
      // result and must not let a rejection surface as unhandled.
      Promise.resolve(supabase.realtime.setAuth(token)).catch(() => {});
    }
    const channel = supabase
      .channel(`inbox-messages-${studentId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const row = payload?.new;
          if (!row?.id) return;
          toastMessage({ id: row.id, title: row.title, body: row.body });
          absorbMessage(row);
        }
      )
      .subscribe((status, err) => {
        console.log('[Realtime] messages channel status:', status, err ?? '');
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [studentId, session?.access_token, toastMessage, absorbMessage]);

  // Mark everything up to now as read — call when the inbox is opened.
  const markAllRead = useCallback(async () => {
    if (!studentId) return;
    const now = new Date().toISOString();
    setLastReadAt(now);
    try {
      await AsyncStorage.setItem(lastReadKey(studentId), now);
    } catch {
      // Non-fatal; the in-memory marker still clears the badge this session.
    }
  }, [studentId]);

  const value = {
    messages,
    unreadCount: countUnread(messages, lastReadAt),
    lastReadAt,
    loading,
    loadError,
    permission,
    isStudent: !!studentId,
    refresh,
    markAllRead,
    // Toast tap → open inbox signal (see requestInbox above).
    inboxRequest,
  };

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error('useNotifications must be used within a NotificationsProvider');
  }
  return ctx;
}
