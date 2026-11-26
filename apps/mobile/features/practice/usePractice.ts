// Loads a topic's practice pool + the learner's history, and owns the upload of
// finished sets through the user's durable queue (packages/core sync). The queue
// is shared with test submissions; this screen sends only practice rows.
import {
  buildAttemptRow,
  type PracticeAnswer,
  type PracticeAttemptRow,
  type PracticeMode,
} from '@school/core';
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { ApiErrorKind } from '../../lib/result';
import { useQueueRunner } from '../../lib/useQueueRunner';
import { userQueueStores } from '../../lib/userQueue';
import { useAuth } from '../auth/AuthProvider';
import {
  historyOf,
  loadPractice,
  PRACTICE_KIND,
  readLocalSets,
  rememberSet,
  sendPracticeAttempt,
  type PracticeData,
  type PracticeLoad,
} from './api';

export type PracticeState =
  | { status: 'loading' }
  | { status: 'error'; error: ApiErrorKind; notFound?: boolean }
  | { status: 'ready'; data: PracticeLoad };

const SENDERS = { [PRACTICE_KIND]: sendPracticeAttempt };

export function usePractice(topicId: string) {
  const { session, userStorage } = useAuth();
  const learnerId = session?.user.id ?? null;
  const [state, setState] = useState<PracticeState>({ status: 'loading' });
  const [local, setLocal] = useState<{ id: string; started_at: string; items: unknown }[]>([]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!learnerId || !topicId) return;
    let live = true;
    Promise.all([
      loadPractice(topicId, learnerId, userStorage),
      readLocalSets(userStorage, topicId),
    ])
      .then(([r, l]) => {
        if (!live) return;
        setLocal(l);
        setState(
          r.ok
            ? { status: 'ready', data: r.data }
            : { status: 'error', error: r.error, notFound: r.notFound },
        );
      })
      .catch(() => live && setState({ status: 'error', error: 'unknown' }));
    return () => {
      live = false;
    };
  }, [learnerId, topicId, userStorage, tick]);

  const stores = useMemo(() => (learnerId ? userQueueStores(learnerId) : null), [learnerId]);
  const runner = useQueueRunner(stores?.queue ?? null, SENDERS);
  const { flush } = runner;

  const history = useMemo(
    () =>
      state.status === 'ready' && state.data !== 'notReady'
        ? historyOf(state.data as PracticeData, local)
        : {},
    [state, local],
  );

  /** Queue a finished (or left part-way) set; history counts it at once. */
  const save = useCallback(
    async (input: {
      id: string;
      mode: PracticeMode;
      startedAt: number;
      answers: PracticeAnswer[];
      followUpId?: string | null;
    }): Promise<PracticeAttemptRow | null> => {
      if (!stores || !learnerId || !input.answers.length) return null;
      const row = buildAttemptRow({
        id: input.id,
        learnerId,
        mode: input.mode,
        topicId,
        startedAt: input.startedAt,
        finishedAt: Date.now(),
        answers: input.answers,
        followUpId: input.followUpId ?? null,
      });
      try {
        await stores.queue.enqueue(PRACTICE_KIND, row.id, row);
      } catch {
        return null; // storage full: the set stays on screen, nothing else breaks
      }
      await rememberSet(userStorage, row).catch(() => undefined);
      setLocal((l) => [
        { id: row.id, started_at: row.started_at, items: row.items },
        ...l.filter((s) => s.id !== row.id),
      ]);
      flush(true).catch(() => undefined);
      return row;
    },
    [stores, learnerId, topicId, userStorage, flush],
  );

  return {
    state,
    history,
    reload: () => {
      setState({ status: 'loading' });
      setTick((n) => n + 1);
    },
    save,
    sync: runner,
  };
}
