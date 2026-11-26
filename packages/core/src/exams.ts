// Prompt 50: generated assessments and the student exam clock. Pure and
// unit-tested (test/exams.test.ts); the server (db/020) runs the exam itself.
//
//   Blueprint            what to draw: topics, count, difficulty mix, minutes, marks
//   drawPaper()          one seeded draw per assessment from approved exam-scope items
//   swapQuestion()       another random item from the same topic (builder "Swap")
//   clockOffset() / remainingMs() / formatClock()   timer = deadline − server time
//   normaliseJoinCode()  what a student types → the server's code alphabet
//   ExamSaveState        per-question save bookkeeping (never lose a tap)

export const DIFFICULTIES = [1, 2, 3] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

/** Saved in `assessments.blueprint`; the last one for a class + subject is pre-filled. */
export interface Blueprint {
  /** Chapters to draw from; empty = the whole subject. */
  chapterIds: string[];
  /** Topics to draw from (narrows chapters); empty = every topic of those chapters. */
  topicIds: string[];
  count: number;
  /** Relative weights for easy / medium / hard (any scale; 0 = none). */
  mix: { easy: number; medium: number; hard: number };
  minutes: number;
  marksEach: number;
}

export const BLUEPRINT_LIMITS = {
  count: { min: 1, max: 100 },
  minutes: { min: 5, max: 240 },
  marksEach: { min: 1, max: 20 },
} as const;

export const DEFAULT_BLUEPRINT: Blueprint = {
  chapterIds: [],
  topicIds: [],
  count: 20,
  mix: { easy: 30, medium: 50, hard: 20 },
  minutes: 30,
  marksEach: 1,
};

const clampInt = (v: unknown, min: number, max: number, dflt: number) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : dflt;
};
const ids = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && !!x))] : [];

/** Any stored jsonb → a valid blueprint (unknown or broken fields fall back to defaults). */
export function normaliseBlueprint(raw: unknown): Blueprint {
  const o = (typeof raw === 'object' && raw && !Array.isArray(raw) ? raw : {}) as Record<
    string,
    unknown
  >;
  const m = (typeof o.mix === 'object' && o.mix ? o.mix : {}) as Record<string, unknown>;
  const d = DEFAULT_BLUEPRINT;
  let mix = {
    easy: clampInt(m.easy, 0, 100, d.mix.easy),
    medium: clampInt(m.medium, 0, 100, d.mix.medium),
    hard: clampInt(m.hard, 0, 100, d.mix.hard),
  };
  if (mix.easy + mix.medium + mix.hard === 0) mix = { ...d.mix };
  const L = BLUEPRINT_LIMITS;
  return {
    chapterIds: ids(o.chapterIds),
    topicIds: ids(o.topicIds),
    count: clampInt(o.count, L.count.min, L.count.max, d.count),
    mix,
    minutes: clampInt(o.minutes, L.minutes.min, L.minutes.max, d.minutes),
    marksEach: clampInt(o.marksEach, L.marksEach.min, L.marksEach.max, d.marksEach),
  };
}

/** Counts per difficulty from the weights (largest remainder; always sums to `count`). */
export function mixCounts(count: number, mix: Blueprint['mix']): Record<Difficulty, number> {
  const w = [mix.easy, mix.medium, mix.hard];
  const total = w[0]! + w[1]! + w[2]!;
  const raw = w.map((x) => (total ? (x / total) * count : count / 3));
  const out = raw.map(Math.floor);
  let left = count - out.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, f: r - Math.floor(r) }))
    .sort((a, b) => b.f - a.f || b.i - a.i); // ties go to the harder level last→first
  for (const { i } of order) {
    if (left <= 0) break;
    out[i]! += 1;
    left -= 1;
  }
  return { 1: out[0]!, 2: out[1]!, 3: out[2]! };
}

/** One approved exam-scope item (db/020 `exam_draw_pool`). */
export interface DrawItem {
  id: string;
  version: number;
  chapterId: string;
  topicId: string | null;
  difficulty: number;
  /** When this class last had it in an assessment within the recent window (ISO), null = not recently. */
  lastUsedAt: string | null;
}

export interface DrawPick {
  questionId: string;
  version: number;
  topicId: string | null;
  difficulty: Difficulty;
}

export interface DrawResult {
  picks: DrawPick[];
  /** Per level: how many the blueprint wanted and how many that level had. */
  levels: { difficulty: Difficulty; wanted: number; got: number }[];
  /** Picks taken from another level to make up a short one. */
  borrowed: number;
  /** Questions still missing after borrowing (0 = the full count). */
  missing: number;
  /** Items in scope at all (0 = nothing approved for exams here yet). */
  available: number;
}

/** Small, fast, seeded PRNG (mulberry32): the same seed gives the same paper. */
export function seededRand(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A string → 32-bit seed (FNV-1a), e.g. from the assessment's id. */
export function seedFrom(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const level = (d: number): Difficulty => (d <= 1 ? 1 : d >= 3 ? 3 : 2);

function inScope(pool: readonly DrawItem[], bp: Blueprint): DrawItem[] {
  const ch = new Set(bp.chapterIds);
  const tp = new Set(bp.topicIds);
  return pool.filter(
    (q) =>
      (!ch.size || ch.has(q.chapterId)) && (!tp.size || (q.topicId !== null && tp.has(q.topicId))),
  );
}

/** Round-robin across topics so the paper covers the whole scope; seeded order inside a topic. */
function roundRobin(items: DrawItem[], n: number, rand: () => number): DrawItem[] {
  const keyed = items.map((q) => ({ q, r: rand() }));
  keyed.sort((a, b) => {
    const ua = a.q.lastUsedAt ?? '';
    const ub = b.q.lastUsedAt ?? '';
    return ua < ub ? -1 : ua > ub ? 1 : a.r - b.r;
  });
  const byTopic = new Map<string, DrawItem[]>();
  for (const { q } of keyed) {
    const k = q.topicId ?? `ch:${q.chapterId}`;
    const list = byTopic.get(k) ?? [];
    list.push(q);
    byTopic.set(k, list);
  }
  const queues = [...byTopic.values()];
  const out: DrawItem[] = [];
  while (out.length < n && queues.some((qq) => qq.length)) {
    for (const qq of queues) {
      if (out.length >= n) break;
      const next = qq.shift();
      if (next) out.push(next);
    }
  }
  return out;
}

/**
 * Within a level: items this class hasn't had recently (`lastUsedAt` null; the
 * pool only reports recent use) spread across topics first; recently used ones,
 * oldest first, only when the fresh ones run out.
 */
function dealLevel(items: DrawItem[], n: number, rand: () => number): DrawItem[] {
  const fresh = roundRobin(
    items.filter((q) => !q.lastUsedAt),
    n,
    rand,
  );
  if (fresh.length >= n) return fresh;
  return fresh.concat(
    roundRobin(
      items.filter((q) => q.lastUsedAt),
      n - fresh.length,
      rand,
    ),
  );
}

/**
 * One draw for an assessment (everyone gets the same questions; the server
 * shuffles order and options per student). Honours the topic scope and the
 * difficulty mix, prefers items this class hasn't seen recently, and when a
 * level runs short borrows from the nearest other level, saying so. Never
 * silently returns fewer: `missing` says how many are still short.
 */
export function drawPaper(
  pool: readonly DrawItem[],
  blueprint: Blueprint,
  seed: number,
): DrawResult {
  const bp = normaliseBlueprint(blueprint);
  const rand = seededRand(seed);
  const scoped = inScope(pool, bp);
  const want = mixCounts(bp.count, bp.mix);
  const byLevel: Record<Difficulty, DrawItem[]> = { 1: [], 2: [], 3: [] };
  for (const q of scoped) byLevel[level(q.difficulty)].push(q);

  const taken = new Set<string>();
  const picks: DrawPick[] = [];
  const take = (q: DrawItem) => {
    taken.add(q.id);
    picks.push({
      questionId: q.id,
      version: q.version,
      topicId: q.topicId,
      difficulty: level(q.difficulty),
    });
  };
  const levels = DIFFICULTIES.map((d) => {
    const got = dealLevel(byLevel[d], want[d], rand);
    got.forEach(take);
    return { difficulty: d, wanted: want[d], got: got.length };
  });

  let short = bp.count - picks.length;
  let borrowed = 0;
  if (short > 0) {
    // Nearest level first: medium is next to both; easy and hard borrow medium first.
    const order: Difficulty[][] = [[2], [1, 3]];
    for (const tier of order) {
      for (const d of tier) {
        if (short <= 0) break;
        const rest = byLevel[d].filter((q) => !taken.has(q.id));
        const extra = dealLevel(rest, short, rand);
        extra.forEach(take);
        borrowed += extra.length;
        short -= extra.length;
      }
    }
  }
  // Paper order: by level then topic, so the builder reads easy → hard.
  picks.sort(
    (a, b) => a.difficulty - b.difficulty || (a.topicId ?? '').localeCompare(b.topicId ?? ''),
  );
  return { picks, levels, borrowed, missing: Math.max(0, short), available: scoped.length };
}

/**
 * Swap one picked question for another random one from the same topic (any
 * level if that topic has no other of the same level). Null = nothing to swap in.
 */
export function swapQuestion(
  pool: readonly DrawItem[],
  pickedIds: readonly string[],
  questionId: string,
  rand: () => number = Math.random,
): DrawItem | null {
  const cur = pool.find((q) => q.id === questionId);
  if (!cur) return null;
  const used = new Set(pickedIds);
  const sameTopic = pool.filter(
    (q) =>
      !used.has(q.id) &&
      (cur.topicId ? q.topicId === cur.topicId : q.chapterId === cur.chapterId && !q.topicId),
  );
  const same = sameTopic.filter((q) => level(q.difficulty) === level(cur.difficulty));
  const from = same.length ? same : sameTopic;
  if (!from.length) return null;
  return from[Math.floor(rand() * from.length)] ?? null;
}

// ───────────────────────────── the exam clock ─────────────────────────────

/**
 * Server minus device clock, from one round trip: assume the server stamped
 * `serverNow` half-way between sending and receiving.
 */
export function clockOffset(
  serverNow: string | number,
  sentAt: number,
  receivedAt: number,
): number {
  const s = typeof serverNow === 'number' ? serverNow : Date.parse(serverNow);
  if (!Number.isFinite(s)) return 0;
  return Math.round(s - (sentAt + receivedAt) / 2);
}

/** Time left by the server's clock (never negative). */
export function remainingMs(deadline: string | number, offset: number, deviceNow: number): number {
  const d = typeof deadline === 'number' ? deadline : Date.parse(deadline);
  if (!Number.isFinite(d)) return 0;
  return Math.max(0, d - (deviceNow + offset));
}

/** 65_000 → "1:05"; an hour or more → "1:02:05". */
export function formatClock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** The last minutes get a calm warning (no flashing). */
export const EXAM_WARN_MS = 5 * 60 * 1000;

// ───────────────────────────── join codes ─────────────────────────────

/** The server's alphabet (db/020): no 0/O, 1/I/L, so a code read aloud can't be mistyped. */
export const JOIN_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const JOIN_CODE_LENGTH = 6;

/** Typed code → canonical form, or null if it can't be one (case, spaces and dashes don't matter). */
export function normaliseJoinCode(input: string): string | null {
  const s = input.toUpperCase().replace(/[\s-]/g, '');
  if (s.length !== JOIN_CODE_LENGTH) return null;
  for (const ch of s) if (!JOIN_CODE_ALPHABET.includes(ch)) return null;
  return s;
}

// ───────────────────────────── saving answers ─────────────────────────────

export type ExamValue = string | boolean | null;

/** One question's answer on this device. */
export interface ExamSlot {
  value: ExamValue;
  /** Device time of the tap (ms). */
  at: number;
  /** Server has this exact value. */
  saved: boolean;
}

export type ExamSaveState = Record<string, ExamSlot>;

/** Merge what the server already has (resume on another device) under what this device holds unsaved. */
export function mergeServerAnswers(
  local: ExamSaveState | null | undefined,
  server: Record<string, unknown> | null | undefined,
): ExamSaveState {
  const out: ExamSaveState = {};
  for (const [q, v] of Object.entries(server ?? {})) {
    if (typeof v === 'string' || typeof v === 'boolean' || v === null)
      out[q] = { value: v, at: 0, saved: true };
  }
  for (const [q, s] of Object.entries(local ?? {})) {
    if (!s.saved || !(q in out)) out[q] = s;
  }
  return out;
}

export function setAnswer(
  state: ExamSaveState,
  q: string,
  value: ExamValue,
  at: number,
): ExamSaveState {
  return { ...state, [q]: { value, at, saved: false } };
}

/** A save of `value` came back accepted: mark it saved only if nothing newer was tapped since. */
export function markSaved(
  state: ExamSaveState,
  q: string,
  value: ExamValue,
  at: number,
): ExamSaveState {
  const s = state[q];
  if (!s || s.at !== at || s.value !== value) return state;
  return { ...state, [q]: { ...s, saved: true } };
}

export const unsaved = (state: ExamSaveState): string[] =>
  Object.keys(state).filter((q) => !state[q]!.saved);

export const answeredIn = (state: ExamSaveState): number =>
  Object.values(state).filter((s) => s.value !== null && s.value !== '').length;
