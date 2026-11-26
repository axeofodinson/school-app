// Offline (pre-downloaded) exams (prompt 60, db/038, LMS_AUDIT §3.3). The paper
// comes down while online; the DEVICE times the exam and keeps the answers; one
// upload at the end is accepted or flagged by the server. Lower integrity, said
// honestly: the clock is the device's, so this is monitoring, never lockdown.
//
//   The clock (OfflineClock) counts:
//     • while the app runs: a monotonic timer (performance.now), so changing the
//       device's date doesn't stop or rewind it;
//     • while the app was closed (killed, phone restarted): the wall-clock gap,
//       so closing the app doesn't pause the exam. A wall clock that went
//       backwards adds nothing and is counted as an anomaly for the teacher.
//   uploadVerdict mirrors exam_offline_submit's rule (tests pin it).
//   Pure: no React, no I/O.
import type { ExamValue } from './exams';

export interface OfflineClock {
  /** Device wall time the student pressed Start (ms). */
  startedAt: number;
  /** Exam time used so far (ms). */
  elapsedMs: number;
  /** Wall and monotonic readings at the last tick. */
  lastWall: number;
  lastMono: number;
  /** Which app run took the last tick (monotonic readings only compare within a run). */
  run: string;
  /** Times the wall clock went backwards between ticks (shown to the teacher). */
  anomalies: number;
  /** Finished (handed in or time up): the clock no longer moves. */
  stoppedAt: number | null;
}

/** A forward wall-clock jump bigger than this while the app ran is suspicious, not counted twice. */
const BACKWARDS_TOLERANCE_MS = 2000;

export function startClock(wall: number, mono: number, run: string): OfflineClock {
  return {
    startedAt: wall,
    elapsedMs: 0,
    lastWall: wall,
    lastMono: mono,
    run,
    anomalies: 0,
    stoppedAt: null,
  };
}

/**
 * Move the clock to now. In the same run the monotonic delta counts (a changed
 * device date can't rewind it); after a restart (a new run) the wall gap counts,
 * and a wall clock that moved backwards adds nothing and is an anomaly.
 */
export function tickClock(c: OfflineClock, wall: number, mono: number, run: string): OfflineClock {
  if (c.stoppedAt !== null) return c;
  let delta: number;
  let anomalies = c.anomalies;
  if (run === c.run) {
    delta = Math.max(0, mono - c.lastMono);
    if (wall < c.lastWall - BACKWARDS_TOLERANCE_MS) anomalies++;
  } else {
    delta = wall - c.lastWall;
    if (delta < 0) {
      anomalies++;
      delta = 0;
    }
  }
  return { ...c, elapsedMs: c.elapsedMs + delta, lastWall: wall, lastMono: mono, run, anomalies };
}

export function stopClock(c: OfflineClock, wall: number, mono: number, run: string): OfflineClock {
  const t = tickClock(c, wall, mono, run);
  return t.stoppedAt !== null ? t : { ...t, stoppedAt: wall };
}

export function offlineRemainingMs(c: OfflineClock, durationMs: number): number {
  return Math.max(0, durationMs - c.elapsedMs);
}

export type OfflineVerdict = 'accepted' | 'late' | 'over_time' | 'already_closed';

/**
 * db/038's rule: accepted while the session is open, received by deadline +
 * grace, and elapsed ≤ duration + grace; otherwise stored and flagged.
 */
export function uploadVerdict(x: {
  sessionOpen: boolean;
  receivedAt: number;
  deadlineAt: number;
  graceMs: number;
  elapsedMs: number;
  durationMs: number;
}): OfflineVerdict {
  const inWindow = x.receivedAt <= x.deadlineAt + x.graceMs;
  if (!x.sessionOpen) return inWindow ? 'already_closed' : 'late';
  if (!inWindow) return 'late';
  if (x.elapsedMs > x.durationMs + x.graceMs) return 'over_time';
  return 'accepted';
}

/** Where a downloaded offline exam stands on this device. */
export type OfflineStage = 'ready' | 'taking' | 'toSend' | 'sent' | 'expired';

export function offlineStage(x: {
  clock: OfflineClock | null;
  durationMs: number;
  closesAt: number;
  now: number;
  sent: boolean;
}): OfflineStage {
  if (x.sent) return 'sent';
  if (x.clock?.stoppedAt != null) return 'toSend';
  if (x.clock && offlineRemainingMs(x.clock, x.durationMs) <= 0) return 'toSend';
  if (x.clock) return x.now > x.closesAt ? 'toSend' : 'taking';
  return x.now > x.closesAt ? 'expired' : 'ready';
}

/** The answers an upload carries: answered questions only, in a plain object. */
export function uploadAnswers(
  answers: Readonly<Record<string, ExamValue | undefined>>,
): Record<string, ExamValue> {
  const out: Record<string, ExamValue> = {};
  for (const [q, v] of Object.entries(answers)) {
    if (v === undefined || v === null) continue;
    if (typeof v === 'string' && !v.trim()) continue;
    out[q] = typeof v === 'string' ? v.slice(0, 500) : v;
  }
  return out;
}
