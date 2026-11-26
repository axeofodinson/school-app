// Offline exams in the student's sync status (prompt 61): how many papers are
// handed in on this device but not sent, and sending them from any student
// screen when the app starts, comes back to the foreground, the browser says
// it's online, or other work just reached the server (so the connection is back).
import type { ScopedStore } from '@school/core';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { flushOffline, isWaiting, listOffline, onOfflineChange } from './offline';

const RETRY_MS = 60_000;

export function useOfflineExamSync(store: ScopedStore | null, tick: number) {
  // Tagged with the store it came from, so another student's count never shows.
  const [state, setState] = useState<{ owner: object; waiting: number; sent: boolean } | null>(
    null,
  );
  const mine = state && store && state.owner === store ? state : null;

  const count = useCallback(
    async (sent = false) => {
      if (!store) return;
      const waiting = (await listOffline(store)).filter(isWaiting).length;
      setState((s) => ({
        owner: store,
        waiting,
        sent: sent || (s?.owner === store && s.sent),
      }));
    },
    [store],
  );
  const send = useCallback(async () => {
    if (!store) return;
    const n = await flushOffline(store).catch(() => 0);
    await count(n > 0);
  }, [store, count]);

  useEffect(() => {
    if (!store) return;
    void Promise.resolve().then(send);
  }, [store, send, tick]);

  useEffect(() => {
    const off = onOfflineChange(() => void count());
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void send();
    });
    let removeOnline = () => {};
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const on = () => void send();
      window.addEventListener('online', on);
      removeOnline = () => window.removeEventListener('online', on);
    }
    return () => {
      off();
      sub.remove();
      removeOnline();
    };
  }, [count, send]);

  const waiting = mine?.waiting ?? 0;
  useEffect(() => {
    if (!waiting) return;
    const h = setInterval(() => void send(), RETRY_MS);
    return () => clearInterval(h);
  }, [waiting, send]);

  return { waiting, justSent: mine?.sent ?? false, send };
}
