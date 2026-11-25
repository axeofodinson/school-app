// UI tour (UI remake, TEST_PLAN UI-1): screenshots of every restyled screen against a
// MOCKED Supabase (nothing leaves localhost) in English + Urdu, light + dark, and the
// full / lite / off motion tiers, at phone (390) and desktop (1280) widths. Also checks:
// no page errors, no foreign hosts, no horizontal scroll at phone width, Urdu sets
// dir=rtl, the kid presentation for a PG class (bigger targets), and that an exam
// screen draws no pattern.
// Build/serve as AT-2. Run: NODE_PATH=$(npm root -g) node scripts/e2e/ui-tour-web.cjs <dir> [quick]
const { chromium } = require('playwright');
const BASE = 'http://localhost:8089';
const SB = 'https://fakedevproject.supabase.co';
const SHOTS = process.argv[2];
const QUICK = process.argv[3] === 'quick';

const ago = (min) => new Date(Date.now() - min * 60000).toISOString();
const PEOPLE = {
  student: {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    role: 'student',
    name: 'Ayesha Khan',
    sid: 's-a',
  },
  kid: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', role: 'student', name: 'Bilal', sid: 's-k' },
  teacher: { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', role: 'teacher', name: 'Mr Rashid' },
  admin: { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', role: 'admin', name: 'Hassan' },
};
let who = PEOPLE.student;

const q = (id, type, body) => ({ id, type, body });
const db = {
  academic_years: [{ id: 'y1', label: '2026-27', is_current: true }],
  classes: [
    { id: 'cpg', name: 'Playgroup A', grade_level: 0 },
    { id: 'c6', name: 'Class 6 · Section B', grade_level: 6 },
    { id: 'c9', name: 'Class 9-A', grade_level: 9 },
    { id: 'c10', name: 'Class 10 Physics', grade_level: 10 },
  ],
  subjects: [
    { id: 's-math', name: 'Mathematics' },
    { id: 's-sci', name: 'Science' },
    { id: 's-eng', name: 'English' },
    { id: 's-urdu', name: 'Urdu' },
    { id: 's-num', name: 'Early Numeracy' },
  ],
  enrollments: [
    { id: 'e1', student_id: 's-a', class_id: 'c6', year_id: 'y1', status: 'active' },
    { id: 'e2', student_id: 's-k', class_id: 'cpg', year_id: 'y1', status: 'active' },
  ],
  teacher_assignments: [
    { teacher_id: PEOPLE.teacher.id, year_id: 'y1', class_id: 'c6', subject_id: null },
    { teacher_id: PEOPLE.teacher.id, year_id: 'y1', class_id: 'c9', subject_id: 's-sci' },
    { teacher_id: PEOPLE.teacher.id, year_id: 'y1', class_id: 'c10', subject_id: 's-sci' },
  ],
  questions: [
    q('q1', 'mcq', {
      stem: 'A car starts from rest and reaches 20 m/s in 5 s. What is its acceleration?',
      options: [
        { key: 'A', text: '2 m/s²' },
        { key: 'B', text: '4 m/s²' },
        { key: 'C', text: '5 m/s²' },
        { key: 'D', text: '100 m/s²' },
      ],
    }),
    q('q2', 'true_false', { stem: 'Friction always slows a moving object.' }),
    q('q3', 'numeric', { stem: 'How many legs do 3 spiders have?' }),
    ...[3, 1, 2].map((n, i) =>
      q('k' + i, 'tap_image', {
        prompt: {
          en: ['Tap the group with THREE apples', 'Which one is the moon?', 'Tap TWO balloons'][i],
          ur: ['جہاں تین سیب ہیں، اُس پر ہاتھ لگاؤ', 'چاند کون سا ہے؟', 'دو غباروں پر ہاتھ لگاؤ'][i],
        },
        choices:
          i === 1
            ? [
                { id: 'a', emoji: '☀️', label: { en: 'Sun', ur: 'سورج' } },
                { id: 'b', emoji: '🌙', label: { en: 'Moon', ur: 'چاند' } },
                { id: 'c', emoji: '⭐', label: { en: 'Star', ur: 'ستارہ' } },
              ]
            : [
                { id: 'a', emoji: i ? '🎈' : '🍎', count: n, label: { en: `${n}`, ur: `${n}` } },
                {
                  id: 'b',
                  emoji: i ? '🎈' : '🍎',
                  count: n + 1,
                  label: { en: `${n + 1}`, ur: `${n + 1}` },
                },
              ],
      }),
    ),
  ],
  assessments: [
    {
      id: 'a-sci',
      class_id: 'c6',
      year_id: 'y1',
      subject_id: 's-sci',
      title: 'Science: Motion',
      type: 'test',
      status: 'published',
      total_marks: 15,
      scheduled_on: null,
      weightage: 10,
      created_at: ago(10),
    },
    {
      id: 'a-mq',
      class_id: 'c6',
      year_id: 'y1',
      subject_id: 's-math',
      title: 'Fractions quiz',
      type: 'quiz',
      status: 'published',
      total_marks: 3,
      scheduled_on: null,
      weightage: 0,
      created_at: ago(20),
    },
    {
      id: 'a-eng',
      class_id: 'c6',
      year_id: 'y1',
      subject_id: 's-eng',
      title: 'Reading homework',
      type: 'assignment',
      status: 'published',
      total_marks: 5,
      scheduled_on: '2026-11-28',
      weightage: 5,
      created_at: ago(30),
    },
    {
      id: 'a-m1',
      class_id: 'c6',
      year_id: 'y1',
      subject_id: 's-math',
      title: 'Decimals test',
      type: 'test',
      status: 'closed',
      total_marks: 10,
      scheduled_on: null,
      weightage: 10,
      created_at: ago(4000),
    },
    {
      id: 'a-u1',
      class_id: 'c6',
      year_id: 'y1',
      subject_id: 's-urdu',
      title: 'Urdu spelling',
      type: 'quiz',
      status: 'published',
      total_marks: 10,
      scheduled_on: null,
      weightage: 0,
      created_at: ago(5000),
    },
    {
      id: 'a-s1',
      class_id: 'c6',
      year_id: 'y1',
      subject_id: 's-sci',
      title: 'Plants quiz',
      type: 'quiz',
      status: 'closed',
      total_marks: 10,
      scheduled_on: null,
      weightage: 0,
      created_at: ago(9000),
    },
    {
      id: 'a-kid',
      class_id: 'cpg',
      year_id: 'y1',
      subject_id: 's-num',
      title: 'Counting fun',
      type: 'quiz',
      status: 'published',
      total_marks: 3,
      scheduled_on: null,
      weightage: 0,
      created_at: ago(5),
    },
  ].map((a) => ({ file_path: null, file_name: null, file_mime: null, ...a })),
  assessment_questions: [
    { assessment_id: 'a-sci', question_id: 'q1', marks: 1, sort_order: 1 },
    { assessment_id: 'a-sci', question_id: 'q2', marks: 1, sort_order: 2 },
    { assessment_id: 'a-sci', question_id: 'q3', marks: 1, sort_order: 3 },
    { assessment_id: 'a-mq', question_id: 'q3', marks: 1, sort_order: 1 },
    { assessment_id: 'a-mq', question_id: 'q1', marks: 2, sort_order: 2 },
    { assessment_id: 'a-kid', question_id: 'k0', marks: 1, sort_order: 1 },
    { assessment_id: 'a-kid', question_id: 'k1', marks: 1, sort_order: 2 },
    { assessment_id: 'a-kid', question_id: 'k2', marks: 1, sort_order: 3 },
  ],
  submissions: [
    {
      id: 'sub1',
      enrollment_id: 'e1',
      assessment_id: 'a-m1',
      score: 9,
      submitted_at: ago(3000),
      graded_at: ago(2000),
      responses: {},
    },
    {
      id: 'sub2',
      enrollment_id: 'e1',
      assessment_id: 'a-u1',
      score: 7,
      submitted_at: ago(4000),
      graded_at: ago(3000),
      responses: {},
    },
    {
      id: 'sub3',
      enrollment_id: 'e1',
      assessment_id: 'a-s1',
      score: null,
      submitted_at: ago(8000),
      graded_at: null,
      responses: {},
    },
  ],
  messages: [
    {
      id: 'm1',
      sender_id: PEOPLE.teacher.id,
      scope: 'class',
      target_id: 'c6',
      title: 'Science test today',
      body: 'Bring a pencil and a ruler. The test opens after break.',
      created_at: ago(30),
    },
    {
      id: 'm2',
      sender_id: PEOPLE.admin.id,
      scope: 'school',
      target_id: null,
      title: 'Sports day',
      body: 'Sports day is on Friday. Wear your house colours.',
      created_at: ago(600),
    },
    {
      id: 'm3',
      sender_id: PEOPLE.teacher.id,
      scope: 'student',
      target_id: 's-a',
      title: 'Well done!',
      body: 'Great work on the decimals test.',
      created_at: ago(3000),
    },
  ],
  message_reads: [{ message_id: 'm3', student_id: 's-a', read_at: ago(100) }],
  attendance: [],
};

const log = [];
const foreign = new Set();
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function sessionFor() {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return {
    access_token: `${b64({ alg: 'HS256' })}.${b64({ sub: who.id, exp, role: 'authenticated' })}.sig`,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: exp,
    refresh_token: 'r-1',
    user: {
      id: who.id,
      aud: 'authenticated',
      email: 'x@school.invalid',
      app_metadata: {},
      user_metadata: {},
      created_at: ago(9999),
    },
  };
}
const find = (t, id) => db[t].find((r) => r.id === id) ?? null;
function withEmbeds(table, row) {
  if (table === 'enrollments') return { ...row, class: find('classes', row.class_id) };
  if (table === 'teacher_assignments') return { ...row, class: find('classes', row.class_id) };
  if (table === 'assessments')
    return {
      ...row,
      subject: find('subjects', row.subject_id),
      class: find('classes', row.class_id),
      items: db.assessment_questions.filter((i) => i.assessment_id === row.id),
    };
  return row;
}
function visible(table, rows) {
  if (who.role !== 'student') return rows;
  const enr = db.enrollments.find((e) => e.student_id === who.sid);
  if (table === 'enrollments') return rows.filter((r) => r.student_id === who.sid);
  if (table === 'submissions') return rows.filter((r) => r.enrollment_id === enr.id);
  if (table === 'messages')
    return rows.filter(
      (m) =>
        m.scope === 'school' ||
        (m.scope === 'class' && m.target_id === enr.class_id) ||
        (m.scope === 'student' && m.target_id === who.sid),
    );
  if (table === 'message_reads') return rows.filter((r) => r.student_id === who.sid);
  return rows;
}
function matches(row, key, cond) {
  const val = row[key];
  const [op, ...rest] = cond.split('.');
  const arg = rest.join('.');
  if (op === 'eq') return String(val) === arg;
  if (op === 'is') return arg === 'null' ? val == null : String(val) === arg;
  if (op === 'in')
    return arg
      .replace(/^\(|\)$/g, '')
      .split(',')
      .map((s) => s.replace(/"/g, ''))
      .includes(String(val));
  if (op === 'gte') return String(val) >= arg;
  if (op === 'lte') return String(val) <= arg;
  if (op === 'lt') return String(val) < arg;
  return true;
}
const SKIP = new Set(['select', 'order', 'limit', 'offset']);

async function mock(page) {
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (!['localhost', 'fakedevproject.supabase.co'].includes(u.hostname)) foreign.add(u.hostname);
  });
  page.on('pageerror', (e) => log.push('PAGEERROR ' + e.message));
  await page.routeWebSocket(/realtime/, (ws) => ws.onMessage(() => undefined));
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
    if (p === '/auth/v1/token') return json(200, sessionFor());
    if (p === '/auth/v1/logout') return route.fulfill({ status: 204 });
    if (p === '/rest/v1/rpc/student_login_email')
      return json(200, 's.1001@students.school.invalid');
    if (p === '/rest/v1/rpc/student_paper') {
      const { p_assessment_id: aid } = req.postDataJSON();
      return json(
        200,
        db.assessment_questions
          .filter((i) => i.assessment_id === aid)
          .map((i) => {
            const qq = find('questions', i.question_id);
            return {
              question_id: qq.id,
              type: qq.type,
              body: qq.body,
              marks: i.marks,
              sort_order: i.sort_order,
              cognitive_level: 'recall',
            };
          }),
      );
    }
    if (p.startsWith('/rest/v1/rpc/')) return json(200, []);
    if (p.startsWith('/storage/')) return json(404, {});
    if (p === '/rest/v1/profiles')
      return out([
        {
          id: who.id,
          role: who.role,
          full_name: who.name,
          student_id: who.sid ?? null,
          access_tier: 'school',
        },
      ]);
    const table = p.replace('/rest/v1/', '');
    if (!db[table]) {
      log.push('UNMOCKED ' + req.method() + ' ' + p);
      return json(200, []);
    }
    if (req.method() === 'GET' || req.method() === 'HEAD') {
      let rows = visible(table, db[table]).map((r) => withEmbeds(table, r));
      for (const [k, v] of url.searchParams)
        if (!SKIP.has(k)) rows = rows.filter((r) => matches(r, k, v));
      return out(rows);
    }
    if (req.method() === 'POST') return route.fulfill({ status: 201 });
    return json(200, []);
  });
}

const check = (cond, msg) => {
  console.log((cond ? 'PASS ' : 'FAIL ') + msg);
  if (!cond) process.exitCode = 1;
};

async function ctxFor(browser, { width, dark, lang, tier, reduce }) {
  const ctx = await browser.newContext({
    viewport: { width, height: width < 600 ? 844 : 860 },
    deviceScaleFactor: 1,
    colorScheme: dark ? 'dark' : 'light',
    reducedMotion: reduce ? 'reduce' : 'no-preference',
  });
  await ctx.addInitScript(
    ([l, t]) => {
      try {
        localStorage.setItem('app.locale', l);
        localStorage.setItem('app.motion', t);
      } catch {}
    },
    [lang, tier],
  );
  const page = await ctx.newPage();
  await mock(page);
  return { ctx, page };
}

async function signIn(page, person) {
  who = person;
  if (person.role === 'student') {
    await page.goto(BASE + '/login');
    await page.locator('input').first().fill('1001');
    await page.locator('input').nth(1).fill('1234');
    await page
      .getByText(/^(Go|چلو)$/)
      .last()
      .click();
  } else {
    await page.goto(BASE + '/staff');
    const inputs = page.locator('input');
    await inputs.nth(0).fill('t@school.pk');
    await inputs.nth(1).fill('secret123');
    await page
      .getByText(/^(Sign in|لاگ اِن کریں)$/)
      .last()
      .click();
  }
  await page.waitForTimeout(2500);
}
async function go(page, path) {
  for (let i = 0; i < 3; i++) {
    await page.goto(BASE + path);
    await page.waitForTimeout(1400);
    if (page.url().endsWith(path)) return;
  }
}
const noHScroll = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

(async () => {
  const browser = await chromium.launch();
  const combos = QUICK
    ? [{ width: 390, dark: false, lang: 'en', tier: 'full' }]
    : [
        { width: 390, dark: false, lang: 'en', tier: 'full' },
        { width: 390, dark: true, lang: 'en', tier: 'lite' },
        { width: 390, dark: false, lang: 'ur', tier: 'full' },
        { width: 390, dark: true, lang: 'ur', tier: 'off' },
        { width: 1280, dark: false, lang: 'en', tier: 'full' },
        { width: 1280, dark: true, lang: 'ur', tier: 'lite' },
      ];
  for (const c of combos) {
    const tag = `${c.width}-${c.lang}-${c.dark ? 'dark' : 'light'}-${c.tier}`;
    // Signed out
    {
      const { ctx, page } = await ctxFor(browser, c);
      await go(page, '/login');
      await page.waitForTimeout(900);
      await page.screenshot({ path: `${SHOTS}/${tag}-login.png` });
      if (c.width === 390) check(await noHScroll(page), `${tag} login: no horizontal scroll`);
      if (c.lang === 'ur')
        check((await page.locator('[dir="rtl"]').count()) > 0, `${tag} login: Urdu is RTL`);
      await ctx.close();
    }
    // Student (Class 6)
    {
      const { ctx, page } = await ctxFor(browser, c);
      await signIn(page, PEOPLE.student);
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `${SHOTS}/${tag}-home.png`, fullPage: true });
      if (c.width === 390) check(await noHScroll(page), `${tag} home: no horizontal scroll`);
      for (const [path, name] of [
        ['/tests', 'tests'],
        ['/results', 'results'],
        ['/study', 'prepare'],
        ['/me', 'me'],
        ['/inbox', 'inbox'],
        ['/attendance', 'attendance'],
        ['/tests/a-sci', 'exam'],
        ['/tests/a-mq', 'quiz'],
      ]) {
        if (path === '/attendance') {
          // /attendance is also the staff route, so a deep link can bounce; open it from Me.
          await go(page, '/me');
          await page
            .locator('[role="button"],a')
            .filter({ hasText: /My attendance|میری حاضری|حاضری/ })
            .first()
            .click();
        } else await go(page, path);
        await page.waitForTimeout(900);
        if (name === 'exam' || name === 'quiz') {
          const opt = page.getByRole('radio').nth(1);
          if (await opt.count()) await opt.click();
        }
        await page.screenshot({ path: `${SHOTS}/${tag}-${name}.png`, fullPage: true });
        if (c.width === 390 && !QUICK)
          check(await noHScroll(page), `${tag} ${name}: no horizontal scroll`);
        if (name === 'exam')
          check(
            (await page.locator('svg pattern').count()) === 0,
            `${tag} exam: no tile pattern on the exam screen`,
          );
      }
      await ctx.close();
    }
    if (c.width === 390) {
      // Kid (Playgroup): presentation + pre-reader paper + finish
      const { ctx, page } = await ctxFor(browser, c);
      await signIn(page, PEOPLE.kid);
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${SHOTS}/${tag}-kid-home.png`, fullPage: true });
      await go(page, '/tests/a-kid');
      await page.waitForTimeout(1200);
      const tiles = page.getByRole('radio');
      if (await tiles.count()) {
        const box = await tiles.first().boundingBox();
        check(
          box && box.height >= 160,
          `${tag} kid: picture tiles ≥ 160 px (${box && Math.round(box.height)})`,
        );
        await tiles.nth(1).click();
        await page.waitForTimeout(150);
        await page.screenshot({ path: `${SHOTS}/${tag}-kid-pick.png` });
      }
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${SHOTS}/${tag}-kid-paper.png`, fullPage: true });
      await ctx.close();
    }
    for (const person of [PEOPLE.teacher, PEOPLE.admin]) {
      const { ctx, page } = await ctxFor(browser, c);
      await signIn(page, person);
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${SHOTS}/${tag}-${person.role}-home.png`, fullPage: true });
      if (c.width === 390)
        check(await noHScroll(page), `${tag} ${person.role} home: no horizontal scroll`);
      if (c.width === 1280) {
        await go(page, '/attendance');
        await page.waitForTimeout(600);
        await page.screenshot({ path: `${SHOTS}/${tag}-${person.role}-attendance.png` });
      }
      await ctx.close();
    }
  }
  await browser.close();
  const errs = log.filter((l) => l.startsWith('PAGEERROR'));
  check(errs.length === 0, 'no page errors: ' + errs.slice(0, 3).join(' | '));
  check(foreign.size === 0, 'no foreign hosts: ' + [...foreign].join(','));
  const unmocked = [...new Set(log.filter((l) => l.startsWith('UNMOCKED')))];
  if (unmocked.length) console.log('note: ' + unmocked.join(', '));
})();
