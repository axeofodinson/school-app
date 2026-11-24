import { useAuth } from '../auth/AuthProvider';
import { useResult } from '../scope/useResult';
import { loadHome } from './api';
import { useAttemptSync } from './AttemptSync';

/** The student's enrollment, tests and submissions; reloads after anything syncs. */
export function useHome(reloadOnSync = true) {
  const { session, userStorage } = useAuth();
  const { syncedTick } = useAttemptSync();
  const uid = session?.user.id ?? null;
  return useResult(uid ? `${uid}#${reloadOnSync ? syncedTick : 0}` : null, () =>
    loadHome(userStorage),
  );
}
