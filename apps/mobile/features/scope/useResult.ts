import { useCallback, useEffect, useRef, useState } from 'react';

import type { ApiErrorKind, Result } from '../../lib/result';

export type Loadable<T> =
  { status: 'loading' } | { status: 'error'; error: ApiErrorKind } | { status: 'ready'; data: T };

/**
 * Run a typed api call when `key` changes (null = nothing to load). Results are
 * tagged with the key they answer, so a slow earlier response never shows for
 * a later key: until the matching one lands the state reads 'loading'.
 */
export function useResult<T>(
  key: string | null,
  load: () => Promise<Result<T>>,
): { state: Loadable<T> | null; reload: () => void } {
  const [tick, setTick] = useState(0);
  const [result, setResult] = useState<{ id: string; value: Loadable<T> } | null>(null);
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });
  const id = key === null ? null : `${key}#${tick}`;

  useEffect(() => {
    if (id === null) return;
    let live = true;
    loadRef
      .current()
      .then((r) => {
        if (!live) return;
        setResult({
          id,
          value: r.ok ? { status: 'ready', data: r.data } : { status: 'error', error: r.error },
        });
      })
      .catch(() => {
        if (live) setResult({ id, value: { status: 'error', error: 'network' } });
      });
    return () => {
      live = false;
    };
  }, [id]);

  const reload = useCallback(() => setTick((n) => n + 1), []);
  const state: Loadable<T> | null =
    id === null ? null : result?.id === id ? result.value : { status: 'loading' };
  return { state, reload };
}
