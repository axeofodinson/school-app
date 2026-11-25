// Attendance reads + the one write (prompt 14). Every mark goes through db/028
// record_attendance(): one request per class-day, sent from the durable queue
// (kind 'attendance'), so a teacher can mark offline and it sends once. The
// RPC checks the caller, the class, the day and the reason; RLS decides every
// read (staff: all classes; a teacher: classes they teach; a student: own days).
//
// Device copies (cache/ keys in the user's namespace, wiped at sign-out): the
// teacher's classes and each class roster, so marking works without a
// connection; the student's own record, so the calendar opens offline.
import {
  attendanceRpcError,
  isAttendanceStatus,
  sortRoster,
  type AttendancePayload,
  type AttendanceRpcError,
  type AttendanceStatus,
  type Marks,
  type ScopedStore,
  type SendError,
  type SendOutcome,
  type SyncItem,
} from '@school/core';

import { readCache, writeCache } from '../../lib/cache';
import {
  classifyError,
  fail,
  notConfigured,
  ok,
  type ApiErrorKind,
  type PgError,
  type Result,
} from '../../lib/result';
import { supabase } from '../../lib/supabase';
import { loadScope, type Scope } from '../scope/api';

export interface RosterEntry {
  enrollmentId: string;
  rollNumber: number | null;
  name: string;
  code: string;
}

export interface SavedMark {
  id: string;
  status: AttendanceStatus;
  editCount: number;
}

export interface Day {
  roster: RosterEntry[];
  /** What the server has for this day (empty when shown from the device copy). */
  saved: Record<string, SavedMark>;
  /** Roster from the device copy; the day's saved marks are unknown. */
  fromCache: boolean;
}

const scopeCache = 'cache/attendance.scope';
const rosterCache = (classId: string) => `cache/attendance.roster.${classId}`;
const MINE_CACHE = 'cache/attendance.mine';

/** The marking scope (year + classes), or the device copy when offline. */
export async function loadMarkingScope(
  userId: string,
  isStaff: boolean,
  cache: ScopedStore | null,
): Promise<Result<Scope & { fromCache: boolean }>> {
  if (!supabase) return notConfigured;
  let r: Result<Scope>;
  try {
    r = await loadScope(userId, isStaff);
  } catch (e) {
    r = fail(e as PgError);
  }
  if (r.ok) {
    await writeCache(cache, scopeCache, r.data);
    return ok({ ...r.data, fromCache: false });
  }
  if (r.error === 'network') {
    const c = await readCache<Scope>(cache, scopeCache);
    if (c) return ok({ ...c, fromCache: true });
  }
  return r;
}

interface EnrollmentRow {
  id: string;
  roll_number: number | null;
  student: { full_name: string; student_code: string } | null;
}

const toEntry = (e: EnrollmentRow): RosterEntry => ({
  enrollmentId: e.id,
  rollNumber: e.roll_number,
  name: e.student?.full_name ?? '',
  code: e.student?.student_code ?? '',
});

/** The class's active roster (roll order) and what is already marked for the day. */
export async function loadDay(
  classId: string,
  yearId: string,
  onDate: string,
  cache: ScopedStore | null,
): Promise<Result<Day>> {
  if (!supabase) return notConfigured;
  try {
    const enr = await supabase
      .from('enrollments')
      .select('id, roll_number, student:students(full_name, student_code)')
      .eq('class_id', classId)
      .eq('year_id', yearId)
      .eq('status', 'active')
      .retry(false)
      .overrideTypes<EnrollmentRow[], { merge: false }>();
    if (enr.error) throw enr.error;
    const roster = sortRoster(enr.data ?? []).map(toEntry);
    const saved: Record<string, SavedMark> = {};
    if (roster.length) {
      const att = await supabase
        .from('attendance')
        .select('id, enrollment_id, status, edit_count')
        .eq('on_date', onDate)
        .in(
          'enrollment_id',
          roster.map((r) => r.enrollmentId),
        )
        .retry(false);
      if (att.error) throw att.error;
      for (const a of att.data ?? []) {
        if (isAttendanceStatus(a.status)) {
          saved[a.enrollment_id] = { id: a.id, status: a.status, editCount: a.edit_count ?? 0 };
        }
      }
    }
    await writeCache(cache, rosterCache(classId), roster);
    return ok({ roster, saved, fromCache: false });
  } catch (e) {
    if (classifyError(e as PgError) === 'network') {
      const roster = await readCache<RosterEntry[]>(cache, rosterCache(classId));
      if (roster) return ok({ roster, saved: {}, fromCache: true });
    }
    return fail(e as PgError);
  }
}

export function savedStatuses(saved: Readonly<Record<string, SavedMark>>): Marks {
  const m: Marks = {};
  for (const [id, s] of Object.entries(saved)) m[id] = s.status;
  return m;
}

/**
 * The queue's sender for 'attendance' items: the whole class-day in one call.
 * Returns the error itself (not just its class) so the queue keeps the server's
 * message and the screen can say why a day was refused.
 */
export async function sendAttendance(item: SyncItem): Promise<SendError | SendOutcome | null> {
  if (!supabase) return { message: 'network request failed' };
  const p = item.payload as AttendancePayload;
  try {
    const { error } = await supabase.rpc('record_attendance', {
      p_class_id: p.class_id,
      p_on_date: p.on_date,
      p_marks: p.marks,
      p_reason: p.reason ?? undefined,
      p_taken_at: p.taken_at,
    });
    // record_attendance() isn't idempotent by row id: a unique violation (a race
    // with another device) must be sent again, never taken for "already saved".
    if (error && (error.code === '23505' || (error as SendError).status === 409)) return 'retry';
    return error;
  } catch (e) {
    return e as SendError;
  }
}

/** Why a queued day was refused, from the stored error text. */
export function refusalOf(item: SyncItem | null | undefined): AttendanceRpcError | ApiErrorKind {
  const msg = item?.lastError ?? '';
  return attendanceRpcError(msg) ?? classifyError({ message: msg, code: msg.split(' ')[0] });
}

export interface AttendanceEdit {
  id: string;
  prev: string;
  next: string;
  reason: string;
  editedAt: string;
}

/** One mark's history, newest first (staff + the class's teachers; never students). */
export async function loadEdits(attendanceId: string): Promise<Result<AttendanceEdit[]>> {
  if (!supabase) return notConfigured;
  const { data, error } = await supabase
    .from('attendance_edits')
    .select('id, prev_status, new_status, reason, edited_at')
    .eq('attendance_id', attendanceId)
    .order('edited_at', { ascending: false });
  if (error) return fail(error);
  return ok(
    (data ?? []).map((r) => ({
      id: r.id,
      prev: r.prev_status,
      next: r.new_status,
      reason: r.reason,
      editedAt: r.edited_at,
    })),
  );
}

// ---- Summaries --------------------------------------------------------------------

export interface ClassDay {
  classId: string;
  className: string;
  enrolled: number;
  marked: number;
  present: number;
  absent: number;
  late: number;
  leave: number;
}

/** Every class the caller can see, with the day's counts (db/028). */
export async function loadDaySummary(yearId: string, onDate: string): Promise<Result<ClassDay[]>> {
  if (!supabase) return notConfigured;
  const { data, error } = await supabase.rpc('attendance_day_summary', {
    p_year_id: yearId,
    p_on_date: onDate,
  });
  if (error) return fail(error);
  return ok(
    (data ?? []).map((r) => ({
      classId: r.class_id,
      className: r.class_name,
      enrolled: r.enrolled,
      marked: r.marked,
      present: r.present,
      absent: r.absent,
      late: r.late,
      leave: r.on_leave,
    })),
  );
}

export interface StudentRange {
  enrollmentId: string;
  rollNumber: number | null;
  name: string;
  active: boolean;
  present: number;
  absent: number;
  late: number;
  leave: number;
}

/** Each student of a class (struck-off ones too) with counts over [from, to]. */
export async function loadClassRange(
  classId: string,
  yearId: string,
  from: string,
  to: string,
): Promise<Result<StudentRange[]>> {
  if (!supabase) return notConfigured;
  const [enr, sum] = await Promise.all([
    supabase
      .from('enrollments')
      .select('id, roll_number, status, student:students(full_name, student_code)')
      .eq('class_id', classId)
      .eq('year_id', yearId)
      .overrideTypes<(EnrollmentRow & { status: string })[], { merge: false }>(),
    supabase.rpc('attendance_student_summary', {
      p_class_id: classId,
      p_year_id: yearId,
      p_from: from,
      p_to: to,
    }),
  ]);
  if (enr.error) return fail(enr.error);
  if (sum.error) return fail(sum.error);
  const counts = new Map((sum.data ?? []).map((r) => [r.enrollment_id, r]));
  return ok(
    sortRoster(enr.data ?? []).map((e) => {
      const c = counts.get(e.id);
      return {
        enrollmentId: e.id,
        rollNumber: e.roll_number,
        name: e.student?.full_name ?? '',
        active: e.status === 'active',
        present: c?.present ?? 0,
        absent: c?.absent ?? 0,
        late: c?.late ?? 0,
        leave: c?.on_leave ?? 0,
      };
    }),
  );
}

// ---- The student's own record ---------------------------------------------------------

export interface MyDay {
  on_date: string;
  status: AttendanceStatus;
}

type MyAttendanceData =
  | { state: 'noYear' | 'noEnrollment' }
  | { state: 'ready'; yearLabel: string; className: string; days: MyDay[] };

export type MyAttendance = MyAttendanceData & { fromCache: boolean };

async function fetchMine(): Promise<MyAttendanceData> {
  const db = supabase!;
  const yr = await db
    .from('academic_years')
    .select('id, label')
    .eq('is_current', true)
    .maybeSingle()
    .retry(false);
  if (yr.error) throw yr.error;
  if (!yr.data) return { state: 'noYear' };
  const enr = await db
    .from('enrollments')
    .select('id, status, class:classes(name)')
    .eq('year_id', yr.data.id)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()
    .retry(false)
    .overrideTypes<
      { id: string; status: string; class: { name: string } | null },
      { merge: false }
    >();
  if (enr.error) throw enr.error;
  if (!enr.data) return { state: 'noEnrollment' };
  const att = await db
    .from('attendance')
    .select('on_date, status')
    .eq('enrollment_id', enr.data.id)
    .order('on_date', { ascending: false })
    .limit(400)
    .retry(false);
  if (att.error) throw att.error;
  return {
    state: 'ready',
    yearLabel: yr.data.label,
    className: enr.data.class?.name ?? '',
    days: (att.data ?? []).flatMap((d) =>
      isAttendanceStatus(d.status) ? [{ on_date: d.on_date, status: d.status }] : [],
    ),
  };
}

/** The signed-in student's days this year (RLS: own enrollment only); device copy offline. */
export async function loadMyAttendance(cache: ScopedStore | null): Promise<Result<MyAttendance>> {
  if (!supabase) return notConfigured;
  try {
    const mine = await fetchMine();
    await writeCache(cache, MINE_CACHE, mine);
    return ok({ ...mine, fromCache: false });
  } catch (e) {
    if (classifyError(e as PgError) === 'network') {
      const c = await readCache<MyAttendanceData>(cache, MINE_CACHE);
      if (c) return ok({ ...c, fromCache: true });
    }
    return fail(e as PgError);
  }
}
