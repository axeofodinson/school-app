// TEST_PLAN AB-2: question authoring + assessment builder on web against a MOCKED
// Supabase (in-memory PostgREST; no request leaves localhost). RLS itself is
// checked in SQL by db/test/010_builder_smoke.sql (AB-1); this checks the UI,
// the payloads it sends and the empty states.
// Build: cd apps/mobile && EXPO_PUBLIC_SUPABASE_URL=https://fakedevproject.supabase.co EXPO_PUBLIC_SUPABASE_ANON_KEY=fake npx expo export -p web
// Serve: node scripts/e2e/serve-dist.mjs "$PWD/apps/mobile/dist" 8089
// Run:   NODE_PATH=$(npm root -g) node scripts/e2e/staff-builder-web.cjs <screenshot-dir>
const { chromium } = require('playwright');
const BASE = 'http://localhost:8089';
const SB = 'https://fakedevproject.supabase.co';
const SHOTS = process.argv[2];

const T = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'teacher@school.test',
  role: 'teacher',
  name: 'Ms Ayesha',
};
const NEW = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'new@school.test',
  role: 'teacher',
  name: 'New Teacher',
};
const A = {
  id: '33333333-3333-4333-8333-333333333333',
  email: 'admin@school.test',
  role: 'admin',
  name: 'Office',
};
const people = [T, NEW, A];

function freshDb(withYear = true) {
  return {
    academic_years: withYear ? [{ id: 'y1', label: '2026-27', is_current: true }] : [],
    classes: [
      { id: 'c9a', name: 'Class 9-A', grade_level: 9 },
      { id: 'c8', name: 'Class 8', grade_level: 8 },
    ],
    subjects: [
      { id: 's-math', class_id: 'c9a', name: 'Mathematics', sort_order: 1 },
      { id: 's-eng', class_id: 'c9a', name: 'English', sort_order: 2 },
      { id: 's-sci8', class_id: 'c8', name: 'Science', sort_order: 1 },
    ],
    chapters: [
      { id: 'ch1', subject_id: 's-math', title: 'Sets', sort_order: 1 },
      { id: 'ch2', subject_id: 's-math', title: 'Logarithms', sort_order: 2 },
    ],
    teacher_assignments: [
      { teacher_id: T.id, class_id: 'c9a', subject_id: 's-math', year_id: 'y1' },
    ],
    questions: [
      {
        id: 'q-other',
        chapter_id: 'ch1',
        type: 'true_false',
        cognitive_level: 'understand',
        body: { stem: 'The empty set is a subset of every set.' },
        answer: { correct: true },
        default_marks: 2,
        created_by: 'someone-else',
        created_at: '2026-01-01T00:00:00Z',
      },
    ],
    assessments: [],
    assessment_questions: [],
  };
}
let db = freshDb();
const requests = [];
let seq = 0;

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function sessionFor(u) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return {
    access_token: `${b64({ alg: 'HS256' })}.${b64({ sub: u.id, exp, role: 'authenticated' })}.sig`,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: exp,
    refresh_token: 'r-' + u.id,
    user: {
      id: u.id,
      aud: 'authenticated',
      email: u.email,
      app_metadata: {},
      user_metadata: {},
      created_at: new Date().toISOString(),
    },
  };
}

// Embeds every select might ask for (supabase-js ignores extra keys).
function withEmbeds(table, row) {
  const find = (t, id) => db[t].find((r) => r.id === id) ?? null;
  switch (table) {
    case 'teacher_assignments':
      return { ...row, class: find('classes', row.class_id) };
    case 'questions':
      return { ...row, chapter: find('chapters', row.chapter_id) };
    case 'assessment_questions':
      return { ...row, assessment: find('assessments', row.assessment_id) };
    case 'assessments':
      return {
        ...row,
        class: find('classes', row.class_id),
        subject: find('subjects', row.subject_id),
        items: db.assessment_questions.filter((i) => i.assessment_id === row.id),
      };
    default:
      return row;
  }
}
function matches(row, key, cond) {
  const val = key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), row);
  const [op, ...rest] = cond.split('.');
  const arg = rest.join('.');
  if (op === 'eq') return String(val) === arg;
  if (op === 'neq') return String(val) !== arg;
  if (op === 'is') return arg === 'null' ? val == null : String(val) === arg;
  if (op === 'in')
    return arg
      .replace(/^\(|\)$/g, '')
      .split(',')
      .map((s) => s.replace(/"/g, ''))
      .includes(String(val));
  throw new Error('op ' + op);
}
const SKIP = new Set(['select', 'order', 'limit', 'on_conflict', 'offset']);
function filtered(table, url) {
  let rows = db[table].map((r) => withEmbeds(table, r));
  for (const [k, v] of url.searchParams)
    if (!SKIP.has(k)) rows = rows.filter((r) => matches(r, k, v));
  return rows;
}
// Teacher RLS, roughly: a teacher may write only into classes they teach.
function teaches(uid, classId) {
  return db.teacher_assignments.some((a) => a.teacher_id === uid && a.class_id === classId);
}

async function mock(page, who) {
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (!['localhost', 'fakedevproject.supabase.co'].includes(u.hostname))
      log.push('FOREIGN ' + u.hostname);
  });
  page.on('pageerror', (e) => log.push('PAGEERROR ' + e.message));
  await page.route(SB + '/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const json = (status, body) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (p === '/auth/v1/token') {
      const { email } = req.postDataJSON();
      const u = people.find((x) => x.email === email);
      return u
        ? json(200, sessionFor(u))
        : json(400, { code: 'invalid_credentials', msg: 'Invalid login credentials' });
    }
    if (p === '/auth/v1/logout') return route.fulfill({ status: 204 });
    const table = p.replace('/rest/v1/', '');
    const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const out = (rows) =>
      single
        ? rows.length
          ? json(200, rows[0])
          : json(406, { code: 'PGRST116', message: 'no rows' })
        : json(200, rows);
    if (table === 'profiles') {
      const u = people.find((x) => url.searchParams.get('id') === 'eq.' + x.id);
      return out(u ? [{ role: u.role, full_name: u.name, student_id: null }] : []);
    }
    if (!db[table]) {
      log.push('UNMOCKED ' + req.method() + ' ' + p);
      return json(404, {});
    }
    const m = req.method();
    if (m === 'GET') {
      let rows = filtered(table, url);
      if (single && url.searchParams.get('limit') === '1') rows = rows.slice(0, 1);
      return out(rows);
    }
    const body = req.postData() ? req.postDataJSON() : null;
    requests.push({ m, table, body, q: url.search });
    if (m === 'POST') {
      const list = Array.isArray(body) ? body : [body];
      for (const r of list) {
        const cls =
          table === 'assessments'
            ? r.class_id
            : table === 'questions'
              ? db.subjects.find(
                  (s) => s.id === db.chapters.find((c) => c.id === r.chapter_id)?.subject_id,
                )?.class_id
              : null;
        if (cls && who.role === 'teacher' && !teaches(who.id, cls)) {
          return json(403, {
            code: '42501',
            message: 'new row violates row-level security policy',
          });
        }
      }
      const upsert = url.searchParams.get('on_conflict');
      const saved = list.map((r) => {
        if (upsert) {
          const keys = upsert.split(',');
          const prev = db[table].find((x) => keys.every((k) => x[k] === r[k]));
          if (prev) return Object.assign(prev, r);
        }
        const row = {
          id: `${table}-${++seq}`,
          created_at: new Date(Date.now() + seq).toISOString(),
          ...r,
        };
        db[table].push(row);
        return row;
      });
      return out(saved.map((r) => withEmbeds(table, r)));
    }
    if (m === 'PATCH') {
      const rows = filtered(table, url).map((r) => db[table].find((x) => x.id === r.id));
      rows.forEach((r) => Object.assign(r, body));
      return out(rows.map((r) => withEmbeds(table, r)));
    }
    if (m === 'DELETE') {
      const kill = new Set(
        filtered(table, url).map((r) => JSON.stringify([r.assessment_id, r.question_id, r.id])),
      );
      db[table] = db[table].filter(
        (r) => !kill.has(JSON.stringify([r.assessment_id, r.question_id, r.id])),
      );
      return route.fulfill({ status: 204 });
    }
    return json(405, {});
  });
}

const log = [];
const seen = (page, text, exact = false) =>
  page
    .getByText(text, { exact })
    .first()
    .waitFor({ timeout: 8000 })
    .then(
      () => true,
      () => false,
    );
const check = (cond, msg) => {
  console.log((cond ? 'PASS ' : 'FAIL ') + msg);
  if (!cond) process.exitCode = 1;
};
async function login(browser, who, viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  await mock(page, who);
  await page.goto(BASE + '/staff');
  await page.getByLabel('Email').fill(who.email);
  await page.getByLabel('Password').fill('secret');
  await page.getByText('Sign in', { exact: true }).click();
  await page.waitForURL(/\/(classes|school)$/, { timeout: 8000 }).catch(() => {});
  return { ctx, page };
}
// A hard load of a deep link can bounce to home while the session restores
// (Stack.Protected guards are all false during 'loading'; MODULE_STATUS follow-up).
async function go(page, path) {
  await page.goto(BASE + path);
  await page.waitForTimeout(1500);
  if (!page.url().endsWith(path)) await page.goto(BASE + path);
}
const last = (table, m) => [...requests].reverse().find((r) => r.table === table && r.m === m);

(async () => {
  const browser = await chromium.launch();

  // 1. Teacher writes questions.
  {
    const { ctx, page } = await login(browser, T);
    check(page.url().endsWith('/classes'), 'teacher lands on /classes');
    await page.getByText('Questions', { exact: true }).first().click();
    await page.waitForURL('**/questions');
    check(await seen(page, 'Class 9-A', true), 'only the taught class is offered');
    check(!(await page.getByText('Class 8', { exact: true }).count()), 'untaught class hidden');
    check(!(await page.getByText('English', { exact: true }).count()), 'unassigned subject hidden');
    check(
      await seen(page, 'The empty set is a subset of every set.'),
      'bank lists chapter questions',
    );
    await page.getByText('The empty set is a subset of every set.').click();
    check(await seen(page, 'Another teacher wrote this question'), "other's question is read-only");
    await page.screenshot({ path: SHOTS + '/questions-view.png', fullPage: true });

    await page.getByText('New question', { exact: true }).first().click();
    await page.getByLabel('Question', { exact: true }).fill('Which set has no elements?');
    await page.getByLabel('Option A', { exact: true }).fill('Universal set');
    await page.getByLabel('Option B', { exact: true }).fill('Empty set');
    await page.getByLabel('Marks', { exact: true }).press('Enter');
    check(await seen(page, 'Pick a thinking level'), 'Enter saves → cognitive level required');
    await page.getByRole('radio', { name: 'Recall' }).click();
    await page.getByLabel('Marks', { exact: true }).press('Enter');
    check(await seen(page, 'Mark which option is correct.'), 'correct option required');
    await page.getByRole('radio', { name: 'Mark B as correct' }).click();
    await page.getByLabel('Marks', { exact: true }).fill('2');
    await page.getByLabel('Marks', { exact: true }).press('Enter');
    check(await seen(page, 'Question saved.'), 'mcq saved (toast)');
    const mcq = last('questions', 'POST');
    check(
      mcq &&
        JSON.stringify(mcq.body.body) ===
          JSON.stringify({
            stem: 'Which set has no elements?',
            options: [
              { key: 'A', text: 'Universal set' },
              { key: 'B', text: 'Empty set' },
            ],
          }) &&
        JSON.stringify(mcq.body.answer) === '{"correct":"B"}' &&
        mcq.body.cognitive_level === 'recall' &&
        mcq.body.default_marks === 2 &&
        mcq.body.chapter_id === 'ch1' &&
        mcq.body.created_by === T.id,
      'mcq payload: existing body/answer shape, level, marks, chapter, owner',
    );

    await page.getByRole('radio', { name: 'Short text' }).click();
    await page.getByRole('radio', { name: 'Apply' }).click();
    await page.getByLabel('Question', { exact: true }).fill('Name the set {1,2} ∪ {}');
    await page.getByLabel('Correct answer').fill('{1,2}');
    await page.getByLabel('Also accept (optional)').fill('{2,1}\n{1, 2}');
    await page.keyboard.press('Control+Enter');
    await page.waitForTimeout(500);
    const st = last('questions', 'POST');
    check(
      st.body.type === 'short_text' &&
        JSON.stringify(st.body.answer) === '{"correct":"{1,2}","also":["{2,1}","{1, 2}"]}',
      'short_text payload via Ctrl+Enter',
    );
    check(await seen(page, 'Which set has no elements?'), 'new question appears in the list');
    await page.screenshot({ path: SHOTS + '/questions-new.png', fullPage: true });

    // Edit own question.
    await page.getByText('Which set has no elements?').click();
    check(
      await page
        .getByRole('heading', { name: 'Edit question' })
        .waitFor({ timeout: 8000 })
        .then(
          () => true,
          () => false,
        ),
      'own question opens for editing',
    );
    await page.screenshot({ path: SHOTS + '/questions-edit.png', fullPage: true });
    await page.getByLabel('Option B', { exact: true }).fill('Empty set (∅)');
    await page.getByText('Update question').click();
    check(await seen(page, 'Question updated.'), 'edit saved');
    const patch = last('questions', 'PATCH');
    check(
      patch &&
        patch.body.answer.correct === 'B' &&
        patch.body.body.options[1].text === 'Empty set (∅)',
      'edit payload',
    );

    // 2. Assessment builder.
    await go(page, '/assessments');
    const emptyOk = await seen(page, 'No assessments yet');
    if (!emptyOk) await page.screenshot({ path: SHOTS + '/debug-assessments.png', fullPage: true });
    check(emptyOk, 'assessments empty state');
    await page.getByText('New assessment').first().click();
    await page.waitForURL('**/assessments/new');
    check(await seen(page, 'No questions on the paper yet'), 'paper empty state');
    await page.getByText('Publish', { exact: true }).click();
    check(await seen(page, 'Enter a title for the assessment.'), 'title required');
    await page.getByLabel('Title').fill('Sets quiz');
    await page.getByRole('radio', { name: 'Quiz' }).click();
    await page.getByLabel('Weightage (%)').fill('10');
    await page.getByLabel('Scheduled date').fill('2026-12-01');
    await page.getByText('Publish', { exact: true }).click();
    check(
      await seen(page, 'Add at least one question before publishing.'),
      'publish needs questions',
    );
    await page.getByText('Which set has no elements?').click();
    await page.getByText('The empty set is a subset of every set.').click();
    check(await seen(page, '2 questions selected · Total marks: 4'), 'picked list totals marks');
    await page.getByRole('button', { name: 'Move up' }).nth(1).click();
    await page.getByLabel('Marks', { exact: true }).first().fill('5');
    check(await seen(page, 'Total marks: 7'), 'total follows marks');
    await page.screenshot({ path: SHOTS + '/builder-new.png', fullPage: true });
    await page.getByText('Publish', { exact: true }).click();
    await page.waitForURL(/\/assessments\/assessments-\d+$/, { timeout: 8000 }).catch(() => {});
    const a = db.assessments[0];
    check(
      a &&
        a.status === 'published' &&
        a.class_id === 'c9a' &&
        a.subject_id === 's-math' &&
        a.year_id === 'y1' &&
        a.total_marks === 7 &&
        Number(a.weightage) === 10 &&
        a.type === 'quiz' &&
        a.scheduled_on === '2026-12-01',
      'assessment row: class/subject/year/type/weight/date/total',
    );
    const firstPost = requests.find((r) => r.table === 'assessments' && r.m === 'POST');
    check(firstPost.body.status === 'draft', 'created as draft first, then published');
    const items = db.assessment_questions.sort((x, y) => x.sort_order - y.sort_order);
    check(
      items.length === 2 &&
        items[0].question_id === 'q-other' &&
        items[0].marks === 5 &&
        items[1].marks === 2,
      'items order + marks',
    );
    check(await seen(page, 'is published'), 'published toast');
    check(await seen(page, 'its questions and marks are fixed'), 'published → questions locked');
    check(await seen(page, 'Close', true), 'close action offered');
    await page.screenshot({ path: SHOTS + '/builder-published.png', fullPage: true });
    await page.getByText('Close', { exact: true }).click();
    await page.waitForTimeout(800);
    check(db.assessments[0].status === 'closed', 'close sets status');
    check(await seen(page, 'Reopen', true), 'reopen offered after close');
    await go(page, '/assessments');
    check(await seen(page, 'Sets quiz'), 'list shows the assessment');
    check(await seen(page, 'Closed', true), 'list shows status');

    // Urdu + RTL (layout mirrors; untranslated strings fall back to English).
    await page.evaluate(() => localStorage.setItem('app.locale', 'ur'));
    await page.reload();
    await page.waitForTimeout(1200);
    check((await page.getAttribute('html', 'dir')) === 'rtl', 'Urdu: dir=rtl');
    await page.screenshot({ path: SHOTS + '/assessments-ur.png', fullPage: true });

    // Phone width: one pane at a time.
    await page.evaluate(() => localStorage.setItem('app.locale', 'en'));
    await page.setViewportSize({ width: 390, height: 844 });
    await go(page, '/questions');
    await page.getByText('Which set has no elements?').click();
    check(
      await seen(page, 'in a published assessment, so it can'),
      'phone: detail replaces list; used question is locked',
    );
    check(
      !(await page
        .getByText('My questions', { exact: true })
        .isVisible()
        .catch(() => false)),
      'phone: list hidden while open',
    );
    await page.screenshot({ path: SHOTS + '/questions-phone.png', fullPage: true });
    await ctx.close();
  }

  // 3. Teacher without assignments, admin with no year.
  {
    const { ctx, page } = await login(browser, NEW);
    await go(page, '/assessments');
    check(await seen(page, "You're not assigned to a class yet"), 'no-assignment empty state');
    await ctx.close();
    db = freshDb(false);
    const s2 = await login(browser, A);
    check(s2.page.url().endsWith('/school'), 'admin lands on /school');
    await s2.page.getByText('Assessments', { exact: true }).first().click();
    check(await seen(s2.page, 'No school year is open'), 'admin: no-year empty state');
    await s2.page.screenshot({ path: SHOTS + '/no-year.png', fullPage: true });
    await s2.ctx.close();
  }

  // 4. Admin sees every class; RLS refusal reads as "classes you teach".
  {
    db = freshDb();
    const { ctx, page } = await login(browser, A);
    await go(page, '/questions');
    check(await seen(page, 'Class 8', true), 'admin sees every class');
    await page.getByRole('radio', { name: 'Class 8' }).click();
    check(await seen(page, 'This subject has no chapters yet'), 'no-chapters empty state');
    await ctx.close();
    const t2 = await login(browser, T);
    // Pretend the teacher lost the class after the page loaded: the insert is refused.
    await go(t2.page, '/assessments/new');
    await t2.page.getByLabel('Title').fill('Late');
    await t2.page.waitForTimeout(500);
    db.teacher_assignments = [];
    await t2.page.getByText('Save draft').click();
    check(await seen(t2.page, 'You can only do this for classes you teach'), 'RLS refusal message');
    await t2.ctx.close();
  }

  await browser.close();
  const bad = log.filter((l) => !l.startsWith('PAGEERROR ResizeObserver'));
  check(
    bad.length === 0,
    'no page errors, unmocked calls or foreign hosts' + (bad.length ? ': ' + bad.join(' | ') : ''),
  );
})();
