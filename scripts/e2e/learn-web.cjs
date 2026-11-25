// TEST_PLAN LS-2: the lesson reader (prompt 30) on web against a MOCKED
// Supabase (in-memory PostgREST; nothing but localhost and the fake project is
// allowed: YouTube is blocked and must not be asked for before Play). RLS and
// review_lesson() themselves are checked in SQL by db/test/033_smoke.sql (LS-1).
// Build: cd apps/mobile && EXPO_PUBLIC_DEV_GALLERY=1 EXPO_PUBLIC_SUPABASE_URL=https://fakedevproject.supabase.co EXPO_PUBLIC_SUPABASE_ANON_KEY=fake npx expo export -p web
// Serve: node scripts/e2e/serve-dist.mjs "$PWD/apps/mobile/dist" 8089
// Run:   node scripts/e2e/learn-web.cjs <screenshot-dir>
const { chromium } = require('playwright');
const path = require('path');
// Prompt 33: the sample Class 9 Physics topic (scene, chart, widget), as stored.
const SAMPLE = require(
  path.join(__dirname, '../../packages/core/samples/class9-physics-motion.json'),
);
const motionBlocks = SAMPLE.lesson.blocks.map((b) => ({
  ...b,
  concept_id: b.concept_id ? 'k9' : null,
  ...(b.type === 'scene' ? { predict_question_id: 'qp' } : {}),
}));
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

const CELL_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><ellipse cx="200" cy="150" rx="180" ry="120" fill="#6EDDB3" stroke="#1B1A3A" stroke-width="2"/><circle cx="210" cy="140" r="40" fill="#C3B0FF" stroke="#1B1A3A" stroke-width="2"/></svg>';
const MATH_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="6ex" height="2ex" style="vertical-align: -0.5ex" viewBox="0 -800 2600 900"><path d="M0 0h2600v100H0z" fill="currentColor"/></svg>';

const blocks = [
  {
    type: 'objectives',
    en: '- Name the parts of a cell\n- Say what the nucleus does',
    ur: '- خلیے کے حصوں کے نام بتاؤ',
  },
  {
    type: 'intro',
    en: 'Every living thing is made of **cells**.',
    ur: 'ہر جاندار **خلیوں** سے بنا ہے۔',
  },
  {
    type: 'figure',
    concept_id: 'k1',
    alt: { en: 'An animal cell with its nucleus', ur: 'ایک خلیہ اور اس کا مرکزہ' },
    svg: CELL_SVG,
    hotspots: [
      { x: 0.52, y: 0.46, label: { en: 'Nucleus', ur: 'مرکزہ' } },
      { x: 0.1, y: 0.5, label: { en: 'Cell membrane', ur: 'جھلی' } },
    ],
  },
  {
    type: 'detailed',
    en: 'The nucleus holds the instructions for the cell.',
    ur: 'مرکزہ خلیے کی ہدایات رکھتا ہے۔',
  },
  {
    type: 'compare',
    alt: { en: 'Plant and animal cells', ur: 'پودے اور جانور کے خلیے' },
    left: { title: { en: 'All cells are round', ur: 'سب خلیے گول ہیں' }, tone: 'wrong_idea' },
    right: {
      title: { en: 'Cells come in many shapes', ur: 'خلیے کئی شکلوں کے ہوتے ہیں' },
      tone: 'result',
    },
  },
  { type: 'simple', en: 'A cell is about $10 \\mu m$ across.', concept_id: 'k1' },
  {
    type: 'worked_example',
    en: 'Ten cells in a row are about $100 \\mu m$ long.',
    ur: 'دس خلیے قطار میں تقریباً ۱۰۰ مائیکرو میٹر۔',
  },
  {
    type: 'misconception',
    en: 'Cells are not all visible to the eye.',
    ur: 'سب خلیے آنکھ سے نظر نہیں آتے۔',
  },
  { type: 'quick_check', en: 'Which part controls the cell?', concept_id: 'k1' },
  {
    type: 'scene',
    alt: { en: 'A cell dividing', ur: 'خلیہ تقسیم ہوتا ہوا' },
    steps: [{ caption: { en: 'The nucleus splits', ur: 'مرکزہ ٹوٹتا ہے' } }],
  },
  {
    type: 'video',
    alt: { en: 'A tour of a cell', ur: 'خلیے کی سیر' },
    youtube_id: 'dQw4w9WgXcQ',
    transcript: { en: 'Welcome inside a cell.', ur: 'خلیے کے اندر خوش آمدید۔' },
    offline_fallback_block: 9,
  },
  {
    type: 'summary',
    en: 'Cells have parts; the nucleus is in charge.',
    ur: 'خلیے کے حصے ہوتے ہیں؛ مرکزہ سردار ہے۔',
  },
];

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
        id: 't3',
        chapter_id: 'ch1',
        title_en: 'TEST Motion: speed and graphs',
        title_ur: 'TEST حرکت: رفتار اور گراف',
        sort_order: 3,
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
    teacher_assignments: [
      {
        teacher_id: TEACHER.id,
        class_id: 'c9',
        subject_id: 's-sci',
        year_id: 'y1',
        class: { id: 'c9', name: 'Class 9-A', grade_level: 9 },
      },
    ],
    learning_content: [
      {
        id: 'L1',
        topic_id: 't1',
        kind: 'lesson',
        concept_id: null,
        current_version: 2,
        status: 'approved',
        origin: 'ai',
        updated_at: null,
        created_at: '1',
      },
      {
        id: 'L2',
        topic_id: 't1',
        kind: 'alternative',
        concept_id: 'k1',
        current_version: 1,
        status: 'approved',
        origin: 'human',
        updated_at: null,
        created_at: '2',
      },
      {
        id: 'L4',
        topic_id: 't3',
        kind: 'lesson',
        concept_id: null,
        current_version: 1,
        status: 'approved',
        origin: 'human',
        updated_at: null,
        created_at: '4',
      },
      {
        id: 'L3',
        topic_id: 't2',
        kind: 'lesson',
        concept_id: null,
        current_version: 1,
        status: 'draft',
        origin: 'ai',
        updated_at: null,
        created_at: '3',
      },
    ],
    learning_content_versions: [
      { content_id: 'L1', version: 1, blocks: [{ type: 'simple', en: 'OLD VERSION' }] },
      { content_id: 'L1', version: 2, blocks },
      {
        content_id: 'L2',
        version: 1,
        blocks: [
          {
            type: 'simple',
            en: 'Think of the nucleus as the head teacher.',
            ur: 'مرکزہ کو ہیڈ ٹیچر سمجھو۔',
          },
        ],
      },
      { content_id: 'L3', version: 1, blocks: [{ type: 'simple', en: 'Cells split in two.' }] },
      { content_id: 'L4', version: 1, blocks: motionBlocks },
    ],
    item_approvals: [
      { item_kind: 'content', item_id: 'L1', version: 2, scope: 'learn', revoked_at: null },
      { item_kind: 'content', item_id: 'L2', version: 1, scope: 'learn', revoked_at: null },
      { item_kind: 'content', item_id: 'L4', version: 1, scope: 'learn', revoked_at: null },
    ],
    question_versions: [
      {
        question_id: 'qp',
        version: 1,
        type: 'mcq',
        concept_id: null,
        body: {
          stem: {
            en: 'The car goes 10 m every second. Where is it after 3 seconds?',
            ur: 'گاڑی ہر سیکنڈ 10 m چلتی ہے۔ 3 سیکنڈ بعد کہاں ہوگی؟',
          },
          options: [
            { key: 'A', text: { en: '30 m', ur: '30 m' } },
            { key: 'B', text: { en: '13 m', ur: '13 m' } },
          ],
        },
        answer: { correct: 'A' },
        explanation: { en: '10 m + 10 m + 10 m = 30 m.', ur: '10 m + 10 m + 10 m = 30 m۔' },
      },
      {
        question_id: 'q1',
        version: 1,
        type: 'mcq',
        concept_id: 'k1',
        body: {
          stem: { en: 'Which part controls the cell?', ur: 'خلیے کو کون سا حصہ چلاتا ہے؟' },
          options: [
            { key: 'A', text: { en: 'Nucleus', ur: 'مرکزہ' } },
            { key: 'B', text: { en: 'Membrane', ur: 'جھلی' } },
          ],
        },
        answer: { correct: 'A' },
        explanation: {
          en: 'The nucleus is in charge.',
          why_wrong: { B: { en: 'The membrane is the wall around it.' } },
        },
      },
    ],
    math_svgs: [
      { key: '10 \\mu m', svg: MATH_SVG },
      { key: '100 \\mu m', svg: MATH_SVG },
    ],
  };
}
let db = freshDb();
const log = [];
const rpcs = [];
let student = true;

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
// RLS stand-in: students read approved lessons, the approved version only, practice items approved.
function visible(table, row) {
  if (!student) return true;
  if (table === 'learning_content') return row.status === 'approved';
  if (table === 'learning_content_versions')
    return db.item_approvals.some(
      (a) => a.item_id === row.content_id && a.version === row.version && !a.revoked_at,
    );
  return true;
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
    if (p === '/rest/v1/rpc/review_lesson') {
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

async function studentLogin(page) {
  await page.goto(BASE + '/login');
  await page.getByLabel('Admission number').fill(STUDENT.code);
  await page.getByLabel('PIN', { exact: true }).fill(STUDENT.pin);
  await page.getByText('Go', { exact: true }).click();
  await seen(page, 'Hi, Ali Raza!');
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  await mock(page);

  // 1. Prepare lists approved lessons of my class; drafts hidden.
  await studentLogin(page);
  await page.goto(BASE + '/study');
  check(await seen(page, 'Parts of a cell', true), 'approved lesson listed on Prepare');
  check(!(await page.getByText('Cell division', { exact: true }).count()), 'draft lesson hidden');
  await page.getByText('Parts of a cell', { exact: true }).click();
  await page.waitForURL('**/lesson/t1');

  // 2. Topic page: objectives, parts, another way; approved version only.
  check(await seen(page, 'Name the parts of a cell'), 'objectives shown');
  check(await seen(page, '5 parts'), 'five parts (sections) built from the blocks');
  check(await seen(page, 'Explain it another way'), 'alternative explanation offered');
  check(!(await page.getByText('OLD VERSION').count()), 'old unapproved version never read');
  check(
    log.every((l) => !l.startsWith('FOREIGN')),
    'nothing loaded from YouTube before Play',
  );
  await page.screenshot({ path: SHOTS + '/topic-1280.png', fullPage: true });

  // 3. Reader: figure + hotspots, two panes.
  await page.getByText('Start the lesson').click();
  await page.waitForURL('**/read**');
  check(await seen(page, 'Every living thing is made of'), 'caption = intro text');
  check(await seen(page, 'Tap the numbers'), 'hotspot hint');
  await page.getByRole('button', { name: '1: Nucleus' }).click();
  check(await seen(page, 'Nucleus', true), 'hotspot label pops');
  await page.getByText('Explain more').click();
  check(await seen(page, 'holds the instructions'), 'explain more opens');
  await page.screenshot({ path: SHOTS + '/reader-figure-1280.png' });

  // 4. Keyboard: → next part (compare, with its caption, maths, watch-out and check).
  await blur(page);
  await page.keyboard.press('ArrowRight');
  check(await seen(page, 'Wrong idea', true), '→ steps to the compare part');
  check(await seen(page, 'Cells come in many shapes'), 'right panel');
  check((await page.getByLabel('10 \\mu m').count()) > 0, 'maths drawn from the stored SVG');
  check(await seen(page, 'Watch out', true), 'misconception callout');
  await page.getByRole('radio', { name: /B\. Membrane/ }).click();
  await page.getByText('Check', { exact: true }).click();
  check(await seen(page, 'Not quite'), 'wrong answer: not quite');
  check(await seen(page, 'The membrane is the wall around it.'), 'why-wrong for the picked option');
  await page.getByText('Try again').click();
  await page.getByRole('radio', { name: /A\. Nucleus/ }).click();
  await page.getByText('Check', { exact: true }).click();
  check(await seen(page, "That's right!"), 'right answer');
  await page.screenshot({ path: SHOTS + '/reader-check-1280.png' });
  await blur(page);
  await page.keyboard.press('ArrowLeft');
  check(await seen(page, 'Every living thing'), '← steps back');
  await page.keyboard.press('End');
  check(await seen(page, 'Cells have parts'), 'End jumps to the summary');
  await page.keyboard.press('Home');
  await page.getByRole('button', { name: /Go to part 3/ }).click();

  // 6. Placeholder scene, then video only after Play.
  check(await seen(page, 'Shown as text'), 'a scene without its drawing shows as text');
  check(await seen(page, 'The nucleus splits'), 'scene step captions still shown as text');
  await blur(page);
  await page.keyboard.press('ArrowRight');
  check((await page.locator('iframe').count()) === 0, 'no player before Play');
  await page.keyboard.press(' ');
  await page
    .locator('iframe')
    .waitFor({ timeout: 5000 })
    .catch(() => undefined);
  const src = await page
    .locator('iframe')
    .first()
    .getAttribute('src')
    .catch(() => null);
  check(
    Boolean(src && src.startsWith('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')),
    'Space plays the nocookie embed',
  );
  await page.getByText('Read the transcript').click();
  check(await seen(page, 'Welcome inside a cell.'), 'transcript');

  // 7. Text version + fullscreen.
  await page.getByRole('button', { name: 'Text version' }).click();
  check(
    await seen(page, 'Picture: An animal cell with its nucleus'),
    'text version shows alt text',
  );
  check(await seen(page, '1. Nucleus'), 'text version lists hotspot labels');
  await page.getByRole('button', { name: 'Text version' }).click();
  await blur(page);
  await page.keyboard.press('f');
  check(
    await page
      .getByRole('button', { name: 'Leave full screen' })
      .first()
      .waitFor({ timeout: 5000 })
      .then(() => true)
      .catch(() => false),
    'F opens full screen',
  );
  await page.screenshot({ path: SHOTS + '/reader-full-1280.png' });
<<<<<<< HEAD
  // The reader hands focus back from the YouTube frame 60 ms after opening; no
  // person presses Esc faster than that.
  await page.waitForTimeout(200);
=======
  // Let the frame load and take focus first, as it would for a learner, then
  // wait for the state rather than a fixed delay.
  await page.waitForTimeout(1500);
>>>>>>> origin/main
  await page.keyboard.press('Escape');
  let left = false;
  for (let i = 0; i < 25 && !left; i++) {
    left = (await page.getByRole('button', { name: 'Leave full screen' }).count()) === 0;
    if (!left) await page.waitForTimeout(200);
  }
  check(left, 'Esc leaves full screen (even on a playing video)');
  await page.keyboard.press('End');
  await page.getByText('Finish', { exact: true }).filter({ visible: true }).first().click();
  check(await seen(page, 'Lesson done!'), 'finish card');
  await page.screenshot({ path: SHOTS + '/reader-done-1280.png' });

  // 8. Progress remembered on this device (back in the app, and after a reload
  // of the deep link); another way opens.
  await page
    .getByText('Back to the topic', { exact: true })
    .filter({ visible: true })
    .first()
    .click();
  check(await seen(page, 'Read it again'), 'topic page knows the lesson was read');
  // A client-side route change can abort a hard navigation; try once more.
  await page.goto(BASE + '/lesson/t1').catch(() => page.goto(BASE + '/lesson/t1'));
  check(await seen(page, 'Read it again'), 'deep link to the topic page after a reload');
  await page.getByText('The nucleus', { exact: true }).click();
  check(await seen(page, 'head teacher'), 'alternative explanation opens');

  // 9. Urdu: RTL, Urdu captions, English fallback marked.
  await page.evaluate(() => localStorage.setItem('app.locale', 'ur'));
  await page.goto(BASE + '/lesson/t1/read?s=0');
  check(await seen(page, 'ہر جاندار'), 'Urdu caption');
  check((await page.locator('[dir="rtl"]').count()) > 0, 'Urdu reader is RTL');
  await blur(page);
  await page.keyboard.press('ArrowLeft');
  check(await seen(page, 'غلط خیال'), '← moves forward in Urdu');
  await page.goto(BASE + '/lesson/t1/read?s=1');
  check(await seen(page, 'ابھی صرف انگریزی میں'), 'English-only caption is marked in Urdu');
  await page.screenshot({ path: SHOTS + '/reader-ur-1280.png' });
  await page.evaluate(() => localStorage.setItem('app.locale', 'en'));

  // 10. Phone width: one column, no sideways scroll.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE + '/lesson/t1/read?s=0');
  check(await seen(page, 'Every living thing'), 'phone reader');
  check(await noHScroll(page), 'phone: no horizontal scroll');
  await page.screenshot({ path: SHOTS + '/reader-figure-390.png', fullPage: true });

  // 11. Offline after opening: the API is unreachable, the device copy reads.
  await page.route(SB + '/rest/**', (route) => route.abort('internetdisconnected'));
  await page
    .getByRole('button', { name: /Go to part 4/ })
    .click()
    .catch(() => undefined);
  await page.goto(BASE + '/lesson/t1');
  check(await seen(page, 'Saved copy'), 'offline: topic opens from the device copy');
  await page.unroute(SB + '/rest/**');

  // 11b. Visual blocks (prompt 33): the sample Physics topic's scene, chart and widget.
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto(BASE + '/lesson/t3/read?s=0');
  check(await seen(page, 'Watch the car'), 'visual lesson opens on the scene part');
  check(await seen(page, 'Step 1 of 4'), 'scene step caption beside the stage');
  check(await seen(page, 'The car waits at the start post'), 'step 1 caption');
  check(await seen(page, 'Guess first'), 'predict veil before play');
  check(await seen(page, 'Where is it after 3 seconds?'), 'predict question under the stage');
  await page.screenshot({ path: SHOTS + '/scene-predict-1280.png' });
  await page.getByRole('radio', { name: /30 m/ }).click();
  await page.getByRole('button', { name: 'Check', exact: true }).first().click();
  await page.waitForTimeout(600);
  check(
    (await page.getByText(/Guess first/).count()) === 0,
    'answering the prediction lifts the veil',
  );
  await page.getByRole('button', { name: 'Next step' }).click();
  check(await seen(page, 'After 1 second, the car has gone 10 m.'), 'next step: caption 2');
  await blur(page);
  await page.keyboard.press('ArrowRight');
  check(await seen(page, 'Step 3 of 4'), '→ walks the scene steps first');
  await page.getByRole('button', { name: 'Play' }).first().click();
  check(await seen(page, 'Step 4 of 4'), 'Play runs to the last step');
  check(
    await page
      .getByRole('button', { name: 'Watch again' })
      .waitFor({ timeout: 8000 })
      .then(() => true)
      .catch(() => false),
    'last step offers Replay',
  );
  await page.waitForTimeout(1200);
  await page.screenshot({ path: SHOTS + '/scene-end-1280.png' });
  await blur(page);
  await page.keyboard.press('ArrowRight');
  check(await seen(page, 'Car A (steady)'), '→ on the last scene step moves to the chart part');
  check(await seen(page, 'Show Car B (speeding up)'), 'series reveal button');
  await page.getByRole('button', { name: /Show Car B/ }).click();
  check(await seen(page, 'Car B (speeding up)', true), 'second series revealed');
  await page.getByRole('button', { name: 'Car A (steady) · 3 s: 30 m' }).click();
  check(await seen(page, 'Car A (steady) · 3 s: 30 m', true), 'tap a point for its value');
  await page.screenshot({ path: SHOTS + '/chart-1280.png' });
  await page.goto(BASE + '/lesson/t3/read?s=2');
  check(await seen(page, 'Make the line straight'), 'widget task under "Your turn"');
  const u = page.getByRole('slider', { name: 'u' });
  await u.focus();
  await page.keyboard.press('ArrowRight');
  check(await seen(page, 'u = 3 m/s'), 'slider: → moves one step and says the value');
  await page.getByRole('button', { name: 'Play' }).first().click();
  await page.waitForTimeout(1600);
  check(
    (await page.getByText(/^t = 0 s /).count()) === 0 &&
      (await page.getByText(/^t = [\d.]+ s /).count()) > 0,
    'Play runs the clock',
  );
  await page.screenshot({ path: SHOTS + '/widget-1280.png' });
  await page.getByRole('button', { name: /Text version/ }).click();
  check(await seen(page, 'Car A (steady): (Time) 0 s: 0 m'), 'text version lists chart values');
  check(
    (await seen(page, 'Every second, the same')) ||
      (await seen(page, 'Same distance every second')),
    'text version lists scene captions',
  );
  await page.getByRole('button', { name: /Text version/ }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE + '/lesson/t3/read?s=0');
  check(await seen(page, 'Step 1 of 4'), 'phone: scene renders');
  check(await noHScroll(page), 'phone: no sideways scroll on the scene');
  await page.screenshot({ path: SHOTS + '/scene-390.png', fullPage: true });
  await page.setViewportSize({ width: 1280, height: 860 });
  for (const q of ['lang=en&tier=full', 'lang=ur&tier=lite&theme=dark', 'lang=en&tier=off&p=kid']) {
    await page.goto(BASE + '/dev/gallery?' + q);
    const head = page.getByRole('heading', { name: /Lesson visuals|سبق کے تصویری حصے/ });
    const ok = await head
      .waitFor({ timeout: 8000 })
      .then(() => true)
      .catch(() => false);
    check(ok, `gallery shows the visual blocks (${q})`);
    if (!ok) continue;
    await head.scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${SHOTS}/gallery-visuals-${q.replace(/[=&]/g, '-')}.png` });
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${SHOTS}/gallery-visuals-2-${q.replace(/[=&]/g, '-')}.png` });
  }

  // 12. Teacher: preview a draft, approve it.
  student = false;
  db = freshDb();
  const t = await (await browser.newContext({ viewport: { width: 1280, height: 860 } })).newPage();
  await mock(t);
  await t.goto(BASE + '/staff');
  await t.getByLabel('Email').fill(TEACHER.email);
  await t.getByLabel('Password').fill('secret');
  await t.getByLabel('Password').press('Enter');
  await t.waitForTimeout(1500);
  await t.goto(BASE + '/lessons');
  check(await seen(t, 'Cell division', true), 'draft listed under To review');
  check(
    !(await t.getByText('Parts of a cell', { exact: true }).count()),
    'approved hidden from To review',
  );
  await t.getByText('Cell division', { exact: true }).click();
  await t.waitForURL('**/lessons/L3');
  check(await seen(t, 'Cells split in two.'), 'teacher previews the draft');
  check(await seen(t, 'Preview', true), 'preview badge');
  await t.getByText('Send back', { exact: true }).first().click();
  const sendBtn = t.getByRole('button', { name: 'Send back' }).last();
  check(
    (await sendBtn.isDisabled().catch(() => false)) ||
      (await sendBtn.getAttribute('aria-disabled')) === 'true',
    'send back needs a reason',
  );
<<<<<<< HEAD
  // Let the sheet finish opening before Esc (a key pressed mid-open can be lost).
  await t.waitForTimeout(300);
  await t.keyboard.press('Escape');
=======
  // Close the sheet with its own button and wait until it is gone (a key press
  // can land before the sheet is ready on a busy machine).
  await t.getByRole('button', { name: 'Close' }).last().click();
  await t
    .getByRole('button', { name: 'Close' })
    .waitFor({ state: 'detached', timeout: 10000 })
    .catch(() => undefined);
>>>>>>> origin/main
  await t.getByRole('button', { name: 'Approve' }).click();
  check(await seen(t, 'Approved. Students can read it now.'), 'approve toast');
  check(
    rpcs.length === 1 &&
      rpcs[0].p_content === 'L3' &&
      rpcs[0].p_version === 1 &&
      rpcs[0].p_decision === 'approve',
    'review_lesson(L3, v1, approve)',
  );
  await t.screenshot({ path: SHOTS + '/teacher-preview-1280.png' });

  check(
    !log.some((l) => l.startsWith('PAGEERROR')),
    'no page errors ' + log.filter((l) => l.startsWith('PAGEERROR')).join(' | '),
  );
  check(!log.some((l) => l.startsWith('WRITE')), 'no direct table writes');
  check(
    !log.some((l) => l.startsWith('FOREIGN') && !l.includes('youtube')),
    'no foreign hosts but the played video',
  );
  const unmocked = [...new Set(log.filter((l) => l.startsWith('UNMOCKED')))];
  if (unmocked.length) console.log('note:', unmocked.join(', '));
  console.log(fails ? `${fails} FAILED` : 'ALL PASS');
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
