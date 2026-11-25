// Curriculum editors (prompt 20): textbook editions, chapters, topics, concepts
// and prerequisites. Plain table reads/writes; RLS (db/017) is the boundary:
// admins edit everything, a teacher edits topics/concepts only in chapters of a
// subject they teach this year, nobody deletes a topic or concept (retire).
// Online only, like grading: an edit that fails keeps its form open with the
// reason, nothing is queued (DECISIONS #96).
import type { PrereqEdge } from '@school/core';

import {
  fail,
  notConfigured,
  ok,
  type ApiErrorKind,
  type PgError,
  type Result,
} from '../../lib/result';
import { supabase } from '../../lib/supabase';

export type CurriculumErrorKind = ApiErrorKind | 'cycle' | 'duplicate';
export type CResult<T> = { ok: true; data: T } | { ok: false; error: CurriculumErrorKind };

export type Status = 'active' | 'retired';

export interface Edition {
  id: string;
  code: string;
  board: string;
  name: string;
  effective_from: string | null;
  status: Status;
}

export interface ChapterRow {
  id: string;
  subject_id: string;
  title: string;
  title_ur: string | null;
  textbook_ref: string | null;
  curriculum_id: string | null;
  status: Status;
  sort_order: number;
}

export interface TopicRow {
  id: string;
  chapter_id: string;
  title_en: string;
  title_ur: string | null;
  sort_order: number;
  status: Status;
  diagnostic_size: number | null;
}

export interface ConceptRow {
  id: string;
  topic_id: string;
  title_en: string;
  title_ur: string | null;
  summary_en: string | null;
  summary_ur: string | null;
  sort_order: number;
  status: Status;
}

/** A concept as the prerequisite picker shows it: where it lives. */
export interface ConceptRef {
  id: string;
  title_en: string;
  title_ur: string | null;
  status: Status;
  topicTitle: string;
  chapterTitle: string;
  className: string;
  subjectName: string;
}

export interface SubjectTree {
  chapters: ChapterRow[];
  topics: TopicRow[];
  concepts: ConceptRow[];
  prereqs: PrereqEdge[];
  /** Concepts outside this subject that one of its concepts needs. */
  outside: Map<string, ConceptRef>;
}

const CHAPTER_COLS =
  'id, subject_id, title, title_ur, textbook_ref, curriculum_id, status, sort_order';
const TOPIC_COLS = 'id, chapter_id, title_en, title_ur, sort_order, status, diagnostic_size';
const CONCEPT_COLS = 'id, topic_id, title_en, title_ur, summary_en, summary_ur, sort_order, status';

function failC(e: PgError | null | undefined): CResult<never> {
  const msg = (e?.message ?? '').toLowerCase();
  if (msg.includes('prerequisite_cycle')) return { ok: false, error: 'cycle' };
  if (e?.code === '23505' || msg.includes('duplicate key'))
    return { ok: false, error: 'duplicate' };
  return fail(e);
}

/** An update RLS filtered out returns no error and no row: read that as "not yours". */
function oneRow<T>(data: T[] | null, error: PgError | null): CResult<T> {
  if (error) return failC(error);
  const row = data?.[0];
  return row ? ok(row) : { ok: false, error: 'forbidden' };
}

const asStatus = (s: string): Status => (s === 'retired' ? 'retired' : 'active');

// ---- Reads ----------------------------------------------------------------------

export async function listEditions(): Promise<Result<Edition[]>> {
  if (!supabase) return notConfigured;
  const { data, error } = await supabase
    .from('curricula')
    .select('id, code, board, name, effective_from, status')
    .order('effective_from', { ascending: false, nullsFirst: false })
    .order('code');
  if (error) return fail(error);
  return ok((data ?? []).map((e) => ({ ...e, status: asStatus(e.status) })));
}

/** A subject's whole tree in four flat reads (chapters, topics, concepts, links). */
export async function loadSubjectTree(subjectId: string): Promise<Result<SubjectTree>> {
  if (!supabase) return notConfigured;
  const ch = await supabase
    .from('chapters')
    .select(CHAPTER_COLS)
    .eq('subject_id', subjectId)
    .order('sort_order')
    .order('title');
  if (ch.error) return fail(ch.error);
  const chapters = (ch.data ?? []).map((c) => ({ ...c, status: asStatus(c.status) }));
  const empty: SubjectTree = {
    chapters,
    topics: [],
    concepts: [],
    prereqs: [],
    outside: new Map(),
  };
  if (!chapters.length) return ok(empty);

  const tp = await supabase
    .from('topics')
    .select(TOPIC_COLS)
    .in(
      'chapter_id',
      chapters.map((c) => c.id),
    )
    .order('sort_order');
  if (tp.error) return fail(tp.error);
  const topics = (tp.data ?? []).map((t) => ({ ...t, status: asStatus(t.status) }));
  if (!topics.length) return ok({ ...empty, topics });

  const cp = await supabase
    .from('concepts')
    .select(CONCEPT_COLS)
    .in(
      'topic_id',
      topics.map((t) => t.id),
    )
    .order('sort_order');
  if (cp.error) return fail(cp.error);
  const concepts = (cp.data ?? []).map((c) => ({ ...c, status: asStatus(c.status) }));
  if (!concepts.length) return ok({ ...empty, topics, concepts });

  const pr = await supabase
    .from('concept_prerequisites')
    .select('concept_id, requires_concept_id')
    .in(
      'concept_id',
      concepts.map((c) => c.id),
    );
  if (pr.error) return fail(pr.error);
  const prereqs = pr.data ?? [];
  const local = new Set(concepts.map((c) => c.id));
  const outsideIds = [...new Set(prereqs.map((p) => p.requires_concept_id))].filter(
    (id) => !local.has(id),
  );
  const outside = await describeConcepts(outsideIds);
  if (!outside.ok) return outside;
  return ok({ chapters, topics, concepts, prereqs, outside: outside.data });
}

/** Where each concept lives (topic → chapter → subject → class), for chips and the picker. */
async function describeConcepts(ids: string[]): Promise<Result<Map<string, ConceptRef>>> {
  const out = new Map<string, ConceptRef>();
  if (!ids.length || !supabase) return ok(out);
  const cp = await supabase
    .from('concepts')
    .select('id, topic_id, title_en, title_ur, status')
    .in('id', ids);
  if (cp.error) return fail(cp.error);
  const rows = cp.data ?? [];
  const tp = await supabase
    .from('topics')
    .select('id, chapter_id, title_en')
    .in('id', [...new Set(rows.map((r) => r.topic_id))]);
  if (tp.error) return fail(tp.error);
  const topics = new Map((tp.data ?? []).map((t) => [t.id, t]));
  const ch = await supabase
    .from('chapters')
    .select('id, subject_id, title')
    .in('id', [...new Set((tp.data ?? []).map((t) => t.chapter_id))]);
  if (ch.error) return fail(ch.error);
  const chapters = new Map((ch.data ?? []).map((c) => [c.id, c]));
  const sb = await supabase
    .from('subjects')
    .select('id, name, class_id')
    .in('id', [...new Set((ch.data ?? []).map((c) => c.subject_id))]);
  if (sb.error) return fail(sb.error);
  const subjects = new Map((sb.data ?? []).map((s) => [s.id, s]));
  const cl = await supabase
    .from('classes')
    .select('id, name')
    .in('id', [...new Set((sb.data ?? []).map((s) => s.class_id))]);
  if (cl.error) return fail(cl.error);
  const classes = new Map((cl.data ?? []).map((c) => [c.id, c]));
  for (const r of rows) {
    const t = topics.get(r.topic_id);
    const c = t ? chapters.get(t.chapter_id) : undefined;
    const s = c ? subjects.get(c.subject_id) : undefined;
    out.set(r.id, {
      id: r.id,
      title_en: r.title_en,
      title_ur: r.title_ur,
      status: asStatus(r.status),
      topicTitle: t?.title_en ?? '',
      chapterTitle: c?.title ?? '',
      subjectName: s?.name ?? '',
      className: (s && classes.get(s.class_id)?.name) ?? '',
    });
  }
  return ok(out);
}

/**
 * Concepts in the same subject of earlier classes (e.g. Class 8 Maths for
 * Class 9 Maths), for prerequisites that reach back a year or more.
 */
export async function listEarlierConcepts(
  subjectName: string,
  gradeLevel: number,
): Promise<Result<ConceptRef[]>> {
  if (!supabase) return notConfigured;
  const cl = await supabase.from('classes').select('id').lt('grade_level', gradeLevel);
  if (cl.error) return fail(cl.error);
  const classIds = (cl.data ?? []).map((c) => c.id);
  if (!classIds.length) return ok([]);
  const sb = await supabase
    .from('subjects')
    .select('id')
    .eq('name', subjectName)
    .in('class_id', classIds);
  if (sb.error) return fail(sb.error);
  const subjectIds = (sb.data ?? []).map((s) => s.id);
  if (!subjectIds.length) return ok([]);
  const ch = await supabase.from('chapters').select('id').in('subject_id', subjectIds);
  if (ch.error) return fail(ch.error);
  const chapterIds = (ch.data ?? []).map((c) => c.id);
  if (!chapterIds.length) return ok([]);
  const tp = await supabase.from('topics').select('id').in('chapter_id', chapterIds);
  if (tp.error) return fail(tp.error);
  const topicIds = (tp.data ?? []).map((t) => t.id);
  if (!topicIds.length) return ok([]);
  const cp = await supabase
    .from('concepts')
    .select('id')
    .in('topic_id', topicIds)
    .eq('status', 'active')
    .limit(500);
  if (cp.error) return fail(cp.error);
  const refs = await describeConcepts((cp.data ?? []).map((c) => c.id));
  return refs.ok ? ok([...refs.data.values()]) : refs;
}

// ---- Topic + concept writes (teachers in their subjects, admins anywhere) --------------

export async function insertTopic(row: {
  chapter_id: string;
  title_en: string;
  title_ur: string | null;
  diagnostic_size: number | null;
  sort_order: number;
}): Promise<CResult<TopicRow>> {
  if (!supabase) return notConfigured;
  const { data, error } = await supabase.from('topics').insert(row).select(TOPIC_COLS);
  const r = oneRow(data, error);
  return r.ok ? ok({ ...r.data, status: asStatus(r.data.status) }) : r;
}

export async function updateTopic(
  id: string,
  patch: Partial<
    Pick<TopicRow, 'title_en' | 'title_ur' | 'diagnostic_size' | 'status' | 'sort_order'>
  >,
): Promise<CResult<TopicRow>> {
  if (!supabase) return notConfigured;
  const { data, error } = await supabase
    .from('topics')
    .update(patch)
    .eq('id', id)
    .select(TOPIC_COLS);
  const r = oneRow(data, error);
  return r.ok ? ok({ ...r.data, status: asStatus(r.data.status) }) : r;
}

export async function insertConcept(row: {
  topic_id: string;
  title_en: string;
  title_ur: string | null;
  summary_en: string | null;
  summary_ur: string | null;
  sort_order: number;
}): Promise<CResult<ConceptRow>> {
  if (!supabase) return notConfigured;
  const { data, error } = await supabase.from('concepts').insert(row).select(CONCEPT_COLS);
  const r = oneRow(data, error);
  return r.ok ? ok({ ...r.data, status: asStatus(r.data.status) }) : r;
}

export async function updateConcept(
  id: string,
  patch: Partial<
    Pick<
      ConceptRow,
      'title_en' | 'title_ur' | 'summary_en' | 'summary_ur' | 'status' | 'sort_order'
    >
  >,
): Promise<CResult<ConceptRow>> {
  if (!supabase) return notConfigured;
  const { data, error } = await supabase
    .from('concepts')
    .update(patch)
    .eq('id', id)
    .select(CONCEPT_COLS);
  const r = oneRow(data, error);
  return r.ok ? ok({ ...r.data, status: asStatus(r.data.status) }) : r;
}

/** Renumber siblings after a move (only the rows that change). */
export async function reorder(
  table: 'topics' | 'concepts',
  rows: { id: string; sort_order: number }[],
): Promise<CResult<number>> {
  if (!supabase) return notConfigured;
  const client = supabase;
  const results = await Promise.all(
    rows.map((r) =>
      client.from(table).update({ sort_order: r.sort_order }).eq('id', r.id).select('id'),
    ),
  );
  for (const res of results) {
    const r = oneRow(res.data, res.error);
    if (!r.ok) return r;
  }
  return ok(rows.length);
}

/** Apply the picker's changes: add new links first (a loop is refused before anything is removed). */
export async function savePrereqs(
  conceptId: string,
  add: string[],
  remove: string[],
): Promise<CResult<true>> {
  if (!supabase) return notConfigured;
  if (add.length) {
    const { error } = await supabase
      .from('concept_prerequisites')
      .insert(add.map((r) => ({ concept_id: conceptId, requires_concept_id: r })));
    if (error) return failC(error);
  }
  if (remove.length) {
    const { data, error } = await supabase
      .from('concept_prerequisites')
      .delete()
      .eq('concept_id', conceptId)
      .in('requires_concept_id', remove)
      .select('concept_id');
    if (error) return failC(error);
    if ((data ?? []).length !== remove.length) return { ok: false, error: 'forbidden' };
  }
  return ok(true);
}

// ---- Admin: editions + chapters ---------------------------------------------------------

export async function saveEdition(
  id: string | null,
  row: {
    code: string;
    board: string;
    name: string;
    effective_from: string | null;
    status?: Status;
  },
): Promise<CResult<Edition>> {
  if (!supabase) return notConfigured;
  const cols = 'id, code, board, name, effective_from, status';
  const { data, error } = id
    ? await supabase.from('curricula').update(row).eq('id', id).select(cols)
    : await supabase.from('curricula').insert(row).select(cols);
  const r = oneRow(data, error);
  return r.ok ? ok({ ...r.data, status: asStatus(r.data.status) }) : r;
}

export async function insertChapter(row: {
  subject_id: string;
  title: string;
  title_ur: string | null;
  textbook_ref: string | null;
  curriculum_id: string | null;
  sort_order: number;
}): Promise<CResult<ChapterRow>> {
  if (!supabase) return notConfigured;
  const { data, error } = await supabase.from('chapters').insert(row).select(CHAPTER_COLS);
  const r = oneRow(data, error);
  return r.ok ? ok({ ...r.data, status: asStatus(r.data.status) }) : r;
}

export async function updateChapter(
  id: string,
  patch: Partial<
    Pick<ChapterRow, 'title' | 'title_ur' | 'textbook_ref' | 'curriculum_id' | 'status'>
  >,
): Promise<CResult<ChapterRow>> {
  if (!supabase) return notConfigured;
  const { data, error } = await supabase
    .from('chapters')
    .update(patch)
    .eq('id', id)
    .select(CHAPTER_COLS);
  const r = oneRow(data, error);
  return r.ok ? ok({ ...r.data, status: asStatus(r.data.status) }) : r;
}

// ---- Backfill: attach existing chapters to an edition ------------------------------------

export interface LooseChapter {
  id: string;
  title: string;
  subjectName: string;
  className: string;
  gradeLevel: number;
}

/** Every chapter not yet in a textbook edition, with its class and subject (admin). */
export async function listLooseChapters(): Promise<Result<LooseChapter[]>> {
  if (!supabase) return notConfigured;
  const ch = await supabase
    .from('chapters')
    .select('id, title, subject_id, sort_order')
    .is('curriculum_id', null)
    .eq('status', 'active')
    .order('sort_order')
    .limit(2000);
  if (ch.error) return fail(ch.error);
  const rows = ch.data ?? [];
  if (!rows.length) return ok([]);
  const sb = await supabase
    .from('subjects')
    .select('id, name, class_id')
    .in('id', [...new Set(rows.map((r) => r.subject_id))]);
  if (sb.error) return fail(sb.error);
  const subjects = new Map((sb.data ?? []).map((s) => [s.id, s]));
  const cl = await supabase
    .from('classes')
    .select('id, name, grade_level')
    .in('id', [...new Set((sb.data ?? []).map((s) => s.class_id))]);
  if (cl.error) return fail(cl.error);
  const classes = new Map((cl.data ?? []).map((c) => [c.id, c]));
  return ok(
    rows
      .map((r) => {
        const s = subjects.get(r.subject_id);
        const c = s ? classes.get(s.class_id) : undefined;
        return {
          id: r.id,
          title: r.title,
          subjectName: s?.name ?? '',
          className: c?.name ?? '',
          gradeLevel: c?.grade_level ?? 0,
        };
      })
      .sort(
        (a, b) =>
          a.gradeLevel - b.gradeLevel ||
          a.className.localeCompare(b.className) ||
          a.subjectName.localeCompare(b.subjectName),
      ),
  );
}

/** Attach chapters that still have no edition (never moves one already attached). */
export async function attachChapters(
  curriculumId: string,
  chapterIds: string[],
): Promise<CResult<number>> {
  if (!supabase) return notConfigured;
  if (!chapterIds.length) return ok(0);
  const { data, error } = await supabase
    .from('chapters')
    .update({ curriculum_id: curriculumId })
    .in('id', chapterIds)
    .is('curriculum_id', null)
    .select('id');
  if (error) return failC(error);
  return ok((data ?? []).length);
}
