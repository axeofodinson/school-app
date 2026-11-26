// TEST_PLAN OP-2: offline Learn packs (prompt 32) on web against a MOCKED
// Supabase (the practice e2e's in-memory PostgREST + a learn_pack mock that
// follows db/036: active topics, approved lessons at their learn approval,
// newest practice versions, `have` → no content). Save a chapter from the
// lesson list; Downloads lists it with size; Update sends only the delta; with
// the network gone and the page reloaded (service worker app shell) a lesson
// never opened reads from the pack and a never-opened topic practises from it,
// the set waits on the device and uploads once online; Delete empties storage.
// Also measures pack size for the synthetic sample chapter (raw + gzip).
// Build: cd apps/mobile && EXPO_PUBLIC_SUPABASE_URL=https://fakedevproject.supabase.co EXPO_PUBLIC_SUPABASE_ANON_KEY=fake npx expo export -p web
// Serve: node scripts/e2e/serve-dist.mjs "$PWD/apps/mobile/dist" 8089
// Run:   node scripts/e2e/offline-packs-web.cjs <screenshot-dir>
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
      {
        question_id: 'q6',
        version: 1,
        type: 'mcq',
        difficulty: 1,
        concept_id: 'k3',
        body: {
          stem: bi('Mitosis makes how many cells from one?', null),
          options: [
            { key: 'A', text: bi('Two', null) },
            { key: 'B', text: bi('Four', null) },
          ],
        },
        answer: { correct: 'A' },
        explanation: null,
      },
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
  };
}
let db = freshDb();
const rpcs = [];
const packCalls = [];

const net = { down: false };
const PRACTICE = ['mcq', 'true_false', 'numeric', 'short_text'];
/** db/036 learn_pack over the mock tables. */
function learnPack(chapterId, have) {
  const ch = db.chapters.find((c) => c.id === chapterId);
  if (!ch) return null;
  const sub = db.subjects.find((x) => x.id === ch.subject_id);
  const topics = db.topics.filter((t) => t.chapter_id === chapterId && t.status === 'active');
  const tids = new Set(topics.map((t) => t.id));
  const concepts = db.concepts.filter((k) => tids.has(k.topic_id) && k.status === 'active');
  const kids = new Set(concepts.map((k) => k.id));
  const lessons = db.learning_content
    .filter((l) => tids.has(l.topic_id) && l.status === 'approved')
    .map((l) => {
      const ap = db.item_approvals.find(
        (a) =>
          a.item_kind === 'content' && a.item_id === l.id && a.scope === 'learn' && !a.revoked_at,
      );
      if (!ap) return null;
      const v = db.learning_content_versions.find(
        (x) => x.content_id === l.id && x.version === ap.version,
      );
      return {
        id: l.id,
        topic_id: l.topic_id,
        kind: l.kind,
        concept_id: l.concept_id,
        version: ap.version,
        updated_at: l.updated_at,
        blocks: have['l:' + l.id] === ap.version ? null : v.blocks,
      };
    })
    .filter(Boolean);
  const newest = new Map();
  for (const q of db.question_versions)
    if (kids.has(q.concept_id) && PRACTICE.includes(q.type))
      if (!newest.has(q.question_id) || newest.get(q.question_id).version < q.version)
        newest.set(q.question_id, q);
  const questions = [...newest.values()].map((q) => {
    const ref = {
      id: q.question_id,
      version: q.version,
      type: q.type,
      difficulty: q.difficulty,
      concept_id: q.concept_id,
    };
    return have['q:' + q.question_id] === q.version
      ? ref
      : { ...ref, body: q.body, answer: q.answer, explanation: q.explanation };
  });
  return {
    chapter: {
      id: ch.id,
      title: ch.title,
      title_ur: ch.title_ur,
      sort_order: ch.sort_order,
      subject_id: sub.id,
      subject_name: sub.name,
      class_name: 'Class 9-A',
    },
    built_at: new Date().toISOString(),
    topics: topics.map(({ id, title_en, title_ur, sort_order }) => ({
      id,
      title_en,
      title_ur,
      sort_order,
    })),
    concepts: concepts.map(({ id, topic_id, title_en, title_ur, sort_order }) => ({
      id,
      topic_id,
      title_en,
      title_ur,
      sort_order,
    })),
    lessons,
    questions,
  };
}
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
  if (table === 'learning_content' && select.startsWith('topic:'))
    return { topic: topicFull(row.topic_id) };
  return row;
}
function cond(row, key, c) {
  const val = row[key];
  const [op, ...rest] = c.split('.');
  const arg = rest.join('.');
  if (op === 'eq') return String(val) === arg;
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
    if (p === '/rest/v1/rpc/learn_pack') {
      const a = req.postDataJSON();
      packCalls.push(a);
      if (net.down) return route.abort('internetdisconnected');
      const pk = learnPack(a.p_chapter, a.p_have || {});
      return json(200, pk);
    }
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

/** The synthetic sample topic (packages/core/samples) shaped as a learn_pack answer. */
function measureSample() {
  const zlib = require('zlib');
  const path = require('path');
  const sample = require(
    path.join(__dirname, '../../packages/core/samples/class9-physics-motion.json'),
  );
  const pk = {
    chapter: {
      id: 'c',
      title: sample.chapter,
      title_ur: null,
      subject_id: 's',
      subject_name: sample.subject,
      class_name: sample.class,
    },
    built_at: new Date().toISOString(),
    topics: [{ id: 't', ...sample.topic, sort_order: 1 }],
    concepts: sample.concepts.map((k, i) => ({
      id: 'k' + i,
      topic_id: 't',
      title_en: k.title_en,
      title_ur: k.title_ur,
      sort_order: i,
    })),
    lessons: [
      {
        id: 'l',
        topic_id: 't',
        kind: 'lesson',
        concept_id: null,
        version: 1,
        updated_at: null,
        blocks: sample.lesson.blocks,
      },
    ],
    questions: sample.questions.map((q, i) => ({
      id: 'q' + i,
      version: 1,
      type: q.type,
      difficulty: q.difficulty,
      concept_id: 'k0',
      body: q.body,
      answer: q.answer,
      explanation: q.explanation ?? null,
    })),
  };
  const raw = Buffer.byteLength(JSON.stringify(pk));
  const gz = zlib.gzipSync(JSON.stringify(pk)).length;
  console.log(
    `MEASURE sample topic pack (1 topic, ${pk.lessons[0].blocks.length} blocks, ${pk.questions.length} items): ${raw} B raw, ${gz} B gzip`,
  );
}

(async () => {
  measureSample();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  await mock(page);
  // Every response that reaches the page from Supabase, for egress.
  let egress = 0;
  page.on('response', async (r) => {
    if (r.url().startsWith(SB + '/rest/v1/rpc/learn_pack'))
      egress += (await r.body().catch(() => Buffer.alloc(0))).length;
  });

  // 1. Save the chapter from the lesson list.
  await studentLogin(page);
  await page.goto(BASE + '/study');
  check(await seen(page, 'The cell', true), 'lesson list shows the chapter');
  await page.getByRole('button', { name: 'Save for offline' }).first().click();
  check(await seen(page, 'The cell saved for offline'), 'saved toast');
  check(await seen(page, /^Saved · \d/), 'chapter shows Saved with its size');
  check(
    packCalls.length === 1 && Object.keys(packCalls[0].p_have || {}).length === 0,
    'first download asks for everything',
  );
  const first = egress;
  console.log(`MEASURE mock chapter first download: ${first} B (2 topics, 1 lesson, 5 items)`);
  await page.screenshot({ path: SHOTS + '/packs-list-1280.png', fullPage: true });

  // 2. Downloads screen; Update sends only the delta.
  await page.goto(BASE + '/downloads');
  check(await seen(page, 'Downloads', true), 'downloads screen');
  check(
    await seen(page, 'Lessons 1 · Practice questions 5'),
    'counts: 1 lesson, 5 practice items (long answer and old version left out)',
  );
  check(await seen(page, /^1 chapter · .* on this device$/), 'total on this device');
  check(await seen(page, 'Videos always need internet'), 'video note');
  await page.getByRole('button', { name: 'Update' }).click();
  check(await seen(page, 'The cell is up to date'), 'update toast');
  const have = packCalls[1]?.p_have || {};
  check(
    have['l:L1'] === 1 && have['q:q1'] === 2 && Object.keys(have).length === 6,
    'update tells the server what it holds ' + JSON.stringify(have),
  );
  const delta = egress - first;
  check(
    delta > 0 && delta < first / 2,
    `update downloads less than half (${delta} B vs ${first} B)`,
  );
  console.log(`MEASURE delta refresh with nothing changed: ${delta} B`);
  await page.screenshot({ path: SHOTS + '/packs-downloads-1280.png', fullPage: true });

  // 3. App shell: make sure the service worker controls the page.
  const sw = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return 'none';
    await navigator.serviceWorker.ready;
    return 'ready';
  });
  check(sw === 'ready', 'service worker registered');
  // The page hands the worker what it loaded; wait until the bundles are kept.
  for (let i = 0; i < 50; i++) {
    const n = await page.evaluate(
      async () =>
        (await (await caches.open('shell-v1')).keys()).filter((r) =>
          r.url.includes('/_expo/static/'),
        ).length,
    );
    if (n >= 4) break;
    await sleep(200);
  }
  await page.reload();
  await seen(page, 'Downloads', true);
  check(
    await page.evaluate(() => !!navigator.serviceWorker.controller),
    'service worker controls the page',
  );

  // 4. Offline: no network at all, reload, lesson + practice from the pack.
  net.down = true;
  await ctx.setOffline(true);
  await page.goto(BASE + '/lesson/t1');
  check(
    await seen(page, 'Every living thing is made of cells.'),
    'offline: never-opened lesson reads from the pack',
  );
  await page.screenshot({ path: SHOTS + '/packs-offline-lesson-1280.png', fullPage: true });
  await page.goto(BASE + '/lesson/t2/practice');
  check(
    await seen(page, 'Practice set', true),
    'offline: never-opened topic practises from the pack',
  );
  await page.getByText('Practice set', { exact: true }).click();
  check(await seen(page, 'Mitosis makes how many cells'), 'offline: the pack item is asked');
  await page.getByRole('radio', { name: /^A\. Two/ }).click();
  await page.getByText('Check', { exact: true }).click();
  check(await seen(page, 'Correct!'), 'offline: marked on the device');
  await page.getByText('See how I did').click();
  check(await seen(page, 'Saved on this device'), 'offline: the set waits on the device');
  check(!posts.length, 'nothing sent while offline');

  // 5. Back online: the set uploads once.
  await ctx.setOffline(false);
  net.down = false;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  for (let i = 0; i < 60 && !db.practice_attempts.length; i++) await sleep(100);
  check(
    db.practice_attempts.length === 1 && db.practice_attempts[0].topic_id === 't2',
    'online: the offline set arrives once',
  );

  // 6. Delete empties storage; phone width.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE + '/downloads');
  await seen(page, 'The cell', true);
  check(await noHScroll(page), 'phone: no sideways scroll');
  await page.screenshot({ path: SHOTS + '/packs-downloads-390.png', fullPage: true });
  await page.getByRole('button', { name: 'Delete' }).first().click();
  check(await seen(page, 'Delete this download?'), 'delete asks first');
  await page.getByRole('button', { name: 'Delete' }).last().click();
  check(await seen(page, 'Nothing saved yet'), 'empty state after delete');
  const left = await page.evaluate(
    () =>
      new Promise((res) => {
        const r = indexedDB.open('learn-packs');
        r.onsuccess = () => {
          const q = r.result.transaction('kv').objectStore('kv').count();
          q.onsuccess = () => res(q.result);
        };
        r.onerror = () => res(-1);
      }),
  );
  check(left === 0, `storage emptied (${left} keys left)`);

  check(!log.some((l) => l.startsWith('FOREIGN')), 'no foreign hosts');
  check(
    !log.some((l) => l.startsWith('PAGEERROR')),
    'no page errors: ' + log.filter((l) => l.startsWith('PAGEERROR')).join(' | '),
  );
  check(!log.some((l) => l.startsWith('WRITE')), 'no other writes');
  console.log(fails ? `${fails} FAILED` : 'ALL PASS');
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
