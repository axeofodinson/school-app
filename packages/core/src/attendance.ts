// Attendance rules shared by the teacher's marking screen, the student's
// calendar and the office summaries (prompt 14). Pure: no React, no Supabase.
//
// One mark per enrollment per day (setup.sql attendance, unique (enrollment,
// on_date)); every write goes through db/028 record_attendance(), one request
// per class-day, queued in the sync queue when offline (kind 'attendance').

export const ATTENDANCE_STATUSES = ['present', 'absent', 'late', 'leave'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export function isAttendanceStatus(v: unknown): v is AttendanceStatus {
  return typeof v === 'string' && (ATTENDANCE_STATUSES as readonly string[]).includes(v);
}

// ---- Dates (YYYY-MM-DD strings, calendar maths in UTC so no DST/zone drift) ------

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Well-formed AND a real calendar day ("2025-02-30" is not). */
export function isIsoDate(s: string): boolean {
  if (!ISO_DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** The device's local calendar day (not toISOString, which is UTC and rolls early). */
export function localIsoDate(d: Date = new Date()): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** The school's time zone: the server decides "today" and "future" in it (db/028). */
export const SCHOOL_TIME_ZONE = 'Asia/Karachi';

/**
 * Today's school date (YYYY-MM-DD) in the school's time zone, whatever the
 * device's own zone or clock zone says; falls back to the device's day if the
 * runtime has no Intl time zones.
 */
export function schoolToday(now: Date = new Date(), timeZone: string = SCHOOL_TIME_ZONE): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const get = (t: string) => parts.find((p) => p.type === t)?.value;
    const y = get('year');
    const m = get('month');
    const d = get('day');
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch {
    // fall through
  }
  return localIsoDate(now);
}

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 0 = Monday … 6 = Sunday. */
export function isoWeekday(iso: string): number {
  return (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
}

export type DateError = 'dateRequired' | 'dateInvalid' | 'dateFuture';

/** Why a typed marking date can't be used (null = fine). Future days can't be marked. */
export function markingDateError(input: string, today: string): DateError | null {
  const s = input.trim();
  if (!s) return 'dateRequired';
  if (!isIsoDate(s)) return 'dateInvalid';
  if (s > today) return 'dateFuture';
  return null;
}

/** "2026-11" for a day. */
export function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const total = y * 12 + (m - 1) + n;
  const yy = Math.floor(total / 12);
  const mm = (total % 12) + 1;
  return `${String(yy).padStart(4, '0')}-${String(mm).padStart(2, '0')}`;
}

/** First and last day of a month, inclusive. */
export function monthRange(month: string): { from: string; to: string } {
  const from = `${month}-01`;
  return { from, to: addDays(`${addMonths(month, 1)}-01`, -1) };
}

/**
 * A month as calendar weeks, Monday first: each week has 7 cells, a day string
 * or null for the padding before the 1st / after the last day. The screen lays
 * cells out with logical start/end, so RTL mirrors it without changing this.
 */
export function monthGrid(month: string): (string | null)[][] {
  const { from, to } = monthRange(month);
  const cells: (string | null)[] = Array.from({ length: isoWeekday(from) }, () => null);
  for (let d = from; d <= to; d = addDays(d, 1)) cells.push(d);
  while (cells.length % 7) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

// ---- Counting ------------------------------------------------------------------

export type AttendanceCounts = Record<AttendanceStatus, number>;

export function emptyCounts(): AttendanceCounts {
  return { present: 0, absent: 0, late: 0, leave: 0 };
}

export function tallyStatuses(statuses: Iterable<string | null | undefined>): AttendanceCounts {
  const c = emptyCounts();
  for (const s of statuses) if (isAttendanceStatus(s)) c[s] += 1;
  return c;
}

/**
 * Attendance percentage (DECISIONS #83): days at school (present + late) out of
 * the days that count (present + late + absent). Approved leave is shown on its
 * own and doesn't lower it. null = no counted day yet (show "—", not 0 %).
 */
export function attendanceRate(c: AttendanceCounts): number | null {
  const at = c.present + c.late;
  const counted = at + c.absent;
  return counted ? Math.round((at / counted) * 100) : null;
}

// ---- Marking -------------------------------------------------------------------

export type Marks = Record<string, AttendanceStatus>;

/** Everyone present, then whatever is already recorded for the day on top. */
export function seedMarks(enrollmentIds: readonly string[], saved: Readonly<Marks>): Marks {
  const m: Marks = {};
  for (const id of enrollmentIds) m[id] = saved[id] ?? 'present';
  return m;
}

/** Students whose recorded status this would change (not first marks). */
export function changedFromSaved(saved: Readonly<Marks>, marks: Readonly<Marks>): string[] {
  return Object.keys(marks).filter((id) => saved[id] !== undefined && saved[id] !== marks[id]);
}

/**
 * A reason is needed when a day that is already over gets a recorded mark
 * changed (record_attendance() refuses it otherwise). The first marking of a
 * past day and changes on the day itself need none.
 */
export function needsReason(
  onDate: string,
  today: string,
  saved: Readonly<Marks>,
  marks: Readonly<Marks>,
): boolean {
  return onDate < today && changedFromSaved(saved, marks).length > 0;
}

export const ATTENDANCE_KIND = 'attendance';

/** Queue identity: one class-day. A second save of the same day replaces the first. */
export function attendanceKey(classId: string, onDate: string): string {
  return `${classId}:${onDate}`;
}

export interface AttendancePayload {
  class_id: string;
  on_date: string;
  marks: { enrollment_id: string; status: AttendanceStatus }[];
  reason: string | null;
  /** When Save was pressed on the device; decides whether the day was over. */
  taken_at: string;
}

export function buildAttendancePayload(
  classId: string,
  onDate: string,
  rosterOrder: readonly string[],
  marks: Readonly<Marks>,
  reason: string,
  takenAt: Date = new Date(),
): AttendancePayload {
  return {
    class_id: classId,
    on_date: onDate,
    marks: rosterOrder.map((id) => ({ enrollment_id: id, status: marks[id] ?? 'present' })),
    reason: reason.trim() || null,
    taken_at: takenAt.toISOString(),
  };
}

/** The payload's marks as a map (to show a queued day before it reaches the server). */
export function payloadMarks(p: AttendancePayload): Marks {
  const m: Marks = {};
  for (const x of p.marks) if (isAttendanceStatus(x.status)) m[x.enrollment_id] = x.status;
  return m;
}

// ---- Server messages -------------------------------------------------------------

/** Stable messages db/028 record_attendance() raises; the screen maps each to words. */
export const ATTENDANCE_RPC_ERRORS = [
  'reason_required',
  'not_authorized',
  'date_required',
  'date_in_future',
  'marks_required',
  'too_many_marks',
  'bad_mark',
  'duplicate_enrollment',
  'enrollment_class_mismatch',
  'enrollment_not_active',
] as const;
export type AttendanceRpcError = (typeof ATTENDANCE_RPC_ERRORS)[number];

export function attendanceRpcError(message: string | null | undefined): AttendanceRpcError | null {
  const m = String(message ?? '').toLowerCase();
  return ATTENDANCE_RPC_ERRORS.find((k) => m.includes(k)) ?? null;
}

/** Fixed reasons db/028 writes itself; the history shows them in the user's language. */
export const ATTENDANCE_SAME_DAY_REASON = 'Changed the same day';
export const ATTENDANCE_OLD_APP_REASON = 'Changed in the old app';
