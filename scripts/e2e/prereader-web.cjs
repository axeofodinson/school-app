// TEST_PLAN PR-2: the pre-reader (prompt 16) on web against a MOCKED Supabase
// (in-memory PostgREST + Storage; nothing leaves localhost). Paged tap-the-picture
// paper, read-aloud order (clip → device speech), clips cached for offline, mouse
// + keyboard, Urdu RTL, phone width, one submission. RLS is PR-1 (db/test/030_smoke.sql).
// Build/serve as AT-2 (EXPO_PUBLIC_SUPABASE_URL=https://fakedevproject.supabase.co).
// Run:   NODE_PATH=$(npm root -g) node scripts/e2e/prereader-web.cjs <screenshot-dir>
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
const ducks = (n) => ({
  id: 'd' + n,
  emoji: '🦆',
  count: n,
  label: { en: n + ' ducks', ur: n + ' بطخیں' },
});
const db = {
  academic_years: [{ id: 'y1', label: '2026-27', is_current: true }],
  classes: [{ id: 'cpg', name: 'Playgroup', grade_level: 0 }],
  subjects: [{ id: 's-num', name: 'Early Numeracy' }],
  enrollments: [{ id: 'e1', student_id: 's-a', class_id: 'cpg', year_id: 'y1', status: 'active' }],
  questions: [
    q(
      'p1',
      'tap_image',
      {
        prompt: { en: 'Where are THREE ducks?', ur: 'تین بطخیں کہاں ہیں؟' },
        audio: { en: 'p1/aaaa.en.mp3', ur: 'p1/bbbb.ur.mp3' },
        choices: [ducks(1), ducks(3)],
      },
      { correct: 'd3' },
    ),
    q(
      'p2',
      'tap_image',
      {
        prompt: { en: 'Tap the box with MORE apples', ur: 'زیادہ سیب والے ڈبے پر ہاتھ لگاؤ' },
        choices: [
          { id: 'a', emoji: '🍎', count: 2, label: { en: '2 apples', ur: '2 سیب' } },
          { id: 'b', emoji: '🍎', count: 5, label: { en: '5 apples', ur: '5 سیب' } },
        ],
      },
      { correct: 'b' },
    ),
    q(
      'p3',
      'tap_image',
      {
        prompt: { en: 'Which one is the sun?', ur: 'سورج کون سا ہے؟' },
        audio: { en: 'p3/cccc.en.mp3' },
        choices: [
          { id: 's', emoji: '☀️', label: { en: 'Sun', ur: 'سورج' } },
          { id: 'm', emoji: '🌙', label: { en: 'Moon', ur: 'چاند' } },
        ],
      },
      { correct: 's' },
    ),
  ],
  assessments: [
    {
      id: 'a-pg',
      title: 'Counting fun',
      type: 'quiz',
      status: 'published',
      class_id: 'cpg',
      year_id: 'y1',
      subject_id: 's-num',
      total_marks: 3,
      created_at: '2026-11-20',
    },
  ],
  assessment_questions: ['p1', 'p2', 'p3'].map((id, i) => ({
    assessment_id: 'a-pg',
    question_id: id,
    marks: 1,
    sort_order: i,
  })),
  submissions: [],
  messages: [],
  message_reads: [],
};
// 0.3 s of silence as a WAV: a real, decodable clip for Chromium.
function wav() {
  const n = 6615,
    b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + n * 2, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(22050, 24);
  b.writeUInt32LE(44100, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(n * 2, 40);
  return b;
}
const CLIP = wav();
const clipGets = []; // storage paths fetched (question-audio)
const net = { down: false, loseNextFor: 'a-lost' };
const posts = []; // every POST to submissions that reached the "server"
const paperCalls = []; // student_paper() calls (db/018: the paper without answers)
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
    if (p === '/rest/v1/rpc/student_paper') {
      // Like db/018: id, type, body, marks, order, level of a paper; never the answer.
      const { p_assessment_id: aid } = req.postDataJSON();
      paperCalls.push(aid);
      const rows = db.assessment_questions
        .filter((i) => i.assessment_id === aid)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((i) => {
          const q = db.questions.find((x) => x.id === i.question_id);
          return q
            ? {
                question_id: q.id,
                type: q.type,
                body: q.body,
                marks: i.marks,
                sort_order: i.sort_order,
                cognitive_level: 'recall',
              }
            : null;
        })
        .filter(Boolean);
      return json(200, rows);
    }
    if (p.startsWith('/storage/v1/object/') && p.includes('/question-audio/')) {
      const key = decodeURIComponent(p.split('/question-audio/')[1]);
      clipGets.push(key);
      const known = db.questions.some((x) => Object.values(x.body.audio ?? {}).includes(key));
      return known
        ? route.fulfill({ status: 200, contentType: 'audio/wav', body: CLIP })
        : json(400, { statusCode: '404', error: 'not_found', message: 'Object not found' });
    }
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

// Record what the page plays: clips (HTMLMediaElement.play) and device speech.
const INSTRUMENT = () => {
  window.__plays = 0;
  window.__spoken = [];
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    window.__plays++;
    return play.call(this).catch(() => undefined);
  };
  if (window.speechSynthesis) {
    window.speechSynthesis.speak = (u) => window.__spoken.push(u.lang + ':' + u.text);
  }
};
const plays = (page) => page.evaluate(() => window.__plays);
const spoken = (page) => page.evaluate(() => window.__spoken.slice());

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 } });
  await ctx.addInitScript(INSTRUMENT);
  const page = await ctx.newPage();
  await mock(page);

  await page.goto(BASE + '/login');
  await page.getByLabel('Admission number').fill(STUDENT.code);
  await page.getByLabel('PIN', { exact: true }).fill(STUDENT.pin);
  await page.getByText('Go', { exact: true }).click();
  check(await seen(page, 'Hi, Ali Raza!'), 'student lands on home');
  await page.getByText('My tests', { exact: true }).first().click();
  await page.waitForURL('**/tests');
  await page.getByText('Counting fun', { exact: true }).click();
  await page.waitForURL('**/tests/a-pg');

  // 1. Paged, one question per screen, big targets.
  check(await seen(page, 'Question 1 of 3'), 'paged: question 1 of 3');
  check(await seen(page, 'Where are THREE ducks?'), 'first prompt shown');
  check((await page.getByRole('radio').count()) === 2, 'only this question’s tiles');
  const box = await radio(page, '3 ducks').boundingBox();
  check(
    box && box.height >= 160 && box.width >= 140,
    `tile is a big target (${box && Math.round(box.width)}×${box && Math.round(box.height)})`,
  );
  check(
    await until(() => clipGets.length >= 3),
    'clips cached while online: ' + clipGets.join(', '),
  );
  check(new Set(clipGets).size === clipGets.length, 'each clip fetched once');
  check(
    (await plays(page)) === 0 && (await spoken(page)).length === 0,
    'web: nothing plays before a tap',
  );

  // 2. Speaker plays the pre-made clip (not device speech).
  await page.getByRole('button', { name: 'Hear the question' }).click();
  check(await until(async () => (await plays(page)) === 1, 4000), 'speaker plays the clip');
  check((await spoken(page)).length === 0, 'no device speech when a clip exists');

  // 3. Mouse tap: gentle feedback (filled tile + tick + "Picked"), draft saved.
  await radio(page, '3 ducks').click();
  check(
    (await radio(page, '3 ducks').getAttribute('aria-checked')) === 'true',
    'tap selects the tile',
  );
  check(await seen(page, 'Picked', true), '"Picked" shown with the tick');
  await page.screenshot({ path: SHOTS + '/prereader-q1.png', fullPage: true });

  // 4. Next: the new question reads itself; no clip → device speech (English).
  await page.getByRole('button', { name: 'Next question' }).click();
  check(await seen(page, 'Question 2 of 3'), 'next page');
  check(
    await until(
      async () => (await spoken(page)).includes('en-US:Tap the box with MORE apples'),
      4000,
    ),
    'no clip: device speech reads the prompt by itself: ' + (await spoken(page)).join(' | '),
  );
  // Keyboard: Tab to a tile, Enter picks it.
  await radio(page, '5 apples').focus();
  await page.keyboard.press('Enter'); // Space on RN-web radios is a follow-up (MODULE_STATUS)
  check(
    (await radio(page, '5 apples').getAttribute('aria-checked')) === 'true',
    'keyboard (Tab + Enter) picks a tile',
  );

  // 5. Offline: back to question 1, the cached clip still plays.
  net.down = true;
  const before = clipGets.length;
  await page.getByRole('button', { name: 'Back', exact: true }).last().click();
  check(await seen(page, 'Question 1 of 3'), 'back works');
  const p0 = await plays(page);
  await page.getByRole('button', { name: 'Hear the question' }).click();
  check(
    await until(async () => (await plays(page)) > p0, 4000),
    'offline: clip plays from the device cache',
  );
  check(clipGets.length === before, 'offline replay made no network fetch');
  check(
    (await radio(page, '3 ducks').getAttribute('aria-checked')) === 'true',
    'answer kept across pages',
  );

  // 6. Finish with one blank: warned once, then finish; online again → one row.
  net.down = false;
  await page.getByRole('button', { name: 'Next question' }).click();
  await page.getByRole('button', { name: 'Next question' }).click();
  check(await seen(page, 'Question 3 of 3'), 'last page');
  await page.getByRole('button', { name: 'Finish my test' }).click();
  check(
    (await seen(page, '1 question is blank', false, 3000)) ||
      (await seen(page, 'blank', false, 1000)),
    'blank warning before finishing',
  );
  await radio(page, 'Sun').click();
  await page.getByRole('button', { name: 'Finish my test' }).click();
  check(await seen(page, 'You did it!'), 'celebration screen');
  check(await seen(page, 'Your stars are saved!'), 'says the work is saved');
  await page.screenshot({ path: SHOTS + '/prereader-done.png', fullPage: true });
  const rows = rowsFor('a-pg');
  check(rows.length === 1 && posts.length === 1, 'exactly one submission');
  const resp = JSON.stringify(rows[0]?.responses ?? null);
  check(
    /d3/.test(resp) && /"b"/.test(resp) && /"s"/.test(resp),
    'responses hold the tapped ids: ' + resp,
  );
  check(rows[0] && rows[0].score == null, 'no score from the client');

  // 7. Urdu: RTL, Urdu clip first; phone width without horizontal scroll.
  db.submissions = [];
  const p2 = await ctx.newPage();
  await mock(p2);
  await p2.setViewportSize({ width: 360, height: 780 });
  await p2.goto(BASE + '/');
  await p2.evaluate(() => localStorage.setItem('app.locale', 'ur'));
  await go(p2, '/tests/a-pg');
  check((await p2.evaluate(() => document.documentElement.dir)) === 'rtl', 'Urdu sets dir=rtl');
  check(await seen(p2, 'تین بطخیں کہاں ہیں؟'), 'Urdu prompt');
  await p2.getByRole('button', { name: 'سوال سنو' }).click();
  check(
    await until(async () => (await plays(p2)) >= 1, 4000),
    'Urdu: speaker plays the cached clip (order: core readAloud tests)',
  );
  check(
    await p2.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    'phone width: no horizontal scroll',
  );
  await p2.screenshot({ path: SHOTS + '/prereader-ur-phone.png', fullPage: true });

  check(!log.length, 'no page errors / unmocked calls: ' + log.join(' | '));
  check(!foreign.size, 'no foreign hosts: ' + [...foreign].join(', '));
  await browser.close();
})();
