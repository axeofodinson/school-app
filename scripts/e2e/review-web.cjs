// TEST_PLAN RQ-2: the teacher review queue on web against a MOCKED Supabase
// (in-memory PostgREST + the db/032 RPCs in JS; no request leaves localhost).
// Who may decide is checked in SQL by db/test/032_smoke.sql (RQ-1); this checks
// the keyboard flow, the payloads, edit → re-approve, send back, reject, bulk,
// maths pictures, the empty and not-ready states, RTL and phone width.
// Build: cd apps/mobile && EXPO_PUBLIC_SUPABASE_URL=https://fakedevproject.supabase.co EXPO_PUBLIC_SUPABASE_ANON_KEY=fake npx expo export -p web
// Serve: node scripts/e2e/serve-dist.mjs "$PWD/apps/mobile/dist" 8089
// Run:   node scripts/e2e/review-web.cjs <screenshot-dir>
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
const people = [T, A];

const MATH_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="9.5ex" height="2.1ex" viewBox="0 -750 4200 930" style="vertical-align: -0.4ex"><path d="M0 0L4200 0L4200 -700L0 -700Z" fill="currentColor"/></svg>';

const qid = (n) => `${n}a${n}b0000-0000-4000-8000-00000000000${n}`;
const t0 = Date.parse('2026-11-25T08:00:00Z');
const mk = (n, over) => ({
  id: qid(n),
  chapter_id: 'ch1',
  concept_id: 'cn1',
  type: 'mcq',
  cognitive_level: 'apply',
  difficulty: 2,
  status: 'draft',
  origin: 'ai',
  current_version: 1,
  import_batch_id: 'b1',
  created_at: new Date(t0 + n * 1000).toISOString(),
  source: { book: 'PTB Maths 9', page: 40 + n },
  explanation: { en: 'Take 3 from both sides.', ur: 'دونوں طرف سے 3 نکالیں۔' },
  answer: { correct: 'A' },
  body: {
    stem: { en: `Question ${n}`, ur: `سوال ${n}` },
    options: [
      { key: 'A', text: { en: 'x = 2', ur: 'x = 2' } },
      { key: 'B', text: { en: 'x = 5', ur: 'x = 5' } },
    ],
  },
  ...over,
});

function freshDb() {
  return {
    academic_years: [{ id: 'y1', label: '2026-27', is_current: true }],
    classes: [{ id: 'c9a', name: 'Class 9-A', grade_level: 9 }],
    subjects: [
      { id: 's-math', class_id: 'c9a', name: 'Mathematics', sort_order: 1 },
      { id: 's-sci', class_id: 'c9a', name: 'Science', sort_order: 2 },
    ],
    chapters: [
      {
        id: 'ch1',
        subject_id: 's-math',
        title: 'Linear Equations',
        sort_order: 1,
        status: 'active',
      },
      { id: 'ch2', subject_id: 's-sci', title: 'Cells', sort_order: 1, status: 'active' },
    ],
    teacher_assignments: [
      { teacher_id: T.id, class_id: 'c9a', subject_id: 's-math', year_id: 'y1' },
    ],
    topics: [
      {
        id: 'tp1',
        chapter_id: 'ch1',
        title_en: 'Solving equations',
        title_ur: 'مساوات حل کرنا',
        sort_order: 0,
      },
    ],
    concepts: [
      {
        id: 'cn1',
        topic_id: 'tp1',
        title_en: 'Balance both sides',
        title_ur: 'دونوں طرف توازن',
        sort_order: 0,
        status: 'active',
      },
      {
        id: 'cn2',
        topic_id: 'tp1',
        title_en: 'Unknown on both sides',
        title_ur: 'دونوں طرف نامعلوم',
        sort_order: 1,
        status: 'active',
      },
    ],
    import_batches: [
      {
        id: 'b1',
        file_name: 'linear.json',
        chapter_id: 'ch1',
        status: 'done',
        imported_by: T.id,
        created_at: new Date(t0).toISOString(),
        question_count: 7,
      },
    ],
    math_svgs: [{ key: '2x + 3 = 7', svg: MATH_SVG }],
    questions: [
      mk(1, {
        body: {
          stem: { en: 'Solve $2x + 3 = 7$', ur: 'حل کریں: $2x + 3 = 7$' },
          options: [
            { key: 'A', text: { en: 'x = 2', ur: 'x = 2' } },
            { key: 'B', text: { en: 'x = 5', ur: 'x = 5' } },
          ],
        },
      }),
      mk(2, {
        type: 'true_false',
        body: { stem: { en: 'You may add 5 to both sides', ur: '' } },
        answer: { correct: true },
        explanation: null,
      }),
      mk(3, {
        type: 'numeric',
        body: { stem: { en: 'Solve 5x = 20', ur: 'حل کریں 5x = 20' } },
        answer: { correct: 3 },
        explanation: null,
      }),
      mk(4, { concept_id: null, origin: 'human' }),
      mk(5, {
        type: 'short_text',
        body: { stem: { en: 'What do we call x?', ur: 'x کو کیا کہتے ہیں؟' } },
        answer: { correct: 'unknown' },
        explanation: null,
      }),
      mk(6, {}),
      mk(7, {}),
      mk(8, { chapter_id: 'ch2', concept_id: null }),
    ],
    item_approvals: [],
    item_reviews: [],
  };
}

let db = freshDb();
let requests = [];
const log = [];
let notReady = false;
let staleOnce = false;

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
  if (op === 'neq') return String(val) !== arg;
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
  for (const [k, v] of url.searchParams)
    if (!SKIP.has(k)) rows = rows.filter((r) => matches(r, k, v));
  return rows;
};

// ---- the db/032 RPCs, in JS ------------------------------------------------------
const subjectOf = (q) => db.chapters.find((c) => c.id === q.chapter_id)?.subject_id;
const canReview = (who, q) =>
  who.role === 'admin' ||
  (q.concept_id != null &&
    db.teacher_assignments.some((a) => a.teacher_id === who.id && a.subject_id === subjectOf(q)));
const lastReview = (q) =>
  [...db.item_reviews]
    .reverse()
    .find((r) => r.item_id === q.id && r.version === q.current_version) ?? null;
const liveScopes = (q) =>
  db.item_approvals
    .filter((a) => a.item_id === q.id && !a.revoked && a.version === q.current_version)
    .map((a) => a.scope)
    .sort();
const inTab = (q, tab) => {
  const ld = lastReview(q)?.decision;
  if (tab === 'to_review')
    return ['draft', 'reviewed'].includes(q.status) && ld !== 'request_changes';
  if (tab === 'changes')
    return ['draft', 'reviewed'].includes(q.status) && ld === 'request_changes';
  if (tab === 'approved') return q.status === 'approved';
  if (tab === 'retired') return q.status === 'retired';
  return true;
};
const base = (a) =>
  db.questions.filter(
    (q) =>
      subjectOf(q) === a.p_subject &&
      (!a.p_chapter || q.chapter_id === a.p_chapter) &&
      (!a.p_topic || db.concepts.find((c) => c.id === q.concept_id)?.topic_id === a.p_topic) &&
      (!a.p_batch || q.import_batch_id === a.p_batch),
  );
function queue(who, a) {
  return base(a)
    .filter((q) => inTab(q, a.p_status ?? 'to_review'))
    .sort((x, y) => x.created_at.localeCompare(y.created_at))
    .map((q) => {
      const lr = lastReview(q);
      return {
        id: q.id,
        version: q.current_version,
        status: q.status,
        origin: q.origin,
        type: q.type,
        cognitive_level: q.cognitive_level,
        difficulty: q.difficulty,
        chapter_id: q.chapter_id,
        concept_id: q.concept_id,
        topic_id: db.concepts.find((c) => c.id === q.concept_id)?.topic_id ?? null,
        body: q.body,
        answer: q.answer,
        explanation: q.explanation,
        source: q.source,
        import_batch_id: q.import_batch_id,
        created_at: q.created_at,
        scopes: liveScopes(q),
        last_decision: lr?.decision ?? null,
        last_notes: lr?.notes ?? null,
        last_translation: lr?.translation_ok ?? null,
        last_reviewed_at: lr?.at ?? null,
        can_review: canReview(who, q),
        in_use: false,
      };
    });
}
const counts = (a) => {
  const rows = base(a);
  return Object.fromEntries(
    ['to_review', 'changes', 'approved', 'retired'].map((t) => [
      t,
      rows.filter((q) => inTab(q, t)).length,
    ]),
  );
};
const err = (code, message) => ({ code, message });
function decide(who, a) {
  const q = db.questions.find((x) => x.id === a.p_question);
  if (!q) throw err('P0002', 'review_not_found');
  if (!canReview(who, q)) throw err('42501', 'review_forbidden');
  if (a.p_version !== q.current_version) throw err('40001', 'review_stale_version');
  if (q.status === 'retired') throw err('22023', 'review_retired');
  const notes = (a.p_notes ?? '').trim() || null;
  if (a.p_decision === 'approve') {
    if (!q.concept_id) throw err('23514', 'review_concept_required');
    const sc = [...new Set(a.p_scopes ?? [])].sort();
    if (!sc.length || sc.some((s) => !['learn', 'practice', 'exam', 'worksheet'].includes(s)))
      throw err('22023', 'review_scopes');
    for (const ap of db.item_approvals)
      if (ap.item_id === q.id && !ap.revoked && !sc.includes(ap.scope)) ap.revoked = true;
    for (const s of sc)
      if (!db.item_approvals.some((ap) => ap.item_id === q.id && !ap.revoked && ap.scope === s))
        db.item_approvals.push({
          item_id: q.id,
          version: q.current_version,
          scope: s,
          by: who.id,
          revoked: false,
        });
    q.status = 'approved';
  } else {
    if (!notes) throw err('23514', 'review_reason_required');
    for (const ap of db.item_approvals) if (ap.item_id === q.id) ap.revoked = true;
    q.status = a.p_decision === 'reject' ? 'retired' : 'draft';
  }
  db.item_reviews.push({
    item_id: q.id,
    version: q.current_version,
    decision: a.p_decision,
    translation_ok: a.p_translation_ok ?? null,
    notes,
    by: who.id,
    at: new Date().toISOString(),
  });
  return {
    question: q.id,
    version: q.current_version,
    decision: a.p_decision,
    status: q.status,
    scopes: liveScopes(q),
  };
}
function edit(who, a) {
  const q = db.questions.find((x) => x.id === a.p_question);
  if (!q) throw err('P0002', 'review_not_found');
  if (!canReview(who, q)) throw err('42501', 'review_forbidden');
  if (a.p_version !== q.current_version) throw err('40001', 'review_stale_version');
  const p = a.p_patch;
  const keys = ['body', 'answer', 'explanation', 'cognitive_level', 'difficulty', 'concept_id'];
  if (Object.keys(p).some((k) => !keys.includes(k))) throw err('22023', 'review_bad_patch');
  if (Object.keys(p).length) {
    Object.assign(q, p);
    q.current_version += 1;
    if (q.status === 'approved') q.status = 'draft';
    if (q.origin === 'ai') q.origin = 'ai_edited';
    for (const ap of db.item_approvals) if (ap.item_id === q.id) ap.revoked = true;
  }
  return {
    question: q.id,
    version: q.current_version,
    changed: Object.keys(p).length > 0,
    status: q.status,
  };
}
function approveMany(who, a) {
  let approved = 0;
  const skipped = [];
  for (const it of a.p_items) {
    try {
      decide(who, {
        p_question: it.id,
        p_version: it.version,
        p_decision: 'approve',
        p_scopes: a.p_scopes,
      });
      approved++;
    } catch (e) {
      skipped.push({ id: it.id, reason: e.message });
    }
  }
  return { approved, skipped };
}

async function mock(page, who) {
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (!['localhost', 'fakedevproject.supabase.co'].includes(u.hostname))
      log.push('FOREIGN ' + u.hostname);
  });
  page.on('pageerror', (e) => {
    log.push('PAGEERROR ' + e.message);
    console.log('PAGEERROR', e.message, (e.stack || '').split('\n').slice(0, 4).join(' | '));
  });
  page.on('console', (m) => m.type() === 'error' && console.log('CONSOLE', m.text().slice(0, 400)));
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
      if (notReady && fn.startsWith('review_'))
        return json(404, { code: 'PGRST202', message: `Could not find the function public.${fn}` });
      try {
        if (fn === 'review_counts') return json(200, counts(body));
        if (fn === 'review_queue') return json(200, queue(who, body));
        if (fn === 'review_question') {
          if (staleOnce) {
            staleOnce = false;
            throw err('40001', 'review_stale_version');
          }
          return json(200, decide(who, body));
        }
        if (fn === 'review_edit_question') return json(200, edit(who, body));
        if (fn === 'review_approve_many') return json(200, approveMany(who, body));
      } catch (e) {
        return json(e.code === '42501' ? 403 : 400, e);
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
    if (m === 'GET') return out(filtered(table, url));
    requests.push({ m, table, body, who: who.role });
    log.push('UNEXPECTED WRITE ' + m + ' ' + table);
    return json(403, { code: '42501', message: 'new row violates row-level security policy' });
  });
}

const seen = (page, text, exact = false, timeout = 15000) =>
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
const rpcs = (fn) => requests.filter((r) => r.table === `rpc:${fn}`);
const lastRpc = (fn) => rpcs(fn).at(-1)?.body;
const qtag = (n) => `Q-${qid(n).replace(/-/g, '').slice(0, 4).toUpperCase()}`;
const key = async (page, k) => {
  await page.keyboard.press(k);
  await page.waitForTimeout(250);
};
// The pane's heading is the current question's id.
const paneShows = (page, n) =>
  page
    .getByRole('heading', { name: qtag(n), exact: true })
    .first()
    .waitFor({ timeout: 8000 })
    .then(
      () => true,
      () => false,
    );

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

async function openReview(page) {
  await page.getByText('Review queue', { exact: true }).first().click();
  await page.waitForURL('**/review');
  await page.getByText('Mathematics', { exact: true }).first().click();
}

(async () => {
  const browser = await chromium.launch();

  // 0. Before db/032: the screen says so plainly.
  {
    notReady = true;
    const { ctx, page } = await login(browser, T);
    await page.goto(BASE + '/review');
    check(await seen(page, 'Not switched on yet'), 'not-ready empty state before 032');
    notReady = false;
    await ctx.close();
  }

  // 1. Teacher: keyboard flow through the queue.
  {
    db = freshDb();
    requests = [];
    const { ctx, page } = await login(browser, T);
    await openReview(page);
    check(
      await seen(page, 'To review (7)'),
      "tab counts the subject drafts (7 of the teacher's subject)",
    );
    check(await paneShows(page, 1), 'first question opens by itself');
    check(
      (await seen(page, 'English', true)) && (await seen(page, 'اردو', true)),
      'both languages side by side',
    );
    check(
      (await page.locator('svg[viewBox="0 -750 4200 930"]').count()) >= 2,
      'maths drawn from math_svgs in both columns',
    );
    check(await seen(page, 'Source: PTB Maths 9 p. 41'), 'source page shown');
    check(await seen(page, 'Answer', true), 'the key is marked on the right option');
    await page.waitForTimeout(600);
    await page.screenshot({ path: SHOTS + '/review-desktop.png', fullPage: false });

    // A without the answer check: refused on screen, nothing sent.
    await key(page, 'a');
    check(
      await seen(page, 'Tick “The answer is right” first (V).'),
      'approve needs the answer check',
    );
    check(rpcs('review_question').length === 0, 'nothing sent before the check');

    await key(page, 'v');
    await key(page, 'u');
    await key(page, 'a');
    let b = lastRpc('review_question');
    check(
      b &&
        b.p_question === qid(1) &&
        b.p_version === 1 &&
        b.p_decision === 'approve' &&
        JSON.stringify(b.p_scopes) === '["learn","practice"]' &&
        b.p_translation_ok === true,
      'A approves for learn + practice with the Urdu check',
    );
    check(await seen(page, `Approved · ${qtag(1)}`), 'decision stamp');
    check(await paneShows(page, 2), 'moves on to the next question');
    check(await seen(page, '1 reviewed · 6 left'), 'progress counter');

    // q2: Urdu missing, scopes by number keys.
    check(await seen(page, 'Urdu missing: question'), 'missing Urdu flagged');
    await key(page, '1');
    await key(page, '3');
    await key(page, 'v');
    await key(page, 'a');
    b = lastRpc('review_question');
    check(
      b && JSON.stringify(b.p_scopes) === '["practice","exam"]' && b.p_translation_ok === false,
      '1–4 toggle scopes; Urdu not ticked is sent as false',
    );
    check(await paneShows(page, 3), 'third question');

    // q3: edit the key → version 2 → approve again.
    await key(page, 'e');
    check(await seen(page, 'Edit question'), 'E opens the editor');
    const answer = page.getByLabel('Answer', { exact: true });
    await answer.fill('4');
    await page.keyboard.press('Control+Enter');
    check(await seen(page, 'Saved as version 2'), 'edit saved as a new version');
    b = lastRpc('review_edit_question');
    check(
      b && b.p_version === 1 && JSON.stringify(b.p_patch) === '{"answer":{"correct":4}}',
      'smallest patch sent',
    );
    check(await seen(page, 'Version 2'), 'pane shows the new version');
    await key(page, 'v');
    await key(page, 'a');
    b = lastRpc('review_question');
    check(b && b.p_question === qid(3) && b.p_version === 2, 're-approved at version 2');

    // q4: untagged → read only for a teacher.
    check(await paneShows(page, 4), 'untagged question next');
    check(
      await seen(page, 'No concept yet. Only an admin can tag it'),
      'untagged: teacher told who fixes it',
    );
    const before = rpcs('review_question').length;
    await key(page, 'v');
    await key(page, 'r');
    check(
      !(await seen(page, 'Reject this question', true, 1500)),
      'R does nothing on a question the teacher cannot decide',
    );
    check(rpcs('review_question').length === before, 'nothing sent for it');

    // q5: ask for changes (reason required).
    await key(page, 'j');
    check(await paneShows(page, 5), 'J moves on');
    await key(page, 'c');
    check(await seen(page, 'Ask for changes', true), 'C opens the reason sheet');
    await page.getByText('Send back', { exact: true }).click();
    check(await seen(page, 'Write a short reason first.'), 'reason required');
    await page.getByLabel('Why').fill('Accept "variable" too');
    await page.keyboard.press('Enter');
    check(await seen(page, `Sent back · ${qtag(5)}`), 'sent-back stamp');
    b = lastRpc('review_question');
    check(
      b && b.p_decision === 'request_changes' && b.p_notes === 'Accept "variable" too',
      'sent back with the note',
    );

    // A stale version: toast + reload, nothing lost.
    staleOnce = true;
    await key(page, 'k');
    await paneShows(page, 4);
    await key(page, 'j');
    check(await paneShows(page, 6), 'cursor on q6');
    await key(page, 'v');
    await key(page, 'a');
    check(
      await seen(page, 'Someone changed this question a moment ago'),
      'stale version explained',
    );

    // Changes tab, then reject from there.
    await page.getByText('Changes asked (1)', { exact: true }).click();
    check(
      await seen(page, 'Changes asked: Accept "variable" too'),
      'the note shows on the sent-back question',
    );
    await key(page, 'r');
    await page.getByLabel('Why').fill('Duplicate of Q-12');
    await page.getByText('Reject', { exact: true }).last().click();
    b = lastRpc('review_question');
    check(b && b.p_decision === 'reject' && b.p_question === qid(5), 'rejected with a reason');
    check(await seen(page, 'Nothing sent back'), 'changes tab empty state');
    check(await seen(page, 'Rejected (1)'), 'rejected count');
    check(db.questions.length === 8, 'nothing deleted');

    // Help sheet
    await key(page, '?');
    check(await seen(page, 'Keyboard shortcuts', true), '? opens the shortcuts');
    await page.keyboard.press('Escape');
    await ctx.close();
  }

  // 2. Admin: tag the untagged question, then bulk approve.
  {
    const { ctx, page } = await login(browser, A);
    await openReview(page);
    await page.getByText(qtag(4), { exact: true }).first().click();
    check(
      await seen(page, 'No concept yet. Edit it and pick one before approving.'),
      'admin told to tag it',
    );
    await key(page, 'e');
    await page.getByText('Unknown on both sides', { exact: true }).first().click();
    await page.getByText('Save new version', { exact: true }).click();
    const b = lastRpc('review_edit_question');
    check(
      b && b.p_question === qid(4) && JSON.stringify(b.p_patch) === '{"concept_id":"cn2"}',
      'admin tags a concept',
    );
    // Bulk: tick q4, q6, q7.
    for (const n of [4, 6, 7])
      await page.getByLabel(`Select ${qtag(n).slice(2)} for bulk approve`).click();
    check(await seen(page, '3 selected'), 'bulk bar counts');
    await page.getByText('Approve 3', { exact: true }).click();
    check(await seen(page, 'Approve 3 questions?'), 'bulk asks first');
    await page.screenshot({ path: SHOTS + '/review-bulk.png' });
    await page.getByText('Approve all 3', { exact: true }).click();
    check(await seen(page, '3 approved.'), 'bulk approved');
    const bb = lastRpc('review_approve_many');
    check(
      bb && bb.p_items.length === 3 && bb.p_items.find((i) => i.id === qid(4))?.version === 2,
      'bulk sends each version',
    );
    check(await seen(page, 'All done here'), 'all-done empty state');

    // Urdu: right to left.
    await page.evaluate(() => localStorage.setItem('app.locale', 'ur'));
    await page.reload();
    await page.waitForTimeout(2500);
    check((await page.evaluate(() => document.documentElement.dir)) === 'rtl', 'Urdu is RTL');
    await page
      .getByText('Approved (5)', { exact: false })
      .first()
      .click()
      .catch(() => {});
    await page.waitForTimeout(800);
    await page.screenshot({ path: SHOTS + '/review-urdu.png' });
    await ctx.close();
  }

  // 3. Phone width: list first, a row opens the question, back returns; no overflow.
  {
    db = freshDb();
    const { ctx, page } = await login(browser, T, { width: 390, height: 844 });
    await page.goto(BASE + '/review');
    await page.getByText('Mathematics', { exact: true }).first().click();
    check(await seen(page, 'To review (7)'), 'queue at phone width');
    await page.getByText(qtag(2), { exact: true }).first().click();
    check(await seen(page, 'Back to the list'), 'detail with a way back');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    check(!overflow, 'no horizontal scroll at 390 px');
    await page.waitForTimeout(500);
    await page.screenshot({ path: SHOTS + '/review-phone.png' });
    await ctx.close();
  }

  await browser.close();
  const bad = log.filter((l) => !l.startsWith('UNMOCKED GET'));
  check(
    bad.length === 0,
    'no page errors, foreign hosts or unexpected writes' +
      (bad.length ? ': ' + bad.join('; ') : ''),
  );
  if (log.length) console.log(log.join('\n'));
})();
