// Teacher review queue (prompt 22). Every decision goes through db/032's RPCs:
// review_question / review_approve_many / review_edit_question decide who may
// approve (teachers: concepts in a subject they teach this year), refuse a
// stale version and log the review. The queue reads run as the caller, so RLS
// decides what a teacher sees. Online only, like the importer (DECISIONS #100):
// a decision on stale data is worse than a "try again".
import type {
  ReviewCounts,
  ReviewDecision,
  ReviewItem,
  ReviewPatch,
  ReviewScope,
  ReviewTab,
} from '@school/core';

import type { Json } from '@school/core/db-types';

import {
  fail,
  notConfigured,
  ok,
  type ApiErrorKind,
  type PgError,
  type Result,
} from '../../lib/result';
import { supabase } from '../../lib/supabase';

export type ReviewErrorKind =
  | ApiErrorKind
  | 'stale'
  | 'reason'
  | 'retired'
  | 'inUse'
  | 'badConcept'
  | 'conceptRequired'
  | 'scopes';

export type RResult<T> = { ok: true; data: T } | { ok: false; error: ReviewErrorKind };

function failR(e: PgError | null | undefined): RResult<never> {
  const msg = (e?.message ?? '').toLowerCase();
  if (msg.includes('review_stale_version')) return { ok: false, error: 'stale' };
  if (msg.includes('review_reason_required')) return { ok: false, error: 'reason' };
  if (msg.includes('review_retired')) return { ok: false, error: 'retired' };
  if (msg.includes('review_in_use')) return { ok: false, error: 'inUse' };
  if (msg.includes('review_bad_concept')) return { ok: false, error: 'badConcept' };
  if (msg.includes('review_concept_required')) return { ok: false, error: 'conceptRequired' };
  if (msg.includes('review_scopes')) return { ok: false, error: 'scopes' };
  if (msg.includes('review_forbidden')) return { ok: false, error: 'forbidden' };
  return fail(e);
}

export interface ReviewFilter {
  subjectId: string;
  chapterId: string | null;
  topicId: string | null;
  batchId: string | null;
  tab: ReviewTab;
}

/** Is db/032 on this project? Before it runs, the screen says so plainly. */
export async function reviewReady(): Promise<Result<boolean>> {
  if (!supabase) return notConfigured;
  const { error } = await supabase.rpc('review_counts', {
    p_subject: '00000000-0000-0000-0000-000000000000',
  });
  if (!error) return ok(true);
  const msg = (error.message ?? '').toLowerCase();
  if (
    error.code === 'PGRST202' ||
    error.code === '42883' ||
    error.code === '42P01' ||
    msg.includes('could not find the function') ||
    msg.includes('does not exist')
  ) {
    return ok(false);
  }
  return fail(error);
}

const args = (f: ReviewFilter) => ({
  p_subject: f.subjectId,
  ...(f.chapterId ? { p_chapter: f.chapterId } : {}),
  ...(f.topicId ? { p_topic: f.topicId } : {}),
  ...(f.batchId ? { p_batch: f.batchId } : {}),
});

export async function loadQueue(f: ReviewFilter): Promise<Result<ReviewItem[]>> {
  if (!supabase) return notConfigured;
  const { data, error } = await supabase.rpc('review_queue', {
    ...args(f),
    p_status: f.tab,
    p_limit: 1000,
  });
  if (error) return fail(error);
  return ok((data ?? []) as unknown as ReviewItem[]);
}

export async function loadCounts(f: ReviewFilter): Promise<Result<ReviewCounts>> {
  if (!supabase) return notConfigured;
  const { data, error } = await supabase.rpc('review_counts', args(f));
  if (error) return fail(error);
  const c = (data ?? {}) as Partial<ReviewCounts>;
  return ok({
    to_review: Number(c.to_review ?? 0),
    changes: Number(c.changes ?? 0),
    approved: Number(c.approved ?? 0),
    retired: Number(c.retired ?? 0),
  });
}

export interface TopicRow {
  id: string;
  chapter_id: string;
  title_en: string;
  title_ur: string | null;
  sort_order: number;
}
export interface ConceptRow {
  id: string;
  topic_id: string;
  title_en: string;
  title_ur: string | null;
  sort_order: number;
  status: 'active' | 'retired';
}
export interface BatchRow {
  id: string;
  file_name: string | null;
  created_at: string;
  question_count: number;
}
export interface SubjectContents {
  topics: TopicRow[];
  concepts: ConceptRow[];
  batches: BatchRow[];
}

/** Topics, concepts and import batches of the chosen chapters: names for the pane and the filters. */
export async function loadSubjectContents(chapterIds: string[]): Promise<Result<SubjectContents>> {
  if (!supabase) return notConfigured;
  if (!chapterIds.length) return ok({ topics: [], concepts: [], batches: [] });
  const [tp, bt] = await Promise.all([
    supabase
      .from('topics')
      .select('id, chapter_id, title_en, title_ur, sort_order')
      .in('chapter_id', chapterIds)
      .order('sort_order'),
    supabase
      .from('import_batches')
      .select('id, file_name, created_at, question_count')
      .in('chapter_id', chapterIds)
      .neq('status', 'retired')
      .order('created_at', { ascending: false })
      .limit(50),
  ]);
  if (tp.error) return fail(tp.error);
  const topics = (tp.data ?? []) as TopicRow[];
  let concepts: ConceptRow[] = [];
  if (topics.length) {
    const cs = await supabase
      .from('concepts')
      .select('id, topic_id, title_en, title_ur, sort_order, status')
      .in(
        'topic_id',
        topics.map((t) => t.id),
      )
      .order('sort_order');
    if (cs.error) return fail(cs.error);
    concepts = (cs.data ?? []) as ConceptRow[];
  }
  // A teacher reads only their own batches (017): that's fine, the filter is a convenience.
  const batches = bt.error ? [] : ((bt.data ?? []) as BatchRow[]);
  return ok({ topics, concepts, batches });
}

/** Pre-rendered maths for these keys (db/031 math_svgs). Missing keys show as TeX. */
export async function loadMath(keys: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!supabase || !keys.length) return out;
  for (let i = 0; i < keys.length; i += 200) {
    const { data } = await supabase
      .from('math_svgs')
      .select('key, svg')
      .in('key', keys.slice(i, i + 200));
    for (const r of data ?? []) out.set(r.key, r.svg);
  }
  return out;
}

export interface DecisionResult {
  status: ReviewItem['status'];
  scopes: string[];
}

export async function decide(
  item: Pick<ReviewItem, 'id' | 'version'>,
  decision: ReviewDecision,
  opts: { scopes?: ReviewScope[]; translationOk?: boolean | null; notes?: string },
): Promise<RResult<DecisionResult>> {
  if (!supabase) return notConfigured;
  const { data, error } = await supabase.rpc('review_question', {
    p_question: item.id,
    p_version: item.version,
    p_decision: decision,
    ...(opts.scopes ? { p_scopes: opts.scopes } : {}),
    ...(opts.translationOk === null || opts.translationOk === undefined
      ? {}
      : { p_translation_ok: opts.translationOk }),
    ...(opts.notes ? { p_notes: opts.notes } : {}),
  });
  if (error) return failR(error);
  const r = (data ?? {}) as { status?: ReviewItem['status']; scopes?: string[] };
  return { ok: true, data: { status: r.status ?? 'draft', scopes: r.scopes ?? [] } };
}

export async function approveMany(
  items: Pick<ReviewItem, 'id' | 'version'>[],
  scopes: ReviewScope[],
  translationOk: boolean | null,
): Promise<RResult<{ approved: number; skipped: { id: string; reason: string }[] }>> {
  if (!supabase) return notConfigured;
  const { data, error } = await supabase.rpc('review_approve_many', {
    p_items: items.map((i) => ({ id: i.id, version: i.version })) as unknown as Json,
    p_scopes: scopes,
    ...(translationOk === null ? {} : { p_translation_ok: translationOk }),
  });
  if (error) return failR(error);
  const r = (data ?? {}) as { approved?: number; skipped?: { id: string; reason: string }[] };
  return { ok: true, data: { approved: r.approved ?? 0, skipped: r.skipped ?? [] } };
}

export async function editQuestion(
  item: Pick<ReviewItem, 'id' | 'version'>,
  patch: ReviewPatch,
): Promise<RResult<{ version: number; changed: boolean }>> {
  if (!supabase) return notConfigured;
  const { data, error } = await supabase.rpc('review_edit_question', {
    p_question: item.id,
    p_version: item.version,
    p_patch: patch as unknown as Json,
  });
  if (error) return failR(error);
  const r = (data ?? {}) as { version?: number; changed?: boolean };
  return { ok: true, data: { version: r.version ?? item.version, changed: Boolean(r.changed) } };
}
