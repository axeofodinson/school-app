import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  attendanceKey,
  attendanceRate,
  attendanceRpcError,
  buildAttendancePayload,
  changedFromSaved,
  isAttendanceStatus,
  isIsoDate,
  isoWeekday,
  localIsoDate,
  schoolToday,
  markingDateError,
  monthGrid,
  monthOf,
  monthRange,
  needsReason,
  payloadMarks,
  seedMarks,
  tallyStatuses,
} from '../src/attendance';

describe('dates', () => {
  it.each([
    ['2026-11-25', true],
    ['2024-02-29', true],
    ['2025-02-29', false],
    ['2025-13-01', false],
    ['2025-1-01', false],
    ['', false],
    ['tomorrow', false],
  ])('isIsoDate(%s) = %s', (s, want) => expect(isIsoDate(s)).toBe(want));

  it('localIsoDate uses local parts', () => {
    expect(localIsoDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
  it('addDays crosses months and years', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
  });
  it('isoWeekday is Monday-first', () => {
    expect(isoWeekday('2026-11-23')).toBe(0); // Monday
    expect(isoWeekday('2026-11-29')).toBe(6); // Sunday
  });
  it.each([
    ['', 'dateRequired'],
    ['  ', 'dateRequired'],
    ['2026-02-30', 'dateInvalid'],
    ['2026-11-26', 'dateFuture'],
    ['2026-11-25', null],
    [' 2026-11-01 ', null],
  ] as const)('markingDateError(%j)', (input, want) => {
    expect(markingDateError(input, '2026-11-25')).toBe(want);
  });
});

describe('schoolToday', () => {
  it('is the Karachi day whatever the device zone says', () => {
    expect(schoolToday(new Date('2026-11-24T20:00:00Z'))).toBe('2026-11-25'); // 01:00 PKT
    expect(schoolToday(new Date('2026-11-25T18:59:00Z'))).toBe('2026-11-25'); // 23:59 PKT
    expect(schoolToday(new Date('2026-11-25T19:00:00Z'))).toBe('2026-11-26'); // 00:00 PKT
  });
  it('falls back to the device day for an unknown zone', () => {
    expect(schoolToday(new Date(2026, 0, 5, 12), 'Not/AZone')).toBe('2026-01-05');
  });
});

describe('months', () => {
  it('monthOf / addMonths', () => {
    expect(monthOf('2026-11-25')).toBe('2026-11');
    expect(addMonths('2026-11', 1)).toBe('2026-12');
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-03', -14)).toBe('2025-01');
  });
  it('monthRange covers leap February', () => {
    expect(monthRange('2024-02')).toEqual({ from: '2024-02-01', to: '2024-02-29' });
    expect(monthRange('2026-11')).toEqual({ from: '2026-11-01', to: '2026-11-30' });
  });
  it('monthGrid: Monday-first weeks of 7, every day once', () => {
    const g = monthGrid('2026-11'); // 1 Nov 2026 is a Sunday
    expect(g.every((w) => w.length === 7)).toBe(true);
    expect(g[0]).toEqual([null, null, null, null, null, null, '2026-11-01']);
    const days = g.flat().filter(Boolean);
    expect(days).toHaveLength(30);
    expect(days[29]).toBe('2026-11-30');
    expect(g).toHaveLength(6);
  });
  it('monthGrid for a month starting on Monday has no leading padding', () => {
    expect(monthGrid('2026-06')[0]![0]).toBe('2026-06-01');
  });
});

describe('counting', () => {
  it('tallies known statuses only', () => {
    expect(tallyStatuses(['present', 'late', 'absent', 'leave', 'present', 'sick', null])).toEqual({
      present: 2,
      absent: 1,
      late: 1,
      leave: 1,
    });
  });
  it('rate: late counts as at school, leave is left out, nothing counted = null', () => {
    expect(attendanceRate({ present: 18, late: 1, absent: 1, leave: 3 })).toBe(95);
    expect(attendanceRate({ present: 0, late: 0, absent: 0, leave: 4 })).toBeNull();
    expect(attendanceRate({ present: 0, late: 0, absent: 0, leave: 0 })).toBeNull();
    expect(attendanceRate({ present: 2, late: 0, absent: 1, leave: 0 })).toBe(67);
  });
  it('isAttendanceStatus', () => {
    expect(isAttendanceStatus('leave')).toBe(true);
    expect(isAttendanceStatus('Present')).toBe(false);
    expect(isAttendanceStatus(1)).toBe(false);
  });
});

describe('marking', () => {
  const ids = ['e1', 'e2', 'e3'];
  it('seeds everyone present, recorded marks on top, strangers ignored', () => {
    expect(seedMarks(ids, { e2: 'absent', x: 'late' })).toEqual({
      e1: 'present',
      e2: 'absent',
      e3: 'present',
    });
  });
  it('changedFromSaved: only recorded marks that differ', () => {
    const saved = { e1: 'present', e2: 'absent' } as const;
    expect(changedFromSaved(saved, { e1: 'present', e2: 'late', e3: 'absent' })).toEqual(['e2']);
  });
  it('needsReason: past day with a recorded change only', () => {
    const saved = { e1: 'present' } as const;
    expect(needsReason('2026-11-24', '2026-11-25', saved, { e1: 'absent' })).toBe(true);
    expect(needsReason('2026-11-25', '2026-11-25', saved, { e1: 'absent' })).toBe(false);
    expect(needsReason('2026-11-24', '2026-11-25', {}, { e1: 'absent' })).toBe(false);
    expect(needsReason('2026-11-24', '2026-11-25', saved, { e1: 'present', e2: 'late' })).toBe(
      false,
    );
  });
  it('payload: roster order, missing = present, blank reason = null, round trip', () => {
    const p = buildAttendancePayload(
      'c1',
      '2026-11-25',
      ids,
      { e2: 'late', e3: 'leave' },
      '  ',
      new Date('2026-11-25T03:00:00Z'),
    );
    expect(p).toEqual({
      class_id: 'c1',
      on_date: '2026-11-25',
      marks: [
        { enrollment_id: 'e1', status: 'present' },
        { enrollment_id: 'e2', status: 'late' },
        { enrollment_id: 'e3', status: 'leave' },
      ],
      reason: null,
      taken_at: '2026-11-25T03:00:00.000Z',
    });
    expect(payloadMarks(p)).toEqual({ e1: 'present', e2: 'late', e3: 'leave' });
    expect(buildAttendancePayload('c1', 'd', [], {}, ' Note ').reason).toBe('Note');
  });
  it('one queue key per class-day', () => {
    expect(attendanceKey('c1', '2026-11-25')).toBe('c1:2026-11-25');
  });
  it('maps record_attendance() messages', () => {
    expect(attendanceRpcError('reason_required')).toBe('reason_required');
    expect(attendanceRpcError('ERROR: enrollment_not_active')).toBe('enrollment_not_active');
    expect(attendanceRpcError('date_in_future')).toBe('date_in_future');
    expect(attendanceRpcError('something else')).toBeNull();
    expect(attendanceRpcError(null)).toBeNull();
  });
});
