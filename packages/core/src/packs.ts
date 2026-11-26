// Offline Learn packs (prompt 32): one chapter's lessons, practice items and
// maths, downloaded to use without internet. Pure bookkeeping, unit-tested
// (test/packs.test.ts); the app supplies the storage (PackStore: IndexedDB on
// web, the documents folder on Android) and the request (db/036 learn_pack).
//
// Storage layout (DECISIONS #156):
//   e/l/<content id>/<version>   one lesson version's blocks (immutable)
//   e/q/<question id>/<version>  one practice item version (immutable)
//   e/m/<hash>                   one maths SVG ({ key, svg })
//   i/<user id>/<chapter id>     that user's pack index (what they downloaded)
// Entries are content, keyed by exact version, so they are shared between the
// students of a shared device; a user only ever reads entries their own index
// lists (built from their own RLS-checked request). Deleting a pack removes the
// index, then any entry no index on the device still lists.

/** Async key → string store for pack data. Large values; no size limit assumed. */
export interface PackStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  keys(prefix: string): Promise<string[]>;
}

export interface PackChapter {
  id: string;
  title: string;
  titleUr: string | null;
  subjectId: string | null;
  subjectName: string;
  className: string;
}
export interface PackTopic {
  id: string;
  titleEn: string;
  titleUr: string | null;
  sortOrder: number;
}
export interface PackConcept {
  id: string;
  topicId: string;
  titleEn: string;
  titleUr: string | null;
  sortOrder: number;
}
export interface PackLessonRef {
  id: string;
  topicId: string;
  kind: 'lesson' | 'alternative';
  conceptId: string | null;
  version: number;
  updatedAt: string | null;
}
export interface PackQuestionRef {
  id: string;
  version: number;
  type: string;
  difficulty: number;
  conceptId: string | null;
}
export interface PackQuestion extends PackQuestionRef {
  body: unknown;
  answer: unknown;
  explanation: unknown;
}

export interface PackIndex {
  chapter: PackChapter;
  topics: PackTopic[];
  concepts: PackConcept[];
  lessons: PackLessonRef[];
  questions: PackQuestionRef[];
  /** Maths keys (TeX) the pack's text uses that the server had an SVG for. */
  math: string[];
  /** Server time of the request that built this index. */
  builtAt: string;
  /** Device time of the last successful download / refresh. */
  savedAt: string;
  /** Bytes of the entries this pack lists (shared entries counted per pack). */
  bytes: number;
}

// ───────────────────────────── keys ─────────────────────────────

/** FNV-1a 32-bit, hex: a short, stable file-safe name for a maths key. */
export function packHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export const lessonKey = (id: string, version: number) => `e/l/${id}/${version}`;
export const questionKey = (id: string, version: number) => `e/q/${id}/${version}`;
export const packMathKey = (tex: string) => `e/m/${packHash(tex)}`;
export const indexPrefix = (userId: string) => `i/${userId}/`;
export const indexKey = (userId: string, chapterId: string) => `i/${userId}/${chapterId}`;

/** Every entry key an index lists. */
export function entryKeys(ix: PackIndex): string[] {
  return [
    ...ix.lessons.map((l) => lessonKey(l.id, l.version)),
    ...ix.questions.map((q) => questionKey(q.id, q.version)),
    ...ix.math.map(packMathKey),
  ];
}

/**
 * What to tell the server the device already holds: entries listed by the
 * previous index AND still present in storage (a cleared entry is fetched
 * again).
 */
export function haveMap(
  prev: PackIndex | null,
  present: ReadonlySet<string>,
): Record<string, number> {
  const out: Record<string, number> = {};
  if (!prev) return out;
  for (const l of prev.lessons)
    if (present.has(lessonKey(l.id, l.version))) out[`l:${l.id}`] = l.version;
  for (const q of prev.questions)
    if (present.has(questionKey(q.id, q.version))) out[`q:${q.id}`] = q.version;
  return out;
}

// ───────────────────────────── the server's answer ─────────────────────────────

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);
const s = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const n = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const arr = (v: unknown): Json[] => (Array.isArray(v) ? v.filter(isObj) : []);

export interface ParsedPack {
  chapter: PackChapter;
  builtAt: string;
  topics: PackTopic[];
  concepts: PackConcept[];
  lessons: (PackLessonRef & { blocks: unknown[] | null })[];
  questions: (PackQuestionRef & {
    body?: unknown;
    answer?: unknown;
    explanation?: unknown;
    sent: boolean;
  })[];
}

/** learn_pack's jsonb → typed. Null for an unknown chapter. */
export function parsePack(raw: unknown): ParsedPack | null {
  if (!isObj(raw) || !isObj(raw.chapter)) return null;
  const c = raw.chapter;
  return {
    chapter: {
      id: s(c.id) ?? '',
      title: s(c.title) ?? '',
      titleUr: s(c.title_ur),
      subjectId: s(c.subject_id),
      subjectName: s(c.subject_name) ?? '',
      className: s(c.class_name) ?? '',
    },
    builtAt: s(raw.built_at) ?? new Date(0).toISOString(),
    topics: arr(raw.topics).map((t) => ({
      id: s(t.id) ?? '',
      titleEn: s(t.title_en) ?? '',
      titleUr: s(t.title_ur),
      sortOrder: n(t.sort_order),
    })),
    concepts: arr(raw.concepts).map((k) => ({
      id: s(k.id) ?? '',
      topicId: s(k.topic_id) ?? '',
      titleEn: s(k.title_en) ?? '',
      titleUr: s(k.title_ur),
      sortOrder: n(k.sort_order),
    })),
    lessons: arr(raw.lessons).map((l) => ({
      id: s(l.id) ?? '',
      topicId: s(l.topic_id) ?? '',
      kind: l.kind === 'alternative' ? 'alternative' : 'lesson',
      conceptId: s(l.concept_id),
      version: n(l.version, 1),
      updatedAt: s(l.updated_at),
      blocks: Array.isArray(l.blocks) ? (l.blocks as unknown[]) : null,
    })),
    questions: arr(raw.questions).map((q) => ({
      id: s(q.id) ?? '',
      version: n(q.version, 1),
      type: s(q.type) ?? '',
      difficulty: n(q.difficulty, 2),
      conceptId: s(q.concept_id),
      sent: 'body' in q,
      body: q.body,
      answer: q.answer,
      explanation: q.explanation,
    })),
  };
}

export interface PackPlan {
  /** Entries to write now (new or changed versions). */
  writes: { key: string; value: string }[];
  /** Entry keys the server left out because the device has them. */
  kept: string[];
  /** Entries the server didn't send though the device lacks them (ask again with have = {}). */
  missing: string[];
}

/** Turn the server's answer into storage writes. */
export function planPack(p: ParsedPack, present: ReadonlySet<string>): PackPlan {
  const writes: PackPlan['writes'] = [];
  const kept: string[] = [];
  const missing: string[] = [];
  for (const l of p.lessons) {
    const key = lessonKey(l.id, l.version);
    if (l.blocks) writes.push({ key, value: JSON.stringify(l.blocks) });
    else (present.has(key) ? kept : missing).push(key);
  }
  for (const q of p.questions) {
    const key = questionKey(q.id, q.version);
    if (q.sent) {
      writes.push({
        key,
        value: JSON.stringify({
          body: q.body,
          answer: q.answer,
          explanation: q.explanation ?? null,
        }),
      });
    } else (present.has(key) ? kept : missing).push(key);
  }
  return { writes, kept, missing };
}

/** The index to store once every entry is written. */
export function buildIndex(
  p: ParsedPack,
  math: readonly string[],
  bytes: number,
  savedAt: string,
): PackIndex {
  return {
    chapter: p.chapter,
    topics: p.topics,
    concepts: p.concepts,
    lessons: p.lessons.map(({ id, topicId, kind, conceptId, version, updatedAt }) => ({
      id,
      topicId,
      kind,
      conceptId,
      version,
      updatedAt,
    })),
    questions: p.questions.map(({ id, version, type, difficulty, conceptId }) => ({
      id,
      version,
      type,
      difficulty,
      conceptId,
    })),
    math: [...math].sort(),
    builtAt: p.builtAt,
    savedAt,
    bytes,
  };
}

/** Entry keys no index on the device lists any more (safe to delete). */
export function orphanKeys(
  indexes: readonly PackIndex[],
  entryKeysInStore: readonly string[],
): string[] {
  const used = new Set(indexes.flatMap(entryKeys));
  return entryKeysInStore.filter((k) => k.startsWith('e/') && !used.has(k));
}

/** Refresh a pack in the background when it is older than this. */
export const PACK_REFRESH_MS = 24 * 60 * 60 * 1000;

export function packIsStale(ix: PackIndex, nowMs: number): boolean {
  const t = Date.parse(ix.savedAt);
  return !Number.isFinite(t) || nowMs - t > PACK_REFRESH_MS;
}

// ───────────────────────────── reading a pack ─────────────────────────────

/** The lesson the reader shows for a topic: `contentId` if given, else its main lesson. */
export function pickPackLesson(
  ix: PackIndex,
  topicId: string,
  contentId: string | null,
): PackLessonRef | null {
  const mine = ix.lessons.filter((l) => l.topicId === topicId);
  return (
    (contentId ? mine.find((l) => l.id === contentId) : undefined) ??
    mine.find((l) => l.kind === 'lesson') ??
    null
  );
}

/** The topic's practice items (refs), by concept order then id. */
export function packTopicQuestions(ix: PackIndex, topicId: string): PackQuestionRef[] {
  const order = new Map(
    ix.concepts.filter((c) => c.topicId === topicId).map((c) => [c.id, c.sortOrder] as const),
  );
  return ix.questions
    .filter((q) => q.conceptId && order.has(q.conceptId))
    .sort((a, b) => order.get(a.conceptId!)! - order.get(b.conceptId!)! || (a.id < b.id ? -1 : 1));
}

/** Which downloaded chapter (of this user's indexes) holds a topic. */
export function packForTopic(indexes: readonly PackIndex[], topicId: string): PackIndex | null {
  return indexes.find((ix) => ix.topics.some((t) => t.id === topicId)) ?? null;
}
