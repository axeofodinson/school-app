// TEST_PLAN A-2: web auth flows against a MOCKED Supabase (no request leaves localhost).
// Build: cd apps/mobile && EXPO_PUBLIC_SUPABASE_URL=https://fakedevproject.supabase.co EXPO_PUBLIC_SUPABASE_ANON_KEY=fake npx expo export -p web
// Serve: node scripts/e2e/serve-dist.mjs "$PWD/apps/mobile/dist" 8089
// Run:   NODE_PATH=$(npm root -g) node scripts/e2e/auth-web.cjs <screenshot-dir>
const { chromium } = require('playwright');
const BASE = 'http://localhost:8089';
const SB = 'https://fakedevproject.supabase.co';
const SHOTS = process.argv[2];
const users = {
  1001: {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    pin: '1234',
    name: 'Ali Raza',
    role: 'student',
    sid: 's-a',
  },
  1002: {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    pin: '5678',
    name: 'Sara Khan',
    role: 'student',
    sid: 's-b',
  },
  1003: {
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    pin: '1111',
    name: 'Withdrawn Kid',
    role: 'student',
    sid: 's-c',
    banned: true,
  },
};
const staff = {
  'admin@school.test': {
    id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    pw: 'secret',
    name: 'Admin',
    role: 'admin',
  },
};
const handle = (code) => `s.${code}@students.school.invalid`;
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
const log = [];
const foreign = new Set();
async function mock(page) {
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (!['localhost', 'fakedevproject.supabase.co'].includes(u.hostname)) foreign.add(u.hostname);
  });
  page.on('pageerror', (e) => log.push('PAGEERROR ' + e.message));
  await page.route(SB + '/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const json = (status, body) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (p === '/rest/v1/rpc/student_login_email') {
      const { p_student_code } = req.postDataJSON();
      const c = p_student_code.trim();
      return json(200, users[c] ? handle(c) : null);
    }
    if (p === '/auth/v1/token') {
      const { email, password } = req.postDataJSON();
      const code = Object.keys(users).find((c) => handle(c) === email);
      const u = code ? users[code] : staff[email];
      if (u && u.banned)
        return json(400, { code: 'user_banned', error_code: 'user_banned', msg: 'User is banned' });
      if (!u || (u.pin ?? u.pw) !== password)
        return json(400, {
          code: 'invalid_credentials',
          error_code: 'invalid_credentials',
          msg: 'Invalid login credentials',
        });
      return json(200, sessionFor(u, email));
    }
    if (p === '/auth/v1/logout') return route.fulfill({ status: 204 });
    if (p === '/rest/v1/profiles') {
      const id = url.searchParams.get('id').replace('eq.', '');
      const u = [...Object.values(users), ...Object.values(staff)].find((x) => x.id === id);
      const row = u ? { role: u.role, full_name: u.name, student_id: u.sid ?? null } : null;
      const obj = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
      return obj
        ? row
          ? json(200, row)
          : json(406, { code: 'PGRST116' })
        : json(200, row ? [row] : []);
    }
    if (p === '/rest/v1/enrollments') {
      return json(200, [
        {
          student_id: 's-a',
          class_id: 'c9',
          classes: { name: 'Class 9', sort_order: 9 },
          students: { full_name: 'Ali Raza', student_code: '1001' },
        },
        {
          student_id: 's-b',
          class_id: 'c8',
          classes: { name: 'Class 8', sort_order: 8 },
          students: { full_name: 'Sara Khan', student_code: '1002' },
        },
      ]);
    }
    log.push('UNMOCKED ' + req.method() + ' ' + p);
    return json(404, {});
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
const ls = (page) =>
  page.evaluate(() =>
    Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])),
  );
async function studentLogin(page, code, pin) {
  await page.goto(BASE + '/login');
  await page.getByLabel('Admission number').fill(code);
  await page.getByLabel('PIN', { exact: true }).fill(pin);
  await page.getByText('Go', { exact: true }).click();
}

(async () => {
  const browser = await chromium.launch();
  // 1. personal device: errors + success + remembered session
  {
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 800 } });
    const page = await ctx.newPage();
    await mock(page);
    await studentLogin(page, '9999', '1234');
    check(
      await seen(page, 'We couldn’t find that admission number'),
      'unknown admission number -> notFound',
    );
    await studentLogin(page, '1001', '9999');
    check(await seen(page, 'That PIN isn’t right'), 'wrong PIN -> wrongPin');
    await studentLogin(page, '1003', '1111');
    check(await seen(page, 'Your login is switched off'), 'banned (db/009 withdrawn) -> revoked');
    await studentLogin(page, '1001', '12');
    check(await seen(page, 'Your PIN has 4 to 8 numbers'), 'short PIN -> badPin');
    await page.screenshot({ path: SHOTS + '/login-error.png' });
    await studentLogin(page, ' ۱۰۰۱ ', '1234');
    await page.waitForURL('**/learn', { timeout: 8000 }).catch(() => {});
    check(
      page.url().endsWith('/learn') && (await seen(page, 'Hi, Ali Raza!')),
      'student login (Urdu digits) -> /learn with name',
    );
    const st = await ls(page);
    check(
      Object.keys(st).some((k) => k.startsWith('sb-fakedevproject-auth-token')),
      'personal mode: session remembered in localStorage',
    );
    await page.reload();
    await page.waitForURL('**/learn', { timeout: 8000 }).catch(() => {});
    check(page.url().endsWith('/learn'), 'personal mode: reload keeps session');
    await page.goto(BASE + '/school');
    await page.waitForTimeout(800);
    check(
      !page.url().endsWith('/school'),
      'student cannot open admin route (guard redirects) -> ' + new URL(page.url()).pathname,
    );
    await page.goto(BASE + '/learn');
    await page.getByText('Sign out', { exact: true }).click();
    await page.waitForURL('**/login', { timeout: 8000 }).catch(() => {});
    check(
      page.url().endsWith('/login') &&
        !Object.keys(await ls(page)).some((k) => k.startsWith('sb-')),
      'sign out -> /login, no session left',
    );
    await ctx.close();
  }
  // 2. shared device: no remembered session, switch student wipes namespace, idle logout
  {
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 800 } });
    const page = await ctx.newPage();
    await mock(page);
    await page.clock.install();
    await page.goto(BASE + '/login');
    await page.evaluate(() => localStorage.setItem('ns/device/sharedMode', '1'));
    await studentLogin(page, '1001', '1234');
    await page.waitForURL('**/learn', { timeout: 8000 }).catch(() => {});
    check(
      await page.getByText('Switch student').isVisible(),
      'shared mode: Switch student button visible',
    );
    const A = users['1001'].id,
      B = users['1002'].id;
    await page.evaluate((A) => {
      localStorage.setItem(`ns/u/${A}/cache/results`, 'A secret results');
      localStorage.setItem(`ns/u/${A}/queue/0001`, 'A unsent answer');
    }, A);
    check(
      !Object.keys(await ls(page)).some((k) => k.startsWith('sb-')),
      'shared mode: no session in localStorage',
    );
    await page.screenshot({ path: SHOTS + '/shared-learn.png' });
    await page.getByText('Switch student').click();
    await page.waitForURL('**/login', { timeout: 8000 }).catch(() => {});
    let st = await ls(page);
    check(
      page.url().endsWith('/login') &&
        (await page.getByText('Signed out. Next student, sign in.').isVisible()),
      'switch -> login with notice',
    );
    check(
      !(`ns/u/${A}/cache/results` in st) && st[`ns/u/${A}/queue/0001`] === 'A unsent answer',
      'switch wiped A namespace, kept A queue',
    );
    // A leftover from an interrupted sign-out is purged when B signs in
    await page.evaluate((A) => localStorage.setItem(`ns/u/${A}/cache/leftover`, 'x'), A);
    await studentLogin(page, '1002', '5678');
    await page.waitForURL('**/learn', { timeout: 8000 }).catch(() => {});
    st = await ls(page);
    check(
      (await seen(page, 'Hi, Sara Khan!')) && (await page.getByText('Ali').count()) === 0,
      'B sees own name, nothing of A',
    );
    check(
      !(`ns/u/${A}/cache/leftover` in st) && `ns/u/${A}/queue/0001` in st,
      'B sign-in purged A leftovers, A queue still isolated',
    );
    await page.clock.fastForward('10:30');
    await page.waitForURL('**/login', { timeout: 8000 }).catch(() => {});
    check(
      page.url().endsWith('/login') &&
        (await page.getByText('Signed out after 10 minutes without use.').isVisible()),
      'idle 10 min -> signed out with notice',
    );
    await studentLogin(page, '1001', '1234');
    await page.waitForURL('**/learn', { timeout: 8000 }).catch(() => {});
    await page.reload();
    await page.waitForTimeout(1500);
    check(page.url().endsWith('/login'), 'shared mode: reload forgets the session');
    await ctx.close();
  }
  // 3. staff: admin login, QR cards, print, settings toggle
  {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    const page = await ctx.newPage();
    await mock(page);
    await page.goto(BASE + '/staff');
    await page.getByLabel('Email').fill('admin@school.test');
    await page.getByLabel('Password').fill('wrong');
    await page.getByText('Sign in', { exact: true }).click();
    check(await seen(page, 'Email or password is incorrect.'), 'staff wrong password');
    await page.getByLabel('Password').fill('secret');
    await page.getByText('Sign in', { exact: true }).click();
    await page.waitForURL('**/school', { timeout: 8000 }).catch(() => {});
    check(page.url().endsWith('/school'), 'admin login -> /school');
    await page.getByText('Print login cards').click();
    await page.waitForURL('**/qr-cards');
    await page
      .getByText('Ali Raza')
      .waitFor({ timeout: 5000 })
      .catch(() => {});
    check(await page.getByText('2 cards').isVisible(), 'QR cards list loaded (2 cards)');
    await page.screenshot({ path: SHOTS + '/qr-cards.png', fullPage: true });
    // Capture the print document instead of opening a dialog.
    await page.evaluate(() => {
      window.__printed = null;
      const orig = HTMLIFrameElement.prototype;
      const d = Object.getOwnPropertyDescriptor(orig, 'contentWindow');
      Object.defineProperty(orig, 'contentWindow', {
        get() {
          const w = d.get.call(this);
          if (w)
            w.print = () => {
              window.__printed = w.document.documentElement.outerHTML;
            };
          return w;
        },
      });
    });
    await page.getByText('Print A4 sheet').click();
    await page.waitForTimeout(500);
    const html = await page.evaluate(() => window.__printed);
    check(
      !!html &&
        html.includes('size: A4') &&
        (html.match(/class="card"/g) || []).length === 2 &&
        html.includes('1001') &&
        !/1234|5678/.test(html),
      'print sheet: A4, 2 cards, no PIN',
    );
    if (html) {
      const p2 = await ctx.newPage();
      await p2.setContent(html);
      await p2.screenshot({ path: SHOTS + '/print-sheet.png', fullPage: true });
      await p2.close();
    }
    await page.goto(BASE + '/settings');
    await page.getByText('Shared', { exact: true }).click();
    await page.waitForTimeout(300);
    check(
      (await ls(page))['ns/device/sharedMode'] === '1' &&
        !Object.keys(await ls(page)).some((k) => k.startsWith('sb-')),
      'admin turns shared mode on -> flag saved, remembered session removed',
    );
    await page.screenshot({ path: SHOTS + '/settings.png', fullPage: true });
    await ctx.close();
  }
  // 4. scan route without BarcodeDetector + Urdu login
  {
    const ctx = await browser.newContext({ viewport: { width: 400, height: 800 } });
    const page = await ctx.newPage();
    await mock(page);
    await page.goto(BASE + '/scan');
    check(
      await seen(page, 'No camera to scan with here'),
      'web without BarcodeDetector -> manual entry fallback',
    );
    await page.getByText('Type my admission number').click();
    await page.waitForURL('**/login');
    await page.goto(BASE + '/login?admission=ASHS-ignored'); // param fills field as typed text
    await page.goto(BASE + '/login');
    await page
      .getByText('اردو')
      .first()
      .click()
      .catch(() => {});
    await page.waitForTimeout(500);
    await page.screenshot({ path: SHOTS + '/login-ur-phone.png', fullPage: true });
    check((await page.evaluate(() => document.documentElement.dir)) === 'rtl', 'Urdu login is RTL');
    await ctx.close();
  }
  await browser.close();
  console.log('foreign hosts:', [...foreign].join(',') || 'none');
  console.log(log.join('\n'));
})();
