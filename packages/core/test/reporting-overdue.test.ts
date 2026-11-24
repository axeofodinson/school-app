// Every case from scripts/verify-overdue.mjs against the core port, then the old
// src/reporting/overdue.js and the port side by side on the same fixtures.
import { describe, expect, it } from 'vitest';

import {
  buildOverdueDashboard,
  compareRoster,
  daysBetweenISO,
  isoDaysBefore,
  isOverdue,
  type OverdueCard,
  type OverdueEnrollment,
} from '../src/reporting';
import { legacy, rng } from './legacy';

const TODAY = '2026-07-13';

describe('daysBetweenISO', () => {
  it('12 days', () => expect(daysBetweenISO('2026-07-01', TODAY)).toBe(12));
  it('same day -> 0', () => expect(daysBetweenISO(TODAY, TODAY)).toBe(0));
  it('spans a month boundary', () => expect(daysBetweenISO('2026-06-30', TODAY)).toBe(13));
  it('missing from -> null', () => expect(daysBetweenISO(null, TODAY)).toBeNull());
  it('blank from -> null', () => expect(daysBetweenISO('', TODAY)).toBeNull());
});

describe('isOverdue (threshold 10)', () => {
  it('due 10 days ago -> overdue', () => expect(isOverdue('2026-07-03', TODAY)).toBe(true));
  it('due 9 days ago -> not yet', () => expect(isOverdue('2026-07-04', TODAY)).toBe(false));
  it('due today -> not overdue', () => expect(isOverdue(TODAY, TODAY)).toBe(false));
  it('no due date -> not overdue', () => expect(isOverdue(null, TODAY)).toBe(false));
  it('custom threshold 3', () => expect(isOverdue('2026-07-10', TODAY, 3)).toBe(true));
});

describe('isoDaysBefore (query cutoff)', () => {
  it('10 days before', () => expect(isoDaysBefore(TODAY)).toBe('2026-07-03'));
  it('cutoff date is itself overdue', () =>
    expect(isOverdue(isoDaysBefore(TODAY), TODAY)).toBe(true));
  it('across a year boundary', () => expect(isoDaysBefore('2026-01-05', 10)).toBe('2025-12-26'));
});

const assessments = [
  {
    id: 'a1',
    title: 'Maths HW 1',
    class_id: 'C1',
    scheduled_on: '2026-07-01',
    className: 'Class 5',
    subjectName: 'Maths',
  },
  {
    id: 'a2',
    title: 'Science HW',
    class_id: 'C2',
    scheduled_on: '2026-07-10',
    className: 'Class 6',
    subjectName: 'Science',
  },
  {
    id: 'a3',
    title: 'Maths HW 2',
    class_id: 'C1',
    scheduled_on: '2026-07-03',
    className: 'Class 5',
    subjectName: 'Maths',
  },
];
const enrollments: OverdueEnrollment[] = [
  { id: 'e1', class_id: 'C1', roll_number: 2, student: { full_name: 'Bilal' } },
  { id: 'e2', class_id: 'C1', roll_number: 1, student: { full_name: 'Aisha' } },
  { id: 'e3', class_id: 'C1', roll_number: null, student: { full_name: 'Zoya' } },
  { id: 'e4', class_id: 'C2', roll_number: 1, student: { full_name: 'Omar' } },
];
const submissions = [
  { assessment_id: 'a1', enrollment_id: 'e2', submitted_at: '2026-07-02T09:00:00Z' },
  { assessment_id: 'a1', enrollment_id: 'e1', submitted_at: null },
  { assessment_id: 'a3', enrollment_id: 'e3', submitted_at: '2026-07-04T09:00:00Z' },
];

const summarize = (cards: OverdueCard[]) =>
  cards.map((c) => ({
    id: c.id,
    className: c.className,
    subjectName: c.subjectName,
    daysOverdue: c.daysOverdue,
    totalActive: c.totalActive,
    missing: c.missing.map((m) => m.id),
  }));

describe('buildOverdueDashboard', () => {
  const cards = buildOverdueDashboard({ assessments, enrollments, submissions, today: TODAY });
  it('only overdue assignments, in input order', () =>
    expect(cards.map((c) => c.id)).toEqual(['a1', 'a3']));
  it('missing lists are roll-sorted; a score-only row does not count', () =>
    expect(summarize(cards)).toEqual([
      {
        id: 'a1',
        className: 'Class 5',
        subjectName: 'Maths',
        daysOverdue: 12,
        totalActive: 3,
        missing: ['e1', 'e3'],
      },
      {
        id: 'a3',
        className: 'Class 5',
        subjectName: 'Maths',
        daysOverdue: 10,
        totalActive: 3,
        missing: ['e2', 'e1'],
      },
    ]));
  it('all submitted -> no missing students', () =>
    expect(
      summarize(
        buildOverdueDashboard({
          assessments: [assessments[2]!],
          enrollments: enrollments.filter((e) => e.class_id === 'C1'),
          submissions: ['e1', 'e2', 'e3'].map((e) => ({
            assessment_id: 'a3',
            enrollment_id: e,
            submitted_at: '2026-07-04T00:00:00Z',
          })),
          today: TODAY,
        }),
      ),
    ).toEqual([
      {
        id: 'a3',
        className: 'Class 5',
        subjectName: 'Maths',
        daysOverdue: 10,
        totalActive: 3,
        missing: [],
      },
    ]));
  it('empty roster -> totalActive 0, no missing', () =>
    expect(
      summarize(
        buildOverdueDashboard({
          assessments: [assessments[0]!],
          enrollments: [],
          submissions: [],
          today: TODAY,
        }),
      ),
    ).toEqual([
      {
        id: 'a1',
        className: 'Class 5',
        subjectName: 'Maths',
        daysOverdue: 12,
        totalActive: 0,
        missing: [],
      },
    ]));
  it('nothing overdue -> empty dashboard', () =>
    expect(
      buildOverdueDashboard({
        assessments: [assessments[1]!],
        enrollments,
        submissions,
        today: TODAY,
      }),
    ).toEqual([]));
  it('compareRoster: numbered first, then by name', () =>
    expect([...enrollments].sort(compareRoster).map((e) => e.id)).toEqual([
      'e2',
      'e4',
      'e1',
      'e3',
    ]));
});

describe('parity with src/reporting/overdue.js', () => {
  it('verify fixture: identical cards', async () => {
    const old = await legacy('src/reporting/overdue.js');
    expect(buildOverdueDashboard({ assessments, enrollments, submissions, today: TODAY })).toEqual(
      old.buildOverdueDashboard!({ assessments, enrollments, submissions, today: TODAY }),
    );
  });
  it('200 seeded random schools: identical cards', async () => {
    const old = await legacy('src/reporting/overdue.js');
    const names = ['Aisha', 'Bilal', 'Zoya', 'Omar', 'Hina', 'علی', ''];
    for (let seed = 1; seed <= 200; seed++) {
      const r = rng(seed);
      const classes = ['C1', 'C2', 'C3'];
      const ens = Array.from({ length: r.int(0, 15) }, (_, i) => ({
        id: `e${i}`,
        class_id: r.pick(classes),
        roll_number: r.next() < 0.2 ? null : r.int(1, 8),
        student: { full_name: r.pick(names) },
      }));
      const as = Array.from({ length: r.int(0, 6) }, (_, i) => ({
        id: `a${i}`,
        title: `HW ${i}`,
        class_id: r.pick(classes),
        scheduled_on: r.next() < 0.1 ? null : `2026-07-${String(r.int(1, 13)).padStart(2, '0')}`,
        className: r.pick(['Class 5', null]),
        subjectName: r.pick(['Maths', undefined]),
      }));
      const subs = Array.from({ length: r.int(0, 30) }, () => ({
        assessment_id: `a${r.int(0, 6)}`,
        enrollment_id: `e${r.int(0, 15)}`,
        submitted_at: r.next() < 0.3 ? null : '2026-07-05T00:00:00Z',
      }));
      const days = r.pick([3, 10]);
      const input = {
        assessments: as,
        enrollments: ens,
        submissions: subs,
        today: TODAY,
        overdueDays: days,
      };
      expect(buildOverdueDashboard(input), `seed ${seed}`).toEqual(
        old.buildOverdueDashboard!(input),
      );
    }
  });
});
