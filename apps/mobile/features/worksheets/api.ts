// Worksheets (prompt 70): the subject's topics and the items approved for
// worksheet use, with their answers (teachers read keys; RLS db/017 + 032).
// An item counts at the exact version that holds a live `worksheet` approval.
import { lessonMathKeys, type WorksheetPoolItem } from '@school/core';

import { fail, notConfigured, ok, type PgError, type Result } from '../../lib/result';
import { supabase } from '../../lib/supabase';
import { isMissingSchema } from '../learn/api';

export interface WorksheetTopic {
  id: string;
  title: string;
  titleUr: string | null;
  chapterId: string;
  chapterTitle: string;
}

export interface WorksheetPool {
  topics: WorksheetTopic[];
  items: WorksheetPoolItem[];
  math: Record<string, string>;
}

const CHUNK = 150;
const chunks = <T>(xs: readonly T[]) =>
  Array.from({ length: Math.ceil(xs.length / CHUNK) }, (_, i) =>
    xs.slice(i * CHUNK, (i + 1) * CHUNK),
  );

class Missing extends Error {}
function check<T>(r: { data: T | null; error: PgError | null }): T {
  if (r.error) throw isMissingSchema(r.error) ? new Missing() : r.error;
  return r.data as T;
}

/** 'notReady' = the LMS tables aren't on this project yet (db/017). */
export async function loadWorksheetPool(
  subjectId: string,
): Promise<Result<WorksheetPool | 'notReady'>> {
  if (!supabase) return notConfigured;
  const db = supabase;
  try {
    const chapters =
      check(
        await db
          .from('chapters')
          .select('id, title, sort_order')
          .eq('subject_id', subjectId)
          .order('sort_order')
          .retry(false),
      ) ?? [];
    if (!chapters.length) return ok({ topics: [], items: [], math: {} });
    const chapterTitle = new Map(chapters.map((c) => [c.id, c.title]));
    const order = new Map(chapters.map((c, i) => [c.id, i]));
    const topicRows =
      check(
        await db
          .from('topics')
          .select('id, title_en, title_ur, chapter_id, sort_order')
          .in(
            'chapter_id',
            chapters.map((c) => c.id),
          )
          .eq('status', 'active')
          .order('sort_order')
          .retry(false),
      ) ?? [];
    const topics: WorksheetTopic[] = [...topicRows]
      .sort((a, b) => (order.get(a.chapter_id) ?? 0) - (order.get(b.chapter_id) ?? 0))
      .map((t) => ({
        id: t.id,
        title: t.title_en,
        titleUr: t.title_ur,
        chapterId: t.chapter_id,
        chapterTitle: chapterTitle.get(t.chapter_id) ?? '',
      }));
    if (!topics.length) return ok({ topics, items: [], math: {} });

    const concepts =
      check(
        await db
          .from('concepts')
          .select('id, topic_id')
          .in(
            'topic_id',
            topics.map((t) => t.id),
          )
          .retry(false),
      ) ?? [];
    const topicOf = new Map(concepts.map((c) => [c.id, c.topic_id]));
    const versions: {
      question_id: string;
      version: number;
      type: string;
      body: unknown;
      answer: unknown;
      concept_id: string | null;
    }[] = [];
    for (const part of chunks(concepts.map((c) => c.id))) {
      versions.push(
        ...(check(
          await db
            .from('question_versions')
            .select('question_id, version, type, body, answer, concept_id')
            .in('concept_id', part)
            .retry(false),
        ) ?? []),
      );
    }
    const live = new Set<string>();
    for (const part of chunks([...new Set(versions.map((v) => v.question_id))])) {
      for (const a of check(
        await db
          .from('item_approvals')
          .select('item_id, version')
          .eq('item_kind', 'question')
          .eq('scope', 'worksheet')
          .is('revoked_at', null)
          .in('item_id', part)
          .retry(false),
      ) ?? [])
        live.add(`${a.item_id}@${a.version}`);
    }
    const items: WorksheetPoolItem[] = versions
      .filter((v) => live.has(`${v.question_id}@${v.version}`) && v.concept_id)
      .map((v) => ({
        questionId: v.question_id,
        version: v.version,
        topicId: topicOf.get(v.concept_id!) ?? '',
        type: v.type,
        body: v.body,
        answer: v.answer,
      }))
      .filter((v) => v.topicId);

    const math: Record<string, string> = {};
    const keys = lessonMathKeys(items.map((i) => i.body));
    for (const part of chunks(keys)) {
      const m = await db.from('math_svgs').select('key, svg').in('key', part).retry(false);
      if (m.error && !isMissingSchema(m.error)) throw m.error;
      for (const r of m.data ?? []) math[r.key] = r.svg;
    }
    return ok({ topics, items, math });
  } catch (e) {
    if (e instanceof Missing) return ok('notReady');
    return fail(e as PgError);
  }
}
