// TEST_PLAN F-6 / WS-1: worksheets (prompt 70) on web against a MOCKED
// Supabase. A teacher picks class + subject, topics, question types and a
// count; only items with a live `worksheet` approval are used, at the approved
// version; sets A and B have the same questions in another order with options
// re-lettered, the key matches each set, Urdu prints right to left, maths
// prints as an image. The printed HTML is captured and rendered to an A4 PDF.
// Build: cd apps/mobile && EXPO_PUBLIC_SUPABASE_URL=https://fakedevproject.supabase.co EXPO_PUBLIC_SUPABASE_ANON_KEY=fake npx expo export -p web
// Serve: node scripts/e2e/serve-dist.mjs "$PWD/apps/mobile/dist" 8089
// Run:   node scripts/e2e/worksheets-web.cjs <screenshot-dir>
const { chromium } = require('playwright');
const BASE = 'http://localhost:8089';
const SB = 'https://fakedevproject.supabase.co';
const SHOTS = process.argv[2];

const TEACHER = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'teacher@school.test',
  name: 'Ms Ayesha',
};
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const T1 = uuid(901);
const T2 = uuid(902);
const C1 = uuid(911);
const C2 = uuid(912);
const MATH_KEY = 'mk1';

const mcq = (n, concept) => ({
  question_id: uuid(n),
  version: 1,
  type: 'mcq',
  concept_id: concept,
  body: {
    stem: { en: `What is ${n} + ${n}?`, ur: `${n} جمع ${n} کتنے ہیں؟` },
    options: ['A', 'B', 'C', 'D'].map((k, j) => ({ key: k, text: String(n * 2 + j) })),
  },
  answer: { correct: 'A' },
});
const versions = [
  ...[1, 2, 3, 4].map((n) => mcq(n, C1)),
  ...[5, 6].map((n) => mcq(n, C2)),
  {
    question_id: uuid(7),
    version: 1,
    type: 'true_false',
    concept_id: C1,
    body: {
      stem: { en: 'A square has four equal sides.', ur: 'مربع کے چاروں ضلعے برابر ہوتے ہیں۔' },
    },
    answer: { correct: true },
  },
  {
    question_id: uuid(8),
    version: 1,
    type: 'short_text',
    concept_id: C2,
    body: { stem: { en: 'The capital of Punjab is ____.', ur: 'پنجاب کا دارالحکومت ____ ہے۔' } },
    answer: { correct: 'Lahore', also: ['lahore'] },
  },
  {
    question_id: uuid(9),
    version: 1,
    type: 'numeric',
    concept_id: C2,
    body: { stem: 'Solve $x+1=3$. What is x?' },
    answer: { correct: 2 },
  },
  // Not on the sheet: tap_image, never approved, revoked, newer unapproved version.
  { question_id: uuid(10), version: 1, type: 'tap_image', concept_id: C1, body: {}, answer: {} },
  { ...mcq(11, C1), question_id: uuid(11) },
  { ...mcq(12, C1), question_id: uuid(12) },
  { ...mcq(13, C2), question_id: uuid(13), version: 1 },
  {
    ...mcq(13, C2),
    question_id: uuid(13),
    version: 2,
    body: { ...mcq(13, C2).body, stem: { en: 'UNAPPROVED v2', ur: null } },
  },
];
const approvals = [
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => ({
    item_kind: 'question',
    item_id: uuid(n),
    version: 1,
    scope: 'worksheet',
    revoked_at: null,
  })),
  { item_kind: 'question', item_id: uuid(11), version: 1, scope: 'exam', revoked_at: null },
  {
    item_kind: 'question',
    item_id: uuid(12),
    version: 1,
    scope: 'worksheet',
    revoked_at: '2026-11-01T00:00:00Z',
  },
  { item_kind: 'question', item_id: uuid(13), version: 1, scope: 'worksheet', revoked_at: null },
];

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
  chapters: [{ id: 'ch1', subject_id: 's-math', title: 'Sets', sort_order: 1 }],
  topics: [
    {
      id: T1,
      chapter_id: 'ch1',
      title_en: 'Shapes',
      title_ur: 'شکلیں',
      sort_order: 1,
      status: 'active',
    },
    {
      id: T2,
      chapter_id: 'ch1',
      title_en: 'Places',
      title_ur: null,
      sort_order: 2,
      status: 'active',
    },
  ],
  concepts: [
    { id: C1, topic_id: T1 },
    { id: C2, topic_id: T2 },
  ],
  question_versions: versions,
  item_approvals: approvals,
  math_svgs: [
    {
      key: MATH_KEY,
      svg: '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="12"><text y="10">x+1=3</text></svg>',
    },
  ],
  messages: [],
  message_reads: [],
};

const log = [];
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function sessionFor() {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return {
    access_token: `${b64({ alg: 'HS256' })}.${b64({ sub: TEACHER.id, exp, role: 'authenticated' })}.sig`,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: exp,
    refresh_token: 'r-t',
    user: {
      id: TEACHER.id,
      aud: 'authenticated',
      email: TEACHER.email,
      app_metadata: {},
      user_metadata: {},
      created_at: new Date().toISOString(),
    },
  };
}
function cond(row, key, c) {
  const val = row[key];
  const [op, ...rest] = c.split('.');
  const arg = rest.join('.');
  if (op === 'eq') return String(val) === arg;
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
const SKIP = new Set(['select', 'order', 'limit', 'offset']);

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
    if (p === '/auth/v1/token') return json(200, sessionFor());
    if (p === '/rest/v1/profiles')
      return out([{ role: 'teacher', full_name: TEACHER.name, student_id: null }]);
    if (p.startsWith('/rest/v1/rpc/')) {
      log.push('UNMOCKED RPC ' + p);
      return json(200, []);
    }
    const table = p.replace('/rest/v1/', '');
    if (!db[table]) {
      log.push('UNMOCKED ' + req.method() + ' ' + table);
      return json(200, []);
    }
    if (req.method() !== 'GET') {
      log.push('WRITE ' + req.method() + ' ' + table);
      return json(405, {});
    }
    const filters = [...url.searchParams].filter(([k]) => !SKIP.has(k));
    let rows = db[table].filter((r) => filters.every(([k, v]) => cond(r, k, v)));
    if (table === 'math_svgs') {
      // Keys are hashes of the TeX: answer each asked key with our one SVG.
      const asked = (url.searchParams.get('key') ?? '').replace(/^in\.\(|\)$/g, '').split(',');
      rows = asked
        .filter(Boolean)
        .map((k) => ({ key: k.replace(/"/g, ''), svg: db.math_svgs[0].svg }));
    }
    return out(rows);
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

// Capture what printHtml writes into its hidden iframe.
async function capturePrint(page, click) {
  await page.evaluate(() => {
    window.__printed = null;
    const mo = new MutationObserver((ms) => {
      for (const m of ms)
        for (const n of m.addedNodes)
          if (n.tagName === 'IFRAME')
            setTimeout(() => {
              window.__printed = n.contentDocument?.documentElement?.outerHTML ?? null;
            }, 20);
    });
    mo.observe(document.body, { childList: true });
    window.__mo = mo;
  });
  await click();
  for (let i = 0; i < 40; i++) {
    const h = await page.evaluate(() => window.__printed);
    if (h) {
      await page.evaluate(() => window.__mo.disconnect());
      return h;
    }
    await page.waitForTimeout(100);
  }
  return null;
}

// [{n, stem, options:[{letter,text}]}] from one printed set page.
const questionsOf = (page) =>
  [
    ...page.matchAll(
      /<li class="q" value="(\d+)"><div class="stem">([\s\S]*?)<\/div>(<ol class="opts">[\s\S]*?<\/ol>)?/g,
    ),
  ].map((m) => ({
    n: Number(m[1]),
    stem: m[2],
    options: [...(m[3] ?? '').matchAll(/<span class="box">([A-D])<\/span> ([^<]*)<\/li>/g)].map(
      (o) => ({ letter: o[1], text: o[2].trim() }),
    ),
  }));
const setPage = (html, i) =>
  (html.split('<section class="page">')[i + 1] ?? '').split('</section>')[0];

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const t = await ctx.newPage();
  await mock(t);
  await t.goto(BASE + '/staff');
  await t.getByLabel('Email').fill(TEACHER.email);
  await t.getByLabel('Password').fill('secret');
  await t.getByLabel('Password').press('Enter');
  await t.waitForTimeout(1500);
  check(await seen(t, 'Worksheets', true), 'Worksheets in the staff menu');
  await t.getByText('Worksheets', { exact: true }).first().click();
  await t.waitForURL('**/worksheets');
  check(
    (await seen(t, '2 · What’s on it').catch(() => false)) || (await seen(t, "2 · What's on it")),
    'step 2 shown',
  );
  check(
    await seen(t, '10 questions from 10 ready'),
    'only live worksheet approvals count (10: approved version of q13 too)',
  );
  await shot(t, 'worksheets-1280');

  // Fewer questions: 10 → 8.
  for (let i = 0; i < 2; i++) await t.getByRole('button', { name: 'Fewer: Questions' }).click();
  check(await seen(t, '8 questions from 10 ready'), 'count 8');
  // Short: ask 12.
  for (let i = 0; i < 4; i++) await t.getByRole('button', { name: 'More: Questions' }).click();
  check(await seen(t, '2 questions short: there are only 10.'), 'shortfall said plainly');
  for (let i = 0; i < 4; i++) await t.getByRole('button', { name: 'Fewer: Questions' }).click();
  check(!(await t.getByText('UNAPPROVED v2').count()), 'newer unapproved version never shown');
  const code =
    (await t
      .getByText(/^WS-[0-9A-Z]{6}$/)
      .first()
      .textContent()) ?? '';
  check(/^WS-/.test(code), 'sheet code shown ' + code);

  // Every ready item on the sheet (10), so the print checks see all kinds.
  for (let i = 0; i < 2; i++) await t.getByRole('button', { name: 'More: Questions' }).click();
  check(await seen(t, '10 questions from 10 ready'), 'count back to 10');
  // Print all: A + B + keys.
  const all = await capturePrint(t, () =>
    t.getByRole('button', { name: 'Print A + B + key' }).click(),
  );
  check(!!all, 'print document produced');
  const html = all ?? '';
  if (SHOTS) require('fs').writeFileSync(SHOTS + '/worksheet-en.html', html);
  check(html.includes('size: A4'), 'A4 page');
  check((html.match(/<section class="page">/g) ?? []).length === 2, 'two set pages');
  check((html.match(/<section class="page key">/g) ?? []).length === 2, 'two key pages');
  check(
    html.includes('Set A') && html.includes('Set B') && html.includes(code),
    'set labels + code',
  );
  check(!html.includes('UNAPPROVED'), 'approved version printed');
  check(html.includes('data:image/svg+xml'), 'maths printed as an image');
  check(html.includes('Also accept: lahore'), 'key lists other accepted answers');
  const A = questionsOf(setPage(html, 0));
  const B = questionsOf(setPage(html, 1));
  check(A.length === 10 && B.length === 10, `10 questions on each set (${A.length}, ${B.length})`);
  check(
    JSON.stringify(A.map((q) => q.stem)) !== JSON.stringify(B.map((q) => q.stem)),
    'A and B in a different order',
  );
  check(
    JSON.stringify([...A.map((q) => q.stem)].sort()) ===
      JSON.stringify([...B.map((q) => q.stem)].sort()),
    'A and B have the same questions',
  );
  // Keys: for every MCQ, the keyed letter is the option 2n (the right answer).
  const keys = (setIdx) => {
    const k = html.split('<section class="page key">')[setIdx + 1] ?? '';
    return Object.fromEntries(
      [...k.matchAll(/<li value="(\d+)">([\s\S]*?)<\/li>/g)].map((m) => [Number(m[1]), m[2]]),
    );
  };
  let keyed = 0;
  let good = 0;
  for (const [s, set] of [
    [0, A],
    [1, B],
  ]) {
    const k = keys(s);
    for (const q of set) {
      const m = /What is (\d+) \+/.exec(q.stem);
      if (!m) continue;
      keyed++;
      const right = String(Number(m[1]) * 2);
      const letter = /<b dir="auto">([A-D])<\/b>/.exec(k[q.n] ?? '')?.[1];
      if (q.options.find((o) => o.letter === letter)?.text === right) good++;
    }
  }
  check(keyed > 0 && good === keyed, `keys match each set (${good}/${keyed})`);

  // Render the captured document as an A4 PDF + screenshot.
  const pg = await browser.newPage();
  await pg.setContent(html, { waitUntil: 'load' });
  if (SHOTS) {
    await pg.pdf({ path: SHOTS + '/worksheet-en.pdf', format: 'A4', printBackground: true });
    await pg.screenshot({ path: SHOTS + '/worksheet-en.png', fullPage: true });
  }
  const pages = await pg.evaluate(() => document.querySelectorAll('section').length);
  check(pages === 4, 'PDF: 4 sections');
  await pg.close();

  // Urdu paper.
  await t.getByRole('radio', { name: 'اردو' }).click();
  const ur =
    (await capturePrint(t, () => t.getByRole('button', { name: 'Print set A' }).click())) ?? '';
  check(ur.includes('dir="rtl"') && ur.includes('lang="ur"'), 'Urdu paper is right to left');
  check(ur.includes('جمع') && ur.includes('صحیح جواب چنیں'), 'Urdu questions and headings');
  check(
    /@font-face \{ font-family: 'WorksheetUrdu'; src: url\('http:\/\/localhost:8089\//.test(ur),
    'bundled Nastaliq font (same origin, no CDN)',
  );
  check(
    (ur.match(/<section class="page">/g) ?? []).length === 1 && !ur.includes('class="page key"'),
    'set A only',
  );
  const pu = await browser.newPage();
  await pu.setContent(ur, { waitUntil: 'networkidle' });
  if (SHOTS) {
    await pu.pdf({ path: SHOTS + '/worksheet-ur.pdf', format: 'A4', printBackground: true });
    await pu.screenshot({ path: SHOTS + '/worksheet-ur.png', fullPage: true });
  }
  await pu.close();
  const key =
    (await capturePrint(t, () => t.getByRole('button', { name: 'Print answer key' }).click())) ??
    '';
  check(
    !key.includes('<section class="page">') && (key.match(/class="page key"/g) ?? []).length === 2,
    'answer key alone: key pages only',
  );

  // Topic filter: only Shapes, only MCQ.
  await t.getByRole('radio', { name: 'English' }).click();
  await t.getByRole('checkbox', { name: 'Places' }).click();
  await t.getByRole('checkbox', { name: 'True or false' }).click();
  check(await seen(t, '4 questions from 4 ready'), 'one topic, MCQ + others: 4 ready');

  // Phone width.
  await t.setViewportSize({ width: 390, height: 844 });
  check(
    await t.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    'phone: no sideways scroll',
  );
  await shot(t, 'worksheets-390');

  check(
    !log.some((l) => l.startsWith('PAGEERROR')),
    'no page errors ' + log.filter((l) => l.startsWith('PAGEERROR')).join(' | '),
  );
  check(!log.some((l) => l.startsWith('FOREIGN')), 'no foreign hosts');
  check(!log.some((l) => l.startsWith('WRITE')), 'nothing written (print only)');
  const unmocked = [...new Set(log.filter((l) => l.startsWith('UNMOCKED')))];
  if (unmocked.length) console.log('note:', unmocked.join(', '));
  console.log(fails ? `${fails} FAILED` : 'ALL PASS');
  await browser.close();
  process.exit(fails ? 1 : 0);
})();

async function shot(page, name) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}
