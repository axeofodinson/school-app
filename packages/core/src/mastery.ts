// Mastery + diagnostics (LMS_AUDIT §1.2 5.4, §3.5; DECISIONS #26; prompt 40).
//
//   masteryFromEvents(events, cfg, prev) → band + the explanation behind it
//   pickDiagnostic(pool, n)              → ordered diagnostic set, every concept covered
//   diagnosticSize(...)                  → how many items a topic's diagnostic gets
//
// The SERVER is the authority: db/019 runs the same rules in SQL
// (mastery_eval / diagnostic_pick) and writes concept_mastery. This copy is for
// offline previews ("2 more to go") and is pinned to the SQL by the shared
// vectors in test/fixtures/mastery-cases.json + diagnostic-cases.json.
// Pure: no React, no I/O.

export type MasteryState = 'learning' | 'weak' | 'mastered' | 'carried_over';

/** Thresholds. The live values sit in `mastery_config` (one row) so they can be tuned. */
export interface MasteryConfig {
  /** Distinct questions in the window (latest answer of each). */
  window: number;
  /** Mastered needs at least this % right in a full window. */
  masteredPct: number;
  /** Difficulty counted as hard. */
  hardLevel: number;
  /** Hard questions answered right inside the window. */
  needHard: number;
  /** Questions answered right the first time they were ever seen, inside the window. */
  needFresh: number;
  /** Weak = at least this many in the window and below `weakPct` right. */
  weakMin: number;
  weakPct: number;
  /** A follow-up round counts as passed at `masteredPct` with at least this many items. */
  roundMin: number;
  /** Rounds before automatic relief. */
  reliefRounds: number;
  diagnosticDefault: number;
  diagnosticMin: number;
  diagnosticMax: number;
  /** Days after mastery (or relief) before the first spaced review. */
  firstReviewDays: number;
}

export const MASTERY_DEFAULTS: Readonly<MasteryConfig> = Object.freeze({
  window: 5,
  masteredPct: 80,
  hardLevel: 3,
  needHard: 1,
  needFresh: 1,
  weakMin: 3,
  weakPct: 60,
  roundMin: 3,
  reliefRounds: 3,
  diagnosticDefault: 30,
  diagnosticMin: 5,
  diagnosticMax: 60,
  firstReviewDays: 7,
});

/** One server-marked answer to a question of the concept. */
export interface MasteryEvent {
  /** question id */
  q: string;
  /** right? (server-marked) */
  c: boolean;
  /** difficulty 1–3 of the answered version */
  d: number;
  /** when (ms since epoch; attempt start) */
  t: number;
  /** order inside the attempt (0-based) */
  i: number;
  /** excluded (retired question / unknown version): ignored */
  x?: boolean;
}

/** What is still missing before the concept counts as mastered. */
export type MasteryNeed = 'more' | 'accuracy' | 'hard' | 'fresh';

export interface MasteryResult {
  state: MasteryState;
  nAttempted: number;
  nCorrect: number;
  nDistinct: number;
  window: { n: number; right: number; hard: number; fresh: number };
  /** Empty when mastered by evidence. */
  needs: MasteryNeed[];
  /** Mastered by this window (false when only kept from before). */
  masteredNow: boolean;
}

const byTime = (a: MasteryEvent, b: MasteryEvent) => a.t - b.t || a.i - b.i;

/**
 * The explainable v1 rule (DECISIONS #26, #134):
 * window = the latest answer of each of the last `window` distinct questions.
 * Mastered = full window, ≥ masteredPct right, ≥ needHard hard ones right, and
 * ≥ needFresh right the first time ever seen. Mastered never goes back (the
 * mosaic tile stays; spaced revision checks it later). Weak = ≥ weakMin in the
 * window and < weakPct right. Carried over (after relief) stays until mastered.
 */
export function masteryFromEvents(
  events: readonly MasteryEvent[],
  cfg: MasteryConfig = MASTERY_DEFAULTS,
  prev: MasteryState | null = null,
): MasteryResult {
  const ev = events.filter((e) => !e.x).sort(byTime);
  const first = new Map<string, MasteryEvent>();
  const last = new Map<string, MasteryEvent>();
  const count = new Map<string, number>();
  let nCorrect = 0;
  for (const e of ev) {
    if (!first.has(e.q)) first.set(e.q, e);
    last.set(e.q, e);
    count.set(e.q, (count.get(e.q) ?? 0) + 1);
    if (e.c) nCorrect += 1;
  }
  const win = [...last.values()].sort((a, b) => byTime(b, a)).slice(0, cfg.window);
  const right = win.filter((e) => e.c).length;
  const hard = win.filter((e) => e.c && e.d >= cfg.hardLevel).length;
  const fresh = win.filter((e) => e.c && count.get(e.q) === 1).length;
  const n = win.length;

  const needs: MasteryNeed[] = [];
  if (n < cfg.window) needs.push('more');
  if (n === 0 || right * 100 < cfg.masteredPct * n) needs.push('accuracy');
  if (hard < cfg.needHard) needs.push('hard');
  if (fresh < cfg.needFresh) needs.push('fresh');
  const masteredNow = needs.length === 0;

  let state: MasteryState;
  if (masteredNow || prev === 'mastered') state = 'mastered';
  else if (n >= cfg.weakMin && right * 100 < cfg.weakPct * n) state = 'weak';
  else if (prev === 'carried_over') state = 'carried_over';
  else state = 'learning';

  return {
    state,
    nAttempted: ev.length,
    nCorrect,
    nDistinct: first.size,
    window: { n, right, hard, fresh },
    needs,
    masteredNow,
  };
}

// ───────────────────────────── diagnostics ─────────────────────────────

/** An approved practice item a diagnostic may use. */
export interface DiagnosticPoolItem {
  q: string;
  concept: string;
  /** the concept's sort order in its topic */
  order: number;
  d: number;
  /** last time this learner answered it (ms), null = never */
  seen: number | null;
}

// Within a difficulty "round", medium first, then easy, then hard.
const D_ORDER: Readonly<Record<number, number>> = { 2: 0, 1: 1, 3: 2 };
const dOrder = (d: number) => D_ORDER[d] ?? 3;
// Byte order, the same as SQL `collate "C"` for uuid text.
const cmpStr = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const seenKey = (s: number | null) => (s === null ? -1 : s);

/**
 * Diagnostic order (same as SQL diagnostic_pick): per concept, never-seen items
 * first (then the longest ago), difficulties interleaved medium → easy → hard;
 * then concepts take turns, so the first k items cover k concepts. Ties break
 * on question id, so the server and the device agree item for item.
 */
export function pickDiagnostic(pool: readonly DiagnosticPoolItem[], n: number): string[] {
  const groups = new Map<string, DiagnosticPoolItem[]>();
  for (const it of pool) {
    const g = groups.get(it.concept);
    if (g) g.push(it);
    else groups.set(it.concept, [it]);
  }
  const ranked: { it: DiagnosticPoolItem; r: number }[] = [];
  for (const items of groups.values()) {
    // k = position among items of the same concept, seen-ness and difficulty.
    const k = new Map<DiagnosticPoolItem, number>();
    const buckets = new Map<string, DiagnosticPoolItem[]>();
    for (const it of items) {
      const key = `${it.seen === null ? 0 : 1}|${it.d}`;
      const b = buckets.get(key);
      if (b) b.push(it);
      else buckets.set(key, [it]);
    }
    for (const b of buckets.values()) {
      b.sort((x, y) => seenKey(x.seen) - seenKey(y.seen) || cmpStr(x.q, y.q));
      b.forEach((it, idx) => k.set(it, idx));
    }
    const sorted = [...items].sort(
      (x, y) =>
        (x.seen === null ? 0 : 1) - (y.seen === null ? 0 : 1) ||
        k.get(x)! - k.get(y)! ||
        dOrder(x.d) - dOrder(y.d) ||
        seenKey(x.seen) - seenKey(y.seen) ||
        cmpStr(x.q, y.q),
    );
    sorted.forEach((it, r) => ranked.push({ it, r }));
  }
  ranked.sort((a, b) => a.r - b.r || a.it.order - b.it.order || cmpStr(a.it.concept, b.it.concept));
  return ranked.slice(0, Math.max(0, n)).map((x) => x.it.q);
}

/**
 * Size of a topic's diagnostic: the topic's own size or the default, kept in
 * [min, max], at least one item per concept that has items, at most the pool.
 */
export function diagnosticSize(
  topicSize: number | null,
  requested: number | null,
  nConcepts: number,
  poolSize: number,
  cfg: MasteryConfig = MASTERY_DEFAULTS,
): number {
  const base = requested ?? topicSize ?? cfg.diagnosticDefault;
  const clamped = Math.min(cfg.diagnosticMax, Math.max(cfg.diagnosticMin, base));
  return Math.min(poolSize, Math.max(clamped, nConcepts));
}
