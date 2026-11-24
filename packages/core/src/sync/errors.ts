// What a failed send means for the queue (ported from the old
// src/lib/attemptStore.js isNetworkError / isConflictError):
//   retry      connection dropped, timeout, server busy, expired session: keep it, back off
//   duplicate  the row is already on the server (unique / primary-key clash): done
//   reject     the server said no for good (RLS, check constraint, bad data): keep it,
//              stop retrying, show it. Never silently dropped.

export type SendOutcome = 'ok' | 'duplicate' | 'retry' | 'reject';

export interface SendError {
  name?: string;
  message?: string;
  code?: string;
  status?: number;
}

const NETWORK =
  /network request failed|failed to fetch|networkerror|network error|load failed|timeout|timed out|econn|aborted/;

export function isNetworkError(e: SendError | null | undefined): boolean {
  if (!e) return false;
  const msg = (e.message ?? '').toLowerCase();
  return (
    e.name === 'AuthRetryableFetchError' ||
    e.name === 'AbortError' ||
    e.status === 0 ||
    NETWORK.test(msg)
  );
}

/** The row already exists: unique (enrollment, assessment) or our client UUID. */
export function isConflictError(e: SendError | null | undefined): boolean {
  if (!e) return false;
  const msg = (e.message ?? '').toLowerCase();
  return e.code === '23505' || e.status === 409 || /duplicate key|already exists/.test(msg);
}

/** Classify a send result. `null` error means it landed. */
export function classifySendError(e: SendError | null | undefined): SendOutcome {
  if (!e) return 'ok';
  if (isConflictError(e)) return 'duplicate';
  if (isNetworkError(e)) return 'retry';
  const s = e.status;
  // Server busy / rate limited / gateway: transient.
  if (s !== undefined && (s === 408 || s === 429 || s >= 500)) return 'retry';
  // Expired or missing session: the client refreshes it; try again later.
  if (s === 401 || e.code === 'PGRST301' || e.code === 'PGRST303') return 'retry';
  return 'reject';
}
