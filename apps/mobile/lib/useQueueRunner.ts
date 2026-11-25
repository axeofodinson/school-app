// Runs a user's durable queue (packages/core sync) while a surface is open:
// sends on start, when the app comes back to the foreground, when the browser
// says it is online again, and when an item's backoff ends. Drives the
// SyncStatusPill. Each surface passes the senders for the kinds it owns; items
// of other kinds wait for their own surface.
import { summarize, type Sender, type SyncItem, type SyncQueue } from '@school/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import type { SyncStatus } from '../ui';

/** Never wait longer than this between automatic tries (native has no "online" event). */
const MAX_WAIT_MS = 60_000;

export interface QueueRunner {
  items: readonly SyncItem[];
  status: SyncStatus;
  /** Items still on this device (waiting + refused). */
  pending: number;
  /** Bumps whenever something reached the server (lists reload on it). */
  syncedTick: number;
  flush(force?: boolean): Promise<void>;
  /** "Try again": refused items go back to waiting, then send now. */
  flushNow(): Promise<void>;
}

export function useQueueRunner(
  queue: SyncQueue | null,
  senders: Record<string, Sender>,
): QueueRunner {
  // Tagged with the queue they came from, so another user's list never shows.
  const [loaded, setLoaded] = useState<{ owner: object; items: readonly SyncItem[] } | null>(null);
  const items = useMemo(
    () => (loaded && queue && loaded.owner === queue ? loaded.items : []),
    [loaded, queue],
  );
  const [flushing, setFlushing] = useState(false);
  const [offline, setOffline] = useState(false);
  const [justSent, setJustSent] = useState(false);
  const [syncedTick, setSyncedTick] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendersRef = useRef(senders);
  useEffect(() => {
    sendersRef.current = senders;
  });

  const flush = useCallback(
    async (force = false) => {
      if (!queue) return;
      setFlushing(true);
      try {
        const r = await queue.flush(sendersRef.current, { force });
        setOffline(r.offline);
        if (r.sent + r.duplicates > 0) {
          setJustSent(true);
          setSyncedTick((n) => n + 1);
        }
      } finally {
        setFlushing(false);
      }
    },
    [queue],
  );

  // Load + follow the queue; flush once on start.
  useEffect(() => {
    if (!queue) return;
    let live = true;
    const set = (q: readonly SyncItem[]) => live && setLoaded({ owner: queue, items: q });
    queue.items().then(set);
    const off = queue.subscribe(set);
    // Next tick: the first pass's state updates don't belong to this render.
    Promise.resolve()
      .then(() => flush(true))
      .catch(() => undefined);
    return () => {
      live = false;
      off();
    };
  }, [queue, flush]);

  // Foreground / back online → try now, ignoring backoff.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') flush(true).catch(() => undefined);
    });
    let removeOnline = () => {};
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const on = () => flush(true).catch(() => undefined);
      window.addEventListener('online', on);
      removeOnline = () => window.removeEventListener('online', on);
    }
    return () => {
      sub.remove();
      removeOnline();
    };
  }, [flush]);

  // Only this surface's kinds count towards its pill and timer.
  const kinds = Object.keys(senders).join('|');
  const mine = useMemo(() => {
    const own = new Set(kinds.split('|'));
    return items.filter((i) => own.has(i.kind));
  }, [items, kinds]);
  const summary = useMemo(() => summarize(mine), [mine]);

  // Wake up when the next backoff ends (capped, so a reconnect is noticed within a minute).
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (summary.nextAt === null || flushing) return;
    const wait = Math.min(MAX_WAIT_MS, Math.max(1_000, summary.nextAt - Date.now()));
    timer.current = setTimeout(() => flush().catch(() => undefined), wait);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [summary.nextAt, flushing, flush]);

  const flushNow = useCallback(async () => {
    if (!queue) return;
    await queue.retryRejected();
    await flush(true);
  }, [queue, flush]);

  let status: SyncStatus = 'idle';
  if (flushing && summary.pending > 0) status = 'syncing';
  else if (summary.rejected > 0) status = 'error';
  else if (summary.pending > 0) status = offline ? 'offline' : 'syncing';
  else if (justSent) status = 'saved';

  return {
    items,
    status,
    pending: summary.pending + summary.rejected,
    syncedTick,
    flush,
    flushNow,
  };
}
