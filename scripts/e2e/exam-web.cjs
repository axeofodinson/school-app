// TEST_PLAN EX-2: generated assessments + live exams (prompt 50) on web against a
// MOCKED Supabase with a small exam "server" (the real RPCs are EX-1,
// db/test/020_exam_smoke.sql; the 40-student run is db/test/020_load.sh).
// Teacher: quick create draws from the pool by the blueprint, says when it is
// short, publishes live with a join code in 3 clicks. Student: joins by code,
// options lettered by position, every tap saved, a dropped save retried, a
// reload on "another device" resumes with the answers, leaving the tab is
// logged, nothing animates, hand in shows the score at once.
// Build: cd apps/mobile && EXPO_PUBLIC_SUPABASE_URL=https://fakedevproject.supabase.co EXPO_PUBLIC_SUPABASE_ANON_KEY=fake npx expo export -p web
// Serve: node scripts/e2e/serve-dist.mjs "$PWD/apps/mobile/dist" 8089
// Run:   node scripts/e2e/exam-web.cjs <screenshot-dir>
const { chromium } = require('playwright');
const BASE = 'http://localhost:8089';
const SB = 'https://fakedevproject.supabase.co';
const SHOTS = process.argv[2];

const STUDENT = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  code: '1001',
  pin: '1234',
  name: 'Ali Raza',
};
const TEACHER = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'teacher@school.test',
  name: 'Ms Ayesha',
};
let who = 'teacher';

// 12 approved exam items: topics tA/tB, difficulties 1–3; q1 used recently.
const POOL = Array.from({ length: 12 }, (_, i) => ({
  id: `q${i + 1}`,
  version: 1,
  type: 'mcq',
  chapter_id: i < 6 ? 'ch1' : 'ch2',
  topic_id: i < 6 ? 'tA' : 'tB',
  difficulty: 1 + (i % 3),
  last_used_at: i === 0 ? '2026-11-20T00:00:00Z' : null,
}));
const BODY = (n) => ({
  stem: { en: `What is ${n} + ${n}?`, ur: null },
  options: ['A', 'B', 'C', 'D'].map((k, j) => ({ key: k, text: String(n * 2 + j) })),
});

const db = {
  academic_years: [{ id: 'y1', label: '2026-27', is_current: true }],
  classes: [{ id: 'c9', name: 'Class 9-A', grade_level: 9 }],
  teacher_assignments: [
    {
      teacher_id: TEACHER.id,
      class_id: 'c9',
      subject_id: 's-math',
      year_id: 'y1',
      class: { id: 'c9', name: 'Class 9-A', grade_level: 9 },
    },
  ],
  subjects: [{ id: 's-math', class_id: 'c9', name: 'Mathematics', sort_order: 1 }],
  chapters: [
    { id: 'ch1', subject_id: 's-math', title: 'Sets', sort_order: 1 },
    { id: 'ch2', subject_id: 's-math', title: 'Algebra', sort_order: 2 },
  ],
  enrollments: [
    {
      id: 'e1',
      student_id: 's-a',
      class_id: 'c9',
      year_id: 'y1',
      status: 'active',
      class: { name: 'Class 9-A', grade_level: 9 },
    },
  ],
  assessments: [],
  assessment_questions: [],
  submissions: [],
  exam_sessions: [],
  questions: POOL.map((q, i) => ({
    id: q.id,
    type: 'mcq',
    body: BODY(i + 1),
    chapter_id: q.chapter_id,
    status: 'approved',
    default_marks: 1,
    difficulty: q.difficulty,
    cognitive_level: 'apply',
  })),
};

const rpcs = [];
const events = [];
const saves = [];
const log = [];
const net = { dropNextSave: false };
const exam = { session: null, answers: {}, deadline: null, perm: null };

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function sessionFor() {
  const id = who === 'student' ? STUDENT.id : TEACHER.id;
  const email = who === 'student' ? 's.1001@students.school.invalid' : TEACHER.email;
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return {
    access_token: `${b64({ alg: 'HS256' })}.${b64({ sub: id, exp, role: 'authenticated' })}.sig`,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: exp,
    refresh_token: 'r-' + id,
    user: {
      id,
      aud: 'authenticated',
      email,
      app_metadata: {},
      user_metadata: {},
      created_at: new Date().toISOString(),
    },
  };
}
const find = (t, id) => db[t].find((r) => r.id === id) ?? null;
function embed(table, row) {
  if (table === 'assessments')
    return {
      ...row,
      class: find('classes', row.class_id),
      subject: find('subjects', row.subject_id),
      items: db.assessment_questions.filter((i) => i.assessment_id === row.id),
    };
  return row;
}
function cond(row, key, c) {
  const val = row[key];
  const [op, ...rest] = c.split('.');
  const arg = rest.join('.');
  if (op === 'eq') return String(val) === arg;
  if (op === 'neq') return String(val) !== arg;
  if (op === 'is') return arg === 'null' ? val == null : String(val) === arg;
  if (op === 'not') return rest[0] === 'is' && rest[1] === 'null' ? val != null : true;
  if (op === 'in')
    return arg
      .replace(/^\(|\)$/g, '')
      .split(',')
      .map((s) => s.replace(/"/g, ''))
      .includes(String(val));
  return true;
}
const SKIP = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);

function paper() {
  const a = db.assessments.find((x) => x.id === exam.session.assessment_id);
  const items = db.assessment_questions.filter((i) => i.assessment_id === a.id);
  return {
    session_id: exam.session.id,
    status: exam.session.status,
    started_at: exam.session.started_at,
    deadline_at: exam.deadline,
    server_now: new Date().toISOString(),
    title: a.title,
    score: exam.session.score ?? null,
    total: exam.session.total ?? null,
    questions:
      exam.session.status === 'in_progress'
        ? items.map((i) => {
            const q = find('questions', i.question_id);
            // Options reversed for this student (the server's per-student shuffle).
            return {
              q: q.id,
              v: 1,
              type: 'mcq',
              marks: i.marks,
              body: { ...q.body, options: [...q.body.options].reverse() },
            };
          })
        : [],
    answers: exam.session.status === 'in_progress' ? exam.answers : {},
  };
}

async function mock(page) {
  page.on('pageerror', (e) => log.push('PAGEERROR ' + e.message));
  page.on('request', (r) => {
    const h = new URL(r.url()).hostname;
    if (!['localhost', 'fakedevproject.supabase.co'].includes(h)) log.push('FOREIGN ' + h);
  });
  await page.route(SB + '/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const json = (status, body) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const out = (rows) =>
      single
        ? rows.length
          ? json(200, rows[0])
          : json(406, { code: 'PGRST116' })
        : json(200, rows);
    const body = () => {
      try {
        return req.postDataJSON() ?? {};
      } catch {
        return {};
      }
    };
    if (p === '/rest/v1/rpc/student_login_email')
      return json(200, 's.1001@students.school.invalid');
    if (p === '/auth/v1/token') return json(200, sessionFor());
    if (p === '/auth/v1/logout') return route.fulfill({ status: 204 });
    if (p === '/rest/v1/profiles')
      return out([
        who === 'student'
          ? { role: 'student', full_name: STUDENT.name, student_id: 's-a' }
          : { role: 'teacher', full_name: TEACHER.name, student_id: null },
      ]);
    if (p.startsWith('/rest/v1/rpc/')) {
      const fn = p.slice('/rest/v1/rpc/'.length);
      const a = body();
      rpcs.push({ fn, ...a });
      if (fn === 'exam_draw_pool') return json(200, POOL);
      if (fn === 'exam_launch') {
        const as = find('assessments', a.p_assessment);
        Object.assign(as, {
          mode: 'live_exam',
          status: 'published',
          join_code: 'KX7P2M',
          duration_seconds: (a.p_minutes ?? 30) * 60,
          opens_at: new Date().toISOString(),
        });
        return json(200, {
          join_code: 'KX7P2M',
          opens_at: as.opens_at,
          duration_seconds: as.duration_seconds,
        });
      }
      if (fn === 'my_live_exams')
        return json(
          200,
          db.assessments
            .filter((x) => x.mode === 'live_exam' && x.status === 'published')
            .map((x) => ({
              assessment_id: x.id,
              title: x.title,
              subject_name: 'Mathematics',
              duration_seconds: x.duration_seconds,
              session_status: exam.session?.status ?? null,
            })),
        );
      if (fn === 'exam_join') {
        const x = db.assessments.find((y) => y.join_code === String(a.p_code).toUpperCase());
        return x
          ? json(200, { assessment_id: x.id, title: x.title })
          : json(400, { code: 'P0002', message: 'exam_code_unknown' });
      }
      if (fn === 'start_exam_session') {
        if (!exam.session) {
          exam.session = {
            id: 'sess-1',
            assessment_id: a.p_assessment,
            status: 'in_progress',
            started_at: new Date().toISOString(),
          };
          exam.deadline = new Date(Date.now() + 30 * 60 * 1000).toISOString();
          db.exam_sessions.push(exam.session);
        }
        return json(200, paper());
      }
      if (fn === 'save_exam_answer') {
        if (net.dropNextSave) {
          net.dropNextSave = false;
          saves.push({ ...a, dropped: true });
          return route.abort('internetdisconnected');
        }
        saves.push(a);
        if (exam.session.status !== 'in_progress')
          return json(200, { accepted: false, reason: 'deadline_passed' });
        exam.answers[a.p_question] = a.p_answer;
        return json(200, { accepted: true });
      }
      if (fn === 'submit_exam_session') {
        if (exam.session.status === 'in_progress') {
          const items = db.assessment_questions.filter(
            (i) => i.assessment_id === exam.session.assessment_id,
          );
          const right = items.filter((i) => exam.answers[i.question_id] === 'A').length;
          Object.assign(exam.session, {
            status: 'submitted',
            score: right * items[0].marks,
            total: items.length * items[0].marks,
          });
        }
        const n = Object.values(exam.answers).filter((v) => v !== null).length;
        return json(200, {
          status: exam.session.status,
          score: exam.session.score,
          total: exam.session.total,
          questions: 6,
          answered: n,
          to_mark: 0,
        });
      }
      if (fn === 'log_exam_event') {
        events.push(a.p_kind);
        return json(200, null);
      }
      log.push('UNMOCKED RPC ' + fn);
      return json(200, []);
    }
    const table = p.replace('/rest/v1/', '');
    if (!db[table]) {
      log.push('UNMOCKED ' + req.method() + ' ' + table);
      return json(200, []);
    }
    const filters = [...url.searchParams].filter(([k]) => !SKIP.has(k));
    const pick = () => db[table].filter((r) => filters.every(([k, v]) => cond(r, k, v)));
    if (req.method() === 'GET') return out(pick().map((r) => embed(table, r)));
    if (req.method() === 'POST') {
      const rows = []
        .concat(body())
        .map((r) => ({ id: r.id ?? `${table}-${db[table].length + 1}`, ...r }));
      for (const r of rows) {
        const dup =
          table === 'assessment_questions' &&
          db[table].find(
            (x) => x.assessment_id === r.assessment_id && x.question_id === r.question_id,
          );
        if (dup) Object.assign(dup, r);
        else db[table].push(r);
      }
      return out(rows);
    }
    if (req.method() === 'PATCH') {
      const rows = pick();
      for (const r of rows) Object.assign(r, body());
      return out(rows);
    }
    log.push('UNEXPECTED ' + req.method() + ' ' + p);
    return json(405, {});
  });
}

let fails = 0;
const check = (ok, what) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${what}`);
  if (!ok) fails++;
};
const seen = (page, text, exact = false, timeout = 8000) =>
  page
    .getByText(text, { exact })
    .filter({ visible: true })
    .first()
    .waitFor({ timeout })
    .then(
      () => true,
      () => false,
    );
const noHScroll = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

(async () => {
  const browser = await chromium.launch();

  // ── Teacher: quick create, live, 3 clicks ──
  const tctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const t = await tctx.newPage();
  await mock(t);
  await t.goto(BASE + '/staff');
  await t.getByLabel('Email').fill(TEACHER.email);
  await t.getByLabel('Password').fill('secret');
  await t.getByLabel('Password').press('Enter');
  await t.waitForTimeout(1500);
  await t.goto(BASE + '/assessments');
  await t.getByRole('button', { name: 'Quick create' }).first().click();
  await t.waitForURL('**/assessments/quick');
  check(await seen(t, '1 · Class and subject'), 'quick create opens');
  check(await seen(t, '12 questions from 12 ready'), 'default plan: 20 asked, all 12 ready drawn');
  check(await seen(t, '8 questions short'), 'shortfall said plainly (not silently fewer)');
  check(await seen(t, 'Publish with 12 questions'), 'publish button names the real count');
  // Click 1: fewer questions (tweak), click 2: live, click 3: publish.
  for (let i = 0; i < 14; i++) await t.getByRole('button', { name: 'Fewer: Questions' }).click();
  check(await seen(t, '6 questions from 12 ready'), 'tweak: 6 questions');
  check(!(await t.getByText('short', { exact: false }).count()), 'no shortfall at 6');
  await t.screenshot({ path: SHOTS + '/quick-create-1280.png', fullPage: true });
  await t.getByRole('radio', { name: 'Live in class, now' }).click();
  await t.getByRole('button', { name: 'Publish and start now' }).click();
  check(await seen(t, 'KX7P2M', true), 'join code shown big');
  const created = db.assessments[0];
  const items = db.assessment_questions.filter((i) => i.assessment_id === created?.id);
  check(
    created && created.mode === 'live_exam' && created.status === 'published',
    'assessment live + published',
  );
  check(
    items.length === 6 && new Set(items.map((i) => i.question_id)).size === 6,
    'six distinct drawn questions',
  );
  check(
    items.every((i) => i.question_version === 1),
    'versions pinned',
  );
  check(
    created?.blueprint && created.blueprint.count === 6 && created.duration_seconds === 1800,
    'blueprint + minutes saved',
  );
  check(!items.some((i) => i.question_id === 'q1'), 'recently used question left out');
  const topics = items.map((i) => POOL.find((p) => p.id === i.question_id).topic_id);
  check(topics.includes('tA') && topics.includes('tB'), 'both topics covered');
  check(
    rpcs.some((r) => r.fn === 'exam_launch' && r.p_minutes === 30),
    'exam_launch(assessment, 30)',
  );
  await t.screenshot({ path: SHOTS + '/quick-live-code-1280.png' });

  // ── Student: join by code, take, drop, resume, hand in ──
  who = 'student';
  const sctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const s = await sctx.newPage();
  await mock(s);
  await s.goto(BASE + '/login');
  await s.getByLabel('Admission number').fill(STUDENT.code);
  await s.getByLabel('PIN', { exact: true }).fill(STUDENT.pin);
  await s.getByText('Go', { exact: true }).click();
  await seen(s, 'Hi, Ali Raza!');
  await s.goto(BASE + '/tests');
  check(await seen(s, 'Live now'), 'Tests shows the live exam');
  check(
    !(await s
      .getByText('Mathematics quiz', { exact: false })
      .filter({ hasText: 'question' })
      .count()),
    'exam not in the plain test list',
  );
  await s.getByLabel('Exam code from your teacher').fill('kx7 p2m');
  await s.getByRole('button', { name: 'Join', exact: true }).last().click();
  await s.waitForURL('**/exam/**');
  check(
    await seen(s, 'Your teacher can see if you leave this screen'),
    'honest monitoring note (no lockdown claim)',
  );
  check(!(await s.getByText(/lock ?down|locked/i).count()), 'no lockdown words');
  await s.getByRole('button', { name: 'Start' }).click();
  const nums = items.map((i) => Number(i.question_id.slice(1)));
  const shown = await seen(s, `What is ${nums[0]} + ${nums[0]}?`);
  if (!shown) await s.screenshot({ path: SHOTS + '/exam-debug.png', fullPage: true });
  check(shown, 'paper shown');
  check(await seen(s, '0/6 done'), 'answered count');
  check((await s.getByRole('timer').count()) > 0, 'timer shown');
  // Options came reversed: the first is lettered A on screen but is key D.
  const first = s.getByRole('radio').first();
  check(
    ((await first.getAttribute('aria-label')) || '') === `A. ${nums[0] * 2 + 3}`,
    'options lettered by position',
  );
  // Answer all six with the right option (text = 2n → key A, now last on screen).
  for (const [k, n] of nums.entries()) {
    if (k === 2) net.dropNextSave = true;
    await s.getByRole('radio', { name: `D. ${n * 2}`, exact: true }).click();
  }
  await s.waitForTimeout(4500); // the dropped save retries after 3 s
  check(
    saves.some((x) => x.dropped),
    'a save was dropped',
  );
  check(
    Object.keys(exam.answers).length === 6 && Object.values(exam.answers).every((v) => v === 'A'),
    'all 6 answers reached the server (retry)',
  );
  check(await seen(s, '6/6 done'), '6/6 done');
  // Motion off in the exam: no running animations on the page.
  const anims = await s.evaluate(
    () => document.getAnimations().filter((a) => a.playState === 'running').length,
  );
  check(anims === 0, `nothing animates in the exam (${anims})`);
  await s.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('blur'));
  });
  await s.waitForTimeout(500);
  check(events.includes('hidden') && events.includes('blur'), 'leaving the tab is logged');
  await s.screenshot({ path: SHOTS + '/exam-taking-1280.png', fullPage: true });

  // "Another device": a fresh context resumes the same session with answers.
  const s2ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const s2 = await s2ctx.newPage();
  await mock(s2);
  await s2.goto(BASE + '/login');
  await s2.getByLabel('Admission number').fill(STUDENT.code);
  await s2.getByLabel('PIN', { exact: true }).fill(STUDENT.pin);
  await s2.getByText('Go', { exact: true }).click();
  await seen(s2, 'Hi, Ali Raza!');
  await s2.goto(BASE + '/exam/' + created.id);
  await s2.getByRole('button', { name: 'Start' }).click();
  check(await seen(s2, '6/6 done'), 'second device resumes with all answers');
  check(
    (await s2
      .getByRole('radio', { name: `D. ${nums[0] * 2}`, exact: true })
      .getAttribute('aria-checked')) === 'true',
    'resumed answer selected',
  );
  check(await noHScroll(s2), 'phone: no sideways scroll');
  await s2.screenshot({ path: SHOTS + '/exam-resume-390.png', fullPage: true });
  await s2ctx.close();

  await s.getByRole('button', { name: 'Hand in' }).click();
  check(await seen(s, 'Handed in'), 'handed in');
  check(await seen(s, '6 / 6', true), 'score shown at once');
  await s.screenshot({ path: SHOTS + '/exam-done-1280.png' });
  await s.getByRole('button', { name: 'Back to Tests' }).click();
  check(await seen(s, 'Finished exams'), 'finished exam listed on Tests');

  check(
    !log.some((l) => l.startsWith('PAGEERROR')),
    'no page errors ' + log.filter((l) => l.startsWith('PAGEERROR')).join(' | '),
  );
  check(!log.some((l) => l.startsWith('FOREIGN')), 'no foreign hosts');
  const unmocked = [...new Set(log.filter((l) => l.startsWith('UNMOCKED')))];
  if (unmocked.length) console.log('note:', unmocked.join(', '));
  console.log(fails ? `${fails} FAILED` : 'ALL PASS');
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
