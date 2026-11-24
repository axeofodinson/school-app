// How seeded rows are recognised. Tables created by 017+ carry
// `is_test_data = true`; the older tables (classes, subjects, academic_years,
// enrollments, teacher_assignments, …) have no such column, so their rows are
// found through these name markers or through a flagged parent. remove.ts uses
// exactly these patterns, so keep the two in step.

/** Every seeded human-readable name starts or ends with this. */
export const TEST = 'TEST';

export const YEAR_LABEL = 'TEST 2026-27';
export const YEAR_LABEL_LIKE = 'TEST %';

export const CLASS_NAME_LIKE = 'TEST %';
export const className = (base: string, section: string): string => `TEST ${base}-${section}`;

/** Admission numbers: TEST-0001 … TEST-0656. Real codes never start with TEST-. */
export const STUDENT_CODE_LIKE = 'TEST-%';
export const studentCode = (n: number): string => `TEST-${String(n).padStart(4, '0')}`;

/** Staff logins live on a reserved (.invalid) domain that can never receive mail. */
export const STAFF_EMAIL_DOMAIN = 'seed.school.invalid';
export const STAFF_EMAIL_LIKE = `%@${STAFF_EMAIL_DOMAIN}`;
export const staffEmail = (local: string): string => `${local}@${STAFF_EMAIL_DOMAIN}`;

/** Person names: "Ayesha Khan (TEST)". */
export const testName = (name: string): string => `${name} (${TEST})`;

export const CURRICULUM_CODE = 'TEST-PTB';
export const CURRICULUM_CODE_LIKE = 'TEST-%';
