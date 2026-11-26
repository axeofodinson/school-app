// TEST_PLAN OX-3: offline exams (prompt 60) on web against a MOCKED Supabase
// with a small offline-exam "server" (the real RPCs are OX-1,
// db/test/038_smoke.sql; the device clock is OX-2, packages/core).
// Teacher: opens the exam offline for 3 days from the builder. Student: the
// Tests tab lists it, saves the paper while online (no answers in it), the
// internet drops, starts and answers with no network, a reload keeps the
// answers and the clock, hands in while offline ("waiting"), comes back online
// and it sends itself with the SAME upload id, score shown. Prompt 61 (O-5):
// the copy is sealed in storage (no readable answers), the sync pill counts the
// waiting paper, signing out offline sends first then warns "not sent yet",
// another student on the same browser sees none of it, and the first
// student's next sign-in sends it from Home. Teacher live view:
// Offline badge, time taken, leaving the app, device clock changed, an
// over-time upload accepted only with a reason. Nothing animates in the exam.
// Build: cd apps/mobile && EXPO_PUBLIC_SUPABASE_URL=https://fakedevproject.supabase.co EXPO_PUBLIC_SUPABASE_ANON_KEY=fake npx expo export -p web
// Serve: node scripts/e2e/serve-dist.mjs "$PWD/apps/mobile/dist" 8089
// Run:   node scripts/e2e/offline-exam-web.cjs <screenshot-dir>
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
const STUDENT_B = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  code: '1002',
  pin: '5678',
  name: 'Sara Khan',
};
const TEACHER = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'teacher@school.test',
  name: 'Ms Ayesha',
};
let who = 'teacher';
const A = 'a-off';

const BODY = (n) => ({
  stem: { en: `What is ${n} + ${n}?`, ur: null },
  options: ['A', 'B', 'C', 'D'].map((k, j) => ({ key: k, text: String(n * 2 + j) })),
});

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
  assessments: [
    {
      id: A,
      title: 'Sets homework test',
      class_id: 'c9',
      subject_id: 's-math',
      year_id: 'y1',
      kind: 'test',
      mode: 'standard',
      status: 'draft',
      duration_seconds: 1200,
      opens_at: null,
      closes_at: null,
      join_code: null,
      created_by: TEACHER.id,
    },
  ],
  assessment_questions: [1, 2, 3].map((n, i) => ({
    id: `aq${n}`,
    assessment_id: A,
    question_id: `q${n}`,
    question_version: 1,
    marks: 1,
    sort_order: i + 1,
  })),
  submissions: [],
  exam_sessions: [],
  questions: [1, 2, 3].map((n) => ({
    id: `q${n}`,
    type: 'mcq',
    body: BODY(n),
    chapter_id: 'ch1',
    status: 'approved',
    default_marks: 1,
    difficulty: 1,
    cognitive_level: 'apply',
  })),
};

const rpcs = [];
const uploads = [];
const log = [];
const net = { down: false, aborted: 0 };
const exam = { session: null, answers: {}, upload: null };

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function sessionFor() {
  const id = who === 'student' ? STUDENT.id : who === 'studentB' ? STUDENT_B.id : TEACHER.id;
  const email =
    who === 'teacher'
      ? TEACHER.email
      : `s.${who === 'student' ? 1001 : 1002}@students.school.invalid`;
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
function embed(table, row) {
  if (table === 'assessments')
    return {
      ...row,
      class: find('classes', row.class_id),
      subject: find('subjects', row.subject_id),
      items: db.assessment_questions.filter((i) => i.assessment_id === row.id),
    };
  if (table === 'assessment_questions')
    return { ...row, question: find('questions', row.question_id) };
  return row;
}
function cond(row, key, c) {
  const val = row[key];
  const [op, ...rest] = c.split('.');
  const arg = rest.join('.');
  if (op === 'eq') return String(val) === arg;
  if (op === 'neq') return String(val) !== arg;
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
const SKIP = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);
const asmt = () => find('assessments', A);

// The teacher's roster for the live view (one student who took it offline
// and handed in over the time, with flags; one not started).
const roster = () => [
  {
    enrollment_id: 'e1',
    student_name: 'Sara Khan',
    student_code: '1002',
    session_id: 'sess-sara',
    status: 'auto_submitted',
    started_at: new Date(Date.now() - 40 * 60000).toISOString(),
    last_seen_at: null,
    score: exam.saraAccepted ? 2 : null,
    total: exam.saraAccepted ? 3 : null,
    answered: 3,
    flags: 0,
    late: 0,
  },
  {
    enrollment_id: 'e2',
    student_name: 'Bilal Ahmed',
    student_code: '1003',
    session_id: null,
    status: null,
    answered: 0,
    flags: 0,
    late: 0,
  },
];

async function mock(page) {
  page.on('pageerror', (e) => log.push('PAGEERROR ' + e.message));
  page.on('request', (r) => {
    const h = new URL(r.url()).hostname;
    if (!['localhost', 'fakedevproject.supabase.co'].includes(h)) log.push('FOREIGN ' + h);
  });
  await page.routeWebSocket(/fakedevproject\.supabase\.co\/realtime/, (sock) => {
    sock.onMessage((m) => {
      let f;
      try {
        f = JSON.parse(String(m));
      } catch {
        return;
      }
      const [joinRef, ref, topic] = f;
      if (ref)
        sock.send(
          JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response: {} }]),
        );
    });
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
    const body = () => {
      try {
        return req.postDataJSON() ?? {};
      } catch {
        return {};
      }
    };
    if (net.down) {
      net.aborted++;
      if (p === '/rest/v1/rpc/exam_offline_submit') uploads.push({ ...body(), dropped: true });
      return route.abort('internetdisconnected');
    }
    if (p === '/rest/v1/rpc/student_login_email')
      return json(200, 's.1001@students.school.invalid');
    if (p === '/auth/v1/token') return json(200, sessionFor());
    if (p === '/auth/v1/logout') return route.fulfill({ status: 204 });
    if (p === '/rest/v1/profiles')
      return out([
        who === 'student'
          ? { role: 'student', full_name: STUDENT.name, student_id: 's-a' }
          : who === 'studentB'
            ? { role: 'student', full_name: STUDENT_B.name, student_id: 's-b' }
            : { role: 'teacher', full_name: TEACHER.name, student_id: null },
      ]);
    if (p.startsWith('/rest/v1/rpc/')) {
      const fn = p.slice('/rest/v1/rpc/'.length);
      const a = body();
      rpcs.push({ fn, ...a });
      if (fn === 'exam_schedule_offline') {
        Object.assign(asmt(), {
          mode: 'offline_exam',
          status: 'published',
          opens_at: a.p_opens,
          closes_at: a.p_closes,
          join_code: null,
        });
        return json(200, { closes_at: a.p_closes, duration_seconds: asmt().duration_seconds });
      }
      if (fn === 'my_live_exams') return json(200, []);
      if (fn === 'my_offline_exams')
        return json(
          200,
          asmt().mode === 'offline_exam' && who === 'student'
            ? [
                {
                  assessment_id: A,
                  title: asmt().title,
                  subject_name: 'Mathematics',
                  duration_seconds: asmt().duration_seconds,
                  closes_at: asmt().closes_at,
                  session_status: exam.session?.status ?? null,
                  score: exam.session?.score ?? null,
                  total: exam.session?.total ?? null,
                },
              ]
            : [],
        );
      if (fn === 'exam_offline_download') {
        if (!exam.session) {
          exam.session = { id: 'sess-1', assessment_id: A, status: 'in_progress' };
          db.exam_sessions.push(exam.session);
        }
        return json(200, {
          session_id: exam.session.id,
          status: exam.session.status,
          title: asmt().title,
          closes_at: asmt().closes_at,
          deadline_at: asmt().closes_at,
          duration_seconds: asmt().duration_seconds,
          grace_seconds: 30,
          // Options reversed (per-student shuffle); never a key or correct flag.
          questions: db.assessment_questions.map((i) => {
            const q = find('questions', i.question_id);
            return {
              q: q.id,
              v: 1,
              type: 'mcq',
              marks: 1,
              body: { ...q.body, options: [...q.body.options].reverse() },
            };
          }),
        });
      }
      if (fn === 'exam_offline_submit') {
        uploads.push(a);
        if (exam.upload && exam.upload !== a.p_upload) log.push('SECOND UPLOAD ID ' + a.p_upload);
        exam.upload = a.p_upload;
        if (exam.session.status === 'in_progress') {
          exam.answers = a.p_answers;
          const right = Object.values(a.p_answers).filter((v) => v === 'A').length;
          Object.assign(exam.session, { status: 'submitted', score: right, total: 3 });
        }
        return json(200, {
          verdict: 'accepted',
          status: exam.session.status,
          score: exam.session.score,
          total: exam.session.total,
          questions: 3,
          answered: Object.keys(exam.answers).length,
          to_mark: 0,
        });
      }
      if (fn === 'exam_live')
        return json(200, {
          title: asmt().title,
          mode: 'offline_exam',
          status: 'published',
          join_code: null,
          closes_at: asmt().closes_at,
          confirmed_at: null,
          server_now: new Date().toISOString(),
          questions: 3,
          total_marks: 3,
          students: roster(),
        });
      if (fn === 'exam_offline_status')
        return json(200, [
          {
            session_id: 'sess-sara',
            delivery: 'offline',
            upload_id: 'up-sara',
            verdict: 'over_time',
            received_at: new Date().toISOString(),
            accepted_at: exam.saraAccepted ? new Date().toISOString() : null,
            client_elapsed_ms: 27 * 60000,
            client_flags: { hidden: 2, clock_back: 1 },
          },
        ]);
      if (fn === 'exam_offline_accept') {
        if (!String(a.p_reason ?? '').trim())
          return json(400, { code: '22023', message: 'reason_required' });
        exam.saraAccepted = true;
        return json(200, { verdict: 'accepted', score: 2, total: 3 });
      }
      if (fn === 'exam_item_analysis') return json(200, { papers: 0, items: [] });
      log.push('UNMOCKED RPC ' + fn);
      return json(200, []);
    }
    const table = p.replace('/rest/v1/', '');
    if (!db[table]) {
      log.push('UNMOCKED ' + req.method() + ' ' + table);
      return json(200, []);
    }
    const filters = [...url.searchParams].filter(([k]) => !SKIP.has(k));
    const pick = () => db[table].filter((r) => filters.every(([k, v]) => cond(r, k, v)));
    if (req.method() === 'GET') return out(pick().map((r) => embed(table, r)));
    if (req.method() === 'PATCH') {
      const rows = pick();
      for (const r of rows) Object.assign(r, body());
      return out(rows);
    }
    if (req.method() === 'POST') return out([].concat(body()));
    log.push('UNEXPECTED ' + req.method() + ' ' + p);
    return json(405, {});
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
const noHScroll = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const shot = (page, name, full = true) =>
  SHOTS ? page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: full }) : null;

(async () => {
  const browser = await chromium.launch();

  // ── Teacher: open it offline for 3 days from the builder ──
  const tctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const t = await tctx.newPage();
  await mock(t);
  await t.goto(BASE + '/staff');
  await t.getByLabel('Email').fill(TEACHER.email);
  await t.getByLabel('Password').fill('secret');
  await t.getByLabel('Password').press('Enter');
  await t.waitForTimeout(1500);
  await t.goto(BASE + '/assessments/' + A);
  const hasOffline = await seen(t, 'Or let them do it offline');
  if (!hasOffline) await shot(t, 'builder-debug');
  check(hasOffline, 'builder offers the offline option');
  check(
    await seen(t, 'Lower integrity: the device keeps the time.', false),
    'honest trade-off said',
  );
  await t.getByRole('radio', { name: 'Open 3 days' }).click();
  await t.getByRole('button', { name: 'Open offline exam' }).click();
  check(await seen(t, 'Offline exam open until'), 'toast: open until <date>');
  const sch = rpcs.find((r) => r.fn === 'exam_schedule_offline');
  const span = sch ? Date.parse(sch.p_closes) - Date.parse(sch.p_opens) : 0;
  check(
    !!sch && Math.abs(span - 3 * 86_400_000) < 5000,
    'exam_schedule_offline(opens, opens + 3 days)',
  );
  check(
    asmt().mode === 'offline_exam' && asmt().status === 'published',
    'assessment offline + published',
  );
  check(await seen(t, 'Offline exam open', true), 'builder shows "Offline exam open"');
  await shot(t, 'offline-builder-1280');

  // ── Student: Tests tab → save the paper while online ──
  who = 'student';
  const sctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const s = await sctx.newPage();
  await mock(s);
  await s.goto(BASE + '/login');
  await s.getByLabel('Admission number').fill(STUDENT.code);
  await s.getByLabel('PIN', { exact: true }).fill(STUDENT.pin);
  await s.getByText('Go', { exact: true }).click();
  await seen(s, 'Hi, Ali Raza!');
  await s.goto(BASE + '/tests');
  check(await seen(s, 'Offline exams', true), 'Tests: "Offline exams" section');
  check(await seen(s, 'Not saved yet', true), 'badge: not saved yet');
  await shot(s, 'offline-tests-1280');
  await s.getByRole('button', { name: 'Open', exact: true }).first().click();
  await s.waitForURL('**/exam/offline/' + A);
  check(await seen(s, 'Save this exam on your device'), 'download card');
  await s.getByRole('button', { name: 'Save the exam' }).click();
  check(await seen(s, 'Ready: 20 minutes once you start'), 'saved: ready, 20 minutes');
  const storedA = () =>
    s.evaluate(() =>
      Object.keys(localStorage)
        .filter((k) => k.includes('/queue/'))
        .map((k) => localStorage.getItem(k))
        .join('\n'),
    );
  const stored = await storedA();
  check(stored.startsWith('sealed1:'), 'paper stored on the device, sealed');
  check(!stored.includes('What is'), 'no readable paper in storage');
  await shot(s, 'offline-ready-1280');

  // ── Internet drops. Start and answer with no network ──
  net.down = true;
  await s.reload();
  check(
    await seen(s, 'Ready: 20 minutes once you start', false, 12000),
    'reload offline: still ready',
  );
  await s.getByRole('button', { name: 'Start the exam' }).click();
  check(await seen(s, 'No internet needed. Every answer is saved on this device.'), 'taking: note');
  check((await s.getByRole('timer').count()) > 0, 'timer shown');
  const first = s.getByRole('radio').first();
  check(
    ((await first.getAttribute('aria-label')) || '') === 'A. 5',
    'options lettered by position',
  );
  // Right answers: text 2n is key A, now last on screen (letter D).
  await s.getByRole('radio', { name: 'D. 2', exact: true }).click();
  await s.getByRole('radio', { name: 'D. 4', exact: true }).click();
  check(await seen(s, '2/3 done'), '2/3 done');
  const anims = await s.evaluate(
    () => document.getAnimations().filter((a) => a.playState === 'running').length,
  );
  check(anims === 0, `nothing animates in the exam (${anims})`);
  await s.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await s.waitForTimeout(1200);
  await shot(s, 'offline-taking-1280');

  // App killed / reloaded mid-exam, still offline: answers and clock kept.
  const secs = (x) => (x || '').split(':').reduce((m, v) => m * 60 + Number(v), 0);
  const before = await s.getByRole('timer').first().textContent();
  await s.waitForTimeout(2000);
  await s.reload();
  check(await seen(s, '2/3 done', false, 12000), 'reload offline mid-exam: answers kept');
  check(
    (await s.getByRole('radio', { name: 'D. 4', exact: true }).getAttribute('aria-checked')) ===
      'true',
    'answer still selected',
  );
  const after = await s.getByRole('timer').first().textContent();
  check(
    secs(after) > 0 && secs(after) <= secs(before) - 2,
    `clock kept counting (${before} → ${after})`,
  );
  await s.getByRole('radio', { name: 'D. 6', exact: true }).click();
  check(await seen(s, '3/3 done'), '3/3 done');
  await s.getByRole('button', { name: 'Hand in' }).click();
  check(await seen(s, 'Handed in. Waiting for internet', false, 12000), 'offline: waiting to send');
  check(!rpcs.some((r) => r.fn === 'exam_offline_submit'), 'nothing reached the server yet');
  await shot(s, 'offline-waiting-1280');

  // Phone width while waiting.
  await s.setViewportSize({ width: 390, height: 844 });
  check(await noHScroll(s), 'phone: no sideways scroll');
  await shot(s, 'offline-waiting-390');
  await s.setViewportSize({ width: 1280, height: 900 });

  const sealed = await storedA();
  check(
    sealed.split('\n').every((v) => v.startsWith('sealed1:')) && !/"[A-D]"|What is/.test(sealed),
    'answers sealed in storage (nothing readable)',
  );
  check(await seen(s, '1 change waiting'), 'sync pill: 1 change waiting');

  // ── O-5: sign out while offline → send first, then "not sent yet" ──
  await s.goto(BASE + '/me');
  await s.getByRole('button', { name: 'Sign out' }).first().click();
  check(await seen(s, 'Not sent yet', true, 15000), 'sign out offline: "Not sent yet"');
  check(
    await seen(s, "1 piece of work is saved on this device but hasn't been sent yet."),
    'says how much is waiting',
  );
  check(await seen(s, 'locked to you'), 'says it stays safe and private');
  await s.waitForTimeout(600);
  await shot(s, 'signout-unsent-1280');
  await s.getByRole('button', { name: 'Stay signed in' }).click();
  check(await seen(s, 'Sign out', true), 'stay: still signed in');
  await s.getByRole('button', { name: 'Sign out' }).first().click();
  await seen(s, 'Not sent yet', true, 15000);
  await s.getByRole('button', { name: 'Sign out anyway' }).click();
  check(await seen(s, 'Admission number', false, 10000), 'signed out anyway');
  const afterOut = await s.evaluate(() => Object.keys(localStorage));
  check(
    afterOut.some((k) => k.includes('/queue/offexam/')),
    'the unsent paper stays on the device (queue kept)',
  );

  // ── Student B on the same browser sees none of it ──
  net.down = false;
  who = 'studentB';
  await s.getByLabel('Admission number').fill(STUDENT_B.code);
  await s.getByLabel('PIN', { exact: true }).fill(STUDENT_B.pin);
  await s.getByText('Go', { exact: true }).click();
  check(await seen(s, 'Hi, Sara Khan!'), 'student B signed in');
  await s.goto(BASE + '/tests');
  await s.waitForTimeout(1500);
  check(!(await s.getByText('Sets homework test').count()), "B sees nothing of A's exam");
  check(!(await s.getByText('Offline exams', { exact: true }).count()), 'B: no offline list');
  check(!uploads.some((u) => !u.dropped), "B's session never sends A's paper");
  await s.goto(BASE + '/me');
  await s.getByRole('button', { name: 'Sign out' }).first().click();
  check(await seen(s, 'Admission number', false, 10000), 'B signs out at once (nothing unsent)');

  // ── A signs in again online: it sends itself from Home, same upload id ──
  who = 'student';
  await s.getByLabel('Admission number').fill(STUDENT.code);
  await s.getByLabel('PIN', { exact: true }).fill(STUDENT.pin);
  await s.getByText('Go', { exact: true }).click();
  await seen(s, 'Hi, Ali Raza!');
  for (let i = 0; i < 40 && !uploads.some((u) => !u.dropped); i++) await s.waitForTimeout(250);
  check(
    uploads.some((u) => !u.dropped),
    "A's next sign-in sends the paper by itself",
  );
  await s.goto(BASE + '/exam/offline/' + A);
  check(await seen(s, '3 / 3', true, 12000), 'sent: score 3 / 3');
  const sent = uploads.filter((u) => !u.dropped);
  const ids = new Set(uploads.map((u) => u.p_upload));
  check(
    uploads.some((u) => u.dropped),
    'an offline attempt was made and dropped',
  );
  check(sent.length >= 1 && ids.size === 1, `same upload id on every try (${ids.size})`);
  const u = sent[0] ?? {};
  check(
    u.p_session === 'sess-1' &&
      Object.keys(u.p_answers ?? {}).length === 3 &&
      Object.values(u.p_answers ?? {}).every((v) => v === 'A'),
    'upload: session + 3 answers (keys, not letters)',
  );
  check(
    u.p_elapsed_ms > 0 && u.p_elapsed_ms < 10 * 60000 && !!u.p_started_at && !!u.p_finished_at,
    'upload: device clock elapsed + times',
  );
  check((u.p_flags?.hidden ?? 0) >= 1, 'upload: leaving the app counted');
  await shot(s, 'offline-sent-1280');
  await s.goto(BASE + '/tests');
  check(await seen(s, 'Sent', true), 'Tests: badge Sent');

  // ── Teacher live view: offline rows, flags, accept with a reason ──
  who = 'teacher';
  await t.goto(BASE + '/exams/' + A);
  check(await seen(t, 'Offline exam open', true), 'live view: offline exam open');
  check(await seen(t, 'Offline', true), 'row: Offline badge');
  check(await seen(t, 'Over time', true), 'row: Over time verdict');
  check(await seen(t, 'took 27 min'), 'row: took 27 min');
  check(await seen(t, 'left the app 2 times'), 'row: left the app 2 times');
  check(await seen(t, 'device clock changed'), 'row: device clock changed');
  check(!(await t.getByText(/lock ?down|locked/i).count()), 'no lockdown words');
  await shot(t, 'offline-live-1280');
  await t.getByRole('button', { name: 'Accept', exact: true }).first().click();
  check(await seen(t, "Accept Sara Khan's answers?"), 'accept sheet');
  await t.getByRole('button', { name: 'Accept', exact: true }).last().click();
  await t.waitForTimeout(500);
  check(
    !rpcs.some((r) => r.fn === 'exam_offline_accept' && r.p_reason),
    'no accept without a reason',
  );
  await t.getByRole('textbox').last().fill('Bus was late, agreed with me');
  await t.getByRole('button', { name: 'Accept', exact: true }).last().click();
  check(await seen(t, "Sara Khan's answers accepted and marked"), 'accepted toast');
  check(
    rpcs.some(
      (r) =>
        r.fn === 'exam_offline_accept' &&
        r.p_upload === 'up-sara' &&
        r.p_reason === 'Bus was late, agreed with me',
    ),
    'exam_offline_accept(upload, reason)',
  );
  check(await seen(t, 'Accepted', true), 'row: Accepted');
  await t.setViewportSize({ width: 390, height: 844 });
  check(await noHScroll(t), 'teacher phone: no sideways scroll');
  await shot(t, 'offline-live-390');

  check(
    !log.some((l) => l.startsWith('PAGEERROR')),
    'no page errors ' + log.filter((l) => l.startsWith('PAGEERROR')).join(' | '),
  );
  check(!log.some((l) => l.startsWith('FOREIGN')), 'no foreign hosts');
  check(!log.some((l) => l.startsWith('SECOND UPLOAD')), 'never a second upload id');
  const unmocked = [...new Set(log.filter((l) => l.startsWith('UNMOCKED')))];
  if (unmocked.length) console.log('note:', unmocked.join(', '));
  console.log(fails ? `${fails} FAILED` : 'ALL PASS');
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
