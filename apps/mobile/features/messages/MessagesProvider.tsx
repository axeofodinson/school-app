// The student's messaging layer (prompt 15), mounted on every student screen:
//   * the inbox (cache-first, server read state, opens offline),
//   * a Realtime subscription on public.messages that shows a toast the moment a
//     message arrives. It runs ONLY while the app is in the foreground (a closed
//     or hidden app has push on Android and catches up with a refresh on return),
//   * Android push registration and "tap a notification -> inbox".
// RLS decides which messages this student receives, on the socket too.
import { mergeInbox, unreadIds, type InboxMessage } from '@school/core';
import { useRouter } from 'expo-router';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';

import { supabase } from '../../lib/supabase';
import { useToast } from '../../ui';
import { useAuth } from '../auth/AuthProvider';
import { absorbMessage, loadInbox, markRead } from './api';
import { onForegroundPush, onNotificationTap, registerPush, type PushStatus } from './push';

interface MessagesValue {
  messages: readonly InboxMessage[];
  readIds: ReadonlySet<string>;
  unreadCount: number;
  loading: boolean;
  /** The server could not be reached; showing the copy on this device. */
  offline: boolean;
  /** Nothing loaded and no copy to show. */
  failed: boolean;
  /** Android only: whether notifications can reach this phone. */
  push: PushStatus | 'pending';
  refresh(): Promise<void>;
  markAllRead(): Promise<void>;
  markOneRead(id: string): Promise<void>;
  /** Exam screens hold message toasts (the message still lands in the inbox). */
  holdToasts(hold: boolean): void;
}

const Ctx = createContext<MessagesValue | null>(null);

const toastText = (m: { title: string; body: string }) => {
  const body = m.body.replace(/\s+/g, ' ').trim();
  return `${m.title}: ${body.length > 120 ? `${body.slice(0, 119)}…` : body}`;
};

export function MessagesProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  // A different student (shared device) starts from a clean inbox.
  return <Inbox key={session?.user.id ?? 'none'}>{children}</Inbox>;
}

function Inbox({ children }: { children: ReactNode }) {
  const { session, userStorage } = useAuth();
  const uid = session?.user.id ?? null;
  const token = session?.access_token ?? null;
  const router = useRouter();
  const toast = useToast();
  const toastRef = useRef(toast);
  const holdRef = useRef(false);
  const tokenRef = useRef(token);
  /** Ids already shown or loaded: push + Realtime for one row is one toast. */
  const seenRef = useRef(new Set<string>());
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [readIds, setReadIds] = useState<ReadonlySet<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [failed, setFailed] = useState(false);
  const [push, setPush] = useState<PushStatus | 'pending'>('pending');
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  useEffect(() => {
    toastRef.current = toast;
    tokenRef.current = token;
  });

  const apply = useCallback((r: Awaited<ReturnType<typeof loadInbox>>) => {
    setLoading(false);
    if (!r.ok) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setOffline(r.data.fromCache);
    r.data.messages.forEach((m) => seenRef.current.add(m.id));
    // The server's list is the truth; a device copy only adds to what is shown.
    const fresh = r.data.messages;
    setMessages((prev) => (r.data.fromCache ? mergeInbox(prev, fresh) : fresh));
    setReadIds(new Set([...r.data.readIds, ...r.data.pendingReads]));
  }, []);

  const refresh = useCallback(async () => {
    if (uid) apply(await loadInbox(userStorage));
  }, [uid, userStorage, apply]);

  useEffect(() => {
    if (!uid) return;
    let live = true;
    loadInbox(userStorage).then((r) => live && apply(r));
    return () => {
      live = false;
    };
  }, [uid, userStorage, apply]);

  // Foreground tracking: refresh on return (catches what push/Realtime missed).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      const active = s === 'active';
      setForeground(active);
      if (active) void refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  // One arrival path for Realtime and a foreground push: toast once, add to the list.
  const arrive = useCallback(
    (msg: InboxMessage) => {
      if (seenRef.current.has(msg.id)) return;
      seenRef.current.add(msg.id);
      if (!holdRef.current) toastRef.current(toastText(msg));
      setMessages((prev) => mergeInbox(prev, [msg]));
      void absorbMessage(msg, userStorage);
    },
    [userStorage],
  );

  // Android push: register once per sign-in; tapping a notification opens the inbox.
  useEffect(() => {
    if (!uid) return;
    let live = true;
    registerPush().then((s) => live && setPush(s));
    const offTap = onNotificationTap(() => router.push('/inbox'));
    // Realtime normally gets there first; this covers a dropped socket.
    const offPush = onForegroundPush((m) =>
      arrive({ ...m, scope: 'school', target_id: null, created_at: new Date().toISOString() }),
    );
    return () => {
      live = false;
      offTap();
      offPush();
    };
  }, [uid, router, arrive]);

  // Realtime, foreground only. setAuth first: the socket evaluates RLS with the
  // JWT it holds, and a socket without one would be SUBSCRIBED yet receive nothing.
  useEffect(() => {
    if (!uid || !foreground || !supabase) return;
    const client = supabase;
    let cancelled = false;
    let channel: ReturnType<typeof client.channel> | null = null;
    (async () => {
      if (tokenRef.current) {
        await Promise.resolve(client.realtime.setAuth(tokenRef.current)).catch(() => undefined);
      }
      if (cancelled) return;
      channel = client
        .channel(`inbox:${uid}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (p) => {
          const row = p.new as Partial<InboxMessage>;
          if (!row.id || !row.title || !row.created_at) return;
          const msg: InboxMessage = {
            id: row.id,
            scope: row.scope ?? 'school',
            target_id: row.target_id ?? null,
            title: row.title,
            body: row.body ?? '',
            created_at: row.created_at,
          };
          arrive(msg);
        })
        .subscribe();
    })();
    return () => {
      cancelled = true;
      if (channel) void client.removeChannel(channel);
    };
  }, [uid, foreground, arrive]);

  const markIds = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      setReadIds((prev) => new Set([...prev, ...ids]));
      const r = await markRead(ids, userStorage);
      if (!r.ok) {
        // The server refused (not offline): show them unread again.
        setReadIds((prev) => new Set([...prev].filter((id) => !ids.includes(id))));
      }
    },
    [userStorage],
  );
  const markAllRead = useCallback(
    () => markIds(unreadIds(messages, readIds)),
    [markIds, messages, readIds],
  );
  const markOneRead = useCallback((id: string) => markIds([id]), [markIds]);
  const holdToasts = useCallback((hold: boolean) => {
    holdRef.current = hold;
  }, []);

  const value = useMemo<MessagesValue>(
    () => ({
      messages,
      readIds,
      unreadCount: unreadIds(messages, readIds).length,
      loading,
      offline,
      failed: failed && messages.length === 0,
      push,
      refresh,
      markAllRead,
      markOneRead,
      holdToasts,
    }),
    [
      messages,
      readIds,
      loading,
      offline,
      failed,
      push,
      refresh,
      markAllRead,
      markOneRead,
      holdToasts,
    ],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMessages(): MessagesValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useMessages must be used inside <MessagesProvider>');
  return v;
}

/** Hold message toasts while `active` (exam screens: nothing moves but timer and save). */
export function useHoldMessageToasts(active: boolean) {
  const v = useContext(Ctx);
  const hold = v?.holdToasts;
  useEffect(() => {
    hold?.(active);
    return () => hold?.(false);
  }, [hold, active]);
}
