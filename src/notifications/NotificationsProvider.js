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

import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
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

  const [messages, setMessages] = useState([]);
  const [lastReadAt, setLastReadAt] = useState(null);
  // 'unknown' until we've read the OS setting; then granted/denied/undetermined.
  const [permission, setPermission] = useState('unknown');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);

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
