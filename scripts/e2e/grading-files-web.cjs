// TEST_PLAN GR-2: file worksheets + grading + overdue + report card on web against
// a MOCKED Supabase (in-memory PostgREST + Storage; no request leaves localhost).
// RLS, record_grade() and the db/026 guard are checked in SQL by
// db/test/026_smoke.sql (GR-1); this checks the UI, what it sends and the states.
// Build: cd apps/mobile && EXPO_PUBLIC_SUPABASE_URL=https://fakedevproject.supabase.co EXPO_PUBLIC_SUPABASE_ANON_KEY=fake npx expo export -p web
// Serve: node scripts/e2e/serve-dist.mjs "$PWD/apps/mobile/dist" 8089
// Run:   NODE_PATH=$(npm root -g) node scripts/e2e/grading-files-web.cjs <screenshot-dir>
const fs = require('node:fs');
const path = require('node:path');
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
const S = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  code: '1001',
  pin: '1234',
  name: 'Ali Raza',
  role: 'student',
};
const people = [T, A];
const handle = (code) => `s.${code}@students.school.invalid`;

const day = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const db = {
  academic_years: [{ id: 'y1', label: '2026-27', is_current: true }],
  classes: [
    { id: 'c9a', name: 'Class 9-A', grade_level: 9 },
    { id: 'c8', name: 'Class 8', grade_level: 8 },
  ],
  subjects: [
    { id: 's-math', class_id: 'c9a', name: 'Mathematics', sort_order: 1 },
    { id: 's-eng', class_id: 'c9a', name: 'English', sort_order: 2 },
  ],
  chapters: [{ id: 'ch1', subject_id: 's-math', title: 'Sets', sort_order: 1 }],
  teacher_assignments: [{ teacher_id: T.id, class_id: 'c9a', subject_id: null, year_id: 'y1' }],
  students: [
    { id: 's-a', full_name: 'Ali Raza', student_code: '1001' },
    { id: 's-b', full_name: 'Bushra Khan', student_code: '1002' },
    { id: 's-c', full_name: 'Zain Ahmed', student_code: '1003' },
  ],
  enrollments: [
    {
      id: 'e1',
      student_id: 's-a',
      class_id: 'c9a',
      year_id: 'y1',
      status: 'active',
      roll_number: 1,
    },
    {
      id: 'e2',
      student_id: 's-b',
      class_id: 'c9a',
      year_id: 'y1',
      status: 'active',
      roll_number: 2,
    },
    {
      id: 'e3',
      student_id: 's-c',
      class_id: 'c9a',
      year_id: 'y1',
      status: 'active',
      roll_number: null,
    },
  ],
  questions: [
    {
      id: 'q1',
      chapter_id: 'ch1',
      type: 'mcq',
      cognitive_level: 'recall',
      body: { stem: 'Which set is empty?' },
      answer: { correct: 'B' },
      created_by: T.id,
      created_at: '2026-01-01',
    },
    {
      id: 'q2',
      chapter_id: 'ch1',
      type: 'short_text',
      cognitive_level: 'apply',
      body: { stem: 'Union?' },
      answer: { accept: ['x'] },
      created_by: T.id,
      created_at: '2026-01-01',
    },
  ],
  assessments: [
    // A published question test (out of 10, weight 30) the teacher grades.
    {
      id: 'a-test',
      year_id: 'y1',
      class_id: 'c9a',
      subject_id: 's-math',
      title: 'Sets test',
      type: 'test',
      status: 'published',
      weightage: 30,
      total_marks: 10,
      scheduled_on: day(-2),
      created_at: '2026-02-01',
    },
    // Homework 12 days past due: overdue for Bushra and Zain.
    {
      id: 'a-hw',
      year_id: 'y1',
      class_id: 'c9a',
      subject_id: 's-eng',
      title: 'Essay homework',
      type: 'assignment',
      status: 'published',
      weightage: 10,
      total_marks: 20,
      scheduled_on: day(-12),
      created_at: '2026-01-15',
    },
    {
      id: 'a-draft',
      year_id: 'y1',
      class_id: 'c9a',
      subject_id: 's-math',
      title: 'Draft quiz',
      type: 'quiz',
      status: 'draft',
      weightage: 0,
      total_marks: null,
      scheduled_on: null,
      created_at: '2026-01-10',
    },
  ],
  assessment_questions: [
    { assessment_id: 'a-test', question_id: 'q1', marks: 4, sort_order: 0 },
    { assessment_id: 'a-test', question_id: 'q2', marks: 6, sort_order: 1 },
  ],
  submissions: [
    // Ali sent the test (not marked yet) and the homework (marked 15/20).
    {
      id: 'sub-1',
      enrollment_id: 'e1',
      assessment_id: 'a-test',
      score: null,
      responses: {},
      submitted_at: '2026-02-02T09:00:00Z',
      graded_at: null,
      edit_count: 0,
      last_edited_at: null,
    },
    {
      id: 'sub-2',
      enrollment_id: 'e1',
      assessment_id: 'a-hw',
      score: '15.00',
      responses: {},
      submitted_at: day(-13) + 'T09:00:00Z',
      graded_at: '2026-02-03',
      edit_count: 0,
      last_edited_at: null,
    },
  ],
  submission_grade_edits: [],
  // The student layout loads the inbox (prompt 15).
  messages: [],
  message_reads: [],
};
const storage = new Map(); // path -> { body: Buffer, type }
const rpcCalls = [];
const levelCalls = []; // student_paper_levels() calls from the report card (db/018)
const writes = [];
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

function withEmbeds(table, row) {
  const find = (t, id) => db[t].find((r) => r.id === id) ?? null;
  switch (table) {
    case 'teacher_assignments':
      return { ...row, class: find('classes', row.class_id) };
    case 'enrollments':
      return {
        ...row,
        class: find('classes', row.class_id),
        student: find('students', row.student_id),
      };
    case 'assessment_questions':
      return { ...row, question: find('questions', row.question_id) };
    case 'assessments':
      return {
        ...row,
        class: find('classes', row.class_id),
        subject: find('subjects', row.subject_id),
        items: db.assessment_questions.filter((i) => i.assessment_id === row.id),
      };
    default:
      return row;
  }
}
function matches(row, key, cond) {
  const val = key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), row);
  let [op, ...rest] = cond.split('.');
  let neg = false;
  if (op === 'not') {
    neg = true;
    [op, ...rest] = rest;
  }
  const arg = rest.join('.');
  let r;
  if (op === 'eq') r = String(val) === arg;
  else if (op === 'neq') r = String(val) !== arg;
  else if (op === 'lte') r = val != null && String(val) <= arg;
  else if (op === 'is') r = arg === 'null' ? val == null : String(val) === arg;
  else if (op === 'in')
    r = arg
      .replace(/^\(|\)$/g, '')
      .split(',')
      .map((s) => s.replace(/"/g, ''))
      .includes(String(val));
  else throw new Error('op ' + op);
  return neg ? !r : r;
}
const SKIP = new Set(['select', 'order', 'limit', 'on_conflict', 'offset']);
const teaches = (uid, classId) =>
  db.teacher_assignments.some((a) => a.teacher_id === uid && a.class_id === classId);

// record_grade() as db/013 defines it (the SQL itself is tested in GR-1).
function recordGrade(who, a) {
  const as = db.assessments.find((x) => x.id === a.p_assessment_id);
  if (!as) return { error: 'assessment_not_found' };
  if (who.role !== 'admin' && !teaches(who.id, as.class_id)) return { error: 'not_authorized' };
  const e = db.enrollments.find((x) => x.id === a.p_enrollment_id && x.class_id === as.class_id);
  if (!e) return { error: 'enrollment_class_mismatch' };
  if (a.p_score == null) return { error: 'score_required' };
  if (a.p_score < 0 || (as.total_marks != null && a.p_score > as.total_marks))
    return { error: 'score_out_of_range' };
  let sub = db.submissions.find((x) => x.enrollment_id === e.id && x.assessment_id === as.id);
  const reason = (a.p_reason || '').trim();
  const edit = (prev) =>
    db.submission_grade_edits.push({
      id: 'ge-' + ++seq,
      submission_id: sub.id,
      prev_score: prev,
      new_score: a.p_score,
      reason: reason || 'Initial grade',
      edited_by: who.id,
      edited_at: new Date(Date.now() + seq * 1000).toISOString(),
    });
  if (!sub) {
    sub = {
      id: 'sub-' + ++seq,
      enrollment_id: e.id,
      assessment_id: as.id,
      score: a.p_score,
      responses: null,
      submitted_at: null,
      graded_at: new Date().toISOString(),
      edit_count: 0,
      last_edited_at: null,
    };
    db.submissions.push(sub);
    edit(null);
    return { row: sub };
  }
  if (sub.score == null) {
    sub.score = a.p_score;
    edit(null);
    return { row: sub };
  }
  if (Number(sub.score) === a.p_score) return { row: sub };
  if (!reason) return { error: 'reason_required' };
  edit(Number(sub.score));
  sub.score = a.p_score;
  sub.edit_count += 1;
  sub.last_edited_at = new Date().toISOString();
  return { row: sub };
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
        return out([{ role: 'student', full_name: S.name, student_id: 's-a' }]);
      return out([{ role: who.role, full_name: who.name, student_id: null }]);
    }
    if (p === '/rest/v1/rpc/student_paper_levels') {
      // Like db/018: marks + thinking level per question, no bodies or answers.
      const { p_assessment_ids: ids } = req.postDataJSON();
      levelCalls.push(ids);
      const rows = db.assessment_questions
        .filter((i) => ids.includes(i.assessment_id))
        .map((i) => ({
          assessment_id: i.assessment_id,
          marks: i.marks,
          cognitive_level:
            db.questions.find((q) => q.id === i.question_id)?.cognitive_level ?? 'recall',
        }));
      return json(200, rows);
    }
    if (p === '/rest/v1/rpc/record_grade') {
      const args = req.postDataJSON();
      rpcCalls.push(args);
      const r = recordGrade(who, args);
      return r.error ? json(400, { code: 'P0001', message: r.error }) : json(200, r.row);
    }
    // Storage: upload, sign, fetch.
    if (p.startsWith('/storage/v1/object/sign/assessment-files/') && m === 'POST') {
      const key = decodeURIComponent(p.replace('/storage/v1/object/sign/assessment-files/', ''));
      if (!storage.has(key))
        return json(400, { statusCode: '404', error: 'not_found', message: 'Object not found' });
      return json(200, {
        signedURL: `/object/sign/assessment-files/${key}?token=t`,
      });
    }
    if (p.startsWith('/storage/v1/object/assessment-files/') && m === 'POST') {
      const key = decodeURIComponent(p.replace('/storage/v1/object/assessment-files/', ''));
      const as = db.assessments.find((x) => x.id === key.split('/')[0]);
      if (!as || (who.role === 'teacher' && !teaches(who.id, as.class_id)))
        return json(403, {
          statusCode: '403',
          error: 'Unauthorized',
          message: 'new row violates row-level security policy',
        });
      storage.set(key, {
        body: req.postDataBuffer() ?? Buffer.alloc(0),
        type: req.headers()['content-type'],
      });
      writes.push({ m: 'UPLOAD', key, type: req.headers()['content-type'] });
      return json(200, { Key: 'assessment-files/' + key, Id: 'obj-' + ++seq });
    }
    if (p.startsWith('/storage/v1/object/sign/') && m === 'GET') {
      const key = decodeURIComponent(p.replace('/storage/v1/object/sign/assessment-files/', ''));
      const f = storage.get(key);
      return f
        ? route.fulfill({ status: 200, contentType: f.type, body: f.body })
        : route.fulfill({ status: 404 });
    }

    const table = p.replace('/rest/v1/', '');
    if (!db[table]) {
      log.push('UNMOCKED ' + m + ' ' + p);
      return json(404, {});
    }
    if (m === 'GET') {
      let rows = db[table].map((r) => withEmbeds(table, r));
      for (const [k, v] of url.searchParams)
        if (!SKIP.has(k)) rows = rows.filter((r) => matches(r, k, v));
      // Student RLS, roughly: own enrollment, own submissions, no grade history.
      if (who.role === 'student') {
        if (table === 'submission_grade_edits') rows = [];
        if (table === 'enrollments') rows = rows.filter((r) => r.student_id === 's-a');
        if (table === 'submissions') rows = rows.filter((r) => r.enrollment_id === 'e1');
        if (table === 'assessments') rows = rows.filter((r) => r.status !== 'draft');
      }
      return out(rows);
    }
    const body = req.postData() ? req.postDataJSON() : null;
    writes.push({ m, table, body, q: url.search });
    if (table === 'submissions' && m !== 'POST') {
      return json(403, { code: '42501', message: 'grade_write_via_record_grade' }); // db/026
    }
    if (m === 'POST') {
      const list = Array.isArray(body) ? body : [body];
      const upsert = url.searchParams.get('on_conflict');
      const saved = list.map((r) => {
        if (upsert) {
          const keys = upsert.split(',');
          const prev = db[table].find((x) => keys.every((k) => x[k] === r[k]));
          if (prev) return Object.assign(prev, r);
        }
        const row = {
          id: `${table}-${++seq}`,
          created_at: new Date(Date.now() + seq).toISOString(),
          ...r,
        };
        db[table].push(row);
        return row;
      });
      return out(saved.map((r) => withEmbeds(table, r)));
    }
    if (m === 'PATCH') {
      let rows = db[table];
      for (const [k, v] of url.searchParams)
        if (!SKIP.has(k)) rows = rows.filter((r) => matches(r, k, v));
      rows.forEach((r) => Object.assign(r, body));
      return out(rows.map((r) => withEmbeds(table, r)));
    }
    if (m === 'DELETE') return route.fulfill({ status: 204 });
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
const check = (cond, msg) => {
  console.log((cond ? 'PASS ' : 'FAIL ') + msg);
  if (!cond) process.exitCode = 1;
};
async function staffLogin(browser, who, viewport = { width: 1280, height: 900 }) {
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
async function studentLogin(browser, viewport = { width: 1000, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  await mock(page, S);
  await page.goto(BASE + '/login');
  await page.getByLabel('Admission number').fill(S.code);
  await page.getByLabel('PIN', { exact: true }).fill(S.pin);
  await page.getByText('Go', { exact: true }).click();
  await page
    .getByText('Hi, Ali Raza!')
    .first()
    .waitFor({ timeout: 8000 })
    .catch(() => {});
  return { ctx, page };
}
async function go(page, p) {
  await page.goto(BASE + p);
  await page.waitForTimeout(1500);
  if (!page.url().endsWith(p)) await page.goto(BASE + p);
}

const MD =
  '# Worksheet 3\n\nAnswer **all** questions.\n\n1. Add 7 + 5\n2. Write the set of vowels\n\n[bad link](javascript:alert(1))';

(async () => {
  const browser = await chromium.launch();
  const tmp = fs.mkdtempSync(path.join(SHOTS, 'files-'));
  const mdFile = path.join(tmp, 'worksheet-3.md');
  fs.writeFileSync(mdFile, MD);
  const exeFile = path.join(tmp, 'virus.exe');
  fs.writeFileSync(exeFile, 'MZ');
  const bigFile = path.join(tmp, 'huge.pdf');
  fs.writeFileSync(bigFile, Buffer.alloc(10 * 1024 * 1024 + 1));

  // 1. Teacher builds a file worksheet: type checks, publish needs the file, upload, publish.
  {
    const { ctx, page } = await staffLogin(browser, T);
    check(await seen(page, 'Grades', true), 'teacher home links Grades');
    check(await seen(page, 'Overdue assignments', true), 'teacher home links Overdue');
    await go(page, '/assessments/new');
    await page.getByLabel('Title').fill('Worksheet 3');
    await page.getByRole('radio', { name: 'File' }).click();
    check(
      await seen(page, '2. Class, subject and file'),
      'file type swaps questions for the file card',
    );
    check(
      !(await page.getByText('2. Choose questions').count()),
      'no question picker for a worksheet',
    );
    await page.getByText('Publish', { exact: true }).click();
    check(
      await seen(page, 'Choose a file before publishing this worksheet.'),
      'publish without a file refused',
    );
    check(!writes.some((w) => w.table === 'assessments'), 'nothing written when refused');

    const chooser = async (file) => {
      const [fc] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.getByText('Choose file', { exact: true }).first().click(),
      ]);
      await fc.setFiles(file);
    };
    await chooser(exeFile);
    check(await seen(page, "That kind of file can't be used"), '.exe refused before upload');
    await chooser(bigFile);
    check(await seen(page, 'bigger than 10 MB'), '> 10 MB refused before upload');
    await chooser(mdFile);
    check(await seen(page, 'Selected: worksheet-3.md'), 'picked file shown');
    await page.getByLabel('Total marks (optional)').fill('2.5');
    await page.getByText('Publish', { exact: true }).click();
    check(await seen(page, 'Total marks must be a whole number.'), 'bad total marks refused');
    await page.getByLabel('Total marks (optional)').fill('20');
    await page.getByText('Publish', { exact: true }).click();
    await page.waitForURL(/\/assessments\/assessments-\d+$/, { timeout: 8000 }).catch(() => {});
    const ws = db.assessments.find((a) => a.title === 'Worksheet 3');
    check(
      ws && ws.type === 'file' && ws.total_marks === 20 && ws.class_id === 'c9a',
      'worksheet row: type file, 20 marks, class 9-A',
    );
    const up = writes.find((w) => w.m === 'UPLOAD');
    check(
      up &&
        new RegExp(`^${ws?.id}/[0-9a-f-]{36}\\.md$`).test(up.key) &&
        up.type === 'text/markdown',
      'uploaded to {assessment_id}/{uuid}.md as text/markdown',
    );
    check(
      ws &&
        ws.file_path === up?.key &&
        ws.file_name === 'worksheet-3.md' &&
        ws.file_mime === 'text/markdown',
      'row points at the file',
    );
    const order = writes
      .map((w) =>
        w.m === 'UPLOAD'
          ? 'upload'
          : w.table === 'assessments' && w.body?.status === 'published'
            ? 'publish'
            : null,
      )
      .filter(Boolean);
    check(order.join() === 'upload,publish', 'file uploaded before publishing');
    check(
      ws?.status === 'published' && (await seen(page, 'Published', true)),
      'worksheet published',
    );
    check(await seen(page, 'Current file: worksheet-3.md'), 'builder shows the current file');
    await page.getByText('Preview', { exact: true }).click();
    check(await seen(page, 'Add 7 + 5'), 'teacher preview renders the markdown');
    check(await seen(page, 'Fixed once published'), 'total marks locked after publish');
    await page.screenshot({ path: SHOTS + '/worksheet-builder.png', fullPage: true });
    await ctx.close();
  }

  // 2. Student sees the worksheet: listed, rendered, not counted as a test to do.
  {
    const { ctx, page } = await studentLogin(browser);
    // UI remake: the report card lives on the Me tab.
    await page.getByRole('tab', { name: /^Me/ }).click();
    check(await seen(page, 'My report card', true), 'Me tab links the report card');
    await page.getByRole('tab', { name: /^Tests/ }).click();
    await page.waitForURL('**/tests');
    check(await seen(page, 'Worksheet 3', true), 'worksheet listed for the student');
    await page.getByText('Worksheet 3', { exact: true }).click();
    check(await seen(page, 'Do this worksheet on paper'), 'worksheet explains it is done on paper');
    check(
      // ("Worksheet 3" also sits in the hidden tests list underneath, so check the body.)
      (await seen(page, 'Add 7 + 5')) && (await seen(page, 'Write the set of vowels')),
      'markdown worksheet rendered',
    );
    check(await seen(page, 'all', true), 'bold span rendered as its own run');
    const bad = page.getByText('bad link', { exact: true });
    check(
      (await bad.count()) === 1 &&
        (await bad.getAttribute('role')) !== 'link' &&
        (await bad.evaluate((el) => getComputedStyle(el).textDecorationLine)) !== 'underline',
      'javascript: link not clickable',
    );
    await page.screenshot({ path: SHOTS + '/worksheet-student.png', fullPage: true });
    await ctx.close();
  }

  // 3. Teacher grades: first grade, correction needs a reason, history shows both values.
  {
    const { ctx, page } = await staffLogin(browser, T);
    await page.getByText('Grades', { exact: true }).first().click();
    await page.waitForURL('**/grading');
    check(!(await page.getByText('Draft quiz').count()), 'drafts are not offered for grading');
    await page.getByRole('radio', { name: 'Sets test' }).click();
    check(await seen(page, '3 students · 0 graded · 1 waiting to be marked'), 'roster summary');
    check(
      (await seen(page, '1. Ali Raza')) &&
        (await seen(page, '2. Bushra Khan')) &&
        (await seen(page, 'Zain Ahmed', true)),
      'roster in roll order, unnumbered last',
    );
    check(await seen(page, 'Submitted — not marked'), 'Ali: submitted, not marked');
    const ali = page.getByLabel('Score for Ali Raza');
    await ali.fill('11');
    await ali.press('Enter');
    check(
      await seen(page, 'Score can’t be more than the total.'),
      'over the total refused locally',
    );
    check(rpcCalls.length === 0, 'no RPC for a locally refused score');
    await ali.fill('7');
    await ali.press('Enter');
    check(await seen(page, 'Saved: Ali Raza, 7'), 'first grade saved (toast)');
    check(
      rpcCalls.length === 1 &&
        rpcCalls[0].p_score === 7 &&
        rpcCalls[0].p_enrollment_id === 'e1' &&
        rpcCalls[0].p_assessment_id === 'a-test' &&
        rpcCalls[0].p_reason === '',
      'record_grade(e1, a-test, 7, "")',
    );
    check(!writes.some((w) => w.table === 'submissions'), 'no direct write to submissions');

    // Bushra never sent an answer: grading her warns that her online attempt will be refused.
    await page.getByLabel('Score for Bushra Khan').fill('5');
    check(
      await seen(page, "hasn't sent an answer for this test yet"),
      'warns: grading before the attempt',
    );
    await page.getByLabel('Score for Bushra Khan').press('Enter');
    check(await seen(page, 'Saved: Bushra Khan, 5'), 'grade for a student with no attempt');

    // Correction: needs a reason.
    await ali.fill('8.5');
    check(await seen(page, 'Reason for change'), 'reason field appears for a correction');
    await ali.press('Enter');
    check(
      await seen(page, 'Give a reason for changing the grade.'),
      'correction without a reason refused',
    );
    check(rpcCalls.length === 2, 'refused correction never reached the server');
    await page.getByLabel('Reason for change').fill('Recounted question 2');
    await page.getByLabel('Reason for change').press('Enter');
    check(await seen(page, 'Saved: Ali Raza, 8.5'), 'correction saved');
    const c = rpcCalls[2];
    check(
      c && c.p_score === 8.5 && c.p_reason === 'Recounted question 2',
      'record_grade carries the reason',
    );
    check(await seen(page, 'Edited 1×'), 'row shows it was edited');
    await page.getByText('Edit history', { exact: true }).first().click();
    check(
      (await seen(page, '7 → 8.5')) && (await seen(page, 'Recounted question 2')),
      'history shows old and new value + reason',
    );
    check(await seen(page, 'First grade: 7'), 'history keeps the first grade');
    await page.screenshot({ path: SHOTS + '/grading.png', fullPage: true });

    // The server refuses a correction without a reason even if the UI let it through.
    db.submissions.find((s) => s.id === 'sub-1').score = '8.50';
    await page.reload();
    await page.waitForTimeout(1500);
    await page.getByRole('radio', { name: 'Sets test' }).click();
    await page.getByLabel('Score for Ali Raza').waitFor();
    const before = db.submission_grade_edits.length;
    const res = await page.evaluate(async (sb) => {
      const key = Object.keys(localStorage).find((k) => k.includes('auth-token'));
      const tok = key ? JSON.parse(localStorage.getItem(key)).access_token : '';
      const r = await fetch(sb + '/rest/v1/rpc/record_grade', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          apikey: 'fake',
          authorization: 'Bearer ' + tok,
        },
        body: JSON.stringify({
          p_enrollment_id: 'e1',
          p_assessment_id: 'a-test',
          p_score: 3,
          p_reason: '',
        }),
      });
      return r.status + ' ' + (await r.text());
    }, SB);
    check(
      res.includes('reason_required') && db.submission_grade_edits.length === before,
      'mock server refuses a reasonless correction (SQL: GR-1)',
    );
    await ctx.close();
  }

  // 4. Overdue: the homework 12 days late, missing Bushra and Zain (Ali turned it in).
  {
    const { ctx, page } = await staffLogin(browser, A);
    check(await seen(page, 'Overdue assignments', true), 'admin home links Overdue');
    await page.getByText('Overdue assignments', { exact: true }).first().click();
    await page.waitForURL('**/overdue');
    check(await seen(page, 'Essay homework', true), 'overdue homework listed');
    check(await seen(page, '12 days overdue'), 'days overdue');
    check(await seen(page, '2 of 3 not submitted'), 'missing count');
    check(
      (await seen(page, 'Roll 2 · Bushra Khan')) && (await seen(page, 'No roll · Zain Ahmed')),
      'missing students in roll order',
    );
    check(
      !(await page.getByText('Roll 1 · Ali Raza').count()),
      'student who submitted is not listed',
    );
    check(
      !(await page.getByText('Sets test').count()),
      'tests (not homework) are not on the overdue list',
    );
    await page.screenshot({ path: SHOTS + '/overdue.png', fullPage: true });
    await page.getByRole('radio', { name: 'Class 8' }).click();
    check(await seen(page, 'Nothing is overdue'), 'empty state for a class with nothing overdue');
    await ctx.close();
  }

  // 5. Student report card: weighted overall from the corrected grade; scores show the clean value.
  {
    const { ctx, page } = await studentLogin(browser);
    await page.getByRole('tab', { name: /^Me/ }).click();
    await page.getByText('My report card', { exact: true }).first().click();
    await page.waitForURL('**/report');
    // Sets test 8.5/10 = 85 % (w30), homework 15/20 = 75 % (w10): (30·85 + 10·75)/40 = 82.5 → 83.
    check(await seen(page, '83%', true), 'overall = weighted 83 % (same rule as the old report)');
    check(await seen(page, 'From 2 marked tests'), 'marked count');
    check(
      (await seen(page, 'Mathematics', true)) && (await seen(page, '85%', true)),
      'per subject: Mathematics 85 %',
    );
    check(
      (await seen(page, 'English', true)) && (await seen(page, '75%', true)),
      'per subject: English 75 %',
    );
    // Cognitive: test questions 4 recall + 6 apply → 40 % remembering, 60 % thinking.
    check(
      (await seen(page, '40%', true)) && (await seen(page, '60%', true)),
      'recall vs thinking by marks',
    );
    check(levelCalls.length > 0, 'report card reads levels through student_paper_levels()');
    check(!(await page.getByText('Recounted').count()), 'student never sees the correction reason');
    await page.screenshot({ path: SHOTS + '/report-card.png', fullPage: true });
    await page.goto(BASE + '/results');
    check(await seen(page, '8.5 / 10'), 'results show the corrected score');
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(BASE + '/report');
    await page.waitForTimeout(1500);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    check(!overflow, 'phone width: no horizontal scroll on the report card');
    await ctx.close();
  }

  // 6. Urdu grading screen is RTL.
  {
    const { ctx, page } = await staffLogin(browser, T);
    await page.evaluate(() => localStorage.setItem('app.locale', 'ur'));
    await go(page, '/grading');
    await page.waitForTimeout(1000);
    const dir = await page.evaluate(
      () => document.documentElement.dir || getComputedStyle(document.body).direction,
    );
    const rtl = await page.locator('[dir="rtl"], [style*="direction: rtl"]').count();
    check(dir === 'rtl' || rtl > 0, 'Urdu: RTL');
    await page.screenshot({ path: SHOTS + '/grading-ur.png', fullPage: true });
    await ctx.close();
  }

  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  const bad = log.filter((l) => !l.startsWith('PAGEERROR ResizeObserver'));
  check(
    bad.length === 0,
    'no page errors, unmocked calls or foreign hosts' + (bad.length ? ': ' + bad.join(' | ') : ''),
  );
})();
