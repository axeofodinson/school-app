// TEST_PLAN EX-4: the teacher's live exam view + results (prompt 51) on web
// against a MOCKED Supabase, including a mocked Realtime socket (the real RPCs
// are EX-3, db/test/035_smoke.sql). Live roster with writing / gone quiet / not
// joined / handed in and leave-screen flags; a Realtime change refetches (one
// channel, filtered to this exam); void needs a reason; confirm waits for open
// papers; End; item analysis (easy / trap flags, the key marked with a word,
// distractor counts, answers to mark); confirm sends results once; the builder
// links to it. Phone width has no sideways scroll.
// Build: cd apps/mobile && EXPO_PUBLIC_SUPABASE_URL=https://fakedevproject.supabase.co EXPO_PUBLIC_SUPABASE_ANON_KEY=fake npx expo export -p web
// Serve: node scripts/e2e/serve-dist.mjs "$PWD/apps/mobile/dist" 8089
// Run:   node scripts/e2e/exam-live-web.cjs <screenshot-dir>
const { chromium } = require('playwright');
const BASE = 'http://localhost:8089';
const SB = 'https://fakedevproject.supabase.co';
const SHOTS = process.argv[2];

const TEACHER = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'teacher@school.test',
  name: 'Ms Ayesha',
};
const A = 'a1';
const ago = (s) => new Date(Date.now() - s * 1000).toISOString();

const exam = {
  title: 'Algebra test',
  mode: 'live_exam',
  status: 'published',
  join_code: 'KX7P2M',
  closes_at: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
  confirmed_at: null,
  questions: 4,
  total_marks: 4,
};
const students = [
  {
    enrollment_id: 'e1',
    student_name: 'Ali Raza',
    student_code: '1001',
    session_id: 's1',
    status: 'submitted',
    started_at: ago(600),
    last_seen_at: ago(60),
    score: 3,
    total: 4,
    answered: 4,
    flags: 0,
    late: 0,
  },
  {
    enrollment_id: 'e2',
    student_name: 'Sara Khan',
    student_code: '1002',
    session_id: 's2',
    status: 'in_progress',
    started_at: ago(500),
    last_seen_at: ago(5),
    answered: 2,
    flags: 2,
    late: 0,
  },
  {
    enrollment_id: 'e3',
    student_name: 'Bilal Ahmed',
    student_code: '1003',
    session_id: 's3',
    status: 'in_progress',
    started_at: ago(500),
    last_seen_at: ago(240),
    answered: 1,
    flags: 0,
    late: 0,
  },
  {
    enrollment_id: 'e4',
    student_name: 'Zara Ali',
    student_code: '1004',
    session_id: null,
    status: null,
  },
];
const ITEMS = {
  papers: 6,
  items: [
    {
      question_id: 'q1',
      marks: 1,
      type: 'mcq',
      body: {
        stem: { en: 'What is 2 + 2?' },
        options: ['A', 'B', 'C'].map((k, j) => ({ key: k, text: String(4 + j) })),
      },
      key: 'A',
      concept_en: 'Adding small numbers',
      answered: 6,
      correct: 6,
      to_mark: 0,
      papers: 6,
      choices: { A: 6 },
    },
    {
      question_id: 'q2',
      marks: 1,
      type: 'mcq',
      body: {
        stem: 'Solve x + 3 = 5',
        options: [
          { key: 'A', text: 'x = 2' },
          { key: 'B', text: 'x = 3' },
          { key: 'C', text: 'x = 8' },
        ],
      },
      key: 'A',
      concept_en: 'One-step equations',
      answered: 6,
      correct: 2,
      to_mark: 0,
      papers: 6,
      choices: { A: 2, B: 1, C: 3 },
    },
    {
      question_id: 'q3',
      marks: 1,
      type: 'short_text',
      body: { stem: 'Name the variable in 3y = 9' },
      key: 'y',
      concept_en: 'Variables',
      answered: 5,
      correct: 3,
      to_mark: 2,
      papers: 6,
      choices: {},
    },
    {
      question_id: 'q4',
      marks: 1,
      type: 'true_false',
      body: { stem: 'Zero is even.' },
      key: true,
      concept_en: 'Even and odd',
      answered: 6,
      correct: 4,
      to_mark: 0,
      papers: 6,
      choices: { true: 4, false: 2 },
    },
  ],
};
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
  chapters: [],
  assessments: [
    {
      id: A,
      title: exam.title,
      class_id: 'c9',
      subject_id: 's-math',
      year_id: 'y1',
      type: 'test',
      status: 'published',
      mode: 'live_exam',
      join_code: 'KX7P2M',
      duration_seconds: 1800,
      opens_at: ago(600),
      closes_at: exam.closes_at,
      created_by: TEACHER.id,
      class: { name: 'Class 9-A' },
      subject: { name: 'Mathematics' },
      items: ['q1', 'q2', 'q3', 'q4'].map((q, i) => ({
        question_id: q,
        marks: 1,
        sort_order: i + 1,
      })),
    },
  ],
  assessment_questions: [],
  questions: [],
  submissions: [],
  exam_sessions: [{ assessment_id: A, status: 'submitted' }],
};

const rpcs = [];
const log = [];
const ws = { joined: null, sockets: [] };

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
  if (op === 'neq') return val != null && String(val) !== arg;
  if (op === 'is') return arg === 'null' ? val == null : String(val) === arg;
  if (op === 'not') return rest[0] === 'is' && rest[1] === 'null' ? val != null : true;
  return true;
}
const SKIP = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);
const liveJson = () => ({
  ...exam,
  server_now: new Date().toISOString(),
  students: students.map((s) => ({ ...s })),
});

async function mock(page) {
  page.on('pageerror', (e) => log.push('PAGEERROR ' + e.message));
  page.on('request', (r) => {
    const h = new URL(r.url()).hostname;
    if (!['localhost', 'fakedevproject.supabase.co'].includes(h)) log.push('FOREIGN ' + h);
  });
  // Realtime (Phoenix, vsn 2: [join_ref, ref, topic, event, payload]).
  await page.routeWebSocket(/fakedevproject\.supabase\.co\/realtime/, (sock) => {
    ws.sockets.push(sock);
    sock.onMessage((m) => {
      let f;
      try {
        f = JSON.parse(String(m));
      } catch {
        return;
      }
      const [joinRef, ref, topic, event, payload] = f;
      if (event === 'phx_join' && topic.startsWith('realtime:exam-live:')) {
        const pc = (payload.config?.postgres_changes ?? []).map((c, i) => ({ ...c, id: 900 + i }));
        ws.joined = { topic, joinRef, pc, token: payload.access_token };
        sock.send(
          JSON.stringify([
            joinRef,
            ref,
            topic,
            'phx_reply',
            { status: 'ok', response: { postgres_changes: pc } },
          ]),
        );
      } else if (ref) {
        sock.send(
          JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response: {} }]),
        );
      }
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
    if (p === '/auth/v1/token') return json(200, sessionFor());
    if (p === '/auth/v1/logout') return route.fulfill({ status: 204 });
    if (p === '/rest/v1/profiles')
      return out([{ role: 'teacher', full_name: TEACHER.name, student_id: null }]);
    if (p.startsWith('/rest/v1/rpc/')) {
      const fn = p.slice('/rest/v1/rpc/'.length);
      const a = body();
      rpcs.push({ fn, ...a });
      if (fn === 'exam_live') return json(200, liveJson());
      if (fn === 'exam_item_analysis') return json(200, ITEMS);
      if (fn === 'exam_void_session') {
        if (!String(a.p_reason ?? '').trim())
          return json(400, { code: '22023', message: 'reason_required' });
        const s = students.find((x) => x.session_id === a.p_session);
        Object.assign(s, { status: 'void', void_reason: a.p_reason.trim() });
        return json(200, { status: 'void' });
      }
      if (fn === 'exam_end') {
        let n = 0;
        for (const s of students)
          if (s.status === 'in_progress') {
            Object.assign(s, { status: 'auto_submitted', score: 1, total: 4 });
            n++;
          }
        exam.status = 'closed';
        db.assessments[0].status = 'closed';
        return json(200, { closed_sessions: n });
      }
      if (fn === 'exam_confirm') {
        if (students.some((s) => s.status === 'in_progress'))
          return json(400, { code: '22023', message: 'exam_still_running' });
        if (exam.confirmed_at) return json(400, { code: '22023', message: 'already_confirmed' });
        exam.confirmed_at = new Date().toISOString();
        const graded = students.filter((s) =>
          ['submitted', 'auto_submitted'].includes(s.status),
        ).length;
        return json(200, { graded, follow_ups: 1 });
      }
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
    if (req.method() === 'GET') return out(pick());
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
const count = (fn) => rpcs.filter((r) => r.fn === fn).length;

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

  // ── Builder links to the live view ──
  await t.goto(BASE + '/assessments/' + A);
  const link = t.getByRole('button', { name: 'Open live view' });
  const linked = await link
    .waitFor({ timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  if (!linked) await t.screenshot({ path: SHOTS + '/builder-debug.png', fullPage: true });
  check(linked, 'builder: "Open live view" on a running exam');
  if (linked) {
    await link.click();
    await t.waitForURL('**/exams/' + A);
  } else await t.goto(BASE + '/exams/' + A);

  // ── Live roster ──
  check(await seen(t, 'Algebra test', true), 'title');
  check(await seen(t, 'KX7P2M', true), 'join code shown while running');
  check(await seen(t, /\d+:\d\d left/), 'time left from the server clock');
  check(await seen(t, '1 writing', true), '1 writing');
  check(await seen(t, '1 gone quiet', true), 'quiet for 4 min reads as gone quiet');
  check(await seen(t, '1 not joined', true), '1 not joined');
  check(await seen(t, '1 handed in', true), '1 handed in');
  check(await seen(t, 'Left 2×', true), 'leave-screen flags on the row');
  check(await seen(t, '1001 · 3/4'), 'handed-in score on the row');
  check(!(await t.getByText(/lock ?down|locked/i).count()), 'no lockdown words');
  await t.screenshot({ path: SHOTS + '/exam-live-1280.png', fullPage: true });

  // ── Realtime: one channel on exam_sessions for this exam → refetch ──
  for (let i = 0; i < 40 && !ws.joined; i++) await t.waitForTimeout(250);
  const pc = ws.joined?.pc?.[0];
  check(
    !!pc && pc.table === 'exam_sessions' && pc.filter === `assessment_id=eq.${A}`,
    'Realtime: joined exam_sessions filtered to this exam ' + JSON.stringify(pc ?? null),
  );
  check(!!ws.joined?.token, 'Realtime: joined with the teacher JWT (RLS applies)');
  if (pc) {
    const before = count('exam_live');
    Object.assign(students[3], {
      session_id: 's4',
      status: 'in_progress',
      started_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
      answered: 0,
      flags: 0,
      late: 0,
    });
    const push = () =>
      ws.sockets.at(-1).send(
        JSON.stringify([
          ws.joined.joinRef,
          null,
          ws.joined.topic,
          'postgres_changes',
          {
            ids: [pc.id],
            data: {
              type: 'UPDATE',
              schema: 'public',
              table: 'exam_sessions',
              commit_timestamp: new Date().toISOString(),
              columns: [],
              record: { id: 's4', assessment_id: A, status: 'in_progress' },
              old_record: { id: 's4' },
              errors: null,
            },
          },
        ]),
      );
    for (let i = 0; i < 10; i++) push(); // a burst of saves
    check(await seen(t, '2 writing', true, 6000), 'Realtime change refetches the roster');
    await t.waitForTimeout(500);
    const extra = count('exam_live') - before;
    check(extra >= 1 && extra <= 2, `a burst of 10 changes → ${extra} refetch(es) (throttled)`);
  }

  // ── Void needs a reason ──
  const bilal = t
    .locator('div', { hasText: 'Bilal Ahmed' })
    .filter({ has: t.getByRole('button', { name: 'Void' }) })
    .last();
  await bilal.getByRole('button', { name: 'Void' }).click();
  check(await seen(t, "Void Bilal Ahmed's paper?"), 'void sheet names the student');
  await t.getByRole('button', { name: 'Void' }).last().click();
  check(await seen(t, 'Write a reason first.'), 'void refuses without a reason');
  check(!rpcs.some((r) => r.fn === 'exam_void_session'), 'nothing sent without a reason');
  await t.getByLabel('Reason').fill('Phone died, will resit');
  await t.getByRole('button', { name: 'Void' }).last().click();
  check(await seen(t, "Bilal Ahmed's paper is void"), 'voided toast');
  check(
    rpcs.some(
      (r) =>
        r.fn === 'exam_void_session' &&
        r.p_session === 's3' &&
        r.p_reason === 'Phone died, will resit',
    ),
    'exam_void_session(session, reason)',
  );
  check(await seen(t, 'Void: Phone died, will resit'), 'reason shown on the row');

  // ── Results: confirm waits for open papers ──
  await t
    .getByRole('tab', { name: 'Results' })
    .or(t.getByRole('radio', { name: 'Results' }))
    .first()
    .click();
  check(await seen(t, 'students are still writing'), 'confirm says it waits for open papers');
  check(
    await t.getByRole('button', { name: 'Confirm results' }).isDisabled(),
    'confirm disabled while writing',
  );
  check(!rpcs.some((r) => r.fn === 'exam_confirm'), 'no confirm while running');

  // ── End ──
  await t
    .getByRole('button', { name: 'End exam' })
    .or(t.getByRole('button', { name: 'End' }))
    .first()
    .click();
  check(await seen(t, 'End the exam now?'), 'end asks first');
  await t.getByRole('button', { name: /^End/ }).last().click();
  check(await seen(t, 'Ended', true), 'ended badge');
  check(
    !(await t.getByText('KX7P2M', { exact: true }).filter({ visible: true }).count()),
    'code hidden once ended',
  );

  // ── Item analysis ──
  check(await seen(t, 'Question by question'), 'item analysis shown');
  check(await seen(t, 'What is 2 + 2?'), 'stem (bilingual body) shown');
  check(await seen(t, 'Easy', true), 'easy flag (6/6)');
  check(await seen(t, 'Trap', true), 'trap flag');
  check(await seen(t, 'C · x = 8'), 'options listed with text');
  check(await seen(t, 'A · x = 2 (answer)'), 'key marked with a word');
  check(await seen(t, 'C pulled 3 students'), 'top distractor named');
  check(await seen(t, '2 answers to mark by hand'), 'answers to mark by hand');
  check(await seen(t, 'True (answer)'), 'true/false bars');
  check(await seen(t, '33%', true), '% right on the trap item');
  check(await seen(t, 'Not in grades yet'), 'unconfirmed results say not in grades');
  await t.screenshot({ path: SHOTS + '/exam-results-1280.png', fullPage: true });

  // ── Confirm ──
  await t.getByRole('button', { name: 'Confirm results' }).first().click();
  check(await seen(t, 'Send results to grades?'), 'confirm sheet');
  check(await seen(t, '3 scores go into grades'), 'confirm counts the papers');
  check(await seen(t, '1 void paper is left out.'), 'void paper left out');
  await t.getByRole('button', { name: 'Confirm results' }).last().click();
  check(await seen(t, '3 scores in grades · 1 follow-ups'), 'confirmed toast');
  check(await seen(t, 'In grades since'), 'confirmed stamp');
  check(count('exam_confirm') === 1, 'exam_confirm once');
  await t
    .getByRole('radio', { name: 'Live' })
    .or(t.getByRole('tab', { name: 'Live' }))
    .first()
    .click();
  check(await seen(t, 'Sara Khan'), 'live tab again');
  check(
    !(await t.getByRole('button', { name: 'Void' }).filter({ visible: true }).count()),
    'no void after confirm',
  );

  // ── Phone ──
  await t.setViewportSize({ width: 390, height: 844 });
  await t.waitForTimeout(400);
  check(await noHScroll(t), 'phone: no sideways scroll');
  await t.screenshot({ path: SHOTS + '/exam-results-390.png', fullPage: true });

  check(
    !log.some((l) => l.startsWith('PAGEERROR')),
    'no page errors ' + log.filter((l) => l.startsWith('PAGEERROR')).join(' | '),
  );
  check(!log.some((l) => l.startsWith('FOREIGN')), 'no foreign hosts');
  const unmocked = [...new Set(log.filter((l) => l.startsWith('UNMOCKED')))];
  if (unmocked.length) console.log('note:', unmocked.join(', '));
  console.log(fails ? `${fails} FAILED` : 'ALL PASS');
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
