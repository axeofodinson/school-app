// TEST_PLAN IM-2: the content importer on web against a MOCKED Supabase
// (in-memory PostgREST + the db/031 RPCs; no request leaves localhost). RLS
// itself is checked in SQL by db/test/031_smoke.sql (IM-1); this checks the
// dry-run report, the payloads, re-importing the same file, retiring a batch,
// the empty states and that real MathJax pre-renders the maths.
// Build: cd apps/mobile && EXPO_PUBLIC_SUPABASE_URL=https://fakedevproject.supabase.co EXPO_PUBLIC_SUPABASE_ANON_KEY=fake npx expo export -p web
// Serve: node scripts/e2e/serve-dist.mjs "$PWD/apps/mobile/dist" 8089
// Run:   node scripts/e2e/importer-web.cjs <screenshot-dir>
const { readFileSync } = require('node:fs');
const { chromium } = require('playwright');

const BASE = 'http://localhost:8089';
const SB = 'https://fakedevproject.supabase.co';
const SHOTS = process.argv[2];
const FIXTURES = `${__dirname}/../../packages/core/test/fixtures/importer`;

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
      { id: 's-math8', class_id: 'c8', name: 'Mathematics', sort_order: 1 },
    ],
    chapters: [
      { id: 'ch1', subject_id: 's-math', title: 'Linear Equations', sort_order: 1, status: 'active' },
      { id: 'ch8', subject_id: 's-math8', title: 'Fractions', sort_order: 1, status: 'active' },
    ],
    teacher_assignments: [
      { teacher_id: T.id, class_id: 'c9a', subject_id: 's-math', year_id: 'y1' },
    ],
    topics: [],
    concepts: [],
    concept_prerequisites: [],
    learning_content: [],
    learning_content_versions: [],
    questions: [],
    import_batches: [],
    math_svgs: [],
  };
}

let db = freshDb();
let requests = [];
let seq = 0;
const log = [];

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
  throw new Error('op ' + op);
}
const SKIP = new Set(['select', 'order', 'limit', 'on_conflict', 'offset']);
function withEmbeds(table, row) {
  if (table === 'teacher_assignments')
    return { ...row, class: db.classes.find((c) => c.id === row.class_id) };
  return row;
}
const filtered = (table, url) => {
  let rows = db[table].map((r) => withEmbeds(table, r));
  for (const [k, v] of url.searchParams) if (!SKIP.has(k)) rows = rows.filter((r) => matches(r, k, v));
  return rows;
};

// ---- the db/031 RPCs, in JS ------------------------------------------------------
const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[^0-9a-z؀-ۿ]+/g, ' ')
    .trim();
const bankText = (body) => {
  const stem = typeof body.stem === 'string' ? body.stem : (body.stem?.en || body.stem?.ur || '');
  const opts = (body.options ?? [])
    .map((o) => (typeof o.text === 'string' ? o.text : o.text?.en || o.text?.ur || ''))
    .join(' ');
  return norm(`${stem} ${opts}`);
};
const trigrams = (s) => {
  const out = new Set();
  for (const w of s.split(/[\s|]+/)) {
    if (!w) continue;
    const padded = `  ${w} `;
    for (let i = 0; i + 3 <= padded.length; i++) out.add(padded.slice(i, i + 3));
  }
  return out;
};
const sim = (a, b) => {
  let shared = 0;
  for (const g of a) if (b.has(g)) shared++;
  return a.size + b.size - shared === 0 ? 1 : shared / (a.size + b.size - shared);
};

function findMatches(subject, texts) {
  const live = db.questions.filter((q) => {
    const ch = db.chapters.find((c) => c.id === q.chapter_id);
    return ch?.subject_id === subject && q.status !== 'retired';
  });
  const out = [];
  texts.forEach((txt, idx) => {
    if (!txt) return;
    const g = trigrams(txt);
    for (const q of live) {
      const s = sim(g, trigrams(bankText(q.body)));
      if (s >= 0.5) out.push({ idx, question_id: q.id, body: q.body, status: q.status, similarity: s });
    }
  });
  return out;
}

function importContent(who, chunk) {
  const b = chunk.batch;
  const batch = db.import_batches.find((x) => x.id === b.id);
  if (batch && batch.status === 'retired') throw { code: '22023', message: 'import_batch_retired' };
  if (batch && batch.imported_by !== who.id)
    throw { code: '42501', message: 'import_batch_not_yours' };
  // RLS: a teacher writes only into a subject they teach this year.
  const subject = db.chapters.find((c) => c.id === b.chapter_id)?.subject_id;
  const cls = db.subjects.find((s) => s.id === subject)?.class_id;
  const mayWrite =
    who.role === 'admin' ||
    db.teacher_assignments.some(
      (a) =>
        a.teacher_id === who.id &&
        a.class_id === cls &&
        (a.subject_id === null || a.subject_id === subject),
    );
  if (!mayWrite) throw { code: '42501', message: 'new row violates row-level security policy' };
  if (chunk.topic && !db.topics.some((t) => t.id === chunk.topic.id))
    db.topics.push({ ...chunk.topic, chapter_id: b.chapter_id, status: 'active' });
  if (!db.topics.some((t) => t.id === b.topic_id && t.chapter_id === b.chapter_id))
    throw { code: '22023', message: 'import_topic_mismatch' };
  if (!batch)
    db.import_batches.push({
      ...b,
      imported_by: who.id,
      status: 'importing',
      question_count: 0,
      created_at: new Date().toISOString(),
      retired_at: null,
      retire_note: null,
      report: null,
    });
  for (const c of chunk.concepts)
    if (!db.concepts.some((x) => x.id === c.id))
      db.concepts.push({ ...c, topic_id: b.topic_id, status: 'active' });
  for (const p of chunk.prereqs)
    if (!db.concept_prerequisites.some((x) => x.concept_id === p.concept_id && x.requires_concept_id === p.requires_concept_id))
      db.concept_prerequisites.push(p);
  for (const m of chunk.math)
    if (!db.math_svgs.some((x) => x.key === m.key)) db.math_svgs.push(m);
  for (const q of chunk.questions)
    if (!db.concepts.some((c) => c.id === q.concept_id && c.topic_id === b.topic_id))
      throw { code: '22023', message: 'import_concept_mismatch' };
  for (const l of chunk.lessons)
    if (!db.learning_content.some((x) => x.id === l.id)) {
      db.learning_content.push({
        id: l.id,
        topic_id: b.topic_id,
        kind: l.kind,
        concept_id: l.concept_id,
        status: 'draft',
        import_batch_id: b.id,
      });
      db.learning_content_versions.push({ content_id: l.id, version: 1, blocks: l.blocks });
    }
  let inserted = 0;
  for (const q of chunk.questions) {
    if (db.questions.some((x) => x.id === q.id)) continue;
    db.questions.push({
      ...q,
      chapter_id: b.chapter_id,
      status: 'draft',
      current_version: 1,
      origin: b.origin,
      import_batch_id: b.id,
      created_by: who.id,
    });
    inserted++;
  }
  const row = db.import_batches.find((x) => x.id === b.id);
  if (chunk.final && row.status === 'importing') {
    row.status = 'done';
    row.report = chunk.report;
    row.question_count = db.questions.filter((q) => q.import_batch_id === b.id).length;
  }
  return { batch: b.id, inserted, status: row.status };
}

function retire(who, batchId, note) {
  const row = db.import_batches.find((x) => x.id === batchId);
  if (!row) throw { code: '22023', message: 'import_batch_not_found' };
  if (who.role !== 'admin' && row.imported_by !== who.id)
    throw { code: '42501', message: 'import_forbidden' };
  if (!note || note.trim().length < 3) throw { code: '22023', message: 'reason_required' };
  if (row.status === 'retired') return { batch: batchId, questions: 0, lessons: 0, already: true };
  let questions = 0;
  let lessons = 0;
  for (const q of db.questions)
    if (q.import_batch_id === batchId && q.status !== 'retired') {
      q.status = 'retired';
      questions++;
    }
  for (const l of db.learning_content)
    if (l.import_batch_id === batchId && l.status !== 'retired') {
      l.status = 'retired';
      lessons++;
    }
  Object.assign(row, {
    status: 'retired',
    retired_at: new Date().toISOString(),
    retired_by: who.id,
    retire_note: note.trim(),
  });
  return { batch: batchId, questions, lessons, already: false };
}

let failNextImport = false;

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
      return u ? json(200, sessionFor(u)) : json(400, { code: 'invalid_credentials' });
    }
    if (p === '/auth/v1/logout') return route.fulfill({ status: 204 });
    const m = req.method();
    const body = req.postData() ? req.postDataJSON() : null;

    if (p.startsWith('/rest/v1/rpc/')) {
      const fn = p.replace('/rest/v1/rpc/', '');
      requests.push({ m, table: `rpc:${fn}`, body, who: who.role });
      try {
        if (fn === 'import_find_matches') return json(200, findMatches(body.p_subject, body.p_texts));
        if (fn === 'import_content') {
          if (failNextImport) {
            failNextImport = false;
            return json(400, { code: '22023', message: 'import_topic_mismatch' });
          }
          return json(200, importContent(who, body.p_chunk));
        }
        if (fn === 'retire_import_batch') return json(200, retire(who, body.p_batch, body.p_note));
      } catch (e) {
        return json(e.code === '42501' ? 403 : 400, { code: e.code, message: e.message });
      }
      log.push('UNMOCKED RPC ' + fn);
      return json(404, {});
    }

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
      log.push('UNMOCKED ' + m + ' ' + p);
      return json(200, []);
    }
    if (m === 'GET') {
      // import_batches: staff see all, a teacher only their own (db/017 policy).
      let rows = filtered(table, url);
      if (table === 'import_batches' && who.role !== 'admin')
        rows = rows.filter((r) => r.imported_by === who.id);
      return out(rows);
    }
    requests.push({ m, table, body, who: who.role });
    log.push('UNEXPECTED WRITE ' + m + ' ' + table);
    return json(403, { code: '42501', message: 'new row violates row-level security policy' });
  });
}

const seen = (page, text, exact = false) =>
  page
    .getByText(text, { exact })
    .first()
    .waitFor({ timeout: 15000 })
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
  await page.waitForURL(/\/(classes|school)$/, { timeout: 15000 }).catch(() => {});
  return { ctx, page };
}

/** Drop a fixture file on the zone, as a browser does. */
async function dropFile(page, name, text) {
  await page.evaluate(
    async ([fileName, content]) => {
      const file = new File([content], fileName, { type: 'application/json' });
      const dt = new DataTransfer();
      dt.items.add(file);
      const zone = document.querySelector('[aria-label="Drop the topic file here"]');
      zone.dispatchEvent(new DragEvent('dragover', { bubbles: true, dataTransfer: dt }));
      zone.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt }));
    },
    [name, text],
  );
}

const fixture = (name) => readFileSync(`${FIXTURES}/${name}`, 'utf8');

async function openImporter(page) {
  await page.getByText('Import content', { exact: true }).first().click();
  await page.waitForURL('**/importer');
  await page.getByText('Class 9-A', { exact: true }).first().click();
  await page.getByText('Mathematics', { exact: true }).first().click();
  await page.getByText('Linear Equations', { exact: true }).first().click();
}

(async () => {
  const browser = await chromium.launch();

  // 1. Teacher: dry run of the good file, import, re-import, retire.
  {
    const { ctx, page } = await login(browser, T);
    await openImporter(page);
    check(await seen(page, 'Drop the topic file here'), 'drop zone after picking a chapter');

    // A file that isn't JSON.
    await dropFile(page, 'notes.json', 'not json at all');
    check(await seen(page, "That file isn't JSON"), 'non-JSON refused with a plain message');

    // The good file.
    await dropFile(page, 'good-topic.json', fixture('good-topic.json'));
    check(await seen(page, 'Can be imported'), 'good file passes');
    check(await seen(page, 'Concepts: 3 · Lesson blocks: 6 · Maths: 13'), 'counts incl. maths');
    check((await page.getByText('Ready', { exact: true }).count()) >= 6, '6 questions ready');
    check(
      await seen(page, '6 questions and 2 lesson blocks will be saved as drafts.'),
      'what will be imported',
    );
    await page.screenshot({ path: SHOTS + '/importer-report.png', fullPage: true });

    requests = [];
    await page.getByText('Import as drafts', { exact: true }).click();
    check(await seen(page, 'Imported', true), 'import done');
    const chunks = requests.filter((r) => r.table === 'rpc:import_content');
    check(chunks.length === 1, 'one chunk for a small file');
    const chunk = chunks[0]?.body?.p_chunk;
    check(
      chunk &&
        chunk.batch.chapter_id === 'ch1' &&
        chunk.batch.origin === 'ai' &&
        chunk.batch.is_test_data === true &&
        chunk.questions.length === 6 &&
        chunk.final === true,
      'chunk payload: chapter, AI origin, 6 questions, final',
    );
    check(
      chunk.questions.every(
        (q) => q.concept_id && q.cognitive_level && q.difficulty >= 1 && q.difficulty <= 3,
      ),
      'every question carries a concept, a thinking level and a difficulty',
    );
    check(
      chunk.math.length > 0 && chunk.math.every((m) => m.svg.startsWith('<svg') && !/<script/i.test(m.svg)),
      'maths pre-rendered to SVG in the browser',
    );
    check(
      db.questions.length === 6 &&
        db.questions.every((q) => q.status === 'draft' && q.current_version === 1),
      'N drafts at version 1, nothing approved',
    );
    check(db.topics.length === 1 && db.concepts.length === 3, 'topic + concepts created once');
    check(db.concept_prerequisites.length === 3, 'prerequisites linked');
    check(
      db.learning_content.length === 2 && db.learning_content.every((l) => l.status === 'draft'),
      'lesson and alternative as drafts',
    );
    check(
      await seen(page, 'Nothing is approved yet'),
      'the screen says the review queue comes next',
    );

    // The same file again: every question is a duplicate, nothing is written twice.
    await page.getByText('Import another file', { exact: true }).click();
    requests = [];
    await dropFile(page, 'good-topic.json', fixture('good-topic.json'));
    check(await seen(page, 'Already there'), 're-import flags duplicates');
    check(
      await seen(page, 'This topic is already there'),
      'the second file adds to the topic instead of twinning it',
    );
    check(
      await seen(page, '0 questions and 0 lesson blocks will be saved as drafts.'),
      'nothing left to import: the topic and its lesson are already there',
    );
    const lookup = last('rpc:import_find_matches', 'POST');
    check(lookup && lookup.body.p_texts.length === 6, 'duplicate lookup asked about 6 questions');
    await page.getByText('Import as drafts', { exact: true }).click();
    check(await seen(page, 'Nothing left to import from this file.'), 'import refused politely');
    check(db.questions.length === 6, 'still 6 questions in the bank');

    // The bad-question file: the good ones still import.
    await dropFile(page, 'bad-questions.json', fixture('bad-questions.json'));
    check(await seen(page, 'Left out'), 'bad questions are left out');
    check(await seen(page, 'No thinking level'), 'a missing thinking level is explained');
    await page.getByText('Left out', { exact: false }).first().click();
    check(await seen(page, 'What the checker found'), 'detail pane explains one question');
    await page.screenshot({ path: SHOTS + '/importer-errors.png', fullPage: true });

    // Retiring a batch.
    await page.getByRole('radio', { name: 'Past imports' }).click();
    check(await seen(page, 'good-topic.json'), 'the batch is listed');
    check(await seen(page, '6 questions · From the AI prompt'), 'batch meta');
    await page.getByText('Retire this batch', { exact: true }).first().click();
    const dialog = page.getByRole('dialog').last();
    check(
      await dialog.getByText('Retire the batch', { exact: true }).isDisabled(),
      'no reason, no retire',
    );
    await dialog.getByLabel('Why are you retiring it?').fill('Wrong chapter');
    await dialog.getByText('Retire the batch', { exact: true }).click();
    check(await seen(page, 'Retired 6 questions and 2 lessons'), 'batch retired');
    check(
      db.questions.every((q) => q.status === 'retired') &&
        db.learning_content.every((l) => l.status === 'retired'),
      'questions and lessons retired, nothing deleted',
    );
    check(db.questions.length === 6, 'no row was deleted');
    await ctx.close();
  }

  // 2. A teacher cannot import into a class they do not teach; a failed import
  //    leaves the report on screen.
  {
    db = freshDb();
    const { ctx, page } = await login(browser, T);
    await page.getByText('Import content', { exact: true }).first().click();
    await page.waitForURL('**/importer');
    check(!(await page.getByText('Class 8', { exact: true }).count()), 'untaught class not offered');
    await page.getByText('Class 9-A', { exact: true }).first().click();
    await page.getByText('Mathematics', { exact: true }).first().click();
    await page.getByText('Linear Equations', { exact: true }).first().click();
    await dropFile(page, 'good-topic.json', fixture('good-topic.json'));
    check(await seen(page, 'Can be imported'), 'report shown');
    failNextImport = true;
    await page.getByText('Import as drafts', { exact: true }).click();
    check(
      await seen(page, "The file doesn't match the chapter you picked"),
      'a refused import is explained',
    );
    check(await seen(page, 'Import as drafts'), 'the report stays so it can be retried');
    check(db.questions.length === 0, 'nothing was written');
    await ctx.close();
  }

  // 3. Admin: any class, and the lesson checks on a visual file.
  {
    db = freshDb();
    const { ctx, page } = await login(browser, A);
    await page.getByText('Import content', { exact: true }).first().click();
    await page.waitForURL('**/importer');
    check(await seen(page, 'Class 8'), 'admin sees every class');
    await page.getByText('Class 8', { exact: true }).first().click();
    await page.getByText('Mathematics', { exact: true }).first().click();
    await page.getByText('Fractions', { exact: true }).first().click();
    await dropFile(page, 'bad-lesson.json', fixture('bad-lesson.json'));
    check(await seen(page, 'A picture needs a description in both languages.'), 'alt text required');
    check(await seen(page, "isn't one of the app's interactive widgets"), 'widget catalogue checked');
    check(await seen(page, "The picture holds something that isn't allowed"), 'unsafe SVG refused');
    check(await seen(page, 'Left out', true), 'the lesson is left out');
    await page.getByText('Import as drafts', { exact: true }).click();
    check(await seen(page, 'Imported', true), 'the file still imports its good question');
    check(db.questions.length === 1 && db.learning_content.length === 0, 'question in, lesson out');

    // Urdu: right to left.
    await page.evaluate(() => localStorage.setItem('app.locale', 'ur'));
    await page.reload();
    await page.waitForTimeout(2000);
    check((await page.evaluate(() => document.documentElement.dir)) === 'rtl', 'Urdu is RTL');
    await page.screenshot({ path: SHOTS + '/importer-urdu.png', fullPage: true });
    await ctx.close();
  }

  // 4. Phone width: the screen says to use a computer, and nothing overflows.
  {
    db = freshDb();
    const { ctx, page } = await login(browser, T, { width: 390, height: 844 });
    await page.goto(BASE + '/importer');
    check(await seen(page, 'Import content'), 'importer opens at phone width');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    check(!overflow, 'no horizontal scroll at 390 px');
    await page.screenshot({ path: SHOTS + '/importer-phone.png', fullPage: true });
    await ctx.close();
  }

  await browser.close();
  const bad = log.filter((l) => !l.startsWith('UNMOCKED GET'));
  check(
    bad.length === 0,
    'no page errors, foreign hosts or unexpected writes' + (bad.length ? ': ' + bad.join('; ') : ''),
  );
  if (log.length) console.log(log.join('\n'));
})();
