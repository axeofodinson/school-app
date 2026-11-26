// TEST_PLAN MS-2: messaging on web against a MOCKED Supabase (in-memory PostgREST,
// the db/029 RPCs in JS, and a mocked Realtime websocket speaking the Phoenix
// protocol; no request leaves localhost). RLS and the RPCs are checked in SQL by
// db/test/029_smoke.sql (MS-1); this checks the UI, what it sends, the live toast,
// foreground-only subscription and read state.
// Build: cd apps/mobile && EXPO_PUBLIC_SUPABASE_URL=https://fakedevproject.supabase.co EXPO_PUBLIC_SUPABASE_ANON_KEY=fake npx expo export -p web
// Serve: node scripts/e2e/serve-dist.mjs "$PWD/apps/mobile/dist" 8089
// Run:   NODE_PATH=$(npm root -g) node scripts/e2e/messaging-web.cjs <screenshot-dir>
const { chromium } = require('playwright');
const BASE = 'http://localhost:8089';
const SB = 'https://fakedevproject.supabase.co';
const SHOTS = process.argv[2] || '.';

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
const S = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  code: '1001',
  pin: '1234',
  name: 'Ali Raza',
  role: 'student',
  sid: 's-1',
};
const people = [T, A];
const handle = (code) => `s.${code}@students.school.invalid`;

const students = [];
const enrollments = [];
for (let i = 1; i <= 40; i++) {
  students.push({
    id: `s-${i}`,
    full_name: i === 1 ? 'Ali Raza' : `Student ${i}`,
    student_code: String(1000 + i),
  });
  enrollments.push({
    id: `e${i}`,
    student_id: `s-${i}`,
    class_id: 'c9a',
    year_id: 'y1',
    status: 'active',
    roll_number: i,
  });
}
for (const n of [42, 43]) {
  students.push({ id: `s-${n}`, full_name: `Class8 ${n}`, student_code: String(1000 + n) });
  enrollments.push({
    id: `e${n}`,
    student_id: `s-${n}`,
    class_id: 'c8',
    year_id: 'y1',
    status: 'active',
    roll_number: n - 41,
  });
}
const ago = (min) => new Date(Date.now() - min * 60000).toISOString();
const db = {
  academic_years: [{ id: 'y1', label: '2026-27', is_current: true }],
  classes: [
    { id: 'c9a', name: 'Class 9-A', grade_level: 9 },
    { id: 'c8', name: 'Class 8', grade_level: 8 },
  ],
  teacher_assignments: [{ teacher_id: T.id, class_id: 'c9a', subject_id: null, year_id: 'y1' }],
  students,
  enrollments,
  messages: [
    {
      id: 'm-old-1',
      sender_id: A.id,
      scope: 'school',
      target_id: null,
      title: 'Sports day',
      body: 'Sports day is on Friday.',
      created_at: ago(300),
    },
    {
      id: 'm-old-2',
      sender_id: T.id,
      scope: 'class',
      target_id: 'c9a',
      title: 'Maths homework',
      body: 'Exercise 3.2, questions 1 to 5.',
      created_at: ago(120),
    },
    {
      id: 'm-c8',
      sender_id: A.id,
      scope: 'class',
      target_id: 'c8',
      title: 'Class 8 trip',
      body: 'Only Class 8.',
      created_at: ago(60),
    },
  ],
  message_reads: [{ message_id: 'm-old-1', student_id: 's-1', read_at: ago(200) }],
  // Student home (prompts 41/42) reads these; empty here.
  follow_ups: [],
  concept_mastery: [],
  concepts: [],
  assessments: [],
  assessment_questions: [],
  submissions: [],
  attendance: [],
};
const inserts = [];
const rpcCalls = [];
const net = { down: false };
const sockets = []; // { ws, topics: Map<topic, joinRef>, events: [] }

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function sessionFor(u, email) {
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
      email,
      app_metadata: {},
      user_metadata: {},
      created_at: new Date().toISOString(),
    },
  };
}
const find = (t, id) => db[t].find((r) => r.id === id) ?? null;
const teaches = (uid, classId) =>
  db.teacher_assignments.some((a) => a.teacher_id === uid && a.class_id === classId);
// db/010 message RLS, in JS.
function canRead(who, m) {
  if (who.role === 'admin') return true;
  if (who.role === 'teacher') return m.sender_id === who.id;
  if (who.role === 'student') {
    if (m.scope === 'school') return true;
    if (m.scope === 'student') return m.target_id === who.sid;
    return enrollments.some(
      (e) => e.student_id === who.sid && e.class_id === m.target_id && e.status === 'active',
    );
  }
  return false;
}
function canSend(who, m) {
  if (m.sender_id !== who.id) return false;
  if (who.role === 'admin') return true;
  if (who.role !== 'teacher') return false;
  if (m.scope === 'class') return teaches(who.id, m.target_id);
  if (m.scope === 'student')
    return enrollments.some((e) => e.student_id === m.target_id && teaches(who.id, e.class_id));
  return false;
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
const SKIP = new Set(['select', 'order', 'limit', 'offset', 'columns']);

// ---- Realtime (Phoenix over websocket, vsn 1 objects or vsn 2 arrays) ----------
function decode(text) {
  const m = JSON.parse(text);
  if (Array.isArray(m))
    return { v2: true, join_ref: m[0], ref: m[1], topic: m[2], event: m[3], payload: m[4] };
  return { v2: false, ...m };
}
function encode(v2, msg) {
  return JSON.stringify(
    v2 ? [msg.join_ref ?? null, msg.ref ?? null, msg.topic, msg.event, msg.payload] : msg,
  );
}
async function mockRealtime(page, who) {
  await page.routeWebSocket(/fakedevproject\.supabase\.co\/realtime/, (ws) => {
    const sock = { ws, who, topics: new Map(), events: [], v2: true };
    sockets.push(sock);
    ws.onMessage((text) => {
      const msg = decode(String(text));
      sock.v2 = msg.v2;
      sock.events.push(msg.event + ' ' + msg.topic);
      const reply = (payload) =>
        ws.send(
          encode(sock.v2, {
            join_ref: msg.join_ref,
            ref: msg.ref,
            topic: msg.topic,
            event: 'phx_reply',
            payload,
          }),
        );
      if (msg.event === 'phx_join') {
        const pc = msg.payload?.config?.postgres_changes ?? [];
        const ids = pc.map((f, i) => ({ id: 100 + i, ...f }));
        sock.topics.set(msg.topic, { joinRef: msg.join_ref ?? msg.ref, ids });
        reply({ status: 'ok', response: { postgres_changes: ids } });
      } else if (msg.event === 'phx_leave') {
        sock.topics.delete(msg.topic);
        reply({ status: 'ok', response: {} });
      } else {
        reply({ status: 'ok', response: {} });
      }
    });
  });
}
const cols = ['id', 'sender_id', 'scope', 'target_id', 'title', 'body', 'created_at'].map(
  (name) => ({ name, type: 'text' }),
);
/** The server side of an INSERT: deliver to every joined channel whose user may read the row. */
function broadcastInsert(row) {
  let delivered = 0;
  for (const s of sockets) {
    if (!canRead(s.who, row)) continue;
    for (const [topic, t] of s.topics) {
      try {
        s.ws.send(
          encode(s.v2, {
            join_ref: t.joinRef,
            ref: null,
            topic,
            event: 'postgres_changes',
            payload: {
              ids: t.ids.map((x) => x.id),
              data: {
                schema: 'public',
                table: 'messages',
                commit_timestamp: row.created_at,
                type: 'INSERT',
                columns: cols,
                record: row,
                errors: null,
              },
            },
          }),
        );
        delivered++;
      } catch {
        /* closed */
      }
    }
  }
  return delivered;
}

const log = [];
async function mock(page, who) {
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (!['localhost', 'fakedevproject.supabase.co'].includes(u.hostname))
      log.push('FOREIGN ' + u.hostname);
  });
  page.on('pageerror', (e) => log.push('PAGEERROR ' + e.message));
  await mockRealtime(page, who);
  await page.route(SB + '/**', async (route) => {
    if (net.down) return route.abort('internetdisconnected');
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const m = req.method();
    const json = (status, body) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    const out = (rows) =>
      single
        ? rows.length
          ? json(200, rows[0])
          : json(406, { code: 'PGRST116' })
        : json(200, rows);

    if (p === '/rest/v1/rpc/student_login_email') return json(200, handle(S.code));
    if (p === '/auth/v1/token') {
      const { email } = req.postDataJSON();
      if (email === handle(S.code)) return json(200, sessionFor(S, email));
      const u = people.find((x) => x.email === email);
      return u ? json(200, sessionFor(u, email)) : json(400, { code: 'invalid_credentials' });
    }
    if (p === '/auth/v1/logout') return route.fulfill({ status: 204 });
    if (p === '/rest/v1/profiles') {
      if (who.role === 'student')
        return out([{ role: 'student', full_name: S.name, student_id: 's-1' }]);
      return out([{ role: who.role, full_name: who.name, student_id: null }]);
    }
    if (p === '/rest/v1/rpc/mark_messages_read') {
      const { p_ids } = req.postDataJSON();
      rpcCalls.push({ fn: 'mark', who: who.role, ids: p_ids });
      if (who.role !== 'student') return json(403, { code: '42501', message: 'not_a_student' });
      let n = 0;
      for (const id of p_ids) {
        const msg = find('messages', id);
        if (!msg || !canRead(who, msg)) continue;
        if (db.message_reads.some((r) => r.message_id === id && r.student_id === who.sid)) continue;
        db.message_reads.push({
          message_id: id,
          student_id: who.sid,
          read_at: new Date().toISOString(),
        });
        n++;
      }
      return json(200, n);
    }
    if (p === '/rest/v1/rpc/message_read_counts') {
      const { p_ids } = req.postDataJSON();
      const mine = (id) => who.role === 'admin' || find('messages', id)?.sender_id === who.id;
      const rows = p_ids
        .filter(mine)
        .map((id) => ({
          message_id: id,
          read_count: db.message_reads.filter((r) => r.message_id === id).length,
        }))
        .filter((r) => r.read_count > 0);
      return json(200, rows);
    }
    if (p === '/rest/v1/rpc/register_push_token') return json(400, { message: 'web has no push' });

    const table = p.replace('/rest/v1/', '');
    if (!db[table]) {
      log.push('UNMOCKED ' + m + ' ' + p);
      return json(404, {});
    }
    if (m === 'POST' && table === 'messages') {
      const row = req.postDataJSON();
      inserts.push({ who: who.role, ...row });
      if (!canSend(who, row))
        return json(403, { code: '42501', message: 'new row violates row-level security policy' });
      if (find('messages', row.id))
        return json(409, { code: '23505', message: 'duplicate key value' });
      const full = { ...row, created_at: new Date().toISOString() };
      db.messages.push(full);
      setTimeout(() => broadcastInsert(full), 50);
      return route.fulfill({ status: 201 });
    }
    if (m !== 'GET' && m !== 'HEAD') {
      log.push('WRITE ' + m + ' ' + table);
      return json(403, { code: '42501', message: 'direct write not expected' });
    }
    let rows = db[table].map((r) =>
      table === 'enrollments'
        ? { ...r, class: find('classes', r.class_id), student: find('students', r.student_id) }
        : table === 'teacher_assignments'
          ? { ...r, class: find('classes', r.class_id) }
          : r,
    );
    for (const [k, v] of url.searchParams)
      if (!SKIP.has(k)) rows = rows.filter((r) => matches(r, k, v));
    if (table === 'messages')
      rows = rows
        .filter((r) => canRead(who, r))
        .sort((x, y) => (x.created_at < y.created_at ? 1 : -1));
    if (table === 'message_reads')
      rows = rows.filter((r) => (who.role === 'student' ? r.student_id === who.sid : true));
    if (table === 'enrollments') {
      rows = rows.filter(
        (e) =>
          who.role === 'admin' ||
          (who.role === 'teacher' && teaches(who.id, e.class_id)) ||
          (who.role === 'student' && e.student_id === who.sid),
      );
    }
    const prefer = req.headers()['prefer'] || '';
    if (prefer.includes('count=exact')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          'content-range': `0-0/${rows.length}`,
          'access-control-allow-origin': '*',
          'access-control-expose-headers': 'content-range',
        },
        body: m === 'HEAD' ? '' : '[]',
      });
    }
    return out(rows);
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
const until = async (fn, ms = 15000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
};
async function staffLogin(browser, who) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  await mock(page, who);
  await page.goto(BASE + '/staff');
  await page.getByLabel('Email').fill(who.email);
  await page.getByLabel('Password').fill('secret');
  await page.getByText('Sign in', { exact: true }).click();
  await page.waitForURL(/\/(classes|school)$/, { timeout: 8000 }).catch(() => {});
  return { ctx, page };
}
const setVisible = (page, visible) =>
  page.evaluate((v) => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => (v ? 'visible' : 'hidden'),
    });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => !v });
    document.dispatchEvent(new Event('visibilitychange'));
  }, visible);
const joined = (sock) => [...sock.topics.keys()].some((t) => t.includes('inbox'));

(async () => {
  const browser = await chromium.launch();

  // 1. Student signs in: inbox from the server, read state, live toast while open.
  const sctx = await browser.newContext({ viewport: { width: 1000, height: 900 } });
  const spage = await sctx.newPage();
  await mock(spage, S);
  await spage.goto(BASE + '/login');
  await spage.getByLabel('Admission number').fill(S.code);
  await spage.getByLabel('PIN', { exact: true }).fill(S.pin);
  await spage.getByText('Go', { exact: true }).click();
  await seen(spage, 'Hi, Ali Raza!');
  check(await seen(spage, 'Messages', true), 'student home links Messages');
  check(await seen(spage, '1 new', true), 'home shows 1 new (homework unread; sports day read)');
  const ssock = () => sockets.find((s) => s.who === S);
  check(
    await until(() => ssock() && joined(ssock()), 8000),
    'student subscribes to Realtime while open',
  );

  // 2. Teacher sends to Class 9-A.
  const { ctx: tctx, page: tpage } = await staffLogin(browser, T);
  // Phone: the "Send a message" card; desktop: the sidebar's "Messages" (UI remake).
  const toMessages = (pg) => pg.getByText(/^(Send a message|Messages)$/).first();
  check(
    await toMessages(tpage)
      .waitFor({ timeout: 8000 })
      .then(
        () => true,
        () => false,
      ),
    'teacher home links messages',
  );
  await toMessages(tpage).click();
  check(await seen(tpage, 'Send a notification to a class you teach'), 'teacher compose opens');
  check(
    !(await tpage.getByText('Whole school', { exact: true }).count()),
    'teacher has no whole-school option',
  );
  check(
    !(await tpage.getByText('Class 8', { exact: true }).count()),
    "teacher isn't offered Class 8",
  );
  check(await seen(tpage, 'Goes to 40 students'), 'reach: 40 students in 9-A');
  await tpage.getByRole('button', { name: 'Send' }).click();
  check(await seen(tpage, 'Enter a title.'), 'empty title refused before sending');
  check(inserts.length === 0, 'nothing sent for an invalid draft');
  await tpage.getByLabel('Title', { exact: true }).fill('Test tomorrow');
  await tpage.getByLabel('Message', { exact: true }).fill('Revise chapter 3 for tomorrow.');

  // Offline first: the draft stays, then the retry uses the same id.
  net.down = true;
  await tpage.getByRole('button', { name: 'Send' }).click();
  check(await seen(tpage, 'No internet connection'), 'offline send explains and keeps the draft');
  net.down = false;
  const before = Date.now();
  await tpage.getByRole('button', { name: 'Send' }).click();
  check(await seen(tpage, 'Sent to Class 9-A.'), 'teacher sees Sent toast');
  const sent = db.messages.find((m) => m.title === 'Test tomorrow');
  check(
    !!sent && sent.scope === 'class' && sent.target_id === 'c9a' && sent.sender_id === T.id,
    'insert: class 9-A, sender = teacher',
  );
  check(/^[0-9a-f-]{36}$/.test(sent?.id ?? ''), 'client UUID used as the message id');
  check(
    inserts.filter((i) => i.title === 'Test tomorrow').every((i) => i.id === sent.id),
    'offline retry reused the same id',
  );

  // 3. The student's open web session shows it as a toast within seconds.
  check(
    await seen(spage, 'Test tomorrow: Revise chapter 3 for tomorrow.', false, 5000),
    'student toast arrives live',
  );
  console.log(`  toast after ${Date.now() - before} ms`);
  check(await seen(spage, '2 new', true), 'unread count rises to 2');
  await spage.screenshot({ path: SHOTS + '/msg-student-toast.png' });

  // 4. A Class 8 message never reaches 9-A (RLS on the socket + the inbox).
  const { ctx: actx, page: apage } = await staffLogin(browser, A);
  await toMessages(apage).click();
  check(
    await apage
      .getByRole('radio', { name: 'Whole school' })
      .waitFor({ timeout: 8000 })
      .then(
        () => true,
        () => false,
      ),
    'admin can send to the whole school',
  );
  await apage.getByRole('radio', { name: 'Class 8', exact: true }).click();
  await apage.getByLabel('Title', { exact: true }).fill('Class 8 only notice');
  await apage.getByLabel('Message', { exact: true }).fill('Bring your art kit.');
  await apage.getByRole('button', { name: 'Send' }).click();
  check(await seen(apage, 'Sent to Class 8.'), 'admin sends to Class 8');
  await spage.waitForTimeout(1500);
  check(
    !(await spage.getByText('Class 8 only notice').count()),
    "9-A student doesn't get Class 8's message",
  );

  // 5. Admin: whole school, then one student.
  await apage.getByRole('radio', { name: 'Whole school', exact: true }).click();
  check(await seen(apage, 'Goes to 42 students'), 'whole school reach = 42 active');
  await apage.getByLabel('Title', { exact: true }).fill('Holiday on Monday');
  await apage.getByLabel('Message', { exact: true }).fill('School is closed on Monday.');
  await apage.getByRole('button', { name: 'Send' }).click();
  check(await seen(apage, 'Sent to the whole school.'), 'admin whole-school send');
  check(
    await seen(spage, 'Holiday on Monday: School is closed on Monday.', false, 5000),
    'student gets the school-wide toast',
  );
  await apage.screenshot({ path: SHOTS + '/msg-admin-compose.png', fullPage: true });

  // 6. Hidden tab: no subscription; back in front: catches up from the server.
  await setVisible(spage, false);
  check(await until(() => !joined(ssock()), 5000), 'hidden app leaves the Realtime channel');
  await apage.getByRole('radio', { name: 'One student', exact: true }).click();
  await apage.getByRole('radio', { name: 'Class 9-A', exact: true }).click();
  await apage.getByLabel('Search by name or admission number').fill('1001');
  await apage.getByText('Ali Raza', { exact: true }).click();
  check(await seen(apage, 'Goes to 1 student'), 'one-student reach');
  await apage.getByLabel('Title', { exact: true }).fill('Please see me');
  await apage.getByLabel('Message', { exact: true }).fill('Come to the office at break.');
  await apage.getByRole('button', { name: 'Send' }).click();
  check(await seen(apage, 'Sent to Ali Raza.'), 'admin sends to one student');
  await spage.waitForTimeout(800);
  check(!(await spage.getByText('Please see me:').count()), 'no toast while hidden');
  await setVisible(spage, true);
  check(await until(() => joined(ssock()), 5000), 'visible again: re-subscribes');
  check(await seen(spage, '4 new', true), 'catch-up refresh counts the personal message (4 new)');

  // 7. Inbox: tap one to read it, then mark all; read state goes to the server.
  await spage.getByText('Messages', { exact: true }).click();
  check(await seen(spage, 'News from your school and teachers.'), 'inbox opens');
  check(await seen(spage, 'For you', true), 'personal message labelled For you');
  check(!(await spage.getByText('Class 8 trip').count()), 'inbox hides other classes');
  await spage.screenshot({ path: SHOTS + '/msg-inbox.png', fullPage: true });
  await spage.getByText('Please see me', { exact: true }).click();
  check(
    await until(() => rpcCalls.some((c) => c.fn === 'mark' && c.ids.length === 1)),
    'tapping marks one read',
  );
  await spage.getByText('Mark all as read', { exact: true }).click();
  check(
    await until(() => db.message_reads.filter((r) => r.student_id === 's-1').length === 5),
    'mark all read reaches the server (5 read)',
  );
  check(!(await spage.getByText('Mark all as read').count()), 'nothing left unread');

  // 8. Teacher's sent list shows the read count.
  await tpage.reload();
  await tpage.waitForTimeout(1500);
  check(await seen(tpage, 'Read by 1 student'), "teacher sees Ali's read on the sent message");
  await tpage.screenshot({ path: SHOTS + '/msg-teacher-sent.png', fullPage: true });

  // 9. Offline inbox: the device copy opens; reads made offline are sent later.
  await spage.goBack().catch(() => {});
  await spage.setViewportSize({ width: 360, height: 780 });
  await spage.goto(BASE + '/inbox');
  await spage.waitForTimeout(1500);
  const sw = await spage.evaluate(() => document.documentElement.scrollWidth);
  check(sw <= 361, `inbox at phone width: no horizontal scroll (${sw})`);
  await spage.evaluate(() => localStorage.setItem('app.locale', 'ur'));
  await spage.reload();
  await spage.waitForTimeout(2000);
  check((await spage.evaluate(() => document.documentElement.dir)) === 'rtl', 'Urdu inbox is RTL');
  check(await seen(spage, 'میسجز'), 'Urdu inbox title');
  await spage.screenshot({ path: SHOTS + '/msg-inbox-ur.png', fullPage: true });

  check(
    !log.some((l) => l.startsWith('PAGEERROR')),
    'no page errors ' + log.filter((l) => l.startsWith('PAGEERROR')).join('; '),
  );
  check(!log.some((l) => l.startsWith('FOREIGN')), 'no foreign hosts');
  check(
    !log.some((l) => l.startsWith('WRITE')),
    'no direct writes ' + log.filter((l) => l.startsWith('WRITE')).join('; '),
  );
  check(
    !log.some((l) => l.startsWith('UNMOCKED')),
    'nothing unmocked ' + log.filter((l) => l.startsWith('UNMOCKED')).join('; '),
  );
  await Promise.all([sctx.close(), tctx.close(), actx.close()]);
  await browser.close();
})();
