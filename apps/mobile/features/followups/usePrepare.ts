// The learner's follow-ups, bands and class concepts, plus the gate for each
// topic. Shared by Prepare and Home; reloads when the screen comes back into view
// (a practice round just synced) without blocking on it.
import { gateFor, prepareModel, revisionModel, type Gate, type TopicPos } from '@school/core';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';

import { useAuth } from '../auth/AuthProvider';
import { useResult } from '../scope/useResult';
import { loadPrepare, type PrepareData } from './api';

/** classId: undefined = still loading the enrollment, null = no class (prep learner). */
export function usePrepare(classId: string | null | undefined) {
  const { session, userStorage } = useAuth();
  const uid = session?.user.id ?? null;
  const ready = classId !== undefined && uid;
  const res = useResult(ready ? `prep:${uid}:${classId ?? '*'}` : null, () =>
    loadPrepare(uid!, classId ?? null, userStorage),
  );
  // Refresh on focus after the first visit (e.g. back from a follow-up round).
  const seen = useRef(false);
  const { reload } = res;
  useFocusEffect(
    useCallback(() => {
      if (seen.current) reload();
      seen.current = true;
    }, [reload]),
  );
  const fresh: PrepareData | null =
    res.state?.status === 'ready' && res.state.data !== 'notReady' ? res.state.data : null;
  // Keep the last answer on screen while a refocus reload runs (no skeleton flash).
  const [kept, setKept] = useState<PrepareData | null>(null);
  if (fresh && fresh !== kept) setKept(fresh);
  const data = fresh ?? (res.state?.status === 'loading' ? kept : null);
  const [now] = useState(() => Date.now());
  const model = useMemo(() => (data ? prepareModel(data.followUps, now) : null), [data, now]);
  // Spaced revision (prompt 42). A copy saved before 037 has no revisions.
  const revision = useMemo(
    () => (data ? revisionModel(data.revisions ?? [], now) : null),
    [data, now],
  );

  /** Gate for a topic given where it sits; open when nothing is known yet. */
  const gate = useCallback(
    (topic: TopicPos, positions: ReadonlyMap<string, TopicPos>): Gate =>
      model ? gateFor(topic, model.doFirst, positions) : { state: 'open' },
    [model],
  );

  return {
    state: res.state,
    reload,
    data,
    model,
    revision,
    now,
    gate,
    notReady: res.state?.status === 'ready' && res.state.data === 'notReady',
  };
}
