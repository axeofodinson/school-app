// Overdue assignments: which published assignments are ≥ OVERDUE_DAYS past due
// and which active students haven't turned them in. Ported from the old app's
// src/reporting/overdue.js (frozen there); identical behaviour, pinned by
// test/reporting-overdue.test.ts (every scripts/verify-overdue.mjs case plus a
// comparison against the old module on the same fixtures).

/** Overdue once the due date (assessments.scheduled_on) is this many days past. */
export const OVERDUE_DAYS = 10;

/** Whole days `to - from` between YYYY-MM-DD dates, at UTC midnight. Null if either is missing/invalid. */
export function daysBetweenISO(
  fromISO: string | null | undefined,
  toISO: string | null | undefined,
): number | null {
  if (!fromISO || !toISO) return null;
  const from = new Date(`${fromISO}T00:00:00Z`).getTime();
  const to = new Date(`${toISO}T00:00:00Z`).getTime();
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.round((to - from) / 86400000);
}

/** An undated assignment is never overdue. */
export function isOverdue(
  scheduledOn: string | null | undefined,
  today: string,
  days: number = OVERDUE_DAYS,
): boolean {
  const d = daysBetweenISO(scheduledOn, today);
  return d != null && d >= days;
}

/** today minus `days`, as YYYY-MM-DD (UTC), for the query cutoff. */
export function isoDaysBefore(today: string, days: number = OVERDUE_DAYS): string {
  const t = new Date(`${today}T00:00:00Z`).getTime() - days * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

export interface RosterEntry {
  roll_number?: number | null;
  student?: { full_name?: string | null } | null;
}

/** Roll number ascending (unnumbered last), then name. Same rule on every roster. */
export function compareRoster(a: RosterEntry, b: RosterEntry): number {
  const ra = a.roll_number;
  const rb = b.roll_number;
  if (ra != null && rb != null && ra !== rb) return ra - rb;
  if (ra != null && rb == null) return -1;
  if (ra == null && rb != null) return 1;
  const na = a.student?.full_name || '';
  const nb = b.student?.full_name || '';
  return na.localeCompare(nb);
}

export interface OverdueAssessment {
  id: string;
  title: string;
  class_id: string;
  scheduled_on: string | null;
  className?: string | null;
  subjectName?: string | null;
}

export interface OverdueEnrollment extends RosterEntry {
  id: string;
  class_id: string;
}

export interface OverdueSubmission {
  assessment_id: string;
  enrollment_id: string;
  submitted_at: string | null;
}

export interface OverdueCard<E extends OverdueEnrollment = OverdueEnrollment> {
  id: string;
  title: string;
  scheduled_on: string | null;
  className: string;
  subjectName: string;
  daysOverdue: number | null;
  totalActive: number;
  missing: E[];
}

/**
 * One card per overdue assignment (input order): active roster minus students
 * with a submission that has submitted_at set (a score-only row is not a
 * turned-in attempt). `enrollments` must be ACTIVE ones only.
 */
export function buildOverdueDashboard<E extends OverdueEnrollment>({
  assessments = [],
  enrollments = [],
  submissions = [],
  today,
  overdueDays = OVERDUE_DAYS,
}: {
  assessments?: readonly OverdueAssessment[];
  enrollments?: readonly E[];
  submissions?: readonly OverdueSubmission[];
  today: string;
  overdueDays?: number;
}): OverdueCard<E>[] {
  const rosterByClass = new Map<string, E[]>();
  for (const e of enrollments) {
    let list = rosterByClass.get(e.class_id);
    if (!list) rosterByClass.set(e.class_id, (list = []));
    list.push(e);
  }
  for (const list of rosterByClass.values()) list.sort(compareRoster);

  const submittedByAssessment = new Map<string, Set<string>>();
  for (const s of submissions) {
    if (!s.submitted_at) continue;
    let set = submittedByAssessment.get(s.assessment_id);
    if (!set) submittedByAssessment.set(s.assessment_id, (set = new Set()));
    set.add(s.enrollment_id);
  }

  const cards: OverdueCard<E>[] = [];
  for (const a of assessments) {
    if (!isOverdue(a.scheduled_on, today, overdueDays)) continue;
    const roster = rosterByClass.get(a.class_id) ?? [];
    const submitted = submittedByAssessment.get(a.id) ?? new Set<string>();
    cards.push({
      id: a.id,
      title: a.title,
      scheduled_on: a.scheduled_on,
      className: a.className ?? '',
      subjectName: a.subjectName ?? '',
      daysOverdue: daysBetweenISO(a.scheduled_on, today),
      totalActive: roster.length,
      missing: roster.filter((e) => !submitted.has(e.id)),
    });
  }
  return cards;
}
