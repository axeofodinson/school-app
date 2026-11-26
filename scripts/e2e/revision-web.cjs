// TEST_PLAN SR-3: spaced revision on Prepare (prompt 42) on web against a MOCKED
// Supabase (in-memory PostgREST; mock copied from practice-web.cjs). "Due for
// revision" lists due ideas (longest waiting first) and later ones; Revise
// starts a 5-question set on that idea at once; the row goes up as kind
// 'revision'; the after-set note says what happens next. The schedule itself is
// server side (db/037, db/test/037_smoke.sql SR-1) and core (revision.test.ts).
// Build: cd apps/mobile && EXPO_PUBLIC_SUPABASE_URL=https://fakedevproject.supabase.co EXPO_PUBLIC_SUPABASE_ANON_KEY=fake npx expo export -p web
// Serve: node scripts/e2e/serve-dist.mjs "$PWD/apps/mobile/dist" 8089
// Run:   node scripts/e2e/revision-web.cjs <screenshot-dir>
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
const TEACHER = { id: '11111111-1111-4111-8111-111111111111', email: 't@school.test', name: 'T' };

const bi = (en, ur) => ({ en, ur });
const DAY = 86_400_000;
const ago = (days) => new Date(Date.now() - days * DAY).toISOString();
function freshDb() {
  return {
    academic_years: [{ id: 'y1', label: '2026-27', is_current: true }],
    classes: [{ id: 'c9', name: 'Class 9-A', grade_level: 9 }],
    subjects: [{ id: 's-sci', class_id: 'c9', name: 'Biology', sort_order: 1 }],
    chapters: [
      { id: 'ch1', subject_id: 's-sci', title: 'The cell', title_ur: 'خلیہ', sort_order: 1 },
    ],
    topics: [
      {
        id: 't1',
        chapter_id: 'ch1',
        title_en: 'Parts of a cell',
        title_ur: 'خلیے کے حصے',
        sort_order: 1,
        status: 'active',
      },
      {
        id: 't2',
        chapter_id: 'ch1',
        title_en: 'Cell division',
        title_ur: null,
        sort_order: 2,
        status: 'active',
      },
    ],
    concepts: [
      {
        id: 'k1',
        topic_id: 't1',
        title_en: 'The nucleus',
        title_ur: 'مرکزہ',
        sort_order: 1,
        status: 'active',
      },
      {
        id: 'k2',
        topic_id: 't1',
        title_en: 'The membrane',
        title_ur: 'جھلی',
        sort_order: 2,
        status: 'active',
      },
      {
        id: 'k3',
        topic_id: 't2',
        title_en: 'Mitosis',
        title_ur: null,
        sort_order: 1,
        status: 'active',
      },
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
    submissions: [],
    teacher_assignments: [],
    learning_content: [
      {
        id: 'L1',
        topic_id: 't1',
        kind: 'lesson',
        concept_id: null,
        current_version: 1,
        status: 'approved',
        origin: 'ai',
        updated_at: null,
        created_at: '1',
      },
    ],
    learning_content_versions: [
      {
        content_id: 'L1',
        version: 1,
        blocks: [{ type: 'intro', en: 'Every living thing is made of cells.' }],
      },
    ],
    item_approvals: [
      { item_kind: 'content', item_id: 'L1', version: 1, scope: 'learn', revoked_at: null },
    ],
    question_versions: [
      {
        question_id: 'q1',
        version: 2,
        type: 'mcq',
        difficulty: 1,
        concept_id: 'k1',
        body: {
          stem: bi('Which part controls the cell?', 'خلیے کو کون سا حصہ چلاتا ہے؟'),
          options: [
            { key: 'A', text: bi('Nucleus', 'مرکزہ') },
            { key: 'B', text: bi('Membrane', 'جھلی') },
            { key: 'C', text: bi('Wall', 'دیوار') },
          ],
        },
        answer: { correct: 'A' },
        explanation: {
          en: 'The nucleus holds the instructions, so it is in charge.',
          ur: 'مرکزہ ہدایات رکھتا ہے۔',
          why_wrong: {
            B: bi('The membrane is the skin around the cell.', 'جھلی خلیے کی کھال ہے۔'),
          },
        },
      },
      {
        question_id: 'q1',
        version: 1,
        type: 'mcq',
        difficulty: 1,
        concept_id: 'k1',
        body: { stem: bi('OLD VERSION', null), options: [] },
        answer: { correct: 'A' },
        explanation: null,
      },
      {
        question_id: 'q2',
        version: 1,
        type: 'true_false',
        difficulty: 2,
        concept_id: 'k2',
        body: {
          stem: bi('The membrane lets some things in and keeps others out.', null),
          hint: bi('Think of a door with a guard.', null),
        },
        answer: { correct: true },
        explanation: bi('It is selectively permeable.', null),
      },
      {
        question_id: 'q3',
        version: 1,
        type: 'numeric',
        difficulty: 3,
        concept_id: 'k1',
        body: { stem: bi('How many nuclei does a red blood cell of a human adult have?', null) },
        answer: { correct: 0 },
        explanation: bi('Mature red blood cells lose their nucleus.', null),
      },
      {
        question_id: 'q4',
        version: 1,
        type: 'short_text',
        difficulty: 2,
        concept_id: 'k2',
        body: { stem: bi('Name the thin layer around every cell.', null) },
        answer: { correct: 'membrane', also: ['cell membrane'] },
        explanation: null,
      },
      ...[6, 7].map((n) => ({
        question_id: 'q' + n,
        version: 1,
        type: 'mcq',
        difficulty: 2,
        concept_id: 'k1',
        body: {
          stem: bi(`Revision ${n}: the nucleus is the cell's…`, null),
          options: [
            { key: 'A', text: bi('Control centre', null) },
            { key: 'B', text: bi('Outer skin', null) },
          ],
        },
        answer: { correct: 'A' },
        explanation: null,
      })),
      {
        question_id: 'q5',
        version: 1,
        type: 'long_answer',
        difficulty: 2,
        concept_id: 'k2',
        body: { stem: bi('LONG ANSWER NOT IN PRACTICE', null) },
        answer: null,
        explanation: null,
      },
    ],
    practice_attempts: [],
    math_svgs: [],
    follow_ups: [],
    concept_mastery: [
      {
        learner_id: STUDENT.id,
        concept_id: 'k1',
        state: 'mastered',
        review_stage: 1,
        next_review_at: ago(3),
      },
      {
        learner_id: STUDENT.id,
        concept_id: 'k2',
        state: 'mastered',
        review_stage: 2,
        next_review_at: ago(-0.2),
      },
      {
        learner_id: STUDENT.id,
        concept_id: 'k3',
        state: 'carried_over',
        review_stage: 1,
        next_review_at: ago(-4),
      },
      {
        learner_id: STUDENT.id,
        concept_id: 'k9',
        state: 'mastered',
        review_stage: 3,
        next_review_at: null,
      },
    ],
  };
}
let db = freshDb();
const log = [];
const posts = [];
let student = true;
const visible = () => true;

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function sessionFor(id, email) {
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
const subjectFull = (sid) => {
  const s = find('subjects', sid);
  return s ? { ...s, class: { name: find('classes', s.class_id)?.name } } : null;
};
const chapterFull = (cid) => {
  const c = find('chapters', cid);
  return c ? { ...c, subject: subjectFull(c.subject_id) } : null;
};
const topicFull = (tid) => {
  const t = find('topics', tid);
  return t ? { ...t, chapter: chapterFull(t.chapter_id) } : null;
};
function embed(table, row, select) {
  if (table === 'topics' && select.includes('chapter:'))
    return { ...row, chapter: chapterFull(row.chapter_id) };
  if (table === 'concept_mastery' && select.includes('concept:')) {
    const k = find('concepts', row.concept_id);
    return { ...row, concept: k ? { ...k, topic: topicFull(k.topic_id) } : null };
  }
  if (table === 'learning_content' && select.startsWith('topic:'))
    return { topic: topicFull(row.topic_id) };
  return row;
}
function cond(row, key, c) {
  const val = row[key];
  const [op, ...rest] = c.split('.');
  const arg = rest.join('.');
  if (op === 'eq') return String(val) === arg;
  if (op === 'gte') return Number(val) >= Number(arg);
  if (op === 'is') return arg === 'null' ? val == null : String(val) === arg;
  if (op === 'in')
    return arg
      .replace(/^\(|\)$/g, '')
      .split(',')
      .map((s) => s.replace(/"/g, ''))
      .includes(String(val));
  throw new Error('op ' + op);
}
const SKIP = new Set(['select', 'order', 'limit', 'offset']);

async function mock(page) {
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (!['localhost', 'fakedevproject.supabase.co'].includes(u.hostname))
      log.push('FOREIGN ' + u.hostname);
  });
  page.on('pageerror', (e) => log.push('PAGEERROR ' + e.message));
  await page.route(/youtube/, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<p>player</p>' }),
  );
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
    if (p === '/rest/v1/rpc/student_login_email')
      return json(200, `s.${STUDENT.code}@students.school.invalid`);
    if (p === '/auth/v1/token')
      return json(
        200,
        student
          ? sessionFor(STUDENT.id, 's.1001@students.school.invalid')
          : sessionFor(TEACHER.id, TEACHER.email),
      );
    if (p === '/auth/v1/logout') return route.fulfill({ status: 204 });
    if (p === '/rest/v1/profiles')
      return out([
        student
          ? { role: 'student', full_name: STUDENT.name, student_id: 's-a' }
          : { role: 'teacher', full_name: TEACHER.name, student_id: null },
      ]);
    if (p === '/rest/v1/rpc/review_lesson_unused') {
      const a = req.postDataJSON();
      rpcs.push(a);
      const lc = find('learning_content', a.p_content);
      if (a.p_version !== lc.current_version)
        return json(400, { code: '40001', message: 'review_stale_version' });
      if (a.p_decision !== 'approve' && !a.p_notes)
        return json(400, { code: '23514', message: 'review_reason_required' });
      lc.status =
        a.p_decision === 'approve' ? 'approved' : a.p_decision === 'reject' ? 'retired' : 'draft';
      return json(200, {
        content: lc.id,
        version: lc.current_version,
        decision: a.p_decision,
        status: lc.status,
      });
    }
    const table = p.replace('/rest/v1/', '');
    if (!db[table]) {
      log.push('UNMOCKED ' + req.method() + ' ' + p);
      return json(200, []);
    }
    if (req.method() === 'POST' && table === 'practice_attempts') {
      const row = req.postDataJSON();
      posts.push(row);
      if (db.practice_attempts.some((r) => r.id === row.id))
        return json(409, { code: '23505', message: 'duplicate key value' });
      db.practice_attempts.push(row);
      return route.fulfill({ status: 201, body: '' });
    }
    if (req.method() !== 'GET') {
      log.push('WRITE ' + req.method() + ' ' + p);
      return json(403, { code: '42501', message: 'row-level security' });
    }
    const select = url.searchParams.get('select') || '';
    let rows = db[table].filter((r) => visible(table, r));
    for (const [k, v] of url.searchParams) {
      if (SKIP.has(k)) continue;
      if (k === 'or') {
        const parts = v.replace(/^\(|\)$/g, '').match(/[a-z_]+\.in\.\([^)]*\)/g) || [];
        rows = rows.filter((r) =>
          parts.some((part) => cond(r, part.split('.')[0], part.slice(part.indexOf('.') + 1))),
        );
        continue;
      }
      rows = rows.filter((r) => cond(r, k, v));
    }
    return out(rows.map((r) => embed(table, r, select)));
  });
}

let fails = 0;
const check = (ok, what) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${what}`);
  if (!ok) fails++;
};
const seen = async (page, text, exact = false) =>
  page
    .getByText(text, { exact })
    .filter({ visible: true })
    .first()
    .waitFor({ timeout: 8000 })
    .then(() => true)
    .catch(() => false);
const blur = (page) => page.evaluate(() => document.activeElement && document.activeElement.blur());
const noHScroll = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function studentLogin(page) {
  await page.goto(BASE + '/login');
  await page.getByLabel('Admission number').fill(STUDENT.code);
  await page.getByLabel('PIN', { exact: true }).fill(STUDENT.pin);
  await page.getByText('Go', { exact: true }).click();
  await seen(page, 'Hi, Ali Raza!');
}

/** Answer whatever question is on screen; `right` picks the key or a wrong answer. */
async function answer(page, right) {
  const stem = async (t) => (await page.getByText(t).filter({ visible: true }).count()) > 0;
  if (await stem('Which part controls')) {
    await page.getByRole('radio', { name: right ? /^A\. Nucleus/ : /^B\. Membrane/ }).click();
    return 'q1';
  }
  if (await stem('lets some things in')) {
    await page.getByRole('radio', { name: right ? /^✓/ : /^✗/ }).click();
    return 'q2';
  }
  if (await stem('Revision ')) {
    await page.getByRole('radio', { name: right ? /^A\. Control/ : /^B\. Outer/ }).click();
    return 'q6/7';
  }
  if (await stem('red blood cell')) {
    await page.getByLabel('Your answer').fill(right ? '0' : '1');
    return 'q3';
  }
  if (await stem('thin layer')) {
    await page.getByLabel('Your answer').fill(right ? 'Cell membrane' : 'wall');
    return 'q4';
  }
  throw new Error('unknown question on screen');
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  await mock(page);
  await studentLogin(page);

  // 1. Prepare: due ideas (longest waiting first), a later one, the retained count.
  await page.goto(BASE + '/study');
  check(await seen(page, 'Due for revision'), 'Prepare shows Due for revision');
  check(await seen(page, '3 days waiting'), 'the overdue idea says how long it waited');
  check(await seen(page, 'Ready today'), '12 hours early counts as due');
  check(await seen(page, '1-week check'), 'stage 1 badge');
  check(await seen(page, '1-month check'), 'stage 2 badge');
  check(await seen(page, 'in 4 days'), 'a later idea shows when it comes back');
  check(await seen(page, '1 idea remembered for a month'), 'retained count');
  const names = await page
    .getByText(/^(The nucleus|The membrane)$/)
    .filter({ visible: true })
    .allTextContents();
  check(names[0] === 'The nucleus', 'longest waiting first: ' + names.join(', '));
  await sleep(1200); // let the moments finish before the picture
  await page.screenshot({ path: SHOTS + '/revision-prepare-1280.png', fullPage: true });

  // 2. Revise the nucleus: the set starts at once, on that idea only.
  await page
    .getByRole('button', { name: /Revise 5 questions/ })
    .first()
    .click();
  await page.waitForURL(/practice\?mode=revise&concept=k1/);
  check(
    await seen(page, '1 / 4'),
    'a revision set on that idea starts at once (all 4 items of k1)',
  );
  for (let i = 0; i < 4; i++) {
    const q = await answer(page, true);
    check(['q1', 'q3', 'q6/7'].includes(q), 'only the idea being revised: ' + q);
    await page.getByText('Check', { exact: true }).click();
    await seen(page, 'Correct!');
    await blur(page);
    await page.keyboard.press('Enter');
  }
  check(await seen(page, 'You still remember it!'), 'after the check: still remembered');
  check(await seen(page, 'Back to Prepare'), 'back to Prepare offered');
  for (let i = 0; i < 40 && !posts.length; i++) await sleep(100);
  const row = posts[0];
  check(posts.length === 1 && row?.kind === 'revision', 'one row, kind revision: ' + row?.kind);
  check(row?.items?.length === 4, 'four items in the row');
  await page.screenshot({ path: SHOTS + '/revision-after-1280.png', fullPage: true });

  // 3. A failed check says it comes back (and lands in Do these first).
  await page.goto(BASE + '/lesson/t1/practice?mode=revise&concept=k1');
  await seen(page, '1 / 4');
  for (let i = 0; i < 4; i++) {
    await answer(page, i < 2);
    await page.getByText('Check', { exact: true }).click();
    await sleep(300);
    await blur(page);
    await page.keyboard.press('Enter');
  }
  check(await seen(page, 'It slipped a little'), 'after a failed check: comes back next week');

  // 4. Nothing due: one quiet line of what comes back, no Revise button.
  db.concept_mastery = db.concept_mastery.filter((r) => r.concept_id === 'k3');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE + '/study');
  check(await seen(page, 'Nothing to revise today'), 'nothing due: says so');
  check(!(await page.getByRole('button', { name: /Revise/ }).count()), 'no Revise button');
  check(await noHScroll(page), 'phone width: no horizontal scroll');
  await sleep(1200);
  await page.screenshot({ path: SHOTS + '/revision-later-390.png', fullPage: true });

  check(!log.some((l) => l.startsWith('FOREIGN')), 'no foreign hosts');
  check(
    !log.some((l) => l.startsWith('PAGEERROR')),
    'no page errors: ' + log.filter((l) => l.startsWith('PAGEERROR')).join(' | '),
  );
  check(!log.some((l) => l.startsWith('WRITE')), 'no other writes');
  console.log(log.filter((l) => l.startsWith('UNMOCKED')).join('\n'));
  console.log(fails ? `${fails} FAILED` : 'ALL PASS');
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
