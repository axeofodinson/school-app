// The teacher's / admin's durable queue for attendance (kind 'attendance'):
// a saved class-day waits on this device until record_attendance() takes it,
// and is sent on start, foreground, back online and when its backoff ends.
// Mounted on every staff surface so a day saved offline goes out from any
// screen (lib/useQueueRunner).
import {
  ATTENDANCE_KIND,
  attendanceKey,
  type AttendancePayload,
  type SyncItem,
} from '@school/core';
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';

import { userQueueStores } from '../../lib/userQueue';
import { useQueueRunner } from '../../lib/useQueueRunner';
import type { SyncStatus } from '../../ui';
import { useAuth } from '../auth/AuthProvider';
import { sendAttendance } from './api';

export const ATTENDANCE_SENDERS = { [ATTENDANCE_KIND]: sendAttendance };
const SENDERS = ATTENDANCE_SENDERS;

/** sent = on the server; queued = on this device, will send; rejected = the server said no. */
export type SaveResult = 'sent' | 'queued' | 'rejected' | 'error';

interface AttendanceSyncValue {
  items: readonly SyncItem[];
  status: SyncStatus;
  pending: number;
  syncedTick: number;
  flushNow(): Promise<void>;
  save(payload: AttendancePayload): Promise<SaveResult>;
}

const Ctx = createContext<AttendanceSyncValue | null>(null);

/**
 * Mounted by every staff layout; /attendance (staff group) opens on top of the
 * teacher or admin group, so two can be mounted at once. Only the outermost
 * runs the queue.
 */
export function AttendanceSyncProvider({ children }: { children: ReactNode }) {
  const parent = useContext(Ctx);
  return parent ? <>{children}</> : <Runner>{children}</Runner>;
}

function Runner({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const stores = useMemo(() => (userId ? userQueueStores(userId) : null), [userId]);
  const queue = stores?.queue ?? null;
  const { items, status, pending, syncedTick, flush, flushNow } = useQueueRunner(queue, SENDERS);

  const save = useCallback<AttendanceSyncValue['save']>(
    async (payload) => {
      if (!queue) return 'error';
      const key = attendanceKey(payload.class_id, payload.on_date);
      try {
        await queue.enqueue(ATTENDANCE_KIND, key, payload);
      } catch {
        return 'error'; // storage full: nothing saved; the marks stay on screen
      }
      await flush(true);
      // A pass already running when we queued didn't include this item: one more.
      let left = await queue.find(ATTENDANCE_KIND, key);
      if (left && left.state === 'pending' && left.attempts === 0) {
        await flush(true);
        left = await queue.find(ATTENDANCE_KIND, key);
      }
      if (!left) return 'sent';
      return left.state === 'rejected' ? 'rejected' : 'queued';
    },
    [queue, flush],
  );

  const value = useMemo<AttendanceSyncValue>(
    () => ({ items, status, pending, syncedTick, flushNow, save }),
    [items, status, pending, syncedTick, flushNow, save],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAttendanceSync(): AttendanceSyncValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAttendanceSync must be used inside <AttendanceSyncProvider>');
  return v;
}

/** The class-day still waiting on this device, if any. */
export function useQueuedDay(classId: string | null, onDate: string): SyncItem | null {
  const { items } = useAttendanceSync();
  if (!classId) return null;
  const key = attendanceKey(classId, onDate);
  return items.find((i) => i.kind === ATTENDANCE_KIND && i.key === key) ?? null;
}
