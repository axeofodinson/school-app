// Idle logout clock for shared devices (10 min in the lab, LMS_AUDIT §3.4).
// Pure: the app feeds it activity and a clock, and asks whether time is up.

export const SHARED_IDLE_TIMEOUT_MS = 10 * 60 * 1000;

export interface IdleClock {
  /** Record user activity (touch, key, pointer, app foregrounded after < timeout). */
  touch(now: number): void;
  isIdle(now: number): boolean;
  remainingMs(now: number): number;
}

export function createIdleClock(timeoutMs: number, startedAt: number): IdleClock {
  if (!(timeoutMs > 0)) throw new Error('idle timeout must be positive');
  let last = startedAt;
  return {
    touch(now) {
      // Never move backwards (clock changes, out-of-order events).
      if (now > last) last = now;
    },
    isIdle(now) {
      return now - last >= timeoutMs;
    },
    remainingMs(now) {
      return Math.max(0, timeoutMs - (now - last));
    },
  };
}
