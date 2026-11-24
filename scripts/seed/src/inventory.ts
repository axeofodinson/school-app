// The single definition of "which rows are seed data", used both to count them
// (seed report, remove verification) and to delete them (remove.ts). Rows are
// found by is_test_data where the column exists, by the name markers in
// markers.ts, or by belonging to a flagged parent.
import { columnsOf, tableExists, type Client } from './db.ts';
import {
  CLASS_NAME_LIKE,
  CURRICULUM_CODE_LIKE,
  STAFF_EMAIL_LIKE,
  STUDENT_CODE_LIKE,
  YEAR_LABEL_LIKE,
} from './markers.ts';

const lit = (s: string): string => `'${s.replace(/'/g, "''")}'`;

interface Schema {
  has(table: string): boolean;
  hasCol(table: string, col: string): boolean;
}

async function readSchema(c: Client, tables: string[]): Promise<Schema> {
  const present = new Map<string, Set<string>>();
  for (const t of tables) if (await tableExists(c, t)) present.set(t, await columnsOf(c, t));
  return {
    has: (t) => present.has(t),
    hasCol: (t, col) => present.get(t)?.has(col) ?? false,
  };
}

const ALL_TABLES = [
  'public.academic_years',
  'public.classes',
  'public.subjects',
  'public.chapters',
  'public.questions',
  'public.students',
  'public.enrollments',
  'public.teacher_assignments',
  'public.assessments',
  'public.assessment_questions',
  'public.submissions',
  'public.submission_grade_edits',
  'public.attendance',
  'public.profiles',
  'public.push_tokens',
  'public.messages',
  'public.curricula',
  'public.topics',
  'public.concepts',
  'public.concept_prerequisites',
  'public.question_versions',
  'public.item_approvals',
  'public.item_reviews',
  'public.import_batches',
  'public.learning_content',
  'public.learning_content_versions',
  'public.practice_attempts',
  'public.concept_mastery',
  'public.follow_ups',
  'public.gate_overrides',
  'public.exam_sessions',
  'public.exam_session_answers',
  'public.exam_events',
  'public.projects',
  'public.project_concepts',
  'public.project_rubric_criteria',
  'public.project_teams',
  'public.project_team_members',
  'public.project_scores',
  'auth.users',
  'auth.identities',
];

/** Temp id sets, created in this order (later ones read earlier ones). */
function idSets(s: Schema): { name: string; sql: string }[] {
  const flag = (t: string): string => (s.hasCol(t, 'is_test_data') ? ` or is_test_data` : '');
  const sets: { name: string; sql: string }[] = [
    {
      name: 'seed_years',
      sql: `select id from public.academic_years where label like ${lit(YEAR_LABEL_LIKE)}`,
    },
    {
      name: 'seed_classes',
      sql: `select id from public.classes where name like ${lit(CLASS_NAME_LIKE)}`,
    },
    {
      name: 'seed_students',
      sql: `select id from public.students where student_code like ${lit(STUDENT_CODE_LIKE)}${flag('public.students')}`,
    },
    {
      name: 'seed_auth',
      sql: `select id from auth.users where email like ${lit(STAFF_EMAIL_LIKE)}
              or email in (select 's.' || replace(id::text, '-', '') || '@students.school.invalid' from seed_students)`,
    },
    {
      name: 'seed_profiles',
      sql: `select id from public.profiles where id in (select id from seed_auth)${
        s.hasCol('public.profiles', 'student_id')
          ? ' or student_id in (select id from seed_students)'
          : ''
      }${flag('public.profiles')}`,
    },
    {
      name: 'seed_subjects',
      sql: `select id from public.subjects where class_id in (select id from seed_classes)`,
    },
    {
      name: 'seed_enrollments',
      sql: `select id from public.enrollments where student_id in (select id from seed_students)
              or class_id in (select id from seed_classes) or year_id in (select id from seed_years)`,
    },
    {
      name: 'seed_assessments',
      sql: `select id from public.assessments where class_id in (select id from seed_classes)
              or year_id in (select id from seed_years) or subject_id in (select id from seed_subjects)`,
    },
  ];
  const lms = s.has('public.topics');
  sets.push(
    {
      name: 'seed_curricula',
      sql: s.has('public.curricula')
        ? `select id from public.curricula where code like ${lit(CURRICULUM_CODE_LIKE)}`
        : 'select null::uuid as id where false',
    },
    {
      name: 'seed_chapters',
      sql: `select id from public.chapters where subject_id in (select id from seed_subjects)${
        s.hasCol('public.chapters', 'curriculum_id')
          ? ' or curriculum_id in (select id from seed_curricula)'
          : ''
      }`,
    },
    {
      name: 'seed_topics',
      sql: lms
        ? `select id from public.topics where chapter_id in (select id from seed_chapters)${flag('public.topics')}`
        : 'select null::uuid as id where false',
    },
    {
      name: 'seed_concepts',
      sql: lms
        ? `select id from public.concepts where topic_id in (select id from seed_topics)${flag('public.concepts')}`
        : 'select null::uuid as id where false',
    },
    {
      name: 'seed_questions',
      sql: `select id from public.questions where chapter_id in (select id from seed_chapters)${flag('public.questions')}${
        s.hasCol('public.questions', 'concept_id')
          ? ' or concept_id in (select id from seed_concepts)'
          : ''
      }`,
    },
    {
      name: 'seed_content',
      sql: s.has('public.learning_content')
        ? `select id from public.learning_content where topic_id in (select id from seed_topics)${flag('public.learning_content')}`
        : 'select null::uuid as id where false',
    },
    {
      name: 'seed_sessions',
      sql: s.has('public.exam_sessions')
        ? `select id from public.exam_sessions where assessment_id in (select id from seed_assessments)
             or learner_id in (select id from seed_profiles) or enrollment_id in (select id from seed_enrollments)`
        : 'select null::uuid as id where false',
    },
    {
      name: 'seed_projects',
      sql: s.has('public.projects')
        ? `select id from public.projects where subject_id in (select id from seed_subjects)${flag('public.projects')}`
        : 'select null::uuid as id where false',
    },
  );
  return sets;
}

export interface Step {
  table: string;
  where: string;
  /** append-only tables: their forbid_mutation trigger is disabled for the delete */
  immutableTrigger?: string;
}

const inSet = (col: string, set: string): string => `${col} in (select id from ${set})`;

/** Child-first: deleting in this order never trips a foreign key. */
function steps(s: Schema): Step[] {
  const all: Step[] = [
    { table: 'public.exam_events', where: inSet('session_id', 'seed_sessions') },
    { table: 'public.exam_session_answers', where: inSet('session_id', 'seed_sessions') },
    { table: 'public.exam_sessions', where: inSet('id', 'seed_sessions') },
    {
      table: 'public.project_scores',
      where: `${inSet('assessment_id', 'seed_assessments')} or ${inSet('enrollment_id', 'seed_enrollments')}`,
    },
    {
      table: 'public.project_team_members',
      where: `${inSet('assessment_id', 'seed_assessments')} or ${inSet('enrollment_id', 'seed_enrollments')}`,
    },
    { table: 'public.project_teams', where: inSet('assessment_id', 'seed_assessments') },
    {
      table: 'public.gate_overrides',
      where: `${inSet('learner_id', 'seed_profiles')} or ${inSet('subject_id', 'seed_subjects')} or ${inSet('topic_id', 'seed_topics')}`,
      immutableTrigger: 't_gate_overrides_immutable',
    },
    {
      table: 'public.follow_ups',
      where: `${inSet('learner_id', 'seed_profiles')} or ${inSet('concept_id', 'seed_concepts')} or ${inSet('subject_id', 'seed_subjects')}`,
    },
    {
      table: 'public.concept_mastery',
      where: `${inSet('learner_id', 'seed_profiles')} or ${inSet('concept_id', 'seed_concepts')}`,
    },
    {
      table: 'public.practice_attempts',
      where: `${inSet('learner_id', 'seed_profiles')} or ${inSet('topic_id', 'seed_topics')} or is_test_data`,
    },
    {
      table: 'public.submission_grade_edits',
      where: `submission_id in (select id from public.submissions where ${inSet('enrollment_id', 'seed_enrollments')} or ${inSet('assessment_id', 'seed_assessments')})`,
    },
    {
      table: 'public.submissions',
      where: `${inSet('enrollment_id', 'seed_enrollments')} or ${inSet('assessment_id', 'seed_assessments')}`,
    },
    { table: 'public.attendance', where: inSet('enrollment_id', 'seed_enrollments') },
    {
      table: 'public.assessment_questions',
      where: `${inSet('assessment_id', 'seed_assessments')} or ${inSet('question_id', 'seed_questions')}`,
    },
    { table: 'public.assessments', where: inSet('id', 'seed_assessments') },
    {
      table: 'public.project_concepts',
      where: `${inSet('project_id', 'seed_projects')} or ${inSet('concept_id', 'seed_concepts')}`,
    },
    {
      table: 'public.project_rubric_criteria',
      where: `${inSet('project_id', 'seed_projects')} or ${inSet('concept_id', 'seed_concepts')}`,
    },
    { table: 'public.projects', where: inSet('id', 'seed_projects') },
    {
      table: 'public.item_reviews',
      where: `(item_kind = 'question' and ${inSet('item_id', 'seed_questions')}) or (item_kind = 'content' and ${inSet('item_id', 'seed_content')}) or ${inSet('reviewer_id', 'seed_profiles')}`,
    },
    {
      table: 'public.item_approvals',
      where: `(item_kind = 'question' and ${inSet('item_id', 'seed_questions')}) or (item_kind = 'content' and ${inSet('item_id', 'seed_content')}) or ${inSet('approved_by', 'seed_profiles')}`,
    },
    {
      table: 'public.learning_content_versions',
      where: inSet('content_id', 'seed_content'),
      immutableTrigger: 't_lcv_immutable',
    },
    { table: 'public.learning_content', where: inSet('id', 'seed_content') },
    {
      table: 'public.question_versions',
      where: inSet('question_id', 'seed_questions'),
      immutableTrigger: 't_qv_immutable',
    },
    { table: 'public.questions', where: inSet('id', 'seed_questions') },
    { table: 'public.import_batches', where: inSet('imported_by', 'seed_profiles') },
    {
      table: 'public.concept_prerequisites',
      where: `${inSet('concept_id', 'seed_concepts')} or ${inSet('requires_concept_id', 'seed_concepts')}`,
    },
    { table: 'public.concepts', where: inSet('id', 'seed_concepts') },
    { table: 'public.topics', where: inSet('id', 'seed_topics') },
    { table: 'public.chapters', where: inSet('id', 'seed_chapters') },
    { table: 'public.curricula', where: inSet('id', 'seed_curricula') },
    {
      table: 'public.teacher_assignments',
      where: `${inSet('class_id', 'seed_classes')} or ${inSet('year_id', 'seed_years')} or ${inSet('teacher_id', 'seed_profiles')}`,
    },
    { table: 'public.push_tokens', where: inSet('student_id', 'seed_students') },
    {
      table: 'public.messages',
      where: `(scope = 'class' and ${inSet('target_id', 'seed_classes')}) or (scope = 'student' and ${inSet('target_id', 'seed_students')}) or ${inSet('sender_id', 'seed_profiles')}`,
    },
    { table: 'public.enrollments', where: inSet('id', 'seed_enrollments') },
    { table: 'public.subjects', where: inSet('id', 'seed_subjects') },
    { table: 'public.classes', where: inSet('id', 'seed_classes') },
    { table: 'public.academic_years', where: inSet('id', 'seed_years') },
    { table: 'public.profiles', where: inSet('id', 'seed_profiles') },
    { table: 'auth.identities', where: inSet('user_id', 'seed_auth') },
    { table: 'auth.users', where: inSet('id', 'seed_auth') },
    { table: 'public.students', where: inSet('id', 'seed_students') },
  ];
  return all.filter((st) => {
    if (!s.has(st.table)) return false;
    // drop is_test_data clauses on tables that predate it
    if (st.where.includes('is_test_data') && !s.hasCol(st.table, 'is_test_data')) {
      st.where = st.where.replace(/ or is_test_data/, '');
    }
    return true;
  });
}

/** Builds the temp id sets in this session and returns the ordered steps. */
export async function prepare(c: Client): Promise<Step[]> {
  const schema = await readSchema(c, ALL_TABLES);
  for (const set of idSets(schema)) {
    await c.query(`drop table if exists pg_temp.${set.name}`);
    await c.query(`create temp table ${set.name} as ${set.sql}`);
    await c.query(`create index on ${set.name} (id)`);
    await c.query(`analyze ${set.name}`);
  }
  return steps(schema);
}

/** Seed rows per table (order = deletion order). */
export async function countSeedRows(c: Client): Promise<{ table: string; n: number }[]> {
  const out: { table: string; n: number }[] = [];
  for (const st of await prepare(c)) {
    const r = await c.query<{ n: string }>(
      `select count(*)::text as n from ${st.table} where ${st.where}`,
    );
    out.push({ table: st.table, n: Number(r.rows[0]!.n) });
  }
  return out;
}
