// Keeps a live exam's roster and item analysis fresh without flicker: the last
// good data stays on screen while a refetch runs. Refetches come from Realtime
// (throttled to one per REFRESH_MS however many students save at once), a slow
// poll while the exam runs (a dropped socket, and "idle" depends on time
// passing), and an explicit reload after the teacher acts.
import { throttle } from '@school/core';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { ApiErrorKind } from '../../lib/result';
import {
  loadExamLive,
  loadItemAnalysis,
  watchExamSessions,
  type ExamLive,
  type ItemAnalysis,
} from './api';

export const REFRESH_MS = 3_000;
export const POLL_MS = 20_000;

export interface LiveExamState {
  live: ExamLive | null;
  analysis: ItemAnalysis | null;
  /** Device → server clock offset from the last fetch. */
  offset: number;
  notReady: boolean;
  error: ApiErrorKind | null;
  loading: boolean;
}

export function isRunning(live: ExamLive | null): boolean {
  return !!live && live.mode === 'live_exam' && live.status === 'published' && !!live.joinCode;
}

export function useLiveExam(assessmentId: string) {
  const [state, setState] = useState<LiveExamState>({
    live: null,
    analysis: null,
    offset: 0,
    notReady: false,
    error: null,
    loading: true,
  });
  const seq = useRef(0);

  // Resolves to the state update (or null when a newer fetch has started), so
  // callers apply it in a callback, never synchronously inside an effect.
  const load = useCallback(async (): Promise<((s: LiveExamState) => LiveExamState) | null> => {
    const mine = ++seq.current;
    const sent = Date.now();
    const [l, a] = await Promise.all([
      loadExamLive(assessmentId),
      loadItemAnalysis(assessmentId),
    ]).catch(() => [null, null] as const);
    if (mine !== seq.current) return null;
    if (!l || !l.ok) {
      const error = l && !l.ok ? l.error : 'network';
      return (s) => ({ ...s, loading: false, error });
    }
    if (l.data === 'notReady')
      return (s) => ({ ...s, loading: false, notReady: true, error: null });
    const received = Date.now();
    const server = Date.parse(l.data.serverNow);
    const offset = Number.isFinite(server) ? server - (sent + received) / 2 : 0;
    const live = l.data;
    return (s) => ({
      live,
      analysis: a && a.ok && a.data !== 'notReady' ? a.data : s.analysis,
      offset,
      notReady: false,
      error: null,
      loading: false,
    });
  }, [assessmentId]);

  const reload = useCallback(
    () =>
      load().then((u) => {
        if (u) setState(u);
      }),
    [load],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  const running = isRunning(state.live);
  useEffect(() => {
    if (!running) return;
    const refresh = throttle(() => void reload(), REFRESH_MS);
    const off = watchExamSessions(assessmentId, refresh);
    const poll = setInterval(refresh, POLL_MS);
    return () => {
      off();
      clearInterval(poll);
      refresh.cancel();
    };
  }, [assessmentId, running, reload]);

  return { ...state, running, reload };
}
