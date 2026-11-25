// Content importer (prompt 21): a topic JSON file → a dry-run report → drafts.
// Reads and writes go through db/031: `import_find_matches()` for duplicates and
// `import_content()` for the write (both run as the caller, so RLS decides what
// a teacher may import), `retire_import_batch()` to pull a whole batch.
// Online only, like grading and the curriculum editors (DECISIONS #100): an
// import is reviewed before it matters, so nothing is queued offline.
import {
  buildImportPlan,
  planChunks,
  reportSummary,
  type BankCandidate,
  type ExistingConcept,
  type ExistingLesson,
  type ExistingTopic,
  type ImportPlan,
  type ImportReport,
  type ParsedFile,
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

export type ImportErrorKind = ApiErrorKind | 'retired' | 'mismatch' | 'reason';

export type IResult<T> = { ok: true; data: T } | { ok: false; error: ImportErrorKind };

function failI(e: PgError | null | undefined): IResult<never> {
  const msg = (e?.message ?? '').toLowerCase();
  if (msg.includes('import_batch_retired')) return { ok: false, error: 'retired' };
  if (msg.includes('reason_required')) return { ok: false, error: 'reason' };
  if (msg.includes('mismatch') || msg.includes('import_bad_chunk'))
    return { ok: false, error: 'mismatch' };
  return fail(e);
}

export interface BatchRow {
  id: string;
  file_name: string | null;
  source_note: string | null;
  origin: 'human' | 'ai';
  status: 'importing' | 'done' | 'retired';
  question_count: number;
  created_at: string;
  retired_at: string | null;
  retire_note: string | null;
  topic_id: string | null;
  report: unknown;
}

export interface ChapterContents {
  topics: ExistingTopic[];
  concepts: ExistingConcept[];
  lessons: ExistingLesson[];
}

/** Is db/031 on this project? Before it runs, the screen says so plainly. */
export async function importerReady(): Promise<Result<boolean>> {
  if (!supabase) return notConfigured;
  const { error } = await supabase.from('import_batches').select('id').limit(1);
  if (!error) {
    const probe = await supabase.from('math_svgs').select('key').limit(1);
    if (!probe.error) return ok(true);
    return missing(probe.error) ? ok(false) : fail(probe.error);
  }
  return missing(error) ? ok(false) : fail(error);
}

function missing(e: PgError): boolean {
  const msg = (e.message ?? '').toLowerCase();
  return (
    e.code === '42P01' ||
    e.code === 'PGRST205' ||
    e.code === '42703' ||
    msg.includes('could not find the table') ||
    msg.includes('does not exist')
  );
}

/** What the chapter already holds, so a second file adds to it instead of twinning it. */
export async function loadChapterContents(chapterId: string): Promise<Result<ChapterContents>> {
  if (!supabase) return notConfigured;
  const tp = await supabase
    .from('topics')
    .select('id, title_en, status, sort_order')
    .eq('chapter_id', chapterId);
  if (tp.error) return fail(tp.error);
  const topics = tp.data ?? [];
  if (!topics.length) return ok({ topics, concepts: [], lessons: [] });
  const ids = topics.map((t) => t.id);
  const [cs, ls] = await Promise.all([
    supabase
      .from('concepts')
      .select('id, topic_id, title_en, status, sort_order')
      .in('topic_id', ids),
    supabase
      .from('learning_content')
      .select('topic_id, kind, concept_id, status')
      .in('topic_id', ids),
  ]);
  if (cs.error) return fail(cs.error);
  if (ls.error) return fail(ls.error);
  return ok({
    topics,
    concepts: cs.data ?? [],
    lessons: (ls.data ?? []) as ExistingLesson[],
  });
}

/** Candidate duplicates already in this subject's bank. */
export async function findBankMatches(
  subjectId: string,
  texts: string[],
): Promise<Result<BankCandidate[]>> {
  if (!supabase) return notConfigured;
  if (!texts.length) return ok([]);
  const { data, error } = await supabase.rpc('import_find_matches', {
    p_subject: subjectId,
    p_texts: texts,
  });
  if (error) return fail(error);
  type Row = { idx: number; question_id: string; body: unknown };
  return ok(
    ((data ?? []) as Row[]).map((r) => ({ idx: r.idx, question_id: r.question_id, body: r.body })),
  );
}

export interface ImportOutcome {
  batchId: string;
  imported: number;
}

/**
 * Write the plan, chunk by chunk. Ids come from the plan, so a chunk sent twice
 * (a retry, a double click) inserts nothing the second time; the call returns
 * how many questions actually landed.
 */
export async function runImport(
  plan: ImportPlan,
  report: ImportReport,
  onProgress?: (done: number, total: number) => void,
): Promise<IResult<ImportOutcome>> {
  if (!supabase) return notConfigured;
  const chunks = planChunks(plan);
  let imported = 0;
  let done = 0;
  for (const chunk of chunks) {
    const body = chunk.final
      ? { ...chunk, report: reportSummary(report, plan.questions.length) }
      : chunk;
    const { data, error } = await supabase.rpc('import_content', {
      p_chunk: body as unknown as Json,
    });
    if (error) return failI(error);
    imported += Number((data as { inserted?: number } | null)?.inserted ?? 0);
    done += chunk.questions.length;
    onProgress?.(done, plan.questions.length);
  }
  return ok({ batchId: plan.batch.id, imported });
}

export async function listBatches(limit = 30): Promise<Result<BatchRow[]>> {
  if (!supabase) return notConfigured;
  const { data, error } = await supabase
    .from('import_batches')
    .select(
      'id, file_name, source_note, origin, status, question_count, created_at, retired_at, retire_note, topic_id, report',
    )
    .order('created_at', { ascending: false })
    .limit(limit);
  return error ? fail(error) : ok((data ?? []) as BatchRow[]);
}

export async function retireBatch(
  batchId: string,
  note: string,
): Promise<IResult<{ questions: number; lessons: number }>> {
  if (!supabase) return notConfigured;
  const { data, error } = await supabase.rpc('retire_import_batch', {
    p_batch: batchId,
    p_note: note,
  });
  if (error) return failI(error);
  const r = (data ?? {}) as { questions?: number; lessons?: number };
  return ok({ questions: Number(r.questions ?? 0), lessons: Number(r.lessons ?? 0) });
}

/** A v4 UUID from the platform's crypto (the plan's client ids). */
export function newId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const b = new Uint8Array(16);
  c?.getRandomValues?.(b);
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x40;
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80;
  const hex = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export { buildImportPlan };
export type { ExistingConcept, ExistingLesson, ExistingTopic, ImportPlan, ParsedFile };
