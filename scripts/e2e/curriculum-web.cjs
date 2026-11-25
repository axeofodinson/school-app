// TEST_PLAN CU-2: curriculum editors on web against a MOCKED Supabase (in-memory
// PostgREST; no request leaves localhost). RLS itself is checked in SQL by
// db/test/020_curriculum_smoke.sql (CU-1); this checks the UI, the payloads it
// sends, the empty states and that nothing is ever deleted.
// Build: cd apps/mobile && EXPO_PUBLIC_SUPABASE_URL=https://fakedevproject.supabase.co EXPO_PUBLIC_SUPABASE_ANON_KEY=fake npx expo export -p web
// Serve: node scripts/e2e/serve-dist.mjs "$PWD/apps/mobile/dist" 8089
// Run:   node scripts/e2e/curriculum-web.cjs <screenshot-dir>
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
const A = {
  id: '33333333-3333-4333-8333-333333333333',
  email: 'admin@school.test',
  role: 'admin',
  name: 'Office',
};
const people = [T, A];

function freshDb() {
  return {
    academic_years: [{ id: 'y1', label: '2026-27', is_current: true }],
    classes: [
      { id: 'c9a', name: 'Class 9-A', grade_level: 9 },
      { id: 'c8', name: 'Class 8', grade_level: 8 },
    ],
    subjects: [
      { id: 's-math', class_id: 'c9a', name: 'Mathematics', sort_order: 1 },
      { id: 's-eng', class_id: 'c9a', name: 'English', sort_order: 2 },
      { id: 's-math8', class_id: 'c8', name: 'Mathematics', sort_order: 1 },
    ],
    chapters: [
      {
        id: 'ch1',
        subject_id: 's-math',
        title: 'Sets',
        title_ur: null,
        textbook_ref: null,
        curriculum_id: null,
        status: 'active',
        sort_order: 1,
      },
      {
        id: 'ch2',
        subject_id: 's-math',
        title: 'Logarithms',
        title_ur: null,
        textbook_ref: null,
        curriculum_id: null,
        status: 'active',
        sort_order: 2,
      },
      {
        id: 'ch8',
        subject_id: 's-math8',
        title: 'Fractions',
        title_ur: null,
        textbook_ref: null,
        curriculum_id: null,
        status: 'active',
        sort_order: 1,
      },
    ],
    teacher_assignments: [
      { teacher_id: T.id, class_id: 'c9a', subject_id: 's-math', year_id: 'y1' },
    ],
    curricula: [],
    topics: [
      {
        id: 't1',
        chapter_id: 'ch1',
        title_en: 'Kinds of sets',
        title_ur: 'سیٹ کی قسمیں',
        sort_order: 1,
        status: 'active',
        diagnostic_size: null,
      },
      {
        id: 't2',
        chapter_id: 'ch1',
        title_en: 'Venn diagrams',
        title_ur: null,
        sort_order: 2,
        status: 'active',
        diagnostic_size: 20,
      },
      {
        id: 't8',
        chapter_id: 'ch8',
        title_en: 'Adding fractions',
        title_ur: null,
        sort_order: 1,
        status: 'active',
        diagnostic_size: null,
      },
    ],
    concepts: [
      {
        id: 'k1',
        topic_id: 't1',
        title_en: 'Finite sets',
        title_ur: null,
        summary_en: null,
        summary_ur: null,
        sort_order: 1,
        status: 'active',
      },
      {
        id: 'k2',
        topic_id: 't1',
        title_en: 'Empty set',
        title_ur: null,
        summary_en: null,
        summary_ur: null,
        sort_order: 2,
        status: 'active',
      },
      {
        id: 'k3',
        topic_id: 't2',
        title_en: 'Union',
        title_ur: null,
        summary_en: null,
        summary_ur: null,
        sort_order: 1,
        status: 'active',
      },
      {
        id: 'k8',
        topic_id: 't8',
        title_en: 'Same denominators',
        title_ur: null,
        summary_en: null,
        summary_ur: null,
        sort_order: 1,
        status: 'active',
      },
    ],
    concept_prerequisites: [{ concept_id: 'k3', requires_concept_id: 'k1' }],
  };
}
let db = freshDb();
let requests = [];
let seq = 0;
let offline = false;

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

function withEmbeds(table, row) {
  if (table === 'teacher_assignments')
    return { ...row, class: db.classes.find((c) => c.id === row.class_id) };
  return row;
}
function matches(row, key, cond) {
  const val = row[key];
  const [op, ...rest] = cond.split('.');
  const arg = rest.join('.');
  if (op === 'eq') return String(val) === arg;
  if (op === 'lt') return Number(val) < Number(arg);
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
const filtered = (table, url) => {
  let rows = db[table].map((r) => withEmbeds(table, r));
  for (const [k, v] of url.searchParams)
    if (!SKIP.has(k)) rows = rows.filter((r) => matches(r, k, v));
  return rows;
};
// RLS in JS (db/017): a teacher writes topics/concepts/links only in subjects they teach this year.
const subjectOfTopic = (tid) =>
  db.chapters.find((c) => c.id === db.topics.find((t) => t.id === tid)?.chapter_id)?.subject_id;
const teachesSubject = (who, sid) => {
  const s = db.subjects.find((x) => x.id === sid);
  return (
    who.role === 'admin' ||
    db.teacher_assignments.some(
      (a) =>
        a.teacher_id === who.id &&
        a.class_id === s?.class_id &&
        (a.subject_id === null || a.subject_id === sid),
    )
  );
};
function allowed(who, table, row) {
  if (who.role === 'admin') return true;
  if (table === 'topics')
    return teachesSubject(who, db.chapters.find((c) => c.id === row.chapter_id)?.subject_id);
  if (table === 'concepts') return teachesSubject(who, subjectOfTopic(row.topic_id));
  if (table === 'concept_prerequisites')
    return teachesSubject(
      who,
      subjectOfTopic(db.concepts.find((c) => c.id === row.concept_id)?.topic_id),
    );
  return false; // curricula, chapters: admin only
}
function loops(edges, concept, requires) {
  const seen = new Set();
  const stack = [requires];
  while (stack.length) {
    const c = stack.pop();
    if (c === concept) return true;
    if (seen.has(c)) continue;
    seen.add(c);
    edges.filter((e) => e.concept_id === c).forEach((e) => stack.push(e.requires_concept_id));
  }
  return false;
}

const log = [];
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
    if (offline && req.method() !== 'GET') return route.abort('internetdisconnected');
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
      return json(200, []);
    }
    const m = req.method();
    if (m === 'GET') return out(filtered(table, url));
    const body = req.postData() ? req.postDataJSON() : null;
    requests.push({ m, table, body, q: url.search, who: who.role });
    const refuse = () =>
      json(403, { code: '42501', message: 'new row violates row-level security policy' });
    if (m === 'POST') {
      const list = Array.isArray(body) ? body : [body];
      for (const r of list) if (!allowed(who, table, r)) return refuse();
      if (table === 'curricula' && list.some((r) => db.curricula.some((c) => c.code === r.code)))
        return json(409, {
          code: '23505',
          message: 'duplicate key value violates unique constraint "curricula_code_key"',
        });
      if (table === 'concept_prerequisites') {
        for (const r of list)
          if (loops(db.concept_prerequisites, r.concept_id, r.requires_concept_id))
            return json(400, {
              code: '23514',
              message: 'prerequisite_cycle: that would make a loop of prerequisites',
            });
        db.concept_prerequisites.push(...list);
        return json(201, list);
      }
      const saved = list.map((r) => {
        const row = { id: `${table}-${++seq}`, status: 'active', sort_order: 0, ...r };
        db[table].push(row);
        return row;
      });
      return out(saved);
    }
    if (m === 'PATCH') {
      // RLS: rows the caller can't write are filtered out (0 rows, no error).
      const rows = filtered(table, url)
        .map((r) => db[table].find((x) => x.id === r.id))
        .filter((r) => allowed(who, table, r) && allowed(who, table, { ...r, ...body }));
      rows.forEach((r) => Object.assign(r, body));
      return out(rows);
    }
    if (m === 'DELETE') {
      if (table !== 'concept_prerequisites') return out([]); // no delete policy: 0 rows
      const kill = filtered(table, url).filter((r) => allowed(who, table, r));
      db[table] = db[table].filter((r) => !kill.includes(r));
      return out(kill);
    }
    return json(405, {});
  });
}

const seen = (page, text, exact = false) =>
  page
    .getByText(text, { exact })
    .first()
    .waitFor({ timeout: 8000 })
    .then(
      () => true,
      () => false,
    );
const gone = (page, text, exact = false) =>
  page
    .getByText(text, { exact })
    .first()
    .waitFor({ state: 'detached', timeout: 8000 })
    .then(
      () => true,
      () => false,
    );
const check = (cond, msg) => {
  console.log((cond ? 'PASS ' : 'FAIL ') + msg);
  if (!cond) process.exitCode = 1;
};
const last = (table, m) => [...requests].reverse().find((r) => r.table === table && r.m === m);
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
const dialog = (page) => page.getByRole('dialog').last();
const save = (page) => dialog(page).getByText('Save', { exact: true }).click();

(async () => {
  const browser = await chromium.launch();

  // 1. Teacher: map, topics, concepts, prerequisites, retire.
  {
    const { ctx, page } = await login(browser, T);
    await page.getByText('Curriculum', { exact: true }).first().click();
    await page.waitForURL('**/curriculum');
    check(
      await seen(page, 'Kinds of sets', true),
      'teacher opens the first chapter of the taught subject',
    );
    check(
      !(await page.getByText('Textbook editions', { exact: true }).count()),
      'editions tab hidden for a teacher',
    );
    check(!(await page.getByText('Class 8', { exact: true }).count()), 'untaught class hidden');
    check(!(await page.getByText('English', { exact: true }).count()), 'unassigned subject hidden');
    check(await seen(page, 'Topics: 2 · Concepts: 3'), 'chapter list counts topics and concepts');
    check(await seen(page, 'Needs: Finite sets'), 'prerequisite shown on the concept');
    check(await seen(page, 'Diagnostic: 20 questions', true), 'diagnostic size badge');
    check(await seen(page, 'Diagnostic: 30 questions (default)'), 'default diagnostic badge');
    check(
      (await page.getByLabel('Students fill 2 tiles in this topic').count()) === 1,
      'topic mosaic preview (2 tiles)',
    );
    await page.screenshot({ path: SHOTS + '/curriculum-teacher.png', fullPage: true });

    // Add a topic: validation, then save.
    await page.getByText('Add topic', { exact: true }).first().click();
    await dialog(page).getByLabel('Title (English)').press('Enter');
    check(await seen(page, 'Write the English title.'), 'empty title refused before sending');
    await dialog(page).getByLabel('Title (English)').fill('Subsets');
    await dialog(page).getByLabel('Diagnostic size').fill('3');
    await dialog(page).getByLabel('Diagnostic size').press('Enter');
    check(await seen(page, 'Use a number from 5 to 60.'), 'diagnostic size 3 refused');
    check(!last('topics', 'POST'), 'nothing sent while invalid');
    await dialog(page).getByLabel('Title (Urdu)').fill('ذیلی سیٹ');
    await dialog(page).getByLabel('Diagnostic size').fill('۲۵');
    await save(page);
    check(await seen(page, 'Topic added'), 'topic saved (toast)');
    const tp = last('topics', 'POST');
    check(
      tp &&
        tp.body.chapter_id === 'ch1' &&
        tp.body.title_en === 'Subsets' &&
        tp.body.title_ur === 'ذیلی سیٹ' &&
        tp.body.diagnostic_size === 25 &&
        tp.body.sort_order === 3,
      'topic payload (Urdu digits → 25, at the end)',
    );
    check(await seen(page, 'Subsets', true), 'new topic card shown');

    // Move topic 3 up.
    requests = [];
    await page.getByRole('button', { name: 'Move Subsets up' }).click();
    await page.waitForTimeout(400);
    const moves = requests.filter((r) => r.table === 'topics' && r.m === 'PATCH');
    check(
      moves.length === 2 && moves.every((r) => 'sort_order' in r.body),
      'move = two sort_order updates',
    );
    const order = await page.getByText(/^(Kinds of sets|Venn diagrams|Subsets)$/).allTextContents();
    check(order.join('|') === 'Kinds of sets|Subsets|Venn diagrams', 'new order on screen');

    // Edit a topic.
    await page.getByRole('button', { name: 'Edit topic' }).nth(1).click();
    await dialog(page).getByLabel('Title (English)').fill('Subsets and supersets');
    await dialog(page).getByLabel('Title (English)').press('Enter');
    check(await seen(page, 'Subsets and supersets', true), 'topic renamed');
    check(last('topics', 'PATCH')?.body.title_en === 'Subsets and supersets', 'rename payload');

    // Add a concept with a prerequisite from this subject.
    await page.getByText('Add concept', { exact: true }).first().click();
    await dialog(page).getByLabel('Title (English)').fill('Infinite sets');
    await dialog(page)
      .getByLabel('What the student learns (English)')
      .fill('A set that never ends.\nLike the counting numbers.');
    check(await seen(page, 'This subject'), 'prerequisite picker shown');
    await dialog(page)
      .getByRole('checkbox', { name: /^Finite sets/ })
      .click();
    check(await seen(page, '1 picked'), 'picked count');
    await page.screenshot({ path: SHOTS + '/curriculum-concept.png' });
    await save(page);
    check(await seen(page, 'Concept added'), 'concept saved (toast)');
    const cp = last('concepts', 'POST');
    const link = last('concept_prerequisites', 'POST');
    check(
      cp &&
        cp.body.topic_id === 't1' &&
        cp.body.summary_en === 'A set that never ends.\nLike the counting numbers.' &&
        cp.body.sort_order === 3,
      'concept payload keeps line breaks',
    );
    check(
      link &&
        link.body.length === 1 &&
        link.body[0].requires_concept_id === 'k1' &&
        link.body[0].concept_id.startsWith('concepts-'),
      'link sent after the concept (needs its id)',
    );

    // Loop prevention: Finite sets can't need Union (Union needs Finite sets).
    await page.getByRole('button', { name: /^1\.1 Finite sets/ }).click();
    const union = dialog(page).getByRole('checkbox', { name: /^Union/ });
    check(await union.isDisabled(), 'a concept that needs this one cannot be picked (loop)');
    check(await seen(page, "Can't pick: it already needs this concept"), 'loop reason shown');

    // Earlier classes: Class 8 Maths.
    await dialog(page).getByRole('radio', { name: 'Earlier classes' }).click();
    check(await seen(page, 'Same denominators'), 'earlier class concepts listed');
    await dialog(page)
      .getByRole('checkbox', { name: /^Same denominators/ })
      .click();
    await save(page);
    check(await seen(page, 'Saved', true), 'prerequisite from an earlier class saved');
    check(
      last('concept_prerequisites', 'POST')?.body[0].requires_concept_id === 'k8',
      'earlier-class link payload',
    );
    check(await seen(page, 'Needs: Same denominators'), 'chip names the earlier-class concept');

    // Remove a prerequisite.
    await page.getByRole('button', { name: /^3\.1 Union/ }).click();
    await dialog(page)
      .getByRole('checkbox', { name: /^Finite sets/ })
      .click();
    await save(page);
    await page.waitForTimeout(500);
    // "Infinite sets" still needs Finite sets; Union no longer does.
    check(
      (await page.getByText('Needs: Finite sets', { exact: true }).count()) === 1,
      'prerequisite removed',
    );
    const del = last('concept_prerequisites', 'DELETE');
    const dq = del ? decodeURIComponent(del.q) : '';
    check(
      /concept_id=eq\.k3/.test(dq) && /requires_concept_id=in\.\(.*k1/.test(dq),
      'removal deletes only that link',
    );

    // Retire a concept, show retired, bring it back.
    await page.getByRole('button', { name: 'Retire: Empty set' }).click();
    check(await gone(page, 'Empty set', true), 'retired concept hidden');
    check(last('concepts', 'PATCH')?.body.status === 'retired', 'retire = status update');
    await page.getByText('Show retired', { exact: true }).click();
    check(await seen(page, 'Empty set', true), 'shown with "Show retired"');
    await page.getByRole('button', { name: 'Bring back: Empty set' }).click();
    check(last('concepts', 'PATCH')?.body.status === 'active', 'brought back');

    // Empty chapter.
    await page.getByRole('button', { name: /^Logarithms/ }).click();
    check(await seen(page, 'No topics in this chapter yet'), 'empty chapter state with an action');

    // Offline: the form stays open with the reason; nothing is lost.
    offline = true;
    await page.getByText('Add topic', { exact: true }).last().click();
    await dialog(page).getByLabel('Title (English)').fill('Laws of logarithms');
    await save(page);
    check(await seen(page, 'No internet connection'), 'offline save explained');
    check(
      (await dialog(page).getByLabel('Title (English)').inputValue()) === 'Laws of logarithms',
      'typed text kept',
    );
    offline = false;
    await save(page);
    check(await seen(page, 'Topic added'), 'saves once back online');

    check(
      !requests.some((r) => r.m === 'DELETE' && r.table !== 'concept_prerequisites'),
      'nothing but a prerequisite link is ever deleted',
    );
    check(
      !requests.some((r) => ['chapters', 'curricula'].includes(r.table)),
      'teacher sends no chapter or edition writes',
    );

    // Phone width: list, then chapter, no horizontal scroll.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await page.waitForTimeout(1500);
    check(await seen(page, 'Sets', true), 'phone: chapter list first');
    await page.getByRole('button', { name: /^Sets/ }).click();
    check(await seen(page, 'Kinds of sets', true), 'phone: chapter opens');
    const wide = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    check(!wide, 'phone: no horizontal scroll');
    await page.screenshot({ path: SHOTS + '/curriculum-phone.png', fullPage: true });
    await ctx.close();
  }

  // 2. Admin: editions, attach chapters (backfill), add chapter.
  {
    db = freshDb();
    requests = [];
    const { ctx, page } = await login(browser, A);
    await page.goto(BASE + '/curriculum');
    await page.waitForTimeout(1500);
    if (!page.url().endsWith('/curriculum')) await page.goto(BASE + '/curriculum');
    check(await seen(page, 'No edition'), 'admin sees chapters without an edition');
    await page.getByRole('radio', { name: 'Textbook editions' }).click();
    check(await seen(page, 'No textbook editions yet'), 'editions empty state');
    check(
      await seen(page, 'Add an edition first, then attach chapters to it.'),
      'attach needs an edition first',
    );
    await page.getByText('Add edition', { exact: true }).first().click();
    await dialog(page).getByLabel('Code').fill('ptb-2025');
    await dialog(page).getByLabel('Name').fill('PTB 2025 edition');
    await dialog(page).getByLabel('In use from').fill('2025-02-30');
    await save(page);
    check(await seen(page, 'Use a real date as YYYY-MM-DD.'), 'impossible date refused');
    await dialog(page).getByLabel('In use from').fill('2025-04-01');
    await save(page);
    check(await seen(page, 'Edition added'), 'edition saved');
    const ed = last('curricula', 'POST');
    check(
      ed &&
        ed.body.code === 'PTB-2025' &&
        ed.body.board === 'Punjab Textbook Board' &&
        ed.body.effective_from === '2025-04-01',
      'edition payload (code upper-cased, PTB default board)',
    );
    await page.getByText('Add edition', { exact: true }).first().click();
    await dialog(page).getByLabel('Code').fill('PTB-2025');
    await dialog(page).getByLabel('Name').fill('Again');
    await save(page);
    check(
      await seen(page, 'That code is already used by another edition.'),
      'duplicate code explained',
    );
    await dialog(page).getByText('Cancel', { exact: true }).click();

    check(await seen(page, 'Class 8 · Mathematics'), 'loose chapters grouped by class and subject');
    await page.getByText('Select all 3', { exact: true }).click();
    check(await seen(page, 'Attach 3 chapters'), 'attach button counts the ticks');
    await page.getByRole('checkbox', { name: /^Class 8 · Mathematics/ }).click();
    await page.getByText('Attach 2 chapters', { exact: true }).click();
    check(await seen(page, '2 chapters attached to PTB-2025'), 'attached (toast)');
    const at = last('chapters', 'PATCH');
    check(
      at && at.body.curriculum_id && /curriculum_id=is\.null/.test(at.q) && /id=in\./.test(at.q),
      'attach only touches chapters with no edition',
    );
    check(await seen(page, 'Fractions', true), 'the unticked chapter stays on the list');
    await page.screenshot({ path: SHOTS + '/curriculum-editions.png', fullPage: true });

    await page.getByRole('radio', { name: 'Chapters and topics' }).click();
    check(await seen(page, 'PTB-2025'), 'chapter shows its edition');
    await page.getByText('Add chapter', { exact: true }).first().click();
    await dialog(page).getByLabel('Title (English)').fill('Matrices');
    await dialog(page).getByLabel('Textbook reference').fill('Unit 4');
    await save(page);
    check(await seen(page, 'Chapter added'), 'admin adds a chapter');
    const ch = last('chapters', 'POST');
    check(
      ch &&
        ch.body.subject_id === 's-math' &&
        ch.body.curriculum_id &&
        ch.body.textbook_ref === 'Unit 4' &&
        ch.body.sort_order === 3,
      'chapter payload (edition preselected, at the end)',
    );
    check(
      await seen(page, 'No topics in this chapter yet'),
      'new chapter opens on its empty state',
    );

    // Urdu: right to left.
    await page.evaluate(() => localStorage.setItem('app.locale', 'ur'));
    await page.reload();
    await page.waitForTimeout(2000);
    check((await page.evaluate(() => document.documentElement.dir)) === 'rtl', 'Urdu is RTL');
    await ctx.close();
  }

  await browser.close();
  const bad = log.filter((l) => !l.startsWith('UNMOCKED GET'));
  check(
    bad.length === 0,
    'no page errors, foreign hosts or unmocked writes' + (bad.length ? ': ' + bad.join('; ') : ''),
  );
  if (log.length) console.log(log.join('\n'));
})();
