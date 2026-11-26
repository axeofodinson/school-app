// The practice engine (LMS_AUDIT §3.1, prompt 31): one engine, modes are configs.
//
//   selectItems(pool, history, rules)  → the set (never repeats an item)
//   scorePracticeAnswer(item, answer)  → right / wrong (same rule as exams: autoMark)
//   buildAttemptRow(...)               → one compact practice_attempts row
//   retryWrongIds(answers)             → the "retry the wrong ones" set
//   summarizeByConcept(answers, pool)  → end-of-set summary, weakest concept first
//
// Pure: no React, no I/O, randomness injected. Mastery is NOT computed here: the
// server recomputes it from raw rows (prompt 40); the client never writes it.
import { autoMarkItem } from '../autoMark';
import { pickDiagnostic, type DiagnosticPoolItem } from '../mastery';

/** Question types practice can mark on the device (the rest need a teacher). */
export const PRACTICE_TYPES = ['mcq', 'true_false', 'numeric', 'short_text'] as const;
export type PracticeType = (typeof PRACTICE_TYPES)[number];
export const isPracticeType = (t: string): t is PracticeType =>
  (PRACTICE_TYPES as readonly string[]).includes(t);

/**
 * The four modes the picker offers, plus two the Prepare tab starts (prompt 41):
 * `diagnose` (a topic's diagnostic, same order as the server's diagnostic_items)
 * and `followup` (fresh items of one concept for an open follow-up).
 */
export type PracticeMode = 'practice' | 'drill' | 'review' | 'retry' | 'diagnose' | 'followup';
export const PRACTICE_MODES: readonly PracticeMode[] = ['practice', 'drill', 'review', 'retry'];
export const ALL_PRACTICE_MODES: readonly PracticeMode[] = [
  ...PRACTICE_MODES,
  'diagnose',
  'followup',
];
export const isPracticeMode = (m: unknown): m is PracticeMode =>
  typeof m === 'string' && (ALL_PRACTICE_MODES as readonly string[]).includes(m);

export type AttemptKind = 'practice' | 'revision' | 'diagnostic' | 'followup';

/** `practice_attempts.kind` for each mode (017's check list). */
export function practiceKind(mode: PracticeMode): AttemptKind {
  if (mode === 'review') return 'revision';
  if (mode === 'diagnose') return 'diagnostic';
  if (mode === 'followup') return 'followup';
  return 'practice';
}

export const PRACTICE_LIMITS = {
  /** Default set size for practice / drill / review. */
  setSize: 10,
  /** Hard cap on one row's items (free-tier row size; smallint counts). */
  maxItems: 50,
  /** Longest time one answer may report (a tab left open overnight is not data). */
  maxMs: 30 * 60_000,
  /** Free-text answers are cut to this many characters in the row. */
  maxAnswerChars: 200,
  /** A concept below this share right (with ≥ 2 answers) is "weak" for review. */
  weakBelow: 0.6,
  /** A seen item is "due" for review after this long. */
  dueAfterMs: 7 * 24 * 60 * 60_000,
} as const;

export interface PracticePoolItem {
  questionId: string;
  version: number;
  conceptId: string | null;
  /** 1 easy · 2 medium · 3 hard (017 check). */
  difficulty: number;
  type: string;
}

/** One question's history for this learner (built from attempts, see historyFromAttempts). */
export interface ItemHistory {
  seen: number;
  wrong: number;
  lastCorrect: boolean;
  /** ms since epoch of the last answer. */
  lastAt: number;
}
export type PracticeHistory = Readonly<Record<string, ItemHistory>>;

export interface SelectRules {
  mode: PracticeMode;
  /** Defaults to PRACTICE_LIMITS.setSize (retry: every wrong item, capped). */
  size?: number;
  /** drill: the concept(s) to drill. Others: optional filter. */
  conceptIds?: readonly string[];
  /** retry: the ids to retry (e.g. the last set's wrong ones). Else history's last-wrong. */
  retryIds?: readonly string[];
  /** diagnose: concept id → its order in the topic (missing = 0). */
  conceptOrder?: Readonly<Record<string, number>>;
  now: number;
}

export type SelectReason =
  /** A full set. */
  | 'ok'
  /** Fewer than asked: the pool is smaller. */
  | 'short'
  /** review with nothing to review yet: a normal practice set instead. */
  | 'fallback'
  /** Nothing to practise. */
  | 'empty';

export interface Selection {
  items: PracticePoolItem[];
  reason: SelectReason;
}

type Rand = () => number;

function shuffle<T>(xs: readonly T[], rand: Rand): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const x = a[i]!;
    a[i] = a[j]!;
    a[j] = x;
  }
  return a;
}

function uniquePool(pool: readonly PracticePoolItem[]): PracticePoolItem[] {
  const seen = new Set<string>();
  const out: PracticePoolItem[] = [];
  for (const p of pool) {
    if (!isPracticeType(p.type) || seen.has(p.questionId)) continue;
    seen.add(p.questionId);
    out.push(p);
  }
  return out;
}

const clampDifficulty = (d: number) => (d <= 1 ? 1 : d >= 3 ? 3 : 2);

/**
 * The difficulty plan for a set of n: about 30 % easy, 40 % medium, 30 % hard,
 * in rising order (warm up, then stretch). Pure function of n.
 */
export function difficultyPlan(n: number): number[] {
  if (n <= 0) return [];
  const easy = Math.round(n * 0.3);
  const hard = Math.round(n * 0.3);
  const medium = Math.max(0, n - easy - hard);
  return [
    ...Array<number>(easy).fill(1),
    ...Array<number>(medium).fill(2),
    ...Array<number>(hard).fill(3),
  ];
}

/**
 * Freshness tier of an item for this learner: 0 = never seen, 1 = seen. Lower
 * goes first; inside a tier the longest-ago seen goes first, then a coin toss.
 */
function rankKey(h: ItemHistory | undefined): [number, number] {
  return h ? [1, h.lastAt] : [0, 0];
}

/**
 * Practice / drill: unseen first, difficulty mix in a rising plan, and concept
 * coverage (round-robin over the concepts in the pool, in a shuffled order).
 */
function selectMixed(
  pool: readonly PracticePoolItem[],
  history: PracticeHistory,
  size: number,
  rand: Rand,
): PracticePoolItem[] {
  // Per-concept candidate lists, best first.
  const tie = new Map(pool.map((p) => [p.questionId, rand()]));
  const byConcept = new Map<string, PracticePoolItem[]>();
  for (const p of pool) {
    const k = p.conceptId ?? '';
    const list = byConcept.get(k) ?? [];
    list.push(p);
    byConcept.set(k, list);
  }
  const better = (a: PracticePoolItem, b: PracticePoolItem) => {
    const [ta, la] = rankKey(history[a.questionId]);
    const [tb, lb] = rankKey(history[b.questionId]);
    return ta - tb || la - lb || tie.get(a.questionId)! - tie.get(b.questionId)!;
  };
  for (const list of byConcept.values()) list.sort(better);
  const concepts = shuffle([...byConcept.keys()].sort(), rand);

  const n = Math.min(size, pool.length);
  const plan = difficultyPlan(n);
  // Spread the plan across concepts: slot i goes to concept i mod k.
  const picked: PracticePoolItem[] = [];
  const taken = new Set<string>();
  const order = shuffle(
    plan.map((d, i) => ({ d, i })),
    rand,
  );
  let ci = 0;
  for (const slot of order) {
    let choice: PracticePoolItem | null = null;
    // Unseen items anywhere beat seen ones (first pass), then concepts in
    // round-robin order from ci; in a concept, the best item at the planned
    // difficulty, else the nearest difficulty.
    for (const freshOnly of [true, false]) {
      for (let tries = 0; tries < concepts.length && !choice; tries++) {
        const list = byConcept.get(concepts[(ci + tries) % concepts.length]!)!;
        const src = list.filter(
          (p) => !taken.has(p.questionId) && (!freshOnly || !history[p.questionId]),
        );
        if (!src.length) continue;
        for (const dist of [0, 1, 2]) {
          choice =
            src.find((p) => Math.abs(clampDifficulty(p.difficulty) - slot.d) === dist) ?? null;
          if (choice) break;
        }
        if (choice) ci = (ci + tries + 1) % concepts.length;
      }
      if (choice) break;
    }
    if (!choice) break;
    taken.add(choice.questionId);
    picked.push(choice);
  }
  // Rising difficulty, stable for equal difficulty.
  return picked
    .map((p, i) => ({ p, i }))
    .sort((a, b) => clampDifficulty(a.p.difficulty) - clampDifficulty(b.p.difficulty) || a.i - b.i)
    .map((x) => x.p);
}

/** Share right per concept from history over this pool (null = fewer than 2 answers). */
export function conceptAccuracy(
  pool: readonly PracticePoolItem[],
  history: PracticeHistory,
): Record<string, { right: number; total: number; share: number | null }> {
  const out: Record<string, { right: number; total: number; share: number | null }> = {};
  for (const p of pool) {
    const k = p.conceptId ?? '';
    const h = history[p.questionId];
    const o = (out[k] ??= { right: 0, total: 0, share: null });
    if (!h) continue;
    o.total += h.seen;
    o.right += h.seen - h.wrong;
  }
  for (const o of Object.values(out)) o.share = o.total >= 2 ? o.right / o.total : null;
  return out;
}

/**
 * Smart review: items last answered wrong, then items in weak concepts, then
 * items not seen for a week, oldest first. Only items seen before (it is review);
 * with nothing to review yet it falls back to a practice set.
 */
function selectReview(
  pool: readonly PracticePoolItem[],
  history: PracticeHistory,
  size: number,
  now: number,
  rand: Rand,
): PracticePoolItem[] {
  const acc = conceptAccuracy(pool, history);
  const weak = (p: PracticePoolItem) => {
    const s = acc[p.conceptId ?? '']?.share;
    return s !== null && s !== undefined && s < PRACTICE_LIMITS.weakBelow;
  };
  const tie = new Map(pool.map((p) => [p.questionId, rand()]));
  const tier = (p: PracticePoolItem) => {
    const h = history[p.questionId]!;
    if (!h.lastCorrect) return 0;
    if (weak(p)) return 1;
    if (now - h.lastAt >= PRACTICE_LIMITS.dueAfterMs) return 2;
    return 3;
  };
  const seen = pool.filter((p) => history[p.questionId]);
  const due = seen.filter((p) => tier(p) < 3);
  return due
    .sort(
      (a, b) =>
        tier(a) - tier(b) ||
        history[a.questionId]!.lastAt - history[b.questionId]!.lastAt ||
        tie.get(a.questionId)! - tie.get(b.questionId)!,
    )
    .slice(0, size);
}

/**
 * Pick a set. Never repeats an item within a set, ignores types practice can't
 * mark, and is deterministic for a given `rand`.
 */
export function selectItems(
  pool: readonly PracticePoolItem[],
  history: PracticeHistory,
  rules: SelectRules,
  rand: Rand = Math.random,
): Selection {
  const size = Math.max(
    1,
    Math.min(PRACTICE_LIMITS.maxItems, Math.floor(rules.size ?? PRACTICE_LIMITS.setSize)),
  );
  let items = uniquePool(pool);
  if (rules.conceptIds?.length) {
    const want = new Set(rules.conceptIds);
    items = items.filter((p) => p.conceptId !== null && want.has(p.conceptId));
  }
  if (!items.length) return { items: [], reason: 'empty' };

  if (rules.mode === 'retry') {
    const ids = rules.retryIds
      ? new Set(rules.retryIds)
      : new Set(Object.keys(history).filter((q) => history[q]?.lastCorrect === false));
    const wrong = items.filter((p) => ids.has(p.questionId));
    const capped = rules.size
      ? size
      : Math.min(PRACTICE_LIMITS.maxItems, Math.max(wrong.length, 1));
    const out = shuffle(wrong, rand).slice(0, capped);
    return { items: out, reason: out.length ? 'ok' : 'empty' };
  }

  if (rules.mode === 'diagnose') {
    // Same order as db/019 diagnostic_pick (shared vectors), so offline = online.
    const byId = new Map(items.map((p) => [p.questionId, p]));
    const dpool: DiagnosticPoolItem[] = items.map((p) => ({
      q: p.questionId,
      concept: p.conceptId ?? '',
      order: rules.conceptOrder?.[p.conceptId ?? ''] ?? 0,
      d: clampDifficulty(p.difficulty),
      seen: history[p.questionId]?.lastAt ?? null,
    }));
    const out = pickDiagnostic(dpool, size).map((q) => byId.get(q)!);
    return { items: out, reason: out.length < size ? 'short' : 'ok' };
  }

  if (rules.mode === 'review') {
    const out = selectReview(items, history, size, rules.now, rand);
    if (out.length) return { items: out, reason: out.length < size ? 'short' : 'ok' };
    const fb = selectMixed(items, history, size, rand);
    return { items: fb, reason: fb.length ? 'fallback' : 'empty' };
  }

  const out = selectMixed(items, history, size, rand);
  return { items: out, reason: out.length < size ? 'short' : 'ok' };
}

/** How many items each mode would give right now (for the mode picker). */
export function modeCounts(
  pool: readonly PracticePoolItem[],
  history: PracticeHistory,
  now: number,
): { practice: number; review: number; retry: number; unseen: number } {
  const items = uniquePool(pool);
  return {
    practice: Math.min(items.length, PRACTICE_LIMITS.setSize),
    review: selectReview(items, history, PRACTICE_LIMITS.maxItems, now, () => 0.5).length,
    retry: items.filter((p) => history[p.questionId]?.lastCorrect === false).length,
    unseen: items.filter((p) => !history[p.questionId]).length,
  };
}

// ─────────────────────────────── scoring ───────────────────────────────

/**
 * Right or wrong, by the same rule as exams (autoMark). `null` = the item can't
 * be marked on the device (no key or an unsupported type): leave it out of sets.
 */
export function scorePracticeAnswer(
  item: { type: string; answer: unknown },
  value: unknown,
): boolean | null {
  if (!isPracticeType(item.type)) return null;
  return autoMarkItem(item.type, value, item.answer);
}

/** Is there an answer to check (an empty text box isn't one)? */
export function hasAnswer(value: unknown): boolean {
  if (typeof value === 'string') return value.trim() !== '';
  return typeof value === 'boolean';
}

// ───────────────────────────── attempt row ─────────────────────────────

/** One answered item in a set, as the app keeps it before the row is built. */
export interface PracticeAnswer {
  questionId: string;
  version: number;
  value: string | boolean;
  correct: boolean;
  ms: number;
  flagged?: boolean;
  /** The learner opened the tip before answering. */
  tip?: boolean;
}

/**
 * `practice_attempts.items[]` (DATABASE_DESIGN §4): q, v, a, c, ms. Optional
 * f: 1 (flagged "check this question") and t: 1 (tip opened first) only when set.
 */
export interface AttemptItem {
  q: string;
  v: number;
  a: string | boolean;
  c: boolean;
  ms: number;
  f?: 1;
  t?: 1;
}

export interface PracticeAttemptRow {
  id: string;
  learner_id: string;
  kind: AttemptKind;
  topic_id: string | null;
  follow_up_id: string | null;
  started_at: string;
  finished_at: string;
  items: AttemptItem[];
  n_correct: number;
  n_total: number;
  device_id: string | null;
}

export function toAttemptItem(a: PracticeAnswer): AttemptItem {
  const ms = Number.isFinite(a.ms)
    ? Math.min(PRACTICE_LIMITS.maxMs, Math.max(0, Math.round(a.ms)))
    : 0;
  const v =
    typeof a.value === 'string' ? a.value.slice(0, PRACTICE_LIMITS.maxAnswerChars) : a.value;
  const it: AttemptItem = { q: a.questionId, v: a.version, a: v, c: a.correct, ms };
  if (a.flagged) it.f = 1;
  if (a.tip) it.t = 1;
  return it;
}

export function buildAttemptRow(input: {
  id: string;
  learnerId: string;
  mode: PracticeMode;
  topicId: string | null;
  startedAt: number;
  finishedAt: number;
  answers: readonly PracticeAnswer[];
  deviceId?: string | null;
  /** followup mode: the follow-up this set is a round of. */
  followUpId?: string | null;
}): PracticeAttemptRow {
  // One row per item: if an item was somehow answered twice, the first answer counts.
  const seen = new Set<string>();
  const items: AttemptItem[] = [];
  for (const a of input.answers) {
    if (seen.has(a.questionId) || items.length >= PRACTICE_LIMITS.maxItems) continue;
    seen.add(a.questionId);
    items.push(toAttemptItem(a));
  }
  const finished = Math.max(input.finishedAt, input.startedAt);
  return {
    id: input.id,
    learner_id: input.learnerId,
    kind: practiceKind(input.mode),
    topic_id: input.topicId,
    follow_up_id: input.mode === 'followup' ? (input.followUpId ?? null) : null,
    started_at: new Date(input.startedAt).toISOString(),
    finished_at: new Date(finished).toISOString(),
    items,
    n_correct: items.filter((i) => i.c).length,
    n_total: items.length,
    device_id: input.deviceId ?? null,
  };
}

/** Is this a well-formed attempt item (for rows read back from the server or a cache)? */
export function isAttemptItem(x: unknown): x is AttemptItem {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.q === 'string' &&
    typeof o.v === 'number' &&
    (typeof o.a === 'string' || typeof o.a === 'boolean') &&
    typeof o.c === 'boolean' &&
    typeof o.ms === 'number'
  );
}

// ─────────────────────────────── history ───────────────────────────────

/** Fold attempts (server rows + rows still on the device) into per-item history. */
export function historyFromAttempts(
  attempts: readonly { id: string; started_at: string; items: unknown }[],
): Record<string, ItemHistory> {
  const byId = new Map<string, { started_at: string; items: unknown }>();
  for (const a of attempts) byId.set(a.id, a); // same id twice (cache + server) = once
  const rows = [...byId.values()].sort(
    (a, b) => Date.parse(a.started_at) - Date.parse(b.started_at),
  );
  const out: Record<string, ItemHistory> = {};
  for (const r of rows) {
    const at = Date.parse(r.started_at) || 0;
    if (!Array.isArray(r.items)) continue;
    for (const it of r.items) {
      if (!isAttemptItem(it)) continue;
      const h = (out[it.q] ??= { seen: 0, wrong: 0, lastCorrect: true, lastAt: 0 });
      h.seen += 1;
      if (!it.c) h.wrong += 1;
      if (at >= h.lastAt) {
        h.lastAt = at;
        h.lastCorrect = it.c;
      }
    }
  }
  return out;
}

/** The ids answered wrong in a set, in set order: the "retry the wrong ones" set. */
export function retryWrongIds(answers: readonly { questionId: string; correct: boolean }[]) {
  const out: string[] = [];
  for (const a of answers) if (!a.correct && !out.includes(a.questionId)) out.push(a.questionId);
  return out;
}

// ─────────────────────────────── summary ───────────────────────────────

export interface ConceptSummary {
  conceptId: string | null;
  right: number;
  total: number;
  /** Question ids answered wrong in this concept. */
  wrongIds: string[];
}

/**
 * End-of-set summary by concept, weakest share first (then most questions). No
 * streaks or time as success metrics (principle 10): only what was understood.
 */
export function summarizeByConcept(
  answers: readonly { questionId: string; correct: boolean }[],
  pool: readonly Pick<PracticePoolItem, 'questionId' | 'conceptId'>[],
): ConceptSummary[] {
  const conceptOf = new Map(pool.map((p) => [p.questionId, p.conceptId]));
  const map = new Map<string, ConceptSummary>();
  for (const a of answers) {
    const c = conceptOf.get(a.questionId) ?? null;
    const k = c ?? '';
    const s = map.get(k) ?? { conceptId: c, right: 0, total: 0, wrongIds: [] };
    s.total += 1;
    if (a.correct) s.right += 1;
    else s.wrongIds.push(a.questionId);
    map.set(k, s);
  }
  return [...map.values()].sort(
    (a, b) => a.right / a.total - b.right / b.total || b.total - a.total,
  );
}
