// The signed-in user's downloaded chapters, shared by every screen that shows
// them (the lesson list's chapter buttons, Downloads). One download at a time
// per chapter; a stale pack (older than a day) refreshes quietly when online.
import { packIsStale, type PackIndex } from '@school/core';
import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '../auth/AuthProvider';
import { deletePack, downloadPack, readIndexes, type Downloaded, type PackResult } from './api';

const listeners = new Set<() => void>();
const busy = new Set<string>();
const refreshed = new Set<string>();
const emit = () => listeners.forEach((f) => f());

export function usePacks() {
  const { session } = useAuth();
  const uid = session?.user.id ?? null;
  const [packs, setPacks] = useState<{ uid: string; list: PackIndex[] } | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!uid) return;
    let live = true;
    const load = () =>
      readIndexes(uid)
        .then((list) => {
          if (live) setPacks({ uid, list });
        })
        .catch(() => {
          if (live) setPacks({ uid, list: [] });
        });
    const onChange = () => {
      setTick((n) => n + 1);
      void load();
    };
    void load();
    listeners.add(onChange);
    return () => {
      live = false;
      listeners.delete(onChange);
    };
  }, [uid]);

  const download = useCallback(
    async (chapterId: string): Promise<PackResult<Downloaded>> => {
      if (!uid) return { ok: false, error: 'unknown' };
      busy.add(chapterId);
      emit();
      try {
        return await downloadPack(uid, chapterId);
      } finally {
        busy.delete(chapterId);
        refreshed.add(`${uid}:${chapterId}`);
        emit();
      }
    },
    [uid],
  );

  const remove = useCallback(
    async (chapterId: string) => {
      if (!uid) return;
      await deletePack(uid, chapterId);
      emit();
    },
    [uid],
  );

  const list = packs && packs.uid === uid ? packs.list : null;

  /** Refresh packs older than a day, once per app session (call when online). */
  const refreshStale = useCallback(async () => {
    if (!uid || !list) return;
    const now = Date.now();
    for (const ix of list) {
      const k = `${uid}:${ix.chapter.id}`;
      if (refreshed.has(k) || busy.has(ix.chapter.id) || !packIsStale(ix, now)) continue;
      refreshed.add(k);
      await download(ix.chapter.id);
    }
  }, [uid, list, download]);

  return {
    packs: list,
    byChapter: (chapterId: string) => list?.find((p) => p.chapter.id === chapterId) ?? null,
    isBusy: (chapterId: string) => busy.has(chapterId),
    download,
    remove,
    refreshStale,
  };
}
