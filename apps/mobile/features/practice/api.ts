// Practice (prompt 31): a topic's practice pool, the learner's history, and the
// upload of finished sets. Plain reads; RLS is the boundary (db/017 + 032): a
// student or prep learner reads a question only at the version holding a live
// practice approval, which carries its key for instant feedback. Exam items never
// come through here. A finished set is one compact practice_attempts row, queued
// in the user's durable sync queue (client UUID = row id, so a retry is a no-op).
//
// The pool, the maths and the learner's own recent sets are copied into their
// storage namespace, so a topic opened once practises offline.
import {
  classifySendError,
  historyFromAttempts,
  isPracticeType,
  lessonMathKeys,
  type PracticeAttemptRow,
  type PracticePoolItem,
  type ScopedStore,
  type SendOutcome,
  type SyncItem,
} from '@school/core';

import { readCache, writeCache } from '../../lib/cache';
import { practiceFromPack } from '../downloads/api';
import { classifyError, notConfigured, ok, type PgError, type Result } from '../../lib/result';
import { supabase } from '../../lib/supabase';
import { isMissingSchema, type ConceptInfo, type TopicInfo } from '../learn/api';

export const PRACTICE_KIND = 'practice_attempt';

export interface PracticeQuestion extends PracticePoolItem {
  body: unknown;
  answer: unknown;
  explanation: unknown;
}

export interface PracticeData {
  topic: TopicInfo;
  concepts: ConceptInfo[];
  questions: Record<string, PracticeQuestion>;
  pool: PracticePoolItem[];
  math: Record<string, string>;
  /** The topic has an approved lesson ("See lesson" shows). */
  hasLesson: boolean;
  /** This learner's recent sets on this topic (server rows). */
  attempts: { id: string; started_at: string; items: unknown }[];
  fromCache: boolean;
}

export type PracticeLoad = PracticeData | 'notReady';

type TopicRow = {
  id: string;
  title_en: string;
  title_ur: string | null;
  chapter: {
    title: string;
    title_ur: string | null;
    subject: { id: string; name: string; class: { name: string } | null } | null;
  } | null;
};

class SchemaMissing extends Error {}
function check<T>(r: { data: T | null; error: PgError | null }): T {
  if (r.error) {
    if (isMissingSchema(r.error)) throw new SchemaMissing();
    throw r.error;
  }
  return r.data as T;
}

const POOL_CAP = 1000;
const HISTORY_ROWS = 40;
const poolKey = (topicId: string) => `practice/pool/${topicId}`;
const localKey = (topicId: string) => `practice/sets/${topicId}`;

async function fetchPractice(topicId: string, learnerId: string): Promise<PracticeData> {
  const db = supabase!;
  const [topicR, conceptsR, lessonR, attemptsR] = await Promise.all([
    db
      .from('topics')
      .select(
        'id, title_en, title_ur, chapter:chapters(title, title_ur, subject:subjects(id, name, class:classes(name)))',
      )
      .eq('id', topicId)
      .maybeSingle()
      .retry(false)
      .overrideTypes<TopicRow | null, { merge: false }>(),
    db
      .from('concepts')
      .select('id, title_en, title_ur, sort_order')
      .eq('topic_id', topicId)
      .eq('status', 'active')
      .order('sort_order')
      .retry(false),
    db
      .from('learning_content')
      .select('id')
      .eq('topic_id', topicId)
      .eq('kind', 'lesson')
      .eq('status', 'approved')
      .limit(1)
      .retry(false),
    db
      .from('practice_attempts')
      .select('id, started_at, items')
      .eq('learner_id', learnerId)
      .eq('topic_id', topicId)
      .order('started_at', { ascending: false })
      .limit(HISTORY_ROWS)
      .retry(false),
  ]);
  const t = check(topicR);
  if (!t) throw Object.assign(new Error('not found'), { notFound: true });
  const concepts = check(conceptsR) ?? [];
  const hasLesson = (check(lessonR) ?? []).length > 0;
  const attempts = check(attemptsR) ?? [];

  const questions: Record<string, PracticeQuestion> = {};
  if (concepts.length) {
    const qv = check(
      await db
        .from('question_versions')
        .select('question_id, version, type, difficulty, body, answer, explanation, concept_id')
        .in(
          'concept_id',
          concepts.map((c) => c.id),
        )
        .order('version', { ascending: false })
        .limit(POOL_CAP)
        .retry(false),
    );
    for (const q of qv ?? []) {
      if (questions[q.question_id] || !isPracticeType(q.type)) continue; // newest version first
      questions[q.question_id] = {
        questionId: q.question_id,
        version: q.version,
        type: q.type,
        difficulty: q.difficulty,
        conceptId: q.concept_id,
        body: q.body,
        answer: q.answer,
        explanation: q.explanation,
      };
    }
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

  const keys = lessonMathKeys(Object.values(questions).map((q) => [q.body, q.explanation]));
  const math: Record<string, string> = {};
  if (keys.length) {
    // 031 may not be on the project yet: then maths shows as its TeX source.
    const m = await db.from('math_svgs').select('key, svg').in('key', keys).retry(false);
    if (m.error && !isMissingSchema(m.error)) throw m.error;
    for (const r of m.data ?? []) math[r.key] = r.svg;
  }

  const sub = t.chapter?.subject ?? null;
  return {
    topic: {
      id: t.id,
      titleEn: t.title_en,
      titleUr: t.title_ur,
      chapterTitle: t.chapter?.title ?? '',
      chapterTitleUr: t.chapter?.title_ur ?? null,
      subjectId: sub?.id ?? null,
      subjectName: sub?.name ?? '',
      className: sub?.class?.name ?? '',
    },
    concepts: concepts.map((c) => ({ id: c.id, titleEn: c.title_en, titleUr: c.title_ur })),
    questions,
    pool,
    math,
    hasLesson,
    attempts,
    fromCache: false,
  };
}

/** The topic's practice pool + history; the device copy when the network fails. */
export async function loadPractice(
  topicId: string,
  learnerId: string,
  cache: ScopedStore | null,
): Promise<Result<PracticeLoad> & { notFound?: boolean }> {
  if (!supabase) return notConfigured;
  try {
    const data = await fetchPractice(topicId, learnerId);
    await writeCache(cache, poolKey(topicId), data);
    return ok(data);
  } catch (e) {
    if (e instanceof SchemaMissing) return ok('notReady');
    if ((e as { notFound?: boolean }).notFound)
      return { ok: false, error: 'unknown', notFound: true };
    const kind = classifyError(e as PgError);
    if (kind !== 'forbidden') {
      const copy = await readCache<PracticeData>(cache, poolKey(topicId));
      // A downloaded chapter (prompt 32) when this topic was never opened here;
      // the last copy has this learner's server history, so it wins when present.
      const pack = copy ? null : await practiceFromPack(learnerId, topicId).catch(() => null);
      if (copy) return ok({ ...copy, fromCache: true });
      if (pack) return ok(pack);
    }
    return { ok: false, error: kind };
  }
}

// ─────────────────────────── sets kept on the device ───────────────────────────

type LocalSet = { id: string; started_at: string; items: unknown };

/** Sets finished on this device (so history counts them before they reach the server). */
export async function readLocalSets(cache: ScopedStore | null, topicId: string) {
  return (await readCache<LocalSet[]>(cache, localKey(topicId))) ?? [];
}

export async function rememberSet(cache: ScopedStore | null, row: PracticeAttemptRow) {
  if (!row.topic_id) return;
  const prev = await readLocalSets(cache, row.topic_id);
  const next = [
    { id: row.id, started_at: row.started_at, items: row.items },
    ...prev.filter((s) => s.id !== row.id),
  ].slice(0, HISTORY_ROWS);
  await writeCache(cache, localKey(row.topic_id), next);
}

/** Server rows + device rows, folded (same id counted once). */
export function historyOf(data: PracticeData, local: readonly LocalSet[]) {
  return historyFromAttempts([...data.attempts, ...local]);
}

// ─────────────────────────────── upload ───────────────────────────────

/** Sender for the user's sync queue: the set's own UUID is the row's primary key. */
export async function sendPracticeAttempt(item: SyncItem): Promise<SendOutcome> {
  if (!supabase) return 'retry';
  const row = item.payload as PracticeAttemptRow;
  try {
    const { error } = await supabase
      .from('practice_attempts')
      .insert({ ...row, items: row.items as unknown as never });
    return classifySendError(error);
  } catch (e) {
    return classifySendError(e as PgError);
  }
}
