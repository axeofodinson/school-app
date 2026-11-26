// Spaced revision (prompt 42, db/037): a mastered (or carried-over) concept comes
// back for a retention check after 7 days, then after 30 days.
//
//   review stage  0 not scheduled · 1 the 7-day check is next
//                 2 the 30-day check is next · 3 retained (done)
//
//   scheduleOnMastery(now)               → stage 1, due in 7 days (db/019 does this)
//   isRevisionDue(row, now)              → may a revision attempt count as the check now
//   revisionOutcome(answers)             → pass / fail / tooFew for one concept's items
//   nextRevision(stage, outcome, now)    → the stage and due date after a check
//   revisionModel(rows, now)             → Prepare's "Due for revision" list + what's next
//   retentionRates(checks)               → the 7- and 30-day retention measures
//
// The server owns the schedule (db/037 mirrors these numbers); this file decides
// what the learner sees and is time-travel tested with a fake clock. Pure.
import { roundPreview } from './followups';
import { MASTERY_DEFAULTS, type MasteryConfig, type MasteryState } from './mastery';

const DAY = 24 * 60 * 60 * 1000;

export const REVISION = Object.freeze({
  /** Days from mastery (or a failed check) to the first check. */
  firstDays: MASTERY_DEFAULTS.firstReviewDays,
  /** Days from a passed first check to the second. */
  secondDays: 30,
  /** A check may be done this long before it is due. */
  earlyMs: 12 * 60 * 60 * 1000,
  /** The stage after the last check: retained, nothing more is scheduled. */
  retained: 3,
  /** Questions in one revision set from Prepare. */
  setSize: 5,
});

export type RevisionStage = 0 | 1 | 2 | 3;
export type RevisionOutcome = 'pass' | 'fail' | 'tooFew';

export interface RevisionSlot {
  stage: number;
  /** ms since epoch, or null when nothing is scheduled. */
  nextAt: number | null;
}

/** What db/019 stores when a concept is mastered or relieved. */
export function scheduleOnMastery(now: number, cfg = REVISION): RevisionSlot {
  return { stage: 1, nextAt: now + cfg.firstDays * DAY };
}

/** Is a check open now (stage 1 or 2, due within the early window)? */
export function isRevisionDue(slot: RevisionSlot, now: number, cfg = REVISION): boolean {
  return (
    (slot.stage === 1 || slot.stage === 2) && slot.nextAt !== null && slot.nextAt <= now + cfg.earlyMs
  );
}

/** One concept's items in a revision set: the same bar as a follow-up round. */
export function revisionOutcome(
  answers: readonly { correct: boolean }[],
  cfg: Pick<MasteryConfig, 'roundMin' | 'masteredPct'> = MASTERY_DEFAULTS,
): RevisionOutcome {
  const r = roundPreview(answers, cfg);
  return r === 'pass' ? 'pass' : r === 'notYet' ? 'fail' : 'tooFew';
}

/**
 * The slot after a check. A pass moves on (7 → 30 days → retained); a fail goes
 * back to the 7-day check (and the server opens a revision follow-up); too few
 * items, or a check that wasn't due, changes nothing.
 */
export function nextRevision(
  slot: RevisionSlot,
  outcome: RevisionOutcome,
  now: number,
  cfg = REVISION,
): RevisionSlot {
  if (outcome === 'tooFew' || !isRevisionDue(slot, now, cfg)) return slot;
  if (outcome === 'fail') return { stage: 1, nextAt: now + cfg.firstDays * DAY };
  if (slot.stage === 1) return { stage: 2, nextAt: now + cfg.secondDays * DAY };
  return { stage: cfg.retained, nextAt: null };
}

/** One concept's revision state, as Prepare reads it from concept_mastery. */
export interface RevisionRow {
  conceptId: string;
  state: MasteryState;
  stage: number;
  /** ISO time, or null. */
  nextReviewAt: string | null;
}

export interface RevisionModel<R extends RevisionRow> {
  /** Due now (or within the early window), longest overdue first. */
  due: R[];
  /** Scheduled later, soonest first. */
  upcoming: R[];
  /** Concepts that passed both checks. */
  retained: number;
}

const slotOf = (r: RevisionRow): RevisionSlot => {
  const t = r.nextReviewAt ? Date.parse(r.nextReviewAt) : NaN;
  return { stage: r.stage, nextAt: Number.isFinite(t) ? t : null };
};

export function revisionModel<R extends RevisionRow>(
  rows: readonly R[],
  now: number,
  cfg = REVISION,
): RevisionModel<R> {
  const due: R[] = [];
  const upcoming: R[] = [];
  let retained = 0;
  for (const r of rows) {
    const s = slotOf(r);
    if (s.stage >= cfg.retained) retained++;
    else if (isRevisionDue(s, now, cfg)) due.push(r);
    else if ((s.stage === 1 || s.stage === 2) && s.nextAt !== null) upcoming.push(r);
  }
  const at = (r: R) => slotOf(r).nextAt ?? 0;
  const order = (a: R, b: R) => at(a) - at(b) || (a.conceptId < b.conceptId ? -1 : 1);
  return { due: due.sort(order), upcoming: upcoming.sort(order), retained };
}

/** Whole days until a check is due (0 = today or overdue). */
export function daysUntil(nextReviewAt: string, now: number): number {
  const t = Date.parse(nextReviewAt);
  return Number.isFinite(t) ? Math.max(0, Math.ceil((t - now) / DAY)) : 0;
}

/** One revision_checks row, or a retention_daily row's counts. */
export interface RetentionCount {
  stage: number;
  checks: number;
  passed: number;
}

/** The 7-day (stage 1) and 30-day (stage 2) retention measures (LMS_AUDIT §5.12). */
export function retentionRates(rows: readonly RetentionCount[]): {
  day7: { checks: number; passed: number; rate: number | null };
  day30: { checks: number; passed: number; rate: number | null };
} {
  const sum = (stage: number) => {
    let checks = 0;
    let passed = 0;
    for (const r of rows)
      if (r.stage === stage) {
        checks += r.checks;
        passed += r.passed;
      }
    return { checks, passed, rate: checks ? passed / checks : null };
  };
  return { day7: sum(1), day30: sum(2) };
}
