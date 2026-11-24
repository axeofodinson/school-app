// Google sign-in (prep-only tier, DECISIONS #23 / #58). Pure flow logic with
// the Supabase and browser calls injected, so it is unit-tested in Node.
//
//   native: signInWithOAuth({ skipBrowserRedirect }) -> open the URL in an auth
//           session (Custom Tab) -> redirect back with ?code -> exchange (PKCE)
//   web:    signInWithOAuth redirects the page; the /auth-callback route then
//           completes with the same completeGoogleCallback().
//
// After the exchange the account's tier is checked: anything that is not a
// prep-only account is signed out again. db/023 already refuses to attach a
// Google identity to a school or staff account; this is the belt to that brace
// (and covers a server where 023 isn't applied yet).

import { classifyAuthError } from './login';

export type GoogleSignInError =
  'cancelled' | 'refused' | 'network' | 'rateLimited' | 'notConfigured' | 'unknown';

export type OAuthCallback = { code: string } | { error: GoogleSignInError } | null;

function paramsOf(url: string): URLSearchParams {
  const out = new URLSearchParams();
  const q = url.indexOf('?');
  const h = url.indexOf('#');
  const query = q >= 0 ? url.slice(q + 1, h > q ? h : undefined) : '';
  const hash = h >= 0 ? url.slice(h + 1) : '';
  for (const part of [query, hash]) {
    new URLSearchParams(part).forEach((v, k) => {
      if (!out.has(k)) out.set(k, v);
    });
  }
  return out;
}

/**
 * Read a redirect URL from Supabase. Returns the PKCE code, a classified error,
 * or null if the URL carries neither (e.g. someone opened /auth-callback directly).
 */
export function parseOAuthCallback(url: string): OAuthCallback {
  const p = paramsOf(url);
  const code = p.get('code');
  const error = p.get('error');
  const description = (p.get('error_description') ?? '').toLowerCase();
  const errorCode = p.get('error_code') ?? '';
  if (error || errorCode) {
    if (error === 'access_denied' && !description.includes('database'))
      return { error: 'cancelled' };
    // db/023's identity guard raises inside GoTrue's transaction; GoTrue reports
    // it as "Database error ...". The main cause is a Google account whose email
    // already belongs to a school or staff login.
    if (description.includes('oauth_school_account') || description.includes('database error')) {
      return { error: 'refused' };
    }
    if (errorCode.includes('rate_limit') || description.includes('rate limit')) {
      return { error: 'rateLimited' };
    }
    return { error: 'unknown' };
  }
  if (code && /^[A-Za-z0-9._~-]{8,512}$/.test(code)) return { code };
  return null;
}

export interface OAuthBackend {
  /** signInWithOAuth({ provider: 'google', options: { redirectTo, skipBrowserRedirect } }). */
  startOAuth(): Promise<{ url: string | null; error: unknown }>;
  /** Native only: open the URL in an auth session and wait for the redirect. */
  openAuthSession?(url: string): Promise<{ type: 'success'; url: string } | { type: 'cancel' }>;
  exchangeCode(code: string): Promise<{ error: unknown }>;
  /** The signed-in account's access_tier (null = unknown / no profile yet). */
  loadTier(): Promise<string | null>;
  signOut(): Promise<void>;
}

function mapClass(c: ReturnType<typeof classifyAuthError>): GoogleSignInError {
  if (c === 'network' || c === 'rateLimited') return c;
  if (c === 'revoked') return 'refused';
  return 'unknown';
}

/** Exchange the code and keep the session only for a prep-only account. */
export async function completeGoogleCallback(
  backend: OAuthBackend,
  url: string,
): Promise<GoogleSignInError | null> {
  const parsed = parseOAuthCallback(url);
  if (!parsed) return 'unknown';
  if ('error' in parsed) return parsed.error;
  try {
    const { error } = await backend.exchangeCode(parsed.code);
    if (error) return mapClass(classifyAuthError(error));
    const tier = await backend.loadTier();
    if (tier !== 'prep_only') {
      await backend.signOut();
      return 'refused';
    }
    return null;
  } catch (e) {
    await backend.signOut().catch(() => undefined);
    return mapClass(classifyAuthError(e));
  }
}

/**
 * Start Google sign-in. Native: runs the whole round trip and returns the
 * result. Web (no openAuthSession): the page navigates away, so null means
 * "redirecting" and /auth-callback finishes the job.
 */
export async function googleSignIn(backend: OAuthBackend): Promise<GoogleSignInError | null> {
  try {
    const { url, error } = await backend.startOAuth();
    if (error) return mapClass(classifyAuthError(error));
    if (!backend.openAuthSession) return null;
    if (!url) return 'unknown';
    const result = await backend.openAuthSession(url);
    if (result.type !== 'success') return 'cancelled';
    return await completeGoogleCallback(backend, result.url);
  } catch (e) {
    return mapClass(classifyAuthError(e));
  }
}
