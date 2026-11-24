import { describe, expect, it } from 'vitest';
import { makeIdFn, uuidv5 } from '../src/uuid.ts';
import { rng } from '../src/rng.ts';
import { PRODUCTION_REFS, resolveTarget } from '../src/target.ts';
import { generateCore } from '../src/generate-core.ts';
import { generateLms } from '../src/generate-lms.ts';
import { SPEC } from '../src/spec.ts';

const DNS = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
const PROD = PRODUCTION_REFS[0];
const DEV = 'abcdefghijklmnopqrst';

describe('uuidv5', () => {
  it('matches the RFC 4122 reference value', () => {
    expect(uuidv5('www.example.com', DNS)).toBe('2ed6657d-e927-568b-95e1-2665a8aea6a2');
  });
  it('is stable per seed string and differs across seeds', () => {
    expect(makeIdFn('a')('student', 1)).toBe(makeIdFn('a')('student', 1));
    expect(makeIdFn('a')('student', 1)).not.toBe(makeIdFn('b')('student', 1));
  });
});

describe('rng', () => {
  it('is deterministic per key', () => {
    const a = rng('k');
    const b = rng('k');
    expect([a.next(), a.next(), a.int(1, 6)]).toEqual([b.next(), b.next(), b.int(1, 6)]);
  });
});

describe('target guard', () => {
  const ok = (url: string, extra = {}) => resolveTarget({ SEED_DATABASE_URL: url, ...extra });
  it('needs a URL', () => expect(resolveTarget({}).ok).toBe(false));
  it('allows local Postgres', () => {
    expect(ok('postgresql://postgres@localhost:54329/t').ok).toBe(true);
    expect(ok('postgresql://postgres@127.0.0.1/t').ok).toBe(true);
    expect(ok('postgresql://postgres@/t?host=/var/run/postgresql').ok).toBe(true);
  });
  it('refuses production however it is written or allow-listed', () => {
    for (const url of [
      `postgresql://postgres:x@db.${PROD}.supabase.co:5432/postgres`,
      `postgresql://postgres.${PROD}:x@aws-0-ap-south-1.pooler.supabase.com:5432/postgres`,
      `postgresql://postgres@localhost/t?note=${PROD}`,
    ]) {
      const r = ok(url, {
        SEED_ALLOWED_REFS: PROD,
        DEV_SUPABASE_URL: `https://${PROD}.supabase.co`,
      });
      expect(r.ok).toBe(false);
    }
  });
  it('allows only allow-listed Supabase dev refs', () => {
    const direct = `postgresql://postgres:x@db.${DEV}.supabase.co:5432/postgres`;
    const pooler = `postgresql://postgres.${DEV}:x@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`;
    expect(ok(direct).ok).toBe(false);
    expect(ok(direct, { DEV_SUPABASE_URL: `https://${DEV}.supabase.co` }).ok).toBe(true);
    expect(ok(pooler, { SEED_ALLOWED_REFS: `zzz, ${DEV}` }).ok).toBe(true);
  });
  it('refuses unknown hosts', () => {
    expect(ok('postgresql://u:p@db.example.com:5432/x').ok).toBe(false);
    expect(ok('mysql://localhost/x').ok).toBe(false);
  });
});

describe('generated dataset', () => {
  const id = makeIdFn('test-seed');
  const core = generateCore(id);
  const learnerByStudent = new Map(core.students.map((s) => [s.id, id('learner', s.id)]));
  const lms = generateLms(id, core, { anchor: '2026-11-24T12:00:00Z', learnerByStudent });

  it('matches the spec counts', () => {
    expect(core.students).toHaveLength(656);
    expect(core.enrollments).toHaveLength(656);
    expect(core.classes).toHaveLength(SPEC.grades.length * SPEC.sections.length);
    expect(core.staff.filter((s) => s.role === 'teacher')).toHaveLength(30);
    expect(core.staff.filter((s) => s.role === 'admin')).toHaveLength(1);
    const L = SPEC.lms;
    const topics = L.subjects.length * L.chaptersPerSubject * L.topicsPerChapter;
    expect(lms.topics).toHaveLength(topics);
    expect(lms.concepts).toHaveLength(topics * L.conceptsPerTopic);
    expect(lms.questions).toHaveLength(topics * L.questionsPerTopic);
  });

  it('marks every person and class as TEST', () => {
    expect(
      core.students.every(
        (s) => s.full_name.endsWith('(TEST)') && s.student_code.startsWith('TEST-'),
      ),
    ).toBe(true);
    expect(
      core.staff.every((s) => s.full_name.endsWith('(TEST)') && s.email.endsWith('.invalid')),
    ).toBe(true);
    expect(core.classes.every((c) => c.name.startsWith('TEST '))).toBe(true);
  });

  it('keeps sections near 30 students', () => {
    const sizes = new Map<string, number>();
    for (const e of core.enrollments) sizes.set(e.class_id, (sizes.get(e.class_id) ?? 0) + 1);
    for (const n of sizes.values()) {
      expect(n).toBeGreaterThanOrEqual(25);
      expect(n).toBeLessThanOrEqual(35);
    }
  });

  it('assigns a teacher to every subject of every section', () => {
    const covered = new Set(core.teacherAssignments.map((t) => t.subject_id));
    expect(core.subjects.every((s) => covered.has(s.id))).toBe(true);
  });

  it('has unique primary keys', () => {
    for (const rows of [
      core.students,
      core.classes,
      core.subjects,
      lms.questions,
      lms.practiceAttempts,
      lms.followUps,
      lms.examSessions,
    ]) {
      const ids = rows.map((r) => (r as { id: string }).id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('tags every question with concept + cognitive level, with some maths SVG and diagrams', () => {
    expect(lms.questions.every((q) => q.concept_id && q.cognitive_level)).toBe(true);
    const share = (pred: (b: Record<string, unknown>) => boolean) =>
      lms.questions.filter((q) => pred(q.body as Record<string, unknown>)).length /
      lms.questions.length;
    expect(share((b) => 'math_svg' in b)).toBeCloseTo(0.1, 2);
    const figures = share((b) => 'figure' in b);
    expect(figures).toBeGreaterThan(0.04);
    expect(figures).toBeLessThan(0.06);
  });

  it('keeps one open follow-up per learner, concept and kind', () => {
    const open = lms.followUps
      .filter((f) => f.status === 'open')
      .map((f) => `${f.learner_id}:${f.concept_id}:${f.kind}`);
    expect(new Set(open).size).toBe(open.length);
  });

  it('puts all history inside the 90 days before the anchor', () => {
    const anchor = Date.parse('2026-11-24T12:00:00Z');
    for (const a of lms.practiceAttempts) {
      const t = Date.parse(a.started_at as string);
      expect(t).toBeLessThan(anchor);
      expect(t).toBeGreaterThan(anchor - 91 * 86_400_000);
    }
  });

  it('is deterministic', () => {
    const again = generateLms(id, generateCore(id), {
      anchor: '2026-11-24T12:00:00Z',
      learnerByStudent,
    });
    expect(JSON.stringify(again.practiceAttempts)).toBe(JSON.stringify(lms.practiceAttempts));
  });
});
