// Follow-ups + mastery bands for Prepare and Home (prompt 41). Plain reads under
// RLS (db/017: a learner reads their own follow-ups and bands; teachers those of
// learners they teach). The server writes both (db/019); teachers relax or
// restore a gate through db/034's RPCs, never a direct write.
//
// The learner's copy is kept in their storage namespace, so Prepare and Home
// open offline with the last known state.
import type { FollowUpView, MasteryState, RevisionRow, ScopedStore } from '@school/core';

import { readCache, writeCache } from '../../lib/cache';
import {
  classifyError,
  fail,
  notConfigured,
  ok,
  type PgError,
  type Result,
} from '../../lib/result';
import { supabase } from '../../lib/supabase';
import { isMissingSchema } from '../learn/api';

/** A follow-up with what the learner needs to read it. */
export interface FollowUpItem extends FollowUpView {
  conceptEn: string;
  conceptUr: string | null;
  topicEn: string | null;
  topicUr: string | null;
  subjectName: string | null;
  /** Where the follow-up's topic sits in its subject (for the gate). */
  chapterOrder: number;
  topicOrder: number;
}

export interface ConceptRef {
  id: string;
  subjectId: string;
  topicId: string;
}

/** A concept in spaced revision (db/019 schedules it, db/037 moves it on). */
export interface RevisionItem extends RevisionRow {
  conceptEn: string;
  conceptUr: string | null;
  topicId: string | null;
  topicEn: string | null;
  topicUr: string | null;
  subjectId: string | null;
  subjectName: string | null;
}

export interface PrepareData {
  followUps: FollowUpItem[];
  /** Concepts with a revision stage (due, later, or retained). */
  revisions: RevisionItem[];
  /** concept id → band (only concepts the learner has practised). */
  bands: Record<string, MasteryState>;
  /** Active concepts of the class (Home mosaics); empty for prep learners. */
  concepts: ConceptRef[];
  fromCache?: boolean;
}

export type PrepareLoad = PrepareData | 'notReady';

type FuRow = {
  id: string;
  concept_id: string;
  subject_id: string;
  kind: FollowUpView['kind'];
  status: FollowUpView['status'];
  rounds: number;
  created_at: string;
  closed_at: string | null;
  close_reason: string | null;
  concept: {
    title_en: string;
    title_ur: string | null;
    topic: {
      id: string;
      title_en: string;
      title_ur: string | null;
      sort_order: number;
      chapter: { sort_order: number } | null;
    } | null;
  } | null;
  subject: { name: string } | null;
};

type RevRow = {
  concept_id: string;
  state: MasteryState;
  review_stage: number;
  next_review_at: string | null;
  concept: {
    title_en: string;
    title_ur: string | null;
    topic: {
      id: string;
      title_en: string;
      title_ur: string | null;
      chapter: { subject: { id: string; name: string } | null } | null;
    } | null;
  } | null;
};

function shapeRevisions(rows: RevRow[]): RevisionItem[] {
  return rows.map((r) => ({
    conceptId: r.concept_id,
    state: r.state,
    stage: r.review_stage,
    nextReviewAt: r.next_review_at,
    conceptEn: r.concept?.title_en ?? '',
    conceptUr: r.concept?.title_ur ?? null,
    topicId: r.concept?.topic?.id ?? null,
    topicEn: r.concept?.topic?.title_en ?? null,
    topicUr: r.concept?.topic?.title_ur ?? null,
    subjectId: r.concept?.topic?.chapter?.subject?.id ?? null,
    subjectName: r.concept?.topic?.chapter?.subject?.name ?? null,
  }));
}

type ConceptRow = {
  id: string;
  topic: {
    id: string;
    status: string;
    chapter: { subject: { id: string; class_id: string } | null } | null;
  } | null;
};

const CACHE = 'prepare/state';
const RECENT_MS = 14 * 24 * 60 * 60 * 1000;

function shapeFollowUps(rows: FuRow[]): FollowUpItem[] {
  return rows.map((r) => ({
    id: r.id,
    conceptId: r.concept_id,
    subjectId: r.subject_id,
    topicId: r.concept?.topic?.id ?? null,
    kind: r.kind,
    status: r.status,
    rounds: r.rounds,
    createdAt: r.created_at,
    closedAt: r.closed_at,
    closeReason: r.close_reason,
    conceptEn: r.concept?.title_en ?? '',
    conceptUr: r.concept?.title_ur ?? null,
    topicEn: r.concept?.topic?.title_en ?? null,
    topicUr: r.concept?.topic?.title_ur ?? null,
    subjectName: r.subject?.name ?? null,
    chapterOrder: r.concept?.topic?.chapter?.sort_order ?? 0,
    topicOrder: r.concept?.topic?.sort_order ?? 0,
  }));
}

/**
 * The learner's follow-ups (open, or closed in the last 14 days), bands, and the
 * class's concepts. `classId` null = a prep learner (no class mosaics).
 */
export async function loadPrepare(
  learnerId: string,
  classId: string | null,
  cache: ScopedStore | null,
): Promise<Result<PrepareLoad> & { fromCache?: boolean }> {
  if (!supabase) return notConfigured;
  const db = supabase;
  const since = new Date(Date.now() - RECENT_MS).toISOString();
  const [fu, cm, cs, rv] = await Promise.all([
    db
      .from('follow_ups')
      .select(
        'id, concept_id, subject_id, kind, status, rounds, created_at, closed_at, close_reason, concept:concepts(title_en, title_ur, topic:topics(id, title_en, title_ur, sort_order, chapter:chapters(sort_order))), subject:subjects(name)',
      )
      .eq('learner_id', learnerId)
      .or(`status.eq.open,closed_at.gte.${since}`)
      .order('created_at')
      .limit(200)
      .retry(false)
      .overrideTypes<FuRow[], { merge: false }>(),
    db
      .from('concept_mastery')
      .select('concept_id, state')
      .eq('learner_id', learnerId)
      .limit(2000)
      .retry(false),
    classId
      ? db
          .from('concepts')
          .select(
            'id, topic:topics!inner(id, status, chapter:chapters!inner(subject:subjects!inner(id, class_id)))',
          )
          .eq('status', 'active')
          .eq('topic.chapter.subject.class_id', classId)
          .limit(2000)
          .retry(false)
          .overrideTypes<ConceptRow[], { merge: false }>()
      : Promise.resolve({ data: [] as ConceptRow[], error: null as PgError | null }),
    db
      .from('concept_mastery')
      .select(
        'concept_id, state, review_stage, next_review_at, concept:concepts(title_en, title_ur, topic:topics(id, title_en, title_ur, chapter:chapters(subject:subjects(id, name))))',
      )
      .eq('learner_id', learnerId)
      .gte('review_stage', 1)
      .order('next_review_at', { nullsFirst: false })
      .limit(300)
      .retry(false)
      .overrideTypes<RevRow[], { merge: false }>(),
  ]);
  const err = fu.error ?? cm.error ?? cs.error ?? rv.error;
  if (err) {
    if (isMissingSchema(err)) return ok('notReady');
    const copy = await readCache<PrepareData>(cache, CACHE);
    if (copy && classifyError(err) !== 'forbidden')
      return { ...ok({ ...copy, fromCache: true }), fromCache: true };
    return fail(err);
  }
  const bands: Record<string, MasteryState> = {};
  for (const r of cm.data ?? []) bands[r.concept_id] = r.state as MasteryState;
  const concepts: ConceptRef[] = [];
  for (const r of cs.data ?? []) {
    const s = r.topic?.chapter?.subject;
    if (!r.topic || r.topic.status === 'retired' || !s || s.class_id !== classId) continue;
    concepts.push({ id: r.id, subjectId: s.id, topicId: r.topic.id });
  }
  const data: PrepareData = {
    followUps: shapeFollowUps(fu.data ?? []),
    revisions: shapeRevisions(rv.data ?? []),
    bands,
    concepts,
  };
  await writeCache(cache, CACHE, data);
  return ok(data);
}

// ───────────────────────────── teacher: stuck students ─────────────────────────────

export interface ClassFollowUp {
  id: string;
  learner_id: string;
  student_name: string;
  student_code: string;
  concept_id: string;
  concept_en: string;
  concept_ur: string | null;
  topic_id: string;
  topic_en: string;
  topic_ur: string | null;
  subject_id: string;
  subject_name: string;
  kind: FollowUpView['kind'];
  status: FollowUpView['status'];
  rounds: number;
  created_at: string;
  closed_at: string | null;
  close_reason: string | null;
  band: MasteryState | null;
  last_actor: string | null;
}

export async function loadClassFollowUps(
  classId: string,
): Promise<Result<ClassFollowUp[] | 'notReady'>> {
  if (!supabase) return notConfigured;
  const r = await supabase.rpc('class_follow_ups', { p_class: classId }).retry(false);
  if (r.error) return isMissingSchema(r.error) ? ok('notReady') : fail(r.error);
  return ok((r.data as unknown as ClassFollowUp[]) ?? []);
}

export type OverrideError = 'reason' | 'notYours' | 'state' | 'alreadyOpen' | 'network' | 'unknown';

/** Relax (let the learner move on) or restore (open it again), with a reason. */
export async function overrideGate(
  action: 'relax' | 'restore',
  followUpId: string,
  reason: string,
): Promise<{ ok: true } | { ok: false; error: OverrideError }> {
  if (!supabase) return { ok: false, error: 'unknown' };
  const r = await supabase
    .rpc(action === 'relax' ? 'gate_relax' : 'gate_restore', {
      p_follow_up: followUpId,
      p_reason: reason,
    })
    .retry(false);
  if (!r.error) return { ok: true };
  const msg = r.error.message ?? '';
  if (msg.includes('reason_required')) return { ok: false, error: 'reason' };
  if (msg.includes('not_your_student')) return { ok: false, error: 'notYours' };
  if (msg.includes('already_open')) return { ok: false, error: 'alreadyOpen' };
  if (msg.includes('not_open') || msg.includes('not_relieved'))
    return { ok: false, error: 'state' };
  return { ok: false, error: classifyError(r.error) === 'network' ? 'network' : 'unknown' };
}
