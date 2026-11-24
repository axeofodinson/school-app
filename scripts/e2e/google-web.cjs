// TEST_PLAN A-4: Google sign-in + prep-only gating on web against a MOCKED
// Supabase (no request leaves localhost). Same build/serve as auth-web.cjs:
// Build: cd apps/mobile && EXPO_PUBLIC_GOOGLE_SIGNIN=1 EXPO_PUBLIC_SUPABASE_URL=https://fakedevproject.supabase.co EXPO_PUBLIC_SUPABASE_ANON_KEY=fake npx expo export -p web
// Serve: node scripts/e2e/serve-dist.mjs "$PWD/apps/mobile/dist" 8089
// Run:   NODE_PATH=$(npm root -g) node scripts/e2e/google-web.cjs <screenshot-dir>
const { chromium } = require('playwright');
const BASE = 'http://localhost:8089';
const SB = 'https://fakedevproject.supabase.co';
const SHOTS = process.argv[2];
const PREP = {
  id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  email: 'prep.kid@gmail.test',
  row: { role: 'student', full_name: 'Prep Kid', student_id: null, access_tier: 'prep_only' },
};
const ADMIN = {
  id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  email: 'admin@school.test',
  row: { role: 'admin', full_name: 'Admin', student_id: null, access_tier: 'school' },
};
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
      app_metadata: { provider: 'google' },
      user_metadata: {},
      created_at: new Date().toISOString(),
    },
  };
}
const log = [];
const foreign = new Set();
/** scenario: which account the Google round trip yields, or an error redirect. */
async function mock(page, scenario) {
  const state = { exchanged: [], authorize: null, linked: null, current: null };
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (!['localhost', 'fakedevproject.supabase.co'].includes(u.hostname)) foreign.add(u.hostname);
  });
  page.on('pageerror', (e) => log.push('PAGEERROR ' + e.message));
  page.on('console', (m) => m.type() === 'error' && log.push('CONSOLE ' + m.text()));
  await page.route(SB + '/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const json = (status, body, headers) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        headers,
        body: JSON.stringify(body),
      });
    if (p === '/auth/v1/authorize') {
      state.authorize = url;
      const back = new URL(url.searchParams.get('redirect_to'));
      if (scenario.error) {
        back.searchParams.set('error', 'server_error');
        back.searchParams.set('error_description', scenario.error);
      } else back.searchParams.set('code', 'test-auth-code-123');
      return route.fulfill({ status: 302, headers: { location: back.toString() } });
    }
    if (p === '/auth/v1/token') {
      const body = req.postDataJSON();
      if (url.searchParams.get('grant_type') === 'pkce') {
        state.exchanged.push(body);
        if (!body.code_verifier)
          return json(400, { code: 'bad_code_verifier', msg: 'no verifier' });
        state.current = scenario.account;
        return json(200, sessionFor(scenario.account));
      }
      if (body.email === ADMIN.email && body.password === 'secret') {
        state.current = ADMIN;
        return json(200, sessionFor(ADMIN));
      }
      return json(400, { code: 'invalid_credentials', msg: 'Invalid login credentials' });
    }
    if (p === '/auth/v1/user') {
      return state.current
        ? json(200, sessionFor(state.current).user)
        : json(401, { msg: 'no session' });
    }
    if (p === '/auth/v1/logout') {
      state.current = null;
      return route.fulfill({ status: 204 });
    }
    if (p === '/rest/v1/profiles') {
      if (req.method() === 'HEAD') {
        return route.fulfill({
          status: 200,
          headers: {
            'content-range': '0-0/1',
            'access-control-allow-origin': '*',
            'access-control-expose-headers': 'content-range',
          },
          body: '',
        });
      }
      const id = (url.searchParams.get('id') || '').replace('eq.', '');
      const acc = [PREP, ADMIN, scenario.account].find((x) => x && x.id === id);
      const row = acc ? { id, ...acc.row, merged_into: scenario.merged ?? null } : null;
      const obj = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
      return obj
        ? row
          ? json(200, row)
          : json(406, { code: 'PGRST116' })
        : json(200, row ? [row] : []);
    }
    if (p === '/rest/v1/rpc/find_prep_accounts') {
      const { p_query } = req.postDataJSON();
      return json(
        200,
        p_query.includes('prep')
          ? [
              {
                id: PREP.id,
                email: PREP.email,
                full_name: 'Prep Kid',
                created_at: new Date().toISOString(),
                merged_into: null,
                attempts: 7,
              },
            ]
          : [],
      );
    }
    if (p === '/rest/v1/students') {
      return json(200, { id: 's-9', full_name: 'Prep Kid (enrolled)', student_code: '2026-001' });
    }
    if (p === '/rest/v1/rpc/link_prep_account') {
      state.linked = req.postDataJSON();
      return json(200, {
        practice_attempts: 7,
        concept_mastery: 3,
        concept_mastery_kept: 0,
        follow_ups: 1,
        follow_ups_kept: 0,
      });
    }
    log.push('UNMOCKED ' + req.method() + ' ' + p);
    return json(404, {});
  });
  return state;
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
const GOOGLE = 'Sign in with Google (Preparation only)';

(async () => {
  const browser = await chromium.launch();
  const fresh = async (scenario) => {
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 } });
    const page = await ctx.newPage();
    const state = await mock(page, scenario);
    return { ctx, page, state };
  };

  // 1. prep-only Google account -> Preparation surface, school features explained
  {
    const { ctx, page, state } = await fresh({ account: PREP });
    await page.goto(BASE + '/login');
    check(
      await seen(page, 'Student sign in'),
      'school login (admission no + PIN) is the default screen',
    );
    await page.getByText(GOOGLE).click();
    await page.waitForURL('**/prepare', { timeout: 10000 }).catch(() => {});
    check(page.url().endsWith('/prepare'), 'Google prep account -> /prepare');
    check(
      state.authorize?.searchParams.get('provider') === 'google' &&
        state.authorize.searchParams.get('code_challenge_method')?.toLowerCase() === 's256',
      'authorize uses Google + PKCE (S256)',
    );
    check(
      state.authorize?.searchParams.get('redirect_to') === BASE + '/auth-callback',
      'redirect_to is /auth-callback',
    );
    check(
      state.exchanged.length === 1 && state.exchanged[0].auth_code === 'test-auth-code-123',
      'code exchanged exactly once with a verifier',
    );
    check(await seen(page, 'Hi, Prep Kid!'), 'prep home greets by name');
    check(await seen(page, 'School features'), 'locked school features are explained');
    check(await seen(page, 'Tests · Assignments'), 'locked list names tests/assignments/etc.');
    check(await seen(page, 'the app moves you on'), 'Prepare explains automatic relief');
    await page.screenshot({ path: SHOTS + '/prep-home.png', fullPage: true });
    for (const r of ['/learn', '/school', '/classes', '/link-prep']) {
      await page.goto(BASE + r);
      await page.waitForTimeout(700);
      check(
        !page.url().endsWith(r),
        `prep user cannot open ${r} -> ${new URL(page.url()).pathname}`,
      );
    }
    await page.goto(BASE + '/settings');
    await page.waitForTimeout(700);
    check(page.url().endsWith('/settings'), 'prep user can open settings');
    await page.goto(BASE + '/prepare');
    await page.getByText('Sign out', { exact: true }).click();
    await page.waitForURL('**/login', { timeout: 8000 }).catch(() => {});
    check(page.url().endsWith('/login'), 'prep sign out -> /login');
    await ctx.close();
  }

  // 2. Google resolves to a SCHOOL account (e.g. 023 not applied) -> signed out, refused
  {
    const school = { ...ADMIN, row: { ...ADMIN.row } };
    const { ctx, page } = await fresh({ account: school });
    await page.goto(BASE + '/login');
    await page.getByText(GOOGLE).click();
    await page.waitForURL('**/login', { timeout: 10000 }).catch(() => {});
    check(
      await seen(page, 'This Google account can’t be used here'),
      'Google -> school account is refused with a message',
    );
    const keys = await page.evaluate(() => Object.keys(localStorage));
    check(
      !keys.some((k) => k.startsWith('sb-') && !k.endsWith('code-verifier')),
      'no session kept',
    );
    await page.goto(BASE + '/school');
    await page.waitForTimeout(700);
    check(!page.url().endsWith('/school'), 'refused account never reaches the admin console');
    await page.screenshot({ path: SHOTS + '/google-refused.png' });
    await ctx.close();
  }

  // 3. db/023 identity guard fires inside GoTrue -> error redirect -> refused
  {
    const { ctx, page, state } = await fresh({ error: 'Database error saving new user' });
    await page.goto(BASE + '/login');
    await page.getByText(GOOGLE).click();
    await page.waitForURL('**/login', { timeout: 10000 }).catch(() => {});
    check(
      (await seen(page, 'This Google account can’t be used here')) && state.exchanged.length === 0,
      'error redirect -> refused, no exchange',
    );
    await ctx.close();
  }

  // 4. shared device: no Google option
  {
    const { ctx, page } = await fresh({ account: PREP });
    await page.goto(BASE + '/login');
    await page.evaluate(() => localStorage.setItem('ns/device/sharedMode', '1'));
    await page.reload();
    await seen(page, 'Student login');
    check(!(await page.getByText(GOOGLE).isVisible()), 'shared mode hides Google sign-in');
    await ctx.close();
  }

  // 5. merged prep account sees where its practice went
  {
    const { ctx, page } = await fresh({ account: PREP, merged: 's-profile' });
    await page.goto(BASE + '/login');
    await page.getByText(GOOGLE).click();
    await page.waitForURL('**/prepare', { timeout: 10000 }).catch(() => {});
    check(
      await seen(page, 'Your practice moved to your school login'),
      'linked account shows the moved notice',
    );
    await ctx.close();
  }

  // 6. admin links a prep account to a student (upgrade path)
  {
    const { ctx, page, state } = await fresh({ account: PREP });
    await page.goto(BASE + '/staff');
    await page.getByLabel('Email').fill(ADMIN.email);
    await page.getByLabel('Password').fill('secret');
    await page.getByText('Sign in', { exact: true }).click();
    await page.waitForURL('**/school', { timeout: 8000 }).catch(() => {});
    await page.getByText('Link a Google account', { exact: true }).click();
    await page.waitForURL('**/link-prep', { timeout: 8000 }).catch(() => {});
    await page.getByLabel('Email or name').fill('zz-nobody');
    await page.getByText('Search', { exact: true }).click();
    check(await seen(page, 'No Google accounts found'), 'link screen: empty state');
    await page.getByLabel('Email or name').fill('prep.kid');
    await page.getByText('Search', { exact: true }).click();
    await page.getByText(PREP.email).click();
    await page.getByLabel('Admission number').fill('2026-001');
    await page.getByText('Find student', { exact: true }).click();
    check(await seen(page, 'Prep Kid (enrolled)'), 'link screen: finds the student');
    await page.getByLabel('Reason', { exact: true }).fill('Admitted to Class 9');
    await page.getByText('Link and move practice', { exact: true }).click({ timeout: 5000 });
    check(await seen(page, 'Moved 7 attempts, 3 mastery rows and 1 follow-ups'), 'link done');
    check(
      state.linked?.p_prep_profile === PREP.id &&
        state.linked.p_student_id === 's-9' &&
        state.linked.p_reason === 'Admitted to Class 9',
      'link_prep_account called with the chosen account, student and reason',
    );
    await page.screenshot({ path: SHOTS + '/link-prep.png', fullPage: true });
    await ctx.close();
  }

  // 7. Urdu: prep home renders right-to-left
  {
    const { ctx, page } = await fresh({ account: PREP });
    await page.goto(BASE + '/login');
    await page.getByText('اردو', { exact: true }).first().click();
    await page.getByText(GOOGLE).click();
    await page.waitForURL('**/prepare', { timeout: 10000 }).catch(() => {});
    await seen(page, 'Prep Kid');
    const dir = await page.evaluate(() => document.documentElement.dir || document.body.dir);
    check(page.url().endsWith('/prepare') && dir === 'rtl', 'Urdu: prep home is RTL -> ' + dir);
    await page.screenshot({ path: SHOTS + '/prep-home-ur.png', fullPage: true });
    await ctx.close();
  }

  await browser.close();
  check(foreign.size === 0, 'no request leaves localhost: ' + [...foreign].join(','));
  const bad = log.filter((l) => !l.startsWith('UNMOCKED HEAD'));
  check(bad.length === 0, 'no page errors / unmocked calls: ' + bad.join(' | '));
})();
