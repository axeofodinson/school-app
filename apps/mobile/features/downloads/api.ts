// Offline Learn packs (prompt 32, db/036): download a chapter, refresh it by
// delta, read lessons and practice from it without internet, delete it. The
// request is learn_pack(chapter, have), which runs under the learner's own RLS,
// so a pack never holds more than the online screens would show. Layout and
// bookkeeping: packages/core/src/packs.ts; storage: lib/packStore(.web).ts.
import {
  buildIndex,
  buildLesson,
  entryKeys,
  haveMap,
  indexKey,
  indexPrefix,
  lessonConceptIds,
  lessonKey,
  lessonMathKeys,
  lessonQuestionIds,
  orphanKeys,
  packForTopic,
  packMathKey,
  packTopicQuestions,
  parsePack,
  pickPackLesson,
  planPack,
  questionKey,
  utf8Bytes,
  type PackIndex,
  type PackQuestionRef,
  type PoolItem,
  type PracticePoolItem,
} from '@school/core';

import { packStore } from '../../lib/packStore';
import { classifyError } from '../../lib/result';
import { supabase } from '../../lib/supabase';
import { isMissingSchema, type LessonData, type QuickItem, type TopicInfo } from '../learn/api';
import type { PracticeData, PracticeQuestion } from '../practice/api';

export type PackError = 'network' | 'forbidden' | 'notReady' | 'notFound' | 'storage' | 'unknown';
export type PackResult<T> = { ok: true; data: T } | { ok: false; error: PackError };

const MATH_CHUNK = 100;

async function readJson<T>(key: string): Promise<T | null> {
  const raw = await packStore.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** This user's downloaded chapters on this device, newest first. */
export async function readIndexes(userId: string): Promise<PackIndex[]> {
  const keys = await packStore.keys(indexPrefix(userId));
  const out: PackIndex[] = [];
  for (const k of keys) {
    const ix = await readJson<PackIndex>(k);
    if (ix?.chapter?.id) out.push(ix);
  }
  return out.sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
}

async function readIndex(userId: string, chapterId: string) {
  return readJson<PackIndex>(indexKey(userId, chapterId));
}

type QStore = { body: unknown; answer: unknown; explanation: unknown };

export interface Downloaded {
  index: PackIndex;
  /** Bytes the server sent for this download (the JSON body, before gzip). */
  transferred: number;
}

/** Download a chapter, or refresh one already here (only changed versions come down). */
export async function downloadPack(
  userId: string,
  chapterId: string,
): Promise<PackResult<Downloaded>> {
  if (!supabase) return { ok: false, error: 'unknown' };
  const db = supabase;
  const prev = await readIndex(userId, chapterId);
  const present = new Set(await packStore.keys('e/'));

  let transferred = 0;
  const ask = async (have: Record<string, number>) => {
    const r = await db
      .rpc('learn_pack', { p_chapter: chapterId, p_have: have as never })
      .retry(false);
    if (r.error) {
      if (isMissingSchema(r.error)) return { error: 'notReady' as const };
      const k = classifyError(r.error);
      return { error: k === 'network' || k === 'forbidden' ? k : ('unknown' as const) };
    }
    transferred += utf8Bytes(JSON.stringify(r.data ?? null));
    return { data: r.data };
  };

  let res = await ask(haveMap(prev, present));
  if ('error' in res) return { ok: false, error: res.error! };
  let pack = parsePack(res.data);
  if (!pack) return { ok: false, error: 'notFound' };
  let plan = planPack(pack, present);
  if (plan.missing.length) {
    // Something the device said it had is gone: ask again for everything.
    res = await ask({});
    if ('error' in res) return { ok: false, error: res.error! };
    pack = parsePack(res.data);
    if (!pack) return { ok: false, error: 'notFound' };
    plan = planPack(pack, new Set());
  }

  let bytes = 0;
  try {
    for (const w of plan.writes) {
      await packStore.put(w.key, w.value);
      bytes += utf8Bytes(w.value);
    }
  } catch {
    return { ok: false, error: 'storage' };
  }

  // Text of every entry (written now or kept) → maths keys and sizes.
  const texts: unknown[] = [];
  for (const l of pack.lessons) {
    const key = lessonKey(l.id, l.version);
    const blocks = l.blocks ?? (await readJson<unknown[]>(key)) ?? [];
    if (!l.blocks) bytes += utf8Bytes(JSON.stringify(blocks));
    texts.push(blocks);
  }
  for (const q of pack.questions) {
    const key = questionKey(q.id, q.version);
    const v = q.sent
      ? { body: q.body, answer: q.answer, explanation: q.explanation }
      : await readJson<QStore>(key);
    if (!q.sent && v) bytes += utf8Bytes(JSON.stringify(v));
    if (v) texts.push([v.body, v.explanation]);
  }
  const wanted = lessonMathKeys(texts);
  const have = new Set(await packStore.keys('e/m/'));
  const math: string[] = [];
  const toFetch: string[] = [];
  for (const k of wanted) (have.has(packMathKey(k)) ? math : toFetch).push(k);
  for (const k of math) bytes += utf8Bytes((await packStore.get(packMathKey(k))) ?? '');
  for (let i = 0; i < toFetch.length; i += MATH_CHUNK) {
    const m = await db
      .from('math_svgs')
      .select('key, svg')
      .in('key', toFetch.slice(i, i + MATH_CHUNK))
      .retry(false);
    if (m.error) {
      if (isMissingSchema(m.error)) break; // 031 not on the project: maths shows as TeX
      return { ok: false, error: classifyError(m.error) === 'network' ? 'network' : 'unknown' };
    }
    transferred += utf8Bytes(JSON.stringify(m.data ?? []));
    try {
      for (const row of m.data ?? []) {
        const value = JSON.stringify({ key: row.key, svg: row.svg });
        await packStore.put(packMathKey(row.key), value);
        bytes += utf8Bytes(value);
        math.push(row.key);
      }
    } catch {
      return { ok: false, error: 'storage' };
    }
  }

  const index = buildIndex(pack, math, bytes, new Date().toISOString());
  try {
    await packStore.put(indexKey(userId, chapterId), JSON.stringify(index));
  } catch {
    return { ok: false, error: 'storage' };
  }
  if (prev) await collectGarbage();
  return { ok: true, data: { index, transferred } };
}

/** Remove entries no pack on this device lists any more (any user's). */
async function collectGarbage() {
  const ixKeys = await packStore.keys('i/');
  const all: PackIndex[] = [];
  for (const k of ixKeys) {
    const ix = await readJson<PackIndex>(k);
    if (ix) all.push(ix);
  }
  for (const k of orphanKeys(all, await packStore.keys('e/'))) await packStore.remove(k);
}

export async function deletePack(userId: string, chapterId: string): Promise<void> {
  await packStore.remove(indexKey(userId, chapterId));
  await collectGarbage();
}

/** Is every entry this index lists still on the device? */
export async function packComplete(ix: PackIndex): Promise<boolean> {
  const present = new Set(await packStore.keys('e/'));
  return entryKeys(ix).every((k) => present.has(k));
}

// ───────────────────────────── reading ─────────────────────────────

function topicInfo(ix: PackIndex, topicId: string): TopicInfo | null {
  const t = ix.topics.find((x) => x.id === topicId);
  if (!t) return null;
  return {
    id: t.id,
    titleEn: t.titleEn,
    titleUr: t.titleUr,
    chapterTitle: ix.chapter.title,
    chapterTitleUr: ix.chapter.titleUr,
    subjectId: ix.chapter.subjectId,
    subjectName: ix.chapter.subjectName,
    className: ix.chapter.className,
  };
}

function conceptsOf(ix: PackIndex, topicId: string) {
  return ix.concepts
    .filter((c) => c.topicId === topicId)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((c) => ({ id: c.id, titleEn: c.titleEn, titleUr: c.titleUr }));
}

async function loadQuestions(refs: readonly PackQuestionRef[]) {
  const out: (PackQuestionRef & QStore)[] = [];
  for (const q of refs) {
    const v = await readJson<QStore>(questionKey(q.id, q.version));
    if (v) out.push({ ...q, ...v });
  }
  return out;
}

async function loadMath(ix: PackIndex, keys: readonly string[]) {
  const listed = new Set(ix.math);
  const math: Record<string, string> = {};
  for (const k of keys) {
    if (!listed.has(k)) continue;
    const v = await readJson<{ key: string; svg: string }>(packMathKey(k));
    if (v && v.key === k) math[k] = v.svg;
  }
  return math;
}

/** A topic's lesson from a downloaded chapter, shaped like the online read. */
export async function lessonFromPack(
  userId: string,
  topicId: string,
  contentId: string | null,
): Promise<LessonData | null> {
  const ix = packForTopic(await readIndexes(userId), topicId);
  if (!ix) return null;
  const topic = topicInfo(ix, topicId);
  if (!topic) return null;
  const ref = pickPackLesson(ix, topicId, contentId);
  const blocks = ref ? await readJson<unknown[]>(lessonKey(ref.id, ref.version)) : null;
  if (ref && !blocks) return null; // entry lost: not usable offline
  const asRef = (l: NonNullable<typeof ref>) => ({
    contentId: l.id,
    kind: l.kind,
    conceptId: l.conceptId,
    version: l.version,
    currentVersion: l.version,
    status: 'approved' as const,
    origin: 'pack',
    updatedAt: l.updatedAt,
  });
  const lesson = ref && blocks ? { ...asRef(ref), blocks } : null;

  const model = buildLesson(blocks ?? []);
  const concepts = new Set(lessonConceptIds(model));
  const named = new Set(lessonQuestionIds(blocks ?? []));
  const quick = await loadQuestions(
    ix.questions.filter((q) => named.has(q.id) || (q.conceptId && concepts.has(q.conceptId))),
  );
  const items: Record<string, QuickItem> = {};
  for (const q of quick) {
    items[q.id] = {
      questionId: q.id,
      version: q.version,
      type: q.type,
      body: q.body,
      answer: q.answer,
      explanation: q.explanation,
      conceptId: q.conceptId,
    };
  }
  const pool: PoolItem[] = Object.values(items)
    .sort((a, b) => (a.questionId < b.questionId ? -1 : 1))
    .map((q) => ({ questionId: q.questionId, conceptId: q.conceptId }));
  const math = await loadMath(
    ix,
    lessonMathKeys([blocks ?? [], quick.map((q) => [q.body, q.explanation])]),
  );
  return {
    topic,
    concepts: conceptsOf(ix, topicId),
    lesson,
    contents: ix.lessons.filter((l) => l.topicId === topicId).map(asRef),
    math,
    items,
    pool,
    fromCache: true,
  };
}

/** A topic's practice pool from a downloaded chapter (history comes from the device). */
export async function practiceFromPack(
  userId: string,
  topicId: string,
): Promise<PracticeData | null> {
  const ix = packForTopic(await readIndexes(userId), topicId);
  if (!ix) return null;
  const topic = topicInfo(ix, topicId);
  if (!topic) return null;
  const qs = await loadQuestions(packTopicQuestions(ix, topicId));
  const questions: Record<string, PracticeQuestion> = {};
  for (const q of qs) {
    questions[q.id] = {
      questionId: q.id,
      version: q.version,
      type: q.type as PracticeQuestion['type'],
      difficulty: q.difficulty,
      conceptId: q.conceptId!,
      body: q.body,
      answer: q.answer,
      explanation: q.explanation,
    };
  }
  const pool: PracticePoolItem[] = Object.values(questions)
    .sort((a, b) => (a.questionId < b.questionId ? -1 : 1))
    .map(({ questionId, version, conceptId, difficulty, type }) => ({
      questionId,
      version,
      conceptId,
      difficulty,
      type,
    }));
  return {
    topic,
    concepts: conceptsOf(ix, topicId),
    questions,
    pool,
    math: await loadMath(ix, lessonMathKeys(qs.map((q) => [q.body, q.explanation]))),
    hasLesson: ix.lessons.some((l) => l.topicId === topicId && l.kind === 'lesson'),
    attempts: [],
    fromCache: true,
  };
}
