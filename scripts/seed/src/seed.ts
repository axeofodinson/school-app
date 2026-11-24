// Seed the synthetic school (prompt 04). Usage, from the repo root:
//   SEED_DATABASE_URL=postgresql://… npm run seed:dev [-- --no-lms | --lms | --plan]
// --plan   print the row counts the generators produce; touch no database
// --lms    require the LMS part (fail if 017 is not applied)
// --no-lms skip it even when 017 is applied
// See scripts/seed/README.md.
import { insertRows, tableExists, type Client } from './db.ts';
import { generateCore, type CoreData } from './generate-core.ts';
import { generateLms, type LmsData } from './generate-lms.ts';
import { hasFlag, openTarget, seconds } from './guard.ts';
import { countSeedRows } from './inventory.ts';
import { STUDENT_CODE_LIKE } from './markers.ts';
import { makeIdFn } from './uuid.ts';

const SEED_STRING = process.env.SEED_STRING ?? 'alsyed-dev-seed-v1';
const ANCHOR = process.env.SEED_ANCHOR ?? '2026-11-24T12:00:00Z';
const STUDENT_PIN = process.env.SEED_STUDENT_PIN ?? '1234';
const STAFF_PASSWORD = process.env.SEED_STAFF_PASSWORD ?? 'test-password-2026';

function plan(core: CoreData, lms: LmsData | null): Record<string, number> {
  const out: Record<string, number> = {
    academic_years: 1,
    classes: core.classes.length,
    subjects: core.subjects.length,
    students: core.students.length,
    enrollments: core.enrollments.length,
    'staff (auth users + profiles)': core.staff.length,
    teacher_assignments: core.teacherAssignments.length,
  };
  if (lms) {
    for (const [k, v] of Object.entries(lms)) out[k] = Array.isArray(v) ? v.length : 1;
  }
  return out;
}

async function seedStaff(c: Client, core: CoreData, flagProfiles: boolean): Promise<number> {
  let n = 0;
  for (const s of core.staff) {
    const r = await c.query(
      `insert into auth.users (
         instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
         created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
         confirmation_token, recovery_token, email_change_token_new, email_change)
       select '00000000-0000-0000-0000-000000000000', $1::uuid, 'authenticated', 'authenticated',
              $2::text, crypt($3::text, gen_salt('bf')), now(), now(), now(),
              jsonb_build_object('provider','email','providers', jsonb_build_array('email')),
              jsonb_build_object('full_name', $4::text), '', '', '', ''
       where not exists (select 1 from auth.users where id = $1::uuid or email = $2::text)`,
      [s.id, s.email, STAFF_PASSWORD, s.full_name],
    );
    n += r.rowCount ?? 0;
    await c.query(
      `insert into auth.identities (id, user_id, provider_id, identity_data, provider,
                                    last_sign_in_at, created_at, updated_at)
       select $1::uuid, $1::uuid, $1::text,
              jsonb_build_object('sub', $1::text, 'email', $2::text), 'email', now(), now(), now()
       where not exists (select 1 from auth.identities where user_id = $1::uuid)`,
      [s.id, s.email],
    );
    // handle_new_user() made a 'pending' profile; promote it.
    await c.query(
      `insert into public.profiles (id, role, full_name) values ($1, $2, $3)
       on conflict (id) do update set role = excluded.role, full_name = excluded.full_name`,
      [s.id, s.role, s.full_name],
    );
  }
  if (flagProfiles) {
    await c.query(
      `update public.profiles set is_test_data = true
                   where id = any($1::uuid[]) and not is_test_data`,
      [core.staff.map((s) => s.id)],
    );
  }
  return n;
}

async function provisionStudents(
  c: Client,
  core: CoreData,
  flagProfiles: boolean,
): Promise<number> {
  // provision_student_login() checks is_staff() through auth.uid(): act as the seed admin.
  const claims = JSON.stringify({ sub: core.admin.id, role: 'authenticated' });
  await c.query(
    `select set_config('request.jwt.claim.sub', $1, true),
                        set_config('request.jwt.claims', $2, true)`,
    [core.admin.id, claims],
  );
  const r = await c.query<{ n: string }>(
    `select count(public.provision_student_login(s.id, $2))::text as n
       from public.students s
      where s.student_code like $1
        and not exists (select 1 from public.profiles p where p.student_id = s.id)`,
    [STUDENT_CODE_LIKE, STUDENT_PIN],
  );
  await c.query(`select set_config('request.jwt.claim.sub', '', true),
                        set_config('request.jwt.claims', '', true)`);
  if (flagProfiles) {
    await c.query(
      `update public.profiles p set is_test_data = true
                     from public.students s
                    where p.student_id = s.id and s.student_code like $1 and not p.is_test_data`,
      [STUDENT_CODE_LIKE],
    );
  }
  return Number(r.rows[0]?.n ?? 0);
}

async function main(): Promise<void> {
  const id = makeIdFn(SEED_STRING);
  const core = generateCore(id);

  if (hasFlag('plan')) {
    const fake = new Map(core.students.map((s) => [s.id, id('plan-learner', s.id)]));
    console.table(plan(core, generateLms(id, core, { anchor: ANCHOR, learnerByStudent: fake })));
    return;
  }

  const t0 = Date.now();
  const { client: c, label } = await openTarget(process.env);
  console.log(`→ seeding ${label} (seed "${SEED_STRING}", anchor ${ANCHOR})`);
  const has017 = await tableExists(c, 'public.topics');
  const wantLms = hasFlag('no-lms') ? false : has017;
  if (hasFlag('lms') && !has017) {
    await c.end();
    console.error('✗ --lms given but db/017 is not applied on this target');
    process.exit(2);
  }
  if (
    !(await tableExists(c, 'public.profiles')) ||
    !(await c.query(`select 1 from pg_proc where proname = 'provision_student_login'`)).rowCount
  ) {
    await c.end();
    console.error(
      '✗ target is missing setup.sql / 004+008 (provision_student_login). Run the migrations first.',
    );
    process.exit(2);
  }

  const inserted: Record<string, number> = {};
  try {
    await c.query('begin');
    await c.query('set local search_path = public, extensions');
    inserted.academic_years = await insertRows(c, 'public.academic_years', [core.year]);
    inserted.classes = await insertRows(c, 'public.classes', core.classes);
    inserted.subjects = await insertRows(c, 'public.subjects', core.subjects);
    inserted.students = await insertRows(
      c,
      'public.students',
      core.students.map((s) => ({ ...s, is_test_data: true })),
    );
    inserted.enrollments = await insertRows(c, 'public.enrollments', core.enrollments);
    inserted['staff auth users'] = await seedStaff(c, core, has017);
    inserted.teacher_assignments = await insertRows(
      c,
      'public.teacher_assignments',
      core.teacherAssignments,
    );
    inserted['student logins (provisioned)'] = await provisionStudents(c, core, has017);
    console.log(`  core done in ${seconds(t0)}`);

    if (wantLms) {
      const t1 = Date.now();
      const r = await c.query<{ student_id: string; id: string }>(
        `select p.student_id, p.id from public.profiles p
           join public.students s on s.id = p.student_id where s.student_code like $1`,
        [STUDENT_CODE_LIKE],
      );
      const learnerByStudent = new Map(r.rows.map((x) => [x.student_id, x.id]));
      const lms = generateLms(id, core, { anchor: ANCHOR, learnerByStudent });
      const order: [string, keyof LmsData][] = [
        ['public.curricula', 'curriculum'],
        ['public.chapters', 'chapters'],
        ['public.topics', 'topics'],
        ['public.concepts', 'concepts'],
        ['public.concept_prerequisites', 'prerequisites'],
        ['public.questions', 'questions'], // trigger snapshots question_versions v1
        ['public.learning_content', 'learningContent'],
        ['public.learning_content_versions', 'contentVersions'],
        ['public.item_approvals', 'approvals'],
        ['public.practice_attempts', 'practiceAttempts'],
        ['public.concept_mastery', 'conceptMastery'],
        ['public.follow_ups', 'followUps'],
        ['public.assessments', 'assessments'],
        ['public.assessment_questions', 'assessmentQuestions'],
        ['public.exam_sessions', 'examSessions'],
        ['public.exam_session_answers', 'examAnswers'],
      ];
      for (const [table, key] of order) {
        const v = lms[key];
        inserted[table.replace('public.', '')] = await insertRows(
          c,
          table,
          Array.isArray(v) ? v : [v],
        );
      }
      inserted.exam_events = await insertRows(c, 'public.exam_events', lms.examEvents, {
        onlyIfAbsent: 'session_id',
      });
      console.log(`  LMS done in ${seconds(t1)}`);
    } else {
      console.log(
        has017 ? '  LMS part skipped (--no-lms)' : '  LMS part skipped: db/017 not applied',
      );
    }
    await c.query('commit');
  } catch (e) {
    await c.query('rollback');
    await c.end();
    throw e;
  }

  console.log(`✓ seed committed in ${seconds(t0)}. Rows inserted this run:`);
  console.table(inserted);
  const counts = await countSeedRows(c);
  console.log('Seed rows now present (by table):');
  console.table(Object.fromEntries(counts.filter((x) => x.n > 0).map((x) => [x.table, x.n])));
  const size = await c.query<{ db: string }>(
    `select pg_size_pretty(pg_database_size(current_database())) as db`,
  );
  console.log(`Database size: ${size.rows[0]!.db}`);
  await c.end();
}

main().catch((e: unknown) => {
  console.error('✗ seed failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
