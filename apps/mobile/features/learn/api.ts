// Learn (prompt 30): a topic's lesson for the reader, the student's list of
// lessons, and the teacher's preview + review of drafts. Plain reads; RLS is the
// boundary (db/017 + db/033): a student or prep learner reads a lesson only when
// it is approved, and only the version that holds the live 'learn' approval;
// quick checks read practice items only at a version approved for practice.
// Teachers and staff read drafts too (preview). Decisions go through
// review_lesson() (db/033), never a direct status/approval write.
//
// Students keep a device copy of every lesson they open (their storage
// namespace), so an opened lesson reads offline; a downloaded chapter (prompt 32,
// features/downloads) serves every lesson in it offline.
import {
  lessonConceptIds,
  lessonMathKeys,
  lessonQuestionIds,
  buildLesson,
  type PoolItem,
  type ScopedStore,
} from '@school/core';

import { readCache, writeCache } from '../../lib/cache';
import { lessonFromPack } from '../downloads/api';
import {
  classifyError,
  fail,
  notConfigured,
  ok,
  type ApiErrorKind,
  type PgError,
  type Result,
} from '../../lib/result';
import { supabase } from '../../lib/supabase';

export type LearnMode = 'student' | 'preview';
export type ContentStatus = 'draft' | 'reviewed' | 'approved' | 'retired';

export interface TopicInfo {
  id: string;
  titleEn: string;
  titleUr: string | null;
  chapterTitle: string;
  chapterTitleUr: string | null;
  subjectId: string | null;
  subjectName: string;
  className: string;
}

export interface ConceptInfo {
  id: string;
  titleEn: string;
  titleUr: string | null;
}

export interface LessonRef {
  contentId: string;
  kind: 'lesson' | 'alternative';
  conceptId: string | null;
  /** The version this reader shows: the approved one (student) or the newest (preview). */
  version: number;
  currentVersion: number;
  status: ContentStatus;
  origin: string;
  updatedAt: string | null;
}

export interface QuickItem {
  questionId: string;
  version: number;
  type: string;
  body: unknown;
  answer: unknown;
  explanation: unknown;
  conceptId: string | null;
}

export interface LessonData {
  topic: TopicInfo;
  concepts: ConceptInfo[];
  /** The lesson being read (main, or the alternative asked for); null = none yet. */
  lesson: (LessonRef & { blocks: unknown[] }) | null;
  /** Every lesson/alternative of the topic this reader may open. */
  contents: LessonRef[];
  /** Pre-rendered maths, key → SVG (db/031 `math_svgs`). */
  math: Record<string, string>;
  items: Record<string, QuickItem>;
  pool: PoolItem[];
  fromCache: boolean;
}

/** db/017 isn't on this project yet: the screen says so instead of an error. */
export type LearnLoad = LessonData | 'notReady';

const QUICK_TYPES = ['mcq', 'true_false', 'numeric', 'short_text'];

export function isMissingSchema(e: PgError | null | undefined): boolean {
  if (!e) return false;
  const msg = (e.message ?? '').toLowerCase();
  return (
    e.code === '42P01' ||
    e.code === 'PGRST205' ||
    e.code === 'PGRST202' ||
    e.code === '42883' ||
    msg.includes('could not find the table') ||
    msg.includes('could not find the function') ||
    msg.includes('does not exist')
  );
}

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
type ContentRow = {
  id: string;
  kind: 'lesson' | 'alternative';
  concept_id: string | null;
  current_version: number;
  status: ContentStatus;
  origin: string;
  updated_at: string | null;
};

class SchemaMissing extends Error {}
function check<T>(r: { data: T | null; error: PgError | null }): T {
  if (r.error) {
    if (isMissingSchema(r.error)) throw new SchemaMissing();
    throw r.error;
  }
  return r.data as T;
}

const cacheKey = (topicId: string, contentId: string | null) =>
  `learn/lesson/${topicId}/${contentId ?? 'main'}`;

async function fetchLesson(
  where: { topicId?: string; contentId?: string },
  mode: LearnMode,
): Promise<LessonData> {
  const db = supabase!;
  let topicId = where.topicId ?? null;
  if (!topicId && where.contentId) {
    const row = check(
      await db
        .from('learning_content')
        .select('topic_id')
        .eq('id', where.contentId)
        .maybeSingle()
        .retry(false),
    );
    if (!row) throw Object.assign(new Error('not found'), { notFound: true });
    topicId = row.topic_id;
  }
  const [topicR, conceptsR, contentR] = await Promise.all([
    db
      .from('topics')
      .select(
        'id, title_en, title_ur, chapter:chapters(title, title_ur, subject:subjects(id, name, class:classes(name)))',
      )
      .eq('id', topicId!)
      .maybeSingle()
      .retry(false)
      .overrideTypes<TopicRow | null, { merge: false }>(),
    db
      .from('concepts')
      .select('id, title_en, title_ur, sort_order')
      .eq('topic_id', topicId!)
      .eq('status', 'active')
      .order('sort_order')
      .retry(false),
    (mode === 'student'
      ? db
          .from('learning_content')
          .select('id, kind, concept_id, current_version, status, origin, updated_at')
          .eq('topic_id', topicId!)
          .eq('status', 'approved')
      : db
          .from('learning_content')
          .select('id, kind, concept_id, current_version, status, origin, updated_at')
          .eq('topic_id', topicId!)
    )
      .order('created_at')
      .retry(false)
      .overrideTypes<ContentRow[], { merge: false }>(),
  ]);
  const t = check(topicR);
  if (!t) throw Object.assign(new Error('not found'), { notFound: true });
  const concepts = check(conceptsR) ?? [];
  const rows = (check(contentR) ?? []).filter((r) => mode === 'preview' || r.status === 'approved');

  // Which version this reader shows.
  const version = new Map<string, number>();
  if (mode === 'preview') rows.forEach((r) => version.set(r.id, r.current_version));
  else if (rows.length) {
    const ap = check(
      await db
        .from('item_approvals')
        .select('item_id, version')
        .eq('item_kind', 'content')
        .eq('scope', 'learn')
        .is('revoked_at', null)
        .in(
          'item_id',
          rows.map((r) => r.id),
        )
        .retry(false),
    );
    (ap ?? []).forEach((a) => version.set(a.item_id, a.version));
  }
  const contents: LessonRef[] = rows
    .filter((r) => version.has(r.id) && (mode === 'preview' || r.status !== 'retired'))
    .map((r) => ({
      contentId: r.id,
      kind: r.kind,
      conceptId: r.concept_id,
      version: version.get(r.id)!,
      currentVersion: r.current_version,
      status: r.status,
      origin: r.origin,
      updatedAt: r.updated_at,
    }));
  // Preview of a retired lesson still opens (it was asked for by id); the list hides it.
  const pick =
    (where.contentId && contents.find((c) => c.contentId === where.contentId)) ||
    contents.find((c) => c.kind === 'lesson' && c.status !== 'retired') ||
    null;

  let lesson: LessonData['lesson'] = null;
  if (pick) {
    const v = check(
      await db
        .from('learning_content_versions')
        .select('blocks')
        .eq('content_id', pick.contentId)
        .eq('version', pick.version)
        .maybeSingle()
        .retry(false),
    );
    if (v) lesson = { ...pick, blocks: Array.isArray(v.blocks) ? (v.blocks as unknown[]) : [] };
  }

  // Practice items for quick checks + every maths expression, in two round trips.
  const blocks = lesson?.blocks ?? [];
  const model = buildLesson(blocks);
  const conceptIds = lessonConceptIds(model);
  const named = lessonQuestionIds(blocks);
  const items: Record<string, QuickItem> = {};
  if (conceptIds.length || named.length) {
    const ors = [
      conceptIds.length ? `concept_id.in.(${conceptIds.join(',')})` : null,
      named.length ? `question_id.in.(${named.join(',')})` : null,
    ].filter(Boolean);
    const qv = await db
      .from('question_versions')
      .select('question_id, version, type, body, answer, explanation, concept_id')
      .or(ors.join(','))
      .in('type', QUICK_TYPES)
      .order('version', { ascending: false })
      .limit(300)
      .retry(false);
    if (qv.error && !isMissingSchema(qv.error)) throw qv.error;
    for (const q of qv.data ?? []) {
      if (items[q.question_id]) continue; // newest version first
      items[q.question_id] = {
        questionId: q.question_id,
        version: q.version,
        type: q.type,
        body: q.body,
        answer: q.answer,
        explanation: q.explanation,
        conceptId: q.concept_id,
      };
    }
  }
  const pool: PoolItem[] = Object.values(items)
    .sort((a, b) => (a.questionId < b.questionId ? -1 : 1))
    .map((q) => ({ questionId: q.questionId, conceptId: q.conceptId }));

  const keys = lessonMathKeys([blocks, Object.values(items).map((q) => [q.body, q.explanation])]);
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
    lesson,
    contents,
    math,
    items,
    pool,
    fromCache: false,
  };
}

/**
 * A topic's lesson (or `contentId`, an alternative explanation or a draft) for
 * the reader. Students fall back to the device copy when the network fails.
 */
export async function loadLesson(
  where: { topicId?: string; contentId?: string },
  mode: LearnMode,
  cache: ScopedStore | null,
  /** The signed-in user: a downloaded chapter (prompt 32) serves the topic offline. */
  packUser: string | null = null,
): Promise<Result<LearnLoad> & { notFound?: boolean }> {
  if (!supabase) return notConfigured;
  const key = where.topicId ? cacheKey(where.topicId, where.contentId ?? null) : null;
  try {
    const data = await fetchLesson(where, mode);
    if (mode === 'student' && key) await writeCache(cache, key, data);
    return ok(data);
  } catch (e) {
    if (e instanceof SchemaMissing) return ok('notReady');
    if ((e as { notFound?: boolean }).notFound)
      return { ok: false, error: 'unknown', notFound: true };
    const kind = classifyError(e as PgError);
    if (mode === 'student' && kind !== 'forbidden') {
      // A downloaded chapter first (deliberate, kept fresh), then the copy of the last read.
      if (packUser && where.topicId) {
        const pack = await lessonFromPack(packUser, where.topicId, where.contentId ?? null).catch(
          () => null,
        );
        if (pack) return ok(pack);
      }
      const copy = key ? await readCache<LessonData>(cache, key) : null;
      if (copy) return ok({ ...copy, fromCache: true });
    }
    return { ok: false, error: kind };
  }
}

// ───────────────────────────── the student's lesson list ─────────────────────────────

export interface LessonListItem {
  topicId: string;
  titleEn: string;
  titleUr: string | null;
  topicOrder: number;
  chapterId: string;
  chapterTitle: string;
  chapterTitleUr: string | null;
  chapterOrder: number;
  subjectId: string;
  subjectName: string;
  subjectOrder: number;
  classId: string;
  className: string;
}

type ListRow = {
  topic: {
    id: string;
    title_en: string;
    title_ur: string | null;
    sort_order: number;
    status: string;
    chapter: {
      id: string;
      title: string;
      title_ur: string | null;
      sort_order: number;
      subject: {
        id: string;
        name: string;
        sort_order: number;
        class_id: string;
        class: { name: string } | null;
      } | null;
    } | null;
  } | null;
};

const LIST_CACHE = 'learn/list';

/**
 * Topics with an approved lesson, for one class (a school student's) or every
 * class (a prep learner picks). Ordered subject → chapter → topic.
 */
export async function loadLessonList(
  classId: string | null,
  cache: ScopedStore | null,
): Promise<Result<LessonListItem[] | 'notReady'> & { fromCache?: boolean }> {
  if (!supabase) return notConfigured;
  const shape = (rows: ListRow[]) => {
    const seen = new Set<string>();
    const out: LessonListItem[] = [];
    for (const r of rows) {
      const t = r.topic;
      const ch = t?.chapter;
      const s = ch?.subject;
      if (!t || !ch || !s || t.status === 'retired' || seen.has(t.id)) continue;
      if (classId && s.class_id !== classId) continue;
      seen.add(t.id);
      out.push({
        topicId: t.id,
        titleEn: t.title_en,
        titleUr: t.title_ur,
        topicOrder: t.sort_order,
        chapterId: ch.id,
        chapterTitle: ch.title,
        chapterTitleUr: ch.title_ur,
        chapterOrder: ch.sort_order,
        subjectId: s.id,
        subjectName: s.name,
        subjectOrder: s.sort_order,
        classId: s.class_id,
        className: s.class?.name ?? '',
      });
    }
    return out.sort(
      (a, b) =>
        a.className.localeCompare(b.className) ||
        a.subjectOrder - b.subjectOrder ||
        a.subjectName.localeCompare(b.subjectName) ||
        a.chapterOrder - b.chapterOrder ||
        a.topicOrder - b.topicOrder ||
        a.titleEn.localeCompare(b.titleEn),
    );
  };
  const r = await supabase
    .from('learning_content')
    .select(
      'topic:topics(id, title_en, title_ur, sort_order, status, chapter:chapters(id, title, title_ur, sort_order, subject:subjects(id, name, sort_order, class_id, class:classes(name))))',
    )
    .eq('kind', 'lesson')
    .eq('status', 'approved')
    .limit(1000)
    .retry(false)
    .overrideTypes<ListRow[], { merge: false }>();
  if (r.error) {
    if (isMissingSchema(r.error)) return ok('notReady');
    const copy = await readCache<ListRow[]>(cache, LIST_CACHE);
    if (copy && classifyError(r.error) !== 'forbidden')
      return { ...ok(shape(copy)), fromCache: true };
    return fail(r.error);
  }
  await writeCache(cache, LIST_CACHE, r.data ?? []);
  return ok(shape(r.data ?? []));
}

// ───────────────────────────── staff: lessons per subject ─────────────────────────────

export interface StaffLessonRow extends LessonRef {
  topicId: string;
  topicTitle: string;
  topicTitleUr: string | null;
  chapterId: string;
  chapterTitle: string;
}

/** Every lesson of a subject's topics (all statuses), chapter → topic order. */
export async function loadSubjectLessons(
  subjectId: string,
): Promise<Result<StaffLessonRow[] | 'notReady'>> {
  if (!supabase) return notConfigured;
  const db = supabase;
  const ch = await db
    .from('chapters')
    .select('id, title, sort_order')
    .eq('subject_id', subjectId)
    .order('sort_order')
    .retry(false);
  if (ch.error) return fail(ch.error);
  const chapters = ch.data ?? [];
  if (!chapters.length) return ok([]);
  const tp = await db
    .from('topics')
    .select('id, chapter_id, title_en, title_ur, sort_order')
    .in(
      'chapter_id',
      chapters.map((c) => c.id),
    )
    .order('sort_order')
    .retry(false);
  if (tp.error) return isMissingSchema(tp.error) ? ok('notReady') : fail(tp.error);
  const topics = tp.data ?? [];
  if (!topics.length) return ok([]);
  const lc = await db
    .from('learning_content')
    .select('id, topic_id, kind, concept_id, current_version, status, origin, updated_at')
    .in(
      'topic_id',
      topics.map((t) => t.id),
    )
    .order('created_at')
    .retry(false);
  if (lc.error) return isMissingSchema(lc.error) ? ok('notReady') : fail(lc.error);
  const chOrder = new Map(chapters.map((c, i) => [c.id, i]));
  const tpOrder = new Map(topics.map((t, i) => [t.id, i]));
  return ok(
    (lc.data ?? [])
      .map((r): StaffLessonRow => {
        const t = topics.find((x) => x.id === r.topic_id)!;
        const c = chapters.find((x) => x.id === t.chapter_id)!;
        return {
          contentId: r.id,
          kind: r.kind as LessonRef['kind'],
          conceptId: r.concept_id,
          version: r.current_version,
          currentVersion: r.current_version,
          status: r.status as ContentStatus,
          origin: r.origin,
          updatedAt: r.updated_at,
          topicId: t.id,
          topicTitle: t.title_en,
          topicTitleUr: t.title_ur,
          chapterId: c.id,
          chapterTitle: c.title,
        };
      })
      .sort(
        (a, b) =>
          (chOrder.get(a.chapterId) ?? 0) - (chOrder.get(b.chapterId) ?? 0) ||
          (tpOrder.get(a.topicId) ?? 0) - (tpOrder.get(b.topicId) ?? 0) ||
          (a.kind === b.kind ? 0 : a.kind === 'lesson' ? -1 : 1),
      ),
  );
}

// ───────────────────────────── review (db/033) ─────────────────────────────

export type ReviewDecision = 'approve' | 'request_changes' | 'reject';
export type ReviewError = ApiErrorKind | 'stale' | 'reasonRequired' | 'retired' | 'notReady';

export async function reviewLesson(
  contentId: string,
  version: number,
  decision: ReviewDecision,
  notes: string,
  translationOk: boolean | null,
): Promise<{ ok: true; status: ContentStatus } | { ok: false; error: ReviewError }> {
  if (!supabase) return { ok: false, error: 'notConfigured' };
  const args: {
    p_content: string;
    p_version: number;
    p_decision: string;
    p_notes?: string;
    p_translation_ok?: boolean;
  } = { p_content: contentId, p_version: version, p_decision: decision };
  if (notes.trim()) args.p_notes = notes.trim();
  if (translationOk !== null) args.p_translation_ok = translationOk;
  const { data, error } = await supabase.rpc('review_lesson', args);
  if (error) {
    const msg = error.message ?? '';
    if (msg.includes('review_stale_version')) return { ok: false, error: 'stale' };
    if (msg.includes('review_reason_required')) return { ok: false, error: 'reasonRequired' };
    if (msg.includes('review_retired')) return { ok: false, error: 'retired' };
    if (msg.includes('review_forbidden')) return { ok: false, error: 'forbidden' };
    if (isMissingSchema(error)) return { ok: false, error: 'notReady' };
    return { ok: false, error: classifyError(error) };
  }
  const status = (data as { status?: ContentStatus } | null)?.status ?? 'draft';
  return { ok: true, status };
}

// ───────────────────────────── reading progress (this device) ─────────────────────────────

const progressKey = (contentId: string, version: number) =>
  `learn/progress/${contentId}/${version}`;

export async function readProgress(
  store: ScopedStore | null,
  contentId: string,
  version: number,
): Promise<number[]> {
  return (await readCache<number[]>(store, progressKey(contentId, version))) ?? [];
}

export async function saveProgress(
  store: ScopedStore | null,
  contentId: string,
  version: number,
  seen: number[],
) {
  await writeCache(store, progressKey(contentId, version), seen);
}
