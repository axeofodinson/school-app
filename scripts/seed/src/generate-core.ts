// School structure for the tables that exist before 017: year, classes,
// subjects, students, enrollments, staff, teacher assignments. Pure: same seed
// string in, same rows out. No database access here.
import type { IdFn } from './uuid.ts';
import { rng } from './rng.ts';
import { BOY_NAMES, FAMILY_NAMES, FATHER_NAMES, GIRL_NAMES } from './names.ts';
import { className, staffEmail, studentCode, testName, YEAR_LABEL } from './markers.ts';
import { EARLY_YEARS_SUBJECTS, SPEC, subjectsForLevel, TEACHER_POOLS } from './spec.ts';

export interface YearRow {
  id: string;
  label: string;
  starts_on: string;
  ends_on: string;
  is_current: boolean;
}
export interface ClassRow {
  id: string;
  name: string;
  grade_level: number;
  sort_order: number;
}
export interface SubjectRow {
  id: string;
  class_id: string;
  name: string;
  sort_order: number;
}
export interface StudentRow {
  id: string;
  student_code: string;
  full_name: string;
  date_of_birth: string;
  admission_date: string;
  guardian_name: string;
  guardian_phone: string;
}
export interface EnrollmentRow {
  id: string;
  student_id: string;
  class_id: string;
  year_id: string;
  roll_number: number;
  status: 'active';
}
export interface StaffRow {
  id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'teacher';
  speciality: string | null;
}
export interface TeacherAssignmentRow {
  id: string;
  teacher_id: string;
  class_id: string;
  subject_id: string | null;
  year_id: string;
}

export interface CoreData {
  year: YearRow;
  classes: ClassRow[];
  /** class id → grade key + section, for the LMS generator */
  classMeta: Map<string, { gradeKey: string; section: string }>;
  subjects: SubjectRow[];
  students: StudentRow[];
  enrollments: EnrollmentRow[];
  staff: StaffRow[];
  admin: StaffRow;
  teacherAssignments: TeacherAssignmentRow[];
}

const pad = (n: number, w = 2): string => String(n).padStart(w, '0');

export function generateCore(id: IdFn): CoreData {
  const year: YearRow = {
    id: id('academic_year', YEAR_LABEL),
    label: YEAR_LABEL,
    starts_on: '2026-04-01',
    ends_on: '2027-03-31',
    is_current: true,
  };

  const classes: ClassRow[] = [];
  const classMeta = new Map<string, { gradeKey: string; section: string }>();
  const subjects: SubjectRow[] = [];
  for (const g of SPEC.grades) {
    SPEC.sections.forEach((section, si) => {
      const c: ClassRow = {
        id: id('class', g.key, section),
        name: className(g.base, section),
        grade_level: g.level,
        sort_order: 1000 + g.level * 10 + si,
      };
      classes.push(c);
      classMeta.set(c.id, { gradeKey: g.key, section });
      subjectsForLevel(g.level).forEach((name, i) => {
        subjects.push({
          id: id('subject', g.key, section, name),
          class_id: c.id,
          name,
          sort_order: i,
        });
      });
    });
  }

  // Students: spread 656 over the sections, ≈ 30 each (the first sections get one extra).
  const students: StudentRow[] = [];
  const enrollments: EnrollmentRow[] = [];
  const perSection = Math.floor(SPEC.students / classes.length);
  const extra = SPEC.students % classes.length;
  let n = 0;
  classes.forEach((c, ci) => {
    const size = perSection + (ci < extra ? 1 : 0);
    const level = c.grade_level;
    for (let roll = 1; roll <= size; roll++) {
      n++;
      const r = rng(`student:${n}`);
      const girl = r.chance(0.5);
      const first = r.pick(girl ? GIRL_NAMES : BOY_NAMES);
      const family = r.pick(FAMILY_NAMES);
      const birthYear = 2026 - (level + 4) - r.int(0, 1);
      const s: StudentRow = {
        id: id('student', n),
        student_code: studentCode(n),
        full_name: testName(`${first} ${family}`),
        date_of_birth: `${birthYear}-${pad(r.int(1, 12))}-${pad(r.int(1, 28))}`,
        admission_date: `${2026 - r.int(0, Math.min(level, 6))}-04-0${r.int(1, 9)}`,
        guardian_name: testName(`${r.pick(FATHER_NAMES)} ${family}`),
        guardian_phone: `0300-${pad(n, 7)}`,
      };
      students.push(s);
      enrollments.push({
        id: id('enrollment', n, year.label),
        student_id: s.id,
        class_id: c.id,
        year_id: year.id,
        roll_number: roll,
        status: 'active',
      });
    }
  });

  // Staff: one admin + 30 teachers grouped by speciality.
  const admin: StaffRow = {
    id: id('staff', 'admin'),
    email: staffEmail('admin'),
    full_name: testName('Admin Office'),
    role: 'admin',
    speciality: null,
  };
  const staff: StaffRow[] = [admin];
  const pools = new Map<string, StaffRow[]>();
  let t = 0;
  for (const [speciality, count] of Object.entries(TEACHER_POOLS)) {
    for (let k = 0; k < count; k++) {
      t++;
      const r = rng(`teacher:${t}`);
      const girl = r.chance(0.6);
      const row: StaffRow = {
        id: id('staff', 'teacher', t),
        email: staffEmail(`teacher${pad(t)}`),
        full_name: testName(`${r.pick(girl ? GIRL_NAMES : BOY_NAMES)} ${r.pick(FAMILY_NAMES)}`),
        role: 'teacher',
        speciality,
      };
      staff.push(row);
      pools.set(speciality, [...(pools.get(speciality) ?? []), row]);
    }
  }
  const teachers = staff.filter((s) => s.role === 'teacher');

  const teacherAssignments: TeacherAssignmentRow[] = [];
  // Class teacher (subject_id null): round-robin over all teachers.
  classes.forEach((c, ci) => {
    const teacher = teachers[ci % teachers.length]!;
    teacherAssignments.push({
      id: id('teacher_assignment', c.id, 'class'),
      teacher_id: teacher.id,
      class_id: c.id,
      subject_id: null,
      year_id: year.id,
    });
  });
  // Subject teachers: each subject slot goes to its speciality pool in turn.
  const turn = new Map<string, number>();
  for (const s of subjects) {
    const poolKey = EARLY_YEARS_SUBJECTS.has(s.name) ? 'Early Years' : s.name;
    const pool = pools.get(poolKey);
    if (!pool) throw new Error(`no teacher pool for subject ${s.name}`);
    const k = turn.get(poolKey) ?? 0;
    turn.set(poolKey, k + 1);
    teacherAssignments.push({
      id: id('teacher_assignment', s.class_id, s.id),
      teacher_id: pool[k % pool.length]!.id,
      class_id: s.class_id,
      subject_id: s.id,
      year_id: year.id,
    });
  }

  return {
    year,
    classes,
    classMeta,
    subjects,
    students,
    enrollments,
    staff,
    admin,
    teacherAssignments,
  };
}
