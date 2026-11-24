import { useAuth } from '../auth/AuthProvider';
import { loadScope } from './api';
import { useResult } from './useResult';

/** The signed-in staff member's year + classes. Admins/developers see every class. */
export function useScope() {
  const { session, destination } = useAuth();
  const userId = session?.user.id ?? null;
  const isStaff = destination === 'admin';
  const { state, reload } = useResult(userId ? `${userId}:${isStaff}` : null, () =>
    loadScope(userId!, isStaff),
  );
  return { state, reload, userId, isStaff };
}
