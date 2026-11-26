// Load a lesson once per screen visit and share it between the topic page and
// the reader (an in-memory copy, so opening the reader from the topic page is
// instant). reload() always goes back to the server.
import { useCallback, useEffect, useRef, useState } from 'react';

import type { ApiErrorKind } from '../../lib/result';
import { useAuth } from '../auth/AuthProvider';
import { loadLesson, type LearnLoad, type LearnMode } from './api';

export type LessonState =
  | { status: 'loading' }
  | { status: 'error'; error: ApiErrorKind; notFound?: boolean }
  | { status: 'ready'; data: LearnLoad };

const memory = new Map<string, LearnLoad>();

export function useLesson(
  where: { topicId?: string; contentId?: string },
  mode: LearnMode,
  /** The reader opened from the topic page reuses what it just loaded. */
  preferMemory = false,
): { state: LessonState; reload: () => void } {
  const { userStorage, session } = useAuth();
  const uid = session?.user.id ?? 'anon';
  const key = `${uid}|${mode}|${where.topicId ?? ''}|${where.contentId ?? ''}`;
  const [tick, setTick] = useState(0);
  const fresh = useRef(false);
  const [state, setState] = useState<{ key: string; value: LessonState } | null>(null);

  useEffect(() => {
    const hit = memory.get(key);
    if (hit && preferMemory && !fresh.current) {
      setState({ key, value: { status: 'ready', data: hit } });
      return;
    }
    fresh.current = false;
    let live = true;
    loadLesson(where, mode, userStorage, uid)
      .then((r) => {
        if (!live) return;
        if (r.ok) {
          memory.set(key, r.data);
          setState({ key, value: { status: 'ready', data: r.data } });
        } else
          setState({
            key,
            value: r.notFound
              ? { status: 'error', error: r.error, notFound: true }
              : { status: 'error', error: r.error },
          });
      })
      .catch(() => live && setState({ key, value: { status: 'error', error: 'network' } }));
    return () => {
      live = false;
    };
    // `where` is captured by its key.
  }, [key, tick, mode, userStorage, preferMemory]); // eslint-disable-line react-hooks/exhaustive-deps

  const reload = useCallback(() => {
    fresh.current = true;
    setTick((n) => n + 1);
  }, []);
  return { state: state?.key === key ? state.value : { status: 'loading' }, reload };
}
