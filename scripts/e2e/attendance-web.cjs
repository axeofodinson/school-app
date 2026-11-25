// TEST_PLAN AD-2: attendance on web against a MOCKED Supabase (in-memory
// PostgREST + the db/028 RPCs written in JS; no request leaves localhost).
// RLS, record_attendance() and the triggers are checked in SQL by
// db/test/028_smoke.sql (AD-1); this checks the UI, what it sends, the
// offline queue and the states.
// Build: cd apps/mobile && EXPO_PUBLIC_SUPABASE_URL=https://fakedevproject.supabase.co EXPO_PUBLIC_SUPABASE_ANON_KEY=fake npx expo export -p web
// Serve: node scripts/e2e/serve-dist.mjs "$PWD/apps/mobile/dist" 8089
// Run:   NODE_PATH=$(npm root -g) node scripts/e2e/attendance-web.cjs <screenshot-dir>
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
};
const people = [T, A];
const handle = (code) => `s.${code}@students.school.invalid`;
// The school day is Karachi's (db/028), whatever zone this machine is in.
const karachi = (d) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
const day = (offset) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return karachi(d);
};
const iso = karachi;
const TODAY = day(0);
const NAMES = [
  'Ali Raza',
  'Bushra Khan',
  'Zain Ahmed',
  'Hira Malik',
  'Usman Tariq',
  'Sana Iqbal',
  'Bilal Shah',
  'Ayesha Noor',
];

// 40 students in 9-A (Ali is roll 1, the student who signs in), one struck off, 2 in Class 8.
const students = [];
const enrollments = [];
for (let i = 1; i <= 40; i++) {
  const id = `s-${i}`;
  students.push({
    id,
    full_name: i <= NAMES.length ? NAMES[i - 1] : `Student ${i}`,
    student_code: String(1000 + i),
  });
  enrollments.push({
    id: `e${i}`,
    student_id: id,
    class_id: 'c9a',
    year_id: 'y1',
    status: 'active',
    roll_number: i,
  });
}
students.push({ id: 's-41', full_name: 'Left Student', student_code: '1041' });
enrollments.push({
  id: 'e41',
  student_id: 's-41',
  class_id: 'c9a',
  year_id: 'y1',
  status: 'struck_off',
  roll_number: 41,
});
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

const db = {
  academic_years: [{ id: 'y1', label: '2026-27', is_current: true }],
  classes: [
    { id: 'c9a', name: 'Class 9-A', grade_level: 9 },
    { id: 'c8', name: 'Class 8', grade_level: 8 },
  ],
  teacher_assignments: [{ teacher_id: T.id, class_id: 'c9a', subject_id: null, year_id: 'y1' }],
  students,
  enrollments,
  // Ali: absent 5 days ago, late 4 days ago (this month, unless it's early in the month).
  attendance: [
    {
      id: 'att-old-1',
      enrollment_id: 'e1',
      on_date: day(-5),
      status: 'absent',
      edit_count: 0,
      marked_by: T.id,
    },
    {
      id: 'att-old-2',
      enrollment_id: 'e1',
      on_date: day(-4),
      status: 'late',
      edit_count: 0,
      marked_by: T.id,
    },
    {
      id: 'att-old-3',
      enrollment_id: 'e41',
      on_date: day(-30),
      status: 'present',
      edit_count: 0,
      marked_by: T.id,
    },
  ],
  attendance_edits: [],
  assessments: [],
  assessment_questions: [],
  submissions: [],
  // The student layout loads the inbox (prompt 15).
  messages: [],
  message_reads: [],
};
const rpcCalls = [];
const writes = [];
const net = { down: false };
let seq = 0;

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
function withEmbeds(table, row) {
  if (table === 'teacher_assignments') return { ...row, class: find('classes', row.class_id) };
  if (table === 'enrollments')
    return {
      ...row,
      class: find('classes', row.class_id),
      student: find('students', row.student_id),
    };
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
const SKIP = new Set(['select', 'order', 'limit', 'offset']);
const teaches = (uid, classId) =>
  db.teacher_assignments.some((a) => a.teacher_id === uid && a.class_id === classId);

// record_attendance() as db/028 defines it (the SQL itself is tested in AD-1).
function recordAttendance(who, a) {
  if (!(who.role === 'admin' || (who.role === 'teacher' && teaches(who.id, a.p_class_id))))
    return { error: 'not_authorized' };
  if (!a.p_on_date) return { error: 'date_required' };
  if (a.p_on_date > TODAY) return { error: 'date_in_future' };
  if (!Array.isArray(a.p_marks) || !a.p_marks.length) return { error: 'marks_required' };
  let taken = a.p_taken_at ? iso(new Date(a.p_taken_at)) : TODAY;
  if (taken > TODAY) taken = TODAY;
  if (taken < a.p_on_date) taken = a.p_on_date;
  const reason = (a.p_reason || '').trim();
  const seen = new Set();
  for (const m of a.p_marks) {
    if (!['present', 'absent', 'late', 'leave'].includes(m.status)) return { error: 'bad_mark' };
    if (seen.has(m.enrollment_id)) return { error: 'duplicate_enrollment' };
    seen.add(m.enrollment_id);
    const e = find('enrollments', m.enrollment_id);
    if (!e || e.class_id !== a.p_class_id) return { error: 'enrollment_class_mismatch' };
    const old = db.attendance.find(
      (x) => x.enrollment_id === m.enrollment_id && x.on_date === a.p_on_date,
    );
    if (!old && e.status !== 'active') return { error: 'enrollment_not_active' };
    if (old && old.status !== m.status && a.p_on_date < taken && !reason)
      return { error: 'reason_required' };
  }
  const out = { inserted: 0, changed: 0, unchanged: 0 };
  for (const m of a.p_marks) {
    const old = db.attendance.find(
      (x) => x.enrollment_id === m.enrollment_id && x.on_date === a.p_on_date,
    );
    if (!old) {
      db.attendance.push({
        id: 'att-' + ++seq,
        enrollment_id: m.enrollment_id,
        on_date: a.p_on_date,
        status: m.status,
        edit_count: 0,
        marked_by: who.id,
      });
      out.inserted++;
    } else if (old.status !== m.status) {
      db.attendance_edits.push({
        id: 'ae-' + ++seq,
        attendance_id: old.id,
        prev_status: old.status,
        new_status: m.status,
        reason: reason || 'Changed the same day',
        edited_by: who.id,
        edited_at: new Date(Date.now() + seq * 1000).toISOString(),
      });
      old.status = m.status;
      old.edit_count += 1;
      out.changed++;
    } else out.unchanged++;
  }
  return { row: out };
}
const visibleEnrollments = (who) =>
  db.enrollments.filter(
    (e) =>
      who.role === 'admin' ||
      (who.role === 'teacher' && teaches(who.id, e.class_id)) ||
      (who.role === 'student' && e.student_id === 's-1'),
  );
function daySummary(who, a) {
  const rows = [];
  for (const c of [...db.classes].sort((x, y) => x.grade_level - y.grade_level)) {
    const es = visibleEnrollments(who).filter(
      (e) => e.class_id === c.id && e.year_id === a.p_year_id && e.status === 'active',
    );
    if (!es.length) continue;
    const marks = es
      .map((e) => db.attendance.find((x) => x.enrollment_id === e.id && x.on_date === a.p_on_date))
      .filter(Boolean);
    const n = (s) => marks.filter((m) => m.status === s).length;
    rows.push({
      class_id: c.id,
      class_name: c.name,
      grade_level: c.grade_level,
      enrolled: es.length,
      marked: marks.length,
      present: n('present'),
      absent: n('absent'),
      late: n('late'),
      on_leave: n('leave'),
    });
  }
  return rows;
}
function studentSummary(who, a) {
  return visibleEnrollments(who)
    .filter((e) => e.class_id === a.p_class_id && e.year_id === a.p_year_id)
    .map((e) => {
      const ms = db.attendance.filter(
        (x) => x.enrollment_id === e.id && x.on_date >= a.p_from && x.on_date <= a.p_to,
      );
      const n = (s) => ms.filter((m) => m.status === s).length;
      return {
        enrollment_id: e.id,
        present: n('present'),
        absent: n('absent'),
        late: n('late'),
        on_leave: n('leave'),
      };
    });
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
    if (p === '/rest/v1/rpc/record_attendance') {
      const args = req.postDataJSON();
      rpcCalls.push({ who: who.role, ...args });
      if (who.role === 'student') return json(400, { code: 'P0001', message: 'not_authorized' });
      const r = recordAttendance(who, args);
      return r.error ? json(400, { code: 'P0001', message: r.error }) : json(200, r.row);
    }
    if (p === '/rest/v1/rpc/attendance_day_summary')
      return json(200, daySummary(who, req.postDataJSON()));
    if (p === '/rest/v1/rpc/attendance_student_summary')
      return json(200, studentSummary(who, req.postDataJSON()));

    const table = p.replace('/rest/v1/', '');
    if (!db[table]) {
      log.push('UNMOCKED ' + m + ' ' + p);
      return json(404, {});
    }
    if (m !== 'GET') {
      writes.push({ m, table });
      return json(403, { code: '42501', message: 'direct write not expected' });
    }
    let rows = db[table].map((r) => withEmbeds(table, r));
    for (const [k, v] of url.searchParams)
      if (!SKIP.has(k)) rows = rows.filter((r) => matches(r, k, v));
    if (table === 'enrollments' || table === 'attendance') {
      const vis = new Set(visibleEnrollments(who).map((e) => e.id));
      rows = rows.filter((r) => vis.has(table === 'enrollments' ? r.id : r.enrollment_id));
    }
    if (table === 'attendance_edits' && who.role === 'student') rows = [];
    if (table === 'attendance' && (url.searchParams.get('order') || '').startsWith('on_date.desc'))
      rows.sort((x, y) => (x.on_date < y.on_date ? 1 : -1));
    if (table === 'attendance_edits') rows.sort((x, y) => (x.edited_at < y.edited_at ? 1 : -1));
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
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
};
async function staffLogin(browser, who, viewport = { width: 1366, height: 768 }) {
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
async function go(page, p) {
  await page.goto(BASE + p);
  await page.waitForTimeout(1500);
  if (!page.url().includes(p)) await page.goto(BASE + p);
}
const radio = (page, name, status) =>
  page.getByRole('radio', { name: `${name}: ${status}`, exact: true });
const mark = (e, d) => db.attendance.find((x) => x.enrollment_id === e && x.on_date === d);

(async () => {
  const browser = await chromium.launch();

  // 1. Teacher: today's roster, everyone present, mark the exceptions, one save.
  {
    const { ctx, page } = await staffLogin(browser, T);
    check(await seen(page, 'Attendance', true), 'teacher home links Attendance');
    check(await seen(page, 'Attendance summary', true), 'teacher home links the summary');
    await page.getByText('Attendance', { exact: true }).first().click();
    check(await seen(page, 'Student 40', true), 'roster lists all 40 students');
    check(await seen(page, '40 present · 0 absent · 0 late · 0 leave'), 'everyone starts present');
    check(await seen(page, 'Not taken yet for this day'), 'day shows not taken');
    check(
      !(await page.getByText('Left Student').count()),
      'struck-off student not on the marking roster',
    );
    check(await seen(page, 'Today', true), 'today is the default day');

    const t0 = Date.now();
    await radio(page, 'Ali Raza', 'Absent').click();
    await radio(page, 'Bushra Khan', 'Absent').click();
    await radio(page, 'Student 17', 'Absent').click();
    await radio(page, 'Zain Ahmed', 'Late').click();
    await radio(page, 'Student 33', 'Leave').click();
    await page.getByRole('button', { name: 'Save attendance' }).click();
    const saved = await seen(page, `Attendance saved for ${TODAY}.`);
    const ms = Date.now() - t0;
    check(saved, 'save confirms');
    check(ms < 30000, `marking 40 (5 exceptions) + save took ${(ms / 1000).toFixed(1)} s (< 30 s)`);
    console.log('INFO marking time ms', ms);
    check(
      rpcCalls.length === 1 && rpcCalls[0].p_marks.length === 40,
      'one record_attendance call with all 40 marks',
    );
    const c0 = rpcCalls[0];
    check(
      c0.p_class_id === 'c9a' &&
        c0.p_on_date === TODAY &&
        !c0.p_reason &&
        typeof c0.p_taken_at === 'string',
      'call carries class, day, taken_at and no reason',
    );
    check(
      mark('e1', TODAY)?.status === 'absent' &&
        mark('e3', TODAY)?.status === 'late' &&
        mark('e33', TODAY)?.status === 'leave' &&
        mark('e40', TODAY)?.status === 'present',
      'statuses stored as marked',
    );
    check(writes.length === 0, 'no direct writes to tables');
    check(await seen(page, '35 present · 3 absent · 1 late · 1 leave'), 'counts after save');
    check(await seen(page, 'Saved for this day'), 'day shows saved');
    await page.screenshot({ path: SHOTS + '/att-marked.png', fullPage: true });

    // 2. Same day: Ali turns up. No reason asked; history shows the change.
    await radio(page, 'Ali Raza', 'Present').click();
    check(await seen(page, 'Changes not saved yet'), 'unsaved change flagged');
    check(
      !(await page.getByLabel('Reason for the change').count()),
      'no reason asked on the same day',
    );
    await page.getByRole('button', { name: 'Save attendance' }).click();
    check(await until(() => mark('e1', TODAY)?.status === 'present'), 'same-day change saved');
    check(await seen(page, 'Changed once', true), 'row shows it was changed');
    await page.getByRole('button', { name: 'Changed once' }).click();
    check(await seen(page, 'Absent → Present'), 'history shows old → new');
    check(await seen(page, 'Changed the same day'), 'history shows the same-day reason in words');

    // 3. A past day: first marking needs no reason, changing it does.
    await page.getByRole('button', { name: 'Previous day' }).click();
    check(await seen(page, 'This day is over.'), 'past day says changes need a reason');
    await radio(page, 'Hira Malik', 'Absent').click();
    check(
      !(await page.getByLabel('Reason for the change').count()),
      'first marking of a past day: no reason',
    );
    const before = rpcCalls.length;
    await page.getByRole('button', { name: 'Save attendance' }).click();
    check(
      await until(() => mark('e4', day(-1))?.status === 'absent'),
      'past day first marking saved',
    );
    await page.waitForTimeout(800);
    await radio(page, 'Hira Malik', 'Present').click();
    check(
      await seen(page, 'Reason for the change'),
      'changing a saved past mark asks for a reason',
    );
    const n1 = rpcCalls.length;
    await page.getByRole('button', { name: 'Save attendance' }).click();
    check(
      await seen(page, "Write why you're changing a day that is over."),
      'save without a reason is stopped',
    );
    check(rpcCalls.length === n1, 'nothing sent without the reason');
    await page.getByLabel('Reason for the change').fill('Register shows present');
    await page.getByRole('button', { name: 'Save attendance' }).click();
    check(
      await until(() => mark('e4', day(-1))?.status === 'present'),
      'past change with a reason saved',
    );
    check(
      db.attendance_edits.some(
        (e) => e.reason === 'Register shows present' && e.prev_status === 'absent',
      ),
      'server history keeps the reason',
    );
    check(rpcCalls.length === before + 2, 'two calls for the past day');
    await page.getByRole('button', { name: 'Next day' }).click();
    await page.waitForTimeout(500);
    check(await page.getByRole('button', { name: 'Next day' }).isDisabled(), "can't go past today");

    // 4. Offline: mark, save → queued; close the tab; reopen offline; reconnect → sends once.
    net.down = true;
    await radio(page, 'Usman Tariq', 'Late').click();
    await page.getByRole('button', { name: 'Save attendance' }).click();
    check(
      await seen(page, "Saved on this device. It will send when you're back online."),
      'offline save is queued',
    );
    check(mark('e5', TODAY)?.status === 'present', 'nothing reached the server yet');
    await page.screenshot({ path: SHOTS + '/att-queued.png', fullPage: true });
    await page.close();
    let p2 = await ctx.newPage();
    await mock(p2, T);
    await p2.goto(BASE + '/attendance');
    check(
      await seen(p2, 'No connection. This is the class list saved on this device'),
      'reopen offline: roster from the device copy',
    );
    check(
      await seen(p2, "Saved on this device. It will send when you're back online."),
      'reopen offline: day still waiting',
    );
    // The waiting day's marks are what the screen shows: Zain + Usman late, Bushra + Student 17 absent, Student 33 on leave, Ali back to present.
    check(
      await seen(p2, '35 present · 2 absent · 2 late · 1 leave'),
      'queued marks shown (counts from the waiting day)',
    );
    await p2.screenshot({ path: SHOTS + '/att-reopened-offline.png', fullPage: false });
    const sent = rpcCalls.length;
    net.down = false;
    await p2.evaluate(() => window.dispatchEvent(new Event('online')));
    check(await until(() => mark('e5', TODAY)?.status === 'late'), 'reconnect → the day lands');
    await p2.waitForTimeout(2500);
    check(rpcCalls.length === sent + 1, 'exactly one call after reconnecting');
    check(
      !(await p2.getByText("It will send when you're back online").count()),
      'waiting note gone',
    );

    // 5. Offline edit of a past day from the device copy: the server wants a reason → shown.
    await p2.getByRole('button', { name: 'Previous day' }).click();
    await p2.waitForTimeout(800);
    net.down = true;
    await p2.reload();
    await p2.waitForTimeout(1500);
    await p2.getByRole('button', { name: 'Previous day' }).click();
    check(await seen(p2, 'No connection.'), 'past day offline: device copy');
    await radio(p2, 'Hira Malik', 'Absent').click();
    await p2.getByRole('button', { name: 'Save attendance' }).click();
    check(
      await seen(p2, "It will send when you're back online"),
      'queued without a reason (saved marks unknown offline)',
    );
    net.down = false;
    await p2.evaluate(() => window.dispatchEvent(new Event('online')));
    const refused = await seen(
      p2,
      'Not saved: this day is over, so a reason is needed.',
      false,
      15000,
    );
    if (!refused)
      console.log(
        'DEBUG',
        (await p2.evaluate(() => document.body.innerText)).slice(0, 700).replace(/\n/g, ' | '),
      );
    check(refused, 'server refusal explained');
    check(mark('e4', day(-1))?.status === 'present', 'refused day not written');
    check(await seen(p2, 'Not synced yet'), 'sync pill shows the refusal');
    await p2.screenshot({ path: SHOTS + '/att-refused.png', fullPage: true });
    await p2.getByRole('button', { name: 'Reload the list' }).click();
    check(await seen(p2, 'Reason for the change'), 'online again: the reason field appears');
    await p2.getByLabel('Reason for the change').fill('Was absent after all');
    await p2.getByRole('button', { name: 'Save attendance' }).click();
    check(await until(() => mark('e4', day(-1))?.status === 'absent'), 'saved with the reason');

    // 6. Phone width: no horizontal scroll; Urdu is RTL.
    await p2.setViewportSize({ width: 360, height: 780 });
    await go(p2, '/attendance');
    await seen(p2, 'Student 40', true);
    const sw = await p2.evaluate(() => document.documentElement.scrollWidth);
    check(sw <= 361, `phone width: no horizontal scroll (${sw})`);
    await p2.screenshot({ path: SHOTS + '/att-phone.png', fullPage: false });
    await ctx.close();
  }

  // 7. Admin: summaries.
  {
    const { ctx, page } = await staffLogin(browser, A);
    check(await seen(page, 'Attendance summary', true), 'admin home links the summary');
    await go(page, '/attendance-summary');
    check(await seen(page, 'Class 9-A', true), 'day summary lists 9-A');
    check(await seen(page, '40 of 40 marked'), '9-A shows 40 of 40 marked');
    check(await seen(page, 'Not taken', true), 'Class 8 shows not taken');
    check(await seen(page, '1 of 2 classes taken'), 'school total');
    await page.screenshot({ path: SHOTS + '/att-summary-day.png', fullPage: true });
    await page.getByRole('radio', { name: 'By class' }).click();
    check(await seen(page, 'Left the class'), 'class view keeps the struck-off student');
    check(await seen(page, 'Ali Raza', true), 'class view lists students');
    await page.screenshot({ path: SHOTS + '/att-summary-class.png', fullPage: true });
    // Admin can mark any class.
    await go(page, '/attendance');
    await page.getByRole('radio', { name: 'Class 8', exact: true }).click();
    check(await seen(page, 'Class8 42', true), 'admin marks Class 8');
    await page.getByRole('button', { name: 'Save attendance' }).click();
    check(await until(() => !!mark('e42', TODAY)), 'admin save lands');
    await ctx.close();
  }

  // 8. Student: calendar + percentage, Urdu RTL.
  {
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 } });
    const page = await ctx.newPage();
    await mock(page, S);
    await page.goto(BASE + '/login');
    await page.getByLabel('Admission number').fill(S.code);
    await page.getByLabel('PIN', { exact: true }).fill(S.pin);
    await page.getByText('Go', { exact: true }).click();
    await seen(page, 'Hi, Ali Raza!');
    check(await seen(page, 'My attendance', true), 'student home links My attendance');
    await page.getByText('My attendance', { exact: true }).click();
    check(await seen(page, 'this month'), 'month percentage shown');
    check(await seen(page, 'this year'), 'year percentage shown');
    // Ali: absent (-5), late (-4), present yesterday (whole class saved) and today → 3 of 4 at school = 75 %.
    check(
      await seen(page, '75% this year'),
      'year rate counts late as at school (3 of 4 counted days)',
    );
    const label = await page
      .getByLabel(new RegExp(`^${Number(TODAY.slice(8))} [A-Za-z]+: Present$`))
      .count();
    check(label === 1, "today's cell reads Present for screen readers");
    check(
      !(await page.getByText('Changed the same day').count()),
      'student never sees the history',
    );
    await page.screenshot({ path: SHOTS + '/att-student.png', fullPage: true });
    await page.setViewportSize({ width: 360, height: 780 });
    await page.waitForTimeout(500);
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    check(sw <= 361, `student phone width: no horizontal scroll (${sw})`);
    await page.evaluate(() => localStorage.setItem('app.locale', 'ur'));
    await page.reload();
    await page.waitForTimeout(2000);
    check((await page.evaluate(() => document.documentElement.dir)) === 'rtl', 'Urdu is RTL');
    check(await seen(page, 'میری حاضری'), 'Urdu title');
    await page.screenshot({ path: SHOTS + '/att-student-ur.png', fullPage: true });
    await ctx.close();
  }

  check(
    !log.some((l) => l.startsWith('PAGEERROR')),
    'no page errors ' + log.filter((l) => l.startsWith('PAGEERROR')).join('; '),
  );
  check(!log.some((l) => l.startsWith('FOREIGN')), 'no foreign hosts');
  check(
    !log.some((l) => l.startsWith('UNMOCKED')),
    'nothing unmocked ' + log.filter((l) => l.startsWith('UNMOCKED')).join('; '),
  );
  await browser.close();
})();
