// Prompt 51: reading a live exam and its results. Pure and unit-tested
// (test/examResults.test.ts); the numbers come from db/035's exam_live and
// exam_item_analysis.

export type LiveStatus = 'notJoined' | 'writing' | 'idle' | 'handedIn' | 'void';

/** A writing student quiet for this long shows as idle (a closed lid, a lost connection). */
export const IDLE_AFTER_MS = 90_000;

export interface LiveRow {
  status: string | null;
  lastSeenAt: string | null;
  startedAt: string | null;
}

export function liveStatus(r: LiveRow, serverNowMs: number): LiveStatus {
  if (!r.status) return 'notJoined';
  if (r.status === 'void') return 'void';
  if (r.status !== 'in_progress') return 'handedIn';
  const seen = Date.parse(r.lastSeenAt ?? r.startedAt ?? '');
  return Number.isFinite(seen) && serverNowMs - seen > IDLE_AFTER_MS ? 'idle' : 'writing';
}

export function liveCounts(
  rows: readonly LiveRow[],
  serverNowMs: number,
): Record<LiveStatus, number> {
  const out: Record<LiveStatus, number> = {
    notJoined: 0,
    writing: 0,
    idle: 0,
    handedIn: 0,
    void: 0,
  };
  for (const r of rows) out[liveStatus(r, serverNowMs)] += 1;
  return out;
}

/** How a question did: most got it, most missed it, or one wrong option pulled many. */
export type ItemFlag = 'easy' | 'hard' | 'trap' | null;

export interface ItemNumbers {
  papers: number;
  correct: number;
  /** option key (or "true"/"false") → how many picked it. */
  choices: Record<string, number>;
  key: unknown;
}

export const pct = (n: number, d: number): number | null =>
  d > 0 ? Math.round((n / d) * 100) : null;

/**
 * easy ≥ 90 % right, hard < 30 % right; a trap is one wrong option picked by at
 * least as many as the right one (and by 3 or more). Needs 5 papers to say anything.
 */
export function itemFlag(it: ItemNumbers): ItemFlag {
  if (it.papers < 5) return null;
  const p = pct(it.correct, it.papers)!;
  const right = it.key == null ? '' : String(it.key);
  const worst = Object.entries(it.choices)
    .filter(([k]) => k !== right)
    .reduce((m, [, n]) => Math.max(m, n), 0);
  if (worst >= 3 && worst >= it.correct) return 'trap';
  if (p >= 90) return 'easy';
  if (p < 30) return 'hard';
  return null;
}

/** The most-picked wrong option, if any. */
export function topDistractor(it: ItemNumbers): { key: string; count: number } | null {
  const right = it.key == null ? '' : String(it.key);
  let best: { key: string; count: number } | null = null;
  for (const [k, n] of Object.entries(it.choices)) {
    if (k === right || n <= 0) continue;
    if (!best || n > best.count || (n === best.count && k < best.key)) best = { key: k, count: n };
  }
  return best;
}

/** Score spread in five bands of the total (0–19 %, 20–39 %, … 80–100 %). */
export function scoreBands(scores: readonly number[], total: number): number[] {
  const bands = [0, 0, 0, 0, 0];
  if (total <= 0) return bands;
  for (const s of scores) {
    const i = Math.min(4, Math.max(0, Math.floor(((s / total) * 100) / 20)));
    bands[i]! += 1;
  }
  return bands;
}

export function average(xs: readonly number[]): number | null {
  if (!xs.length) return null;
  return Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10;
}

/** Calls `fn` at most once per `ms`, trailing (the last call always lands). */
export function throttle(fn: () => void, ms: number, now: () => number = Date.now) {
  let last = -Infinity;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const run = () => {
    timer = null;
    last = now();
    fn();
  };
  const call = () => {
    if (timer) return;
    const wait = last + ms - now();
    if (wait <= 0) run();
    else timer = setTimeout(run, wait);
  };
  call.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  return call;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

function localised(v: unknown, locale: string): string | null {
  if (typeof v === 'string') return v || null;
  if (isObj(v)) {
    const exact = v[locale];
    if (typeof exact === 'string' && exact) return exact;
    if (typeof v.en === 'string' && v.en) return v.en;
  }
  return null;
}

/** The question's text for a teacher's list (stem, or a pre-reader prompt). */
export function stemText(body: unknown, locale: string): string {
  const b = isObj(body) ? body : {};
  return localised(b.stem, locale) ?? localised(b.prompt, locale) ?? '';
}

/**
 * The bars to draw for a choice item: every option in paper order (unpicked
 * ones show 0), then any picked key the body doesn't list. true/false gets
 * True, False.
 */
export function choiceRows(
  type: string,
  body: unknown,
  choices: Record<string, number>,
  key: unknown,
): { key: string; text: string | null; count: number; correct: boolean }[] {
  const right = key == null ? '' : String(key);
  const listed: { key: string; text: string | null }[] =
    type === 'true_false'
      ? [
          { key: 'true', text: null },
          { key: 'false', text: null },
        ]
      : (isObj(body) && Array.isArray(body.options) ? body.options : [])
          .filter(isObj)
          .map((o) => ({
            key: String(o.key ?? ''),
            text: typeof o.text === 'string' ? o.text : null,
          }))
          .filter((o) => o.key);
  const seen = new Set(listed.map((o) => o.key));
  const extra = Object.keys(choices)
    .filter((k) => !seen.has(k))
    .sort()
    .map((k) => ({ key: k, text: null }));
  return [...listed, ...extra].map((o) => ({
    ...o,
    count: choices[o.key] ?? 0,
    correct: o.key === right,
  }));
}
