// TEST_PLAN AT-2: student attempts on web against a MOCKED Supabase (in-memory
// PostgREST; no request leaves localhost). Covers the airplane-mode done-when:
// answer → offline → submit → close the tab → reopen with the API still down →
// reconnect → exactly one submission. RLS itself is AT-1 (db/test/025_smoke.sql).
// Build: cd apps/mobile && EXPO_PUBLIC_SUPABASE_URL=https://fakedevproject.supabase.co EXPO_PUBLIC_SUPABASE_ANON_KEY=fake npx expo export -p web
// Serve: node scripts/e2e/serve-dist.mjs "$PWD/apps/mobile/dist" 8089
// Run:   NODE_PATH=$(npm root -g) node scripts/e2e/student-attempts-web.cjs <screenshot-dir>
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
const handle = (code) => `s.${code}@students.school.invalid`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const q = (id, type, body, answer) => ({ id, type, body, answer });
const db = {
  academic_years: [{ id: 'y1', label: '2026-27', is_current: true }],
  classes: [
    { id: 'c9', name: 'Class 9-A' },
    { id: 'c8', name: 'Class 8' },
  ],
  subjects: [{ id: 's-math', name: 'Mathematics' }],
  enrollments: [{ id: 'e1', student_id: 's-a', class_id: 'c9', year_id: 'y1', status: 'active' }],
  questions: [
    q(
      'q1',
      'mcq',
      {
        stem: 'Which set has no elements?',
        options: [
          { key: 'A', text: 'Universal set' },
          { key: 'B', text: 'Empty set' },
        ],
      },
      { correct: 'B' },
    ),
    q('q2', 'true_false', { stem: 'Every set is a subset of itself.' }, { correct: true }),
    q('q3', 'numeric', { stem: 'How many elements in {2, 4, 6, …, 24}?' }, { correct: 12 }),
    q('q4', 'short_text', { stem: 'Capital of Punjab?' }, { correct: 'Lahore' }),
    q(
      'q5',
      'tap_image',
      {
        prompt: { en: 'Tap the one with MORE apples', ur: 'زیادہ سیب والی تصویر پر ہاتھ لگاؤ' },
        choices: [
          { id: 'a', emoji: '🍎', count: 2, label: { en: '2 apples', ur: '2 سیب' } },
          { id: 'b', emoji: '🍎', count: 5, label: { en: '5 apples', ur: '5 سیب' } },
        ],
      },
      { correct: 'b' },
    ),
    q('q6', 'true_false', { stem: 'log 1 = 0' }, { correct: true }),
    q(
      'q7',
      'mcq',
      {
        stem: 'x + 2 = 5, x = ?',
        options: [
          { key: 'A', text: '3' },
          { key: 'B', text: '7' },
        ],
      },
      { correct: 'A' },
    ),
  ],
  assessments: [
    {
      id: 'a-quiz',
      title: 'Sets quiz',
      type: 'quiz',
      status: 'published',
      class_id: 'c9',
      year_id: 'y1',
      subject_id: 's-math',
      total_marks: 7,
      created_at: '2026-11-20',
    },
    {
      id: 'a-lost',
      title: 'Logs test',
      type: 'test',
      status: 'published',
      class_id: 'c9',
      year_id: 'y1',
      subject_id: 's-math',
      total_marks: 1,
      created_at: '2026-11-19',
    },
    {
      id: 'a-foreign',
      title: 'Algebra homework',
      type: 'assignment',
      status: 'published',
      class_id: 'c9',
      year_id: 'y1',
      subject_id: 's-math',
      total_marks: 1,
      created_at: '2026-11-18',
    },
    {
      id: 'a-done',
      title: 'Old quiz',
      type: 'quiz',
      status: 'closed',
      class_id: 'c9',
      year_id: 'y1',
      subject_id: 's-math',
      total_marks: 10,
      created_at: '2026-10-01',
    },
    {
      id: 'a-draft',
      title: 'Draft quiz',
      type: 'quiz',
      status: 'draft',
      class_id: 'c9',
      year_id: 'y1',
      subject_id: 's-math',
      total_marks: 1,
      created_at: '2026-11-21',
    },
    {
      id: 'a-c8',
      title: 'Class 8 quiz',
      type: 'quiz',
      status: 'published',
      class_id: 'c8',
      year_id: 'y1',
      subject_id: 's-math',
      total_marks: 1,
      created_at: '2026-11-21',
    },
  ],
  assessment_questions: [
    ...['q1', 'q2', 'q3', 'q4', 'q5'].map((id, i) => ({
      assessment_id: 'a-quiz',
      question_id: id,
      marks: i === 4 ? 3 : 1,
      sort_order: i,
    })),
    { assessment_id: 'a-lost', question_id: 'q6', marks: 1, sort_order: 0 },
    { assessment_id: 'a-foreign', question_id: 'q7', marks: 1, sort_order: 0 },
  ],
  submissions: [
    {
      id: 'sub-old',
      enrollment_id: 'e1',
      assessment_id: 'a-done',
      score: 8,
      submitted_at: '2026-10-02T09:00:00Z',
      graded_at: '2026-10-03T09:00:00Z',
    },
  ],
};

const net = { down: false, loseNextFor: 'a-lost' };
const posts = []; // every POST to submissions that reached the "server"
const selects = []; // select= strings sent for assessment_questions
const log = [];
const foreign = new Set();

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function sessionFor() {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return {
    access_token: `${b64({ alg: 'HS256' })}.${b64({ sub: STUDENT.id, exp, role: 'authenticated' })}.sig`,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: exp,
    refresh_token: 'r-1',
    user: {
      id: STUDENT.id,
      aud: 'authenticated',
      email: handle(STUDENT.code),
      app_metadata: {},
      user_metadata: {},
      created_at: new Date().toISOString(),
    },
  };
}
function withEmbeds(table, row) {
  const find = (t, id) => db[t].find((r) => r.id === id) ?? null;
  if (table === 'enrollments') return { ...row, class: find('classes', row.class_id) };
  if (table === 'assessments')
    return {
      ...row,
      subject: find('subjects', row.subject_id),
      items: db.assessment_questions.filter((i) => i.assessment_id === row.id),
    };
  if (table === 'assessment_questions')
    return { ...row, question: find('questions', row.question_id) };
  return row;
}
function matches(row, key, cond) {
  const val = row[key];
  const [op, ...rest] = cond.split('.');
  const arg = rest.join('.');
  if (op === 'eq') return String(val) === arg;
  if (op === 'in')
    return arg
      .replace(/^\(|\)$/g, '')
      .split(',')
      .map((s) => s.replace(/"/g, ''))
      .includes(String(val));
  throw new Error('op ' + op);
}
const SKIP = new Set(['select', 'order', 'limit']);

async function mock(page) {
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (!['localhost', 'fakedevproject.supabase.co'].includes(u.hostname)) foreign.add(u.hostname);
  });
  page.on('pageerror', (e) => log.push('PAGEERROR ' + e.message));
  await page.route(SB + '/**', async (route) => {
    if (net.down) return route.abort('internetdisconnected');
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
    if (p === '/rest/v1/rpc/student_login_email') return json(200, handle(STUDENT.code));
    if (p === '/auth/v1/token') return json(200, sessionFor());
    if (p === '/auth/v1/logout') return route.fulfill({ status: 204 });
    if (p === '/rest/v1/profiles')
      return out([{ role: 'student', full_name: STUDENT.name, student_id: 's-a' }]);
    const table = p.replace('/rest/v1/', '');
    if (!db[table]) {
      log.push('UNMOCKED ' + req.method() + ' ' + p);
      return json(404, {});
    }
    if (req.method() === 'GET') {
      if (table === 'assessment_questions') selects.push(url.searchParams.get('select'));
      let rows = db[table].map((r) => withEmbeds(table, r));
      for (const [k, v] of url.searchParams)
        if (!SKIP.has(k)) rows = rows.filter((r) => matches(r, k, v));
      return out(rows);
    }
    if (req.method() === 'POST' && table === 'submissions') {
      const row = req.postDataJSON();
      posts.push(row);
      if (row.assessment_id === 'a-foreign')
        return json(403, {
          code: '42501',
          message: 'new row violates row-level security policy for table "submissions"',
        });
      if (
        db.submissions.some(
          (s) =>
            s.id === row.id ||
            (s.enrollment_id === row.enrollment_id && s.assessment_id === row.assessment_id),
        )
      )
        return json(409, {
          code: '23505',
          message:
            'duplicate key value violates unique constraint "submissions_enrollment_id_assessment_id_key"',
        });
      db.submissions.push({ score: null, graded_at: null, ...row });
      if (net.loseNextFor === row.assessment_id) {
        net.loseNextFor = null;
        return route.abort('connectionreset'); // landed, but the reply never arrives
      }
      return route.fulfill({ status: 201 });
    }
    log.push('UNEXPECTED ' + req.method() + ' ' + p);
    return json(405, {});
  });
}

const seen = (page, text, exact = false, timeout = 8000) =>
  page
    .getByText(text, { exact })
    .first()
    .waitFor({ timeout })
    .then(
      () => true,
      () => false,
    );
const check = (cond, msg) => {
  console.log((cond ? 'PASS ' : 'FAIL ') + msg);
  if (!cond) process.exitCode = 1;
};
// A hard load of a deep link can bounce to home while the session restores
// (Stack.Protected guards are all false during 'loading'; MODULE_STATUS follow-up).
async function go(page, path) {
  for (let i = 0; i < 3; i++) {
    await page.goto(BASE + path);
    await page.waitForTimeout(1500);
    if (page.url().endsWith(path)) return;
  }
}
async function until(fn, ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}
const rowsFor = (aid) => db.submissions.filter((s) => s.assessment_id === aid);
const radio = (page, name) => page.getByRole('radio', { name, exact: true });

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 } });
  let page = await ctx.newPage();
  await mock(page);

  // 1. Sign in; home + list.
  await page.goto(BASE + '/login');
  await page.getByLabel('Admission number').fill(STUDENT.code);
  await page.getByLabel('PIN', { exact: true }).fill(STUDENT.pin);
  await page.getByText('Go', { exact: true }).click();
  check(await seen(page, 'Hi, Ali Raza!'), 'student lands on home');
  check(await seen(page, '3 tests to do'), 'home counts tests to do');
  await page.getByText('My tests', { exact: true }).first().click();
  await page.waitForURL('**/tests');
  check(await seen(page, 'Sets quiz', true), 'published test listed');
  check(await seen(page, 'Old quiz', true), 'closed test listed');
  check(
    !(await page.getByText('Draft quiz').count()) &&
      !(await page.getByText('Class 8 quiz').count()),
    'draft and other class hidden',
  );
  await page.screenshot({ path: SHOTS + '/tests-list.png', fullPage: true });

  // 2. Answer every type; draft autosaves and survives a reload.
  await page.getByText('Sets quiz', { exact: true }).click();
  await page.waitForURL('**/tests/a-quiz');
  check(await seen(page, 'Which set has no elements?'), 'paper renders');
  check(
    selects.length > 0 && selects.every((s) => !/answer/.test(s)),
    'paper select never asks for answer: ' + selects[0],
  );
  check(
    (await page.getByRole('button', { name: 'Hear the question' }).count()) === 1,
    'tap_image has a read-aloud button',
  );
  await radio(page, 'B. Empty set').click();
  await radio(page, 'True').click();
  await page.getByLabel('Your answer').nth(0).fill('12');
  await page.getByLabel('Your answer').nth(1).fill('Lahore');
  await radio(page, '5 apples').click();
  check(await seen(page, '5 of 5 answered'), 'answered count');
  check(await seen(page, 'Saved on this device'), 'draft saved indicator');
  await page.screenshot({ path: SHOTS + '/attempt.png', fullPage: true });
  await go(page, '/tests/a-quiz'); // a hard reload (deep link)
  check(await seen(page, 'Which set has no elements?'), 'paper after reload');
  check(
    (await radio(page, 'B. Empty set').getAttribute('aria-checked')) === 'true',
    'draft restored after reload (mcq)',
  );
  check(
    (await page.getByLabel('Your answer').nth(1).inputValue()) === 'Lahore',
    'draft restored after reload (short_text)',
  );

  // 3. Airplane mode: submit offline.
  net.down = true;
  await page.getByRole('button', { name: 'Submit test' }).click();
  check(
    await seen(page, 'your answers are saved and will send'),
    'offline submit is queued, not lost',
  );
  check(await seen(page, 'Offline: saved on this device'), 'sync pill says offline');
  check(rowsFor('a-quiz').length === 0, 'nothing reached the server yet');
  await page.screenshot({ path: SHOTS + '/queued.png', fullPage: true });

  // 4. Kill the app (close the tab) and reopen with the API still down.
  await page.close();
  page = await ctx.newPage();
  await mock(page);
  await page.goto(BASE + '/learn');
  check(await seen(page, 'Hi, Ali Raza!'), 'reopen offline: home from the cached profile');
  await go(page, '/tests');
  check(
    await seen(page, 'You’re offline: showing your saved list.'),
    'reopen offline: list from the device copy',
  );
  check(await seen(page, 'Waiting to send', true), 'queued test shows waiting');

  // 5. Reconnect: the queue sends itself, exactly once.
  net.down = false;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  check(await until(() => rowsFor('a-quiz').length === 1), 'reconnect → the submission lands');
  await page.waitForTimeout(3000);
  const row = rowsFor('a-quiz')[0];
  check(
    rowsFor('a-quiz').length === 1 &&
      posts.filter((p) => p.assessment_id === 'a-quiz').length === 1,
    'exactly one submission, one POST',
  );
  check(UUID.test(row?.id ?? ''), 'row id is the client UUID');
  check(!('score' in posts[0]) && !('graded_by' in posts[0]), 'no score sent');
  check(
    JSON.stringify(row?.responses?.answers?.map((a) => a.value)) ===
      JSON.stringify(['B', true, '12', 'Lahore', 'b']) && row.responses.answered_count === 5,
    'raw responses kept in order',
  );
  check(await seen(page, 'Done', true), 'list shows done after sync');

  // 6. Response lost after the row landed: retried, comes back duplicate, still one row.
  await page.getByText('Logs test', { exact: true }).click();
  await radio(page, 'True').click();
  await page.getByRole('button', { name: 'Submit test' }).click();
  check(
    await seen(page, 'Done! Your answers are saved.', false, 20000),
    'lost reply → retried → done',
  );
  check(
    rowsFor('a-lost').length === 1 &&
      posts.filter((p) => p.assessment_id === 'a-lost').length === 2,
    'two sends, one row (duplicate treated as done)',
  );

  // 7. A refusal (RLS 42501) is kept and shown, never dropped or retried silently.
  await go(page, '/tests');
  await page.getByText('Algebra homework', { exact: true }).click();
  await radio(page, 'A. 3').click();
  await page.getByRole('button', { name: 'Submit test' }).click();
  check(await seen(page, 'Your answers couldn’t be sent.'), 'refused attempt explained');
  check(
    await page
      .getByRole('button', { name: /Not synced yet\. Tap to try again/ })
      .first()
      .waitFor({ timeout: 8000 })
      .then(
        () => true,
        () => false,
      ),
    'sync pill shows the problem (tap to retry)',
  );
  const tries = posts.filter((p) => p.assessment_id === 'a-foreign').length;
  await page.waitForTimeout(4000);
  check(
    posts.filter((p) => p.assessment_id === 'a-foreign').length === tries,
    'refused attempt not retried automatically',
  );
  await page.screenshot({ path: SHOTS + '/rejected.png', fullPage: true });

  // 8. Results.
  await go(page, '/results');
  check(await seen(page, '8 / 10', true), 'marked score');
  check(await seen(page, 'Not marked yet', true), 'unmarked submission');
  check(await seen(page, 'Not sent yet', true), 'unsent attempt in results');
  check(await seen(page, 'Overall: 80%'), 'overall from marked tests');
  await page.screenshot({ path: SHOTS + '/results.png', fullPage: true });

  // 9. Blank answers ask once; Urdu is RTL; phone width.
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p2 = await ctx2.newPage();
  await mock(p2);
  db.assessments.push({
    id: 'a-new',
    title: 'Blank quiz',
    type: 'quiz',
    status: 'published',
    class_id: 'c9',
    year_id: 'y1',
    subject_id: 's-math',
    total_marks: 1,
    created_at: '2026-11-22',
  });
  db.assessment_questions.push({
    assessment_id: 'a-new',
    question_id: 'q2',
    marks: 1,
    sort_order: 0,
  });
  await p2.goto(BASE + '/login');
  await p2.getByLabel('Admission number').fill(STUDENT.code);
  await p2.getByLabel('PIN', { exact: true }).fill(STUDENT.pin);
  await p2.getByText('Go', { exact: true }).click();
  await seen(p2, 'Hi, Ali Raza!');
  await go(p2, '/tests/a-new');
  await p2.getByRole('button', { name: 'Submit test' }).click();
  check(await seen(p2, '1 question is blank. Submit anyway?'), 'blank answers warn first');
  check(rowsFor('a-new').length === 0, 'warning did not submit');
  const wide = await p2.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth + 1,
  );
  check(wide, 'phone width: no horizontal scroll');
  await p2.evaluate(() => localStorage.setItem('app.locale', 'ur'));
  await go(p2, '/tests');
  check((await p2.evaluate(() => document.documentElement.dir)) === 'rtl', 'Urdu sets dir=rtl');
  check(await seen(p2, 'میرے ٹیسٹ'), 'Urdu title');
  await p2.screenshot({ path: SHOTS + '/tests-ur-phone.png', fullPage: true });

  check(log.length === 0, 'no page errors / unmocked calls: ' + log.join(' | '));
  check(foreign.size === 0, 'no foreign hosts: ' + [...foreign].join(','));
  await browser.close();
})();
