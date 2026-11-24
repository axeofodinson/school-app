import { describe, expect, it } from 'vitest';

import {
  PREPARATION_FEATURES,
  SCHOOL_ONLY_FEATURES,
  canUse,
  completeGoogleCallback,
  googleSignIn,
  parseOAuthCallback,
  reliefPolicyFor,
  tierOf,
  type OAuthBackend,
} from '../src/auth';

describe('access tiers', () => {
  it('reads the tier, defaulting to school', () => {
    expect(tierOf({ access_tier: 'prep_only' })).toBe('prep_only');
    expect(tierOf({ access_tier: 'school' })).toBe('school');
    expect(tierOf({})).toBe('school');
    expect(tierOf(null)).toBe('school');
    expect(tierOf({ access_tier: 'PREP_ONLY' })).toBe('school');
  });

  it('prep-only gets Preparation and nothing else', () => {
    for (const f of PREPARATION_FEATURES) expect(canUse('prep_only', f)).toBe(true);
    for (const f of SCHOOL_ONLY_FEATURES) expect(canUse('prep_only', f)).toBe(false);
    for (const f of [...PREPARATION_FEATURES, ...SCHOOL_ONLY_FEATURES]) {
      expect(canUse('school', f)).toBe(true);
    }
    // The two lists don't overlap.
    const overlap = PREPARATION_FEATURES.filter((f) =>
      (SCHOOL_ONLY_FEATURES as readonly string[]).includes(f),
    );
    expect(overlap).toEqual([]);
  });

  it('prep-only relief is automatic only (no teacher)', () => {
    expect(reliefPolicyFor('prep_only')).toEqual({
      autoRelief: true,
      teacherOverrides: false,
      examFollowUpsBlockPrepare: false,
      notifyTeacher: false,
    });
    expect(reliefPolicyFor('school').teacherOverrides).toBe(true);
    expect(reliefPolicyFor('school').autoRelief).toBe(true);
  });
});

describe('parseOAuthCallback', () => {
  it('reads a PKCE code from the query', () => {
    expect(parseOAuthCallback('schoolapp://auth-callback?code=abc123DEF-_.~xyz')).toEqual({
      code: 'abc123DEF-_.~xyz',
    });
    expect(parseOAuthCallback('https://app.test/auth-callback?code=abcdefgh#')).toEqual({
      code: 'abcdefgh',
    });
  });

  it('classifies errors from query or hash', () => {
    expect(
      parseOAuthCallback(
        'schoolapp://auth-callback#error=access_denied&error_description=User+cancelled',
      ),
    ).toEqual({ error: 'cancelled' });
    expect(
      parseOAuthCallback(
        'https://x/auth-callback?error=server_error&error_code=unexpected_failure&error_description=Database+error+saving+new+user',
      ),
    ).toEqual({ error: 'refused' });
    expect(
      parseOAuthCallback(
        'https://x/auth-callback?error=access_denied&error_description=Database+error+updating+user',
      ),
    ).toEqual({ error: 'refused' });
    expect(parseOAuthCallback('https://x/cb?error_code=over_request_rate_limit')).toEqual({
      error: 'rateLimited',
    });
    expect(parseOAuthCallback('https://x/cb?error=weird')).toEqual({ error: 'unknown' });
  });

  it('ignores URLs without a usable code', () => {
    expect(parseOAuthCallback('https://x/auth-callback')).toBeNull();
    expect(parseOAuthCallback('https://x/auth-callback?code=short')).toBeNull();
    expect(parseOAuthCallback('https://x/auth-callback?code=bad%20code%3Cscript%3E')).toBeNull();
  });
});

function oauth(opts: {
  start?: { url: string | null; error: unknown };
  browser?: { type: 'success'; url: string } | { type: 'cancel' };
  exchange?: { error: unknown };
  tier?: string | null;
  native?: boolean;
  throwOnExchange?: unknown;
}) {
  const calls: string[] = [];
  const b: OAuthBackend = {
    async startOAuth() {
      calls.push('start');
      return opts.start ?? { url: 'https://supabase.test/authorize', error: null };
    },
    async exchangeCode(code) {
      calls.push(`exchange:${code}`);
      if (opts.throwOnExchange) throw opts.throwOnExchange;
      return opts.exchange ?? { error: null };
    },
    async loadTier() {
      calls.push('tier');
      return opts.tier === undefined ? 'prep_only' : opts.tier;
    },
    async signOut() {
      calls.push('signOut');
    },
  };
  if (opts.native !== false) {
    b.openAuthSession = async (url) => {
      calls.push(`open:${url}`);
      return opts.browser ?? { type: 'success', url: 'schoolapp://auth-callback?code=goodcode1' };
    };
  }
  return { b, calls };
}

describe('googleSignIn', () => {
  it('native: full round trip keeps a prep-only session', async () => {
    const { b, calls } = oauth({});
    expect(await googleSignIn(b)).toBeNull();
    expect(calls).toEqual([
      'start',
      'open:https://supabase.test/authorize',
      'exchange:goodcode1',
      'tier',
    ]);
  });

  it('signs a school or staff account straight back out', async () => {
    for (const tier of ['school', null]) {
      const { b, calls } = oauth({ tier });
      expect(await googleSignIn(b)).toBe('refused');
      expect(calls.at(-1)).toBe('signOut');
    }
  });

  it('reports cancel, refused and network without exchanging', async () => {
    expect(await googleSignIn(oauth({ browser: { type: 'cancel' } }).b)).toBe('cancelled');
    const refused = oauth({
      browser: {
        type: 'success',
        url: 'schoolapp://auth-callback?error=server_error&error_description=Database+error+saving+new+user',
      },
    });
    expect(await googleSignIn(refused.b)).toBe('refused');
    expect(refused.calls.some((c) => c.startsWith('exchange'))).toBe(false);
    expect(
      await googleSignIn(
        oauth({ start: { url: null, error: { name: 'AuthRetryableFetchError' } } }).b,
      ),
    ).toBe('network');
  });

  it('web: null means the page is redirecting', async () => {
    const { b, calls } = oauth({ native: false });
    expect(await googleSignIn(b)).toBeNull();
    expect(calls).toEqual(['start']);
  });

  it('a thrown exchange signs out and classifies', async () => {
    const { b, calls } = oauth({ throwOnExchange: new TypeError('Failed to fetch') });
    expect(await completeGoogleCallback(b, 'https://x/auth-callback?code=goodcode1')).toBe(
      'network',
    );
    expect(calls.at(-1)).toBe('signOut');
  });

  it('a bad exchange (used code) is unknown', async () => {
    const { b } = oauth({ exchange: { error: { status: 400, message: 'invalid flow state' } } });
    expect(await completeGoogleCallback(b, 'https://x/auth-callback?code=goodcode1')).toBe(
      'unknown',
    );
  });
});
