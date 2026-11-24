// Typed access to the question bank (setup.sql `questions`). RLS decides who may
// write where: db/003 lets a teacher insert only into chapters of classes they
// teach, and update only their own questions. Answers are read here because
// this is the staff surface; students get papers without keys (prompt 13/018).
import type { AuthorableType, CognitiveLevel, QuestionAnswer, QuestionBody } from '@school/core';

import { supabase } from '../../lib/supabase';
import { fail, notConfigured, ok, type Result } from '../../lib/result';
import type { Json } from '@school/core/db-types';

export interface BankQuestion {
  id: string;
  type: string;
  cognitive_level: string;
  default_marks: number;
  body: unknown;
  answer: unknown;
  chapter_id: string;
  chapterTitle: string;
  created_by: string | null;
}

export interface QuestionInput {
  type: AuthorableType;
  cognitive_level: CognitiveLevel;
  body: QuestionBody;
  answer: QuestionAnswer;
  default_marks: number;
}

/** Row cap per bank request (a subject averages ~50 questions in the seed). */
export const MAX_BANK = 1000;

const COLUMNS =
  'id, type, cognitive_level, default_marks, body, answer, chapter_id, created_by, ' +
  'chapter:chapters!inner(id, title, subject_id, sort_order)';

interface Row {
  id: string;
  type: string;
  cognitive_level: string;
  default_marks: number;
  body: unknown;
  answer: unknown;
  chapter_id: string;
  created_by: string | null;
  chapter: { id: string; title: string; subject_id: string; sort_order: number } | null;
}

/**
 * Questions in a subject, or in one chapter of it (server-side filter, so a big
 * bank never hides a chapter behind the row cap).
 */
export async function listSubjectQuestions(
  subjectId: string,
  chapterId?: string,
): Promise<Result<BankQuestion[]>> {
  if (!supabase) return notConfigured;
  let q = supabase.from('questions').select(COLUMNS).eq('chapter.subject_id', subjectId);
  if (chapterId) q = q.eq('chapter_id', chapterId);
  const { data, error } = await q
    .order('created_at', { ascending: false })
    .limit(MAX_BANK)
    .overrideTypes<Row[], { merge: false }>();
  if (error) return fail(error);
  const rows = (data ?? [])
    .filter((r) => r.chapter)
    .sort((a, b) => a.chapter!.sort_order - b.chapter!.sort_order);
  return ok(rows.map(({ chapter, ...r }) => ({ ...r, chapterTitle: chapter?.title ?? '' })));
}

export async function createQuestion(
  chapterId: string,
  userId: string,
  q: QuestionInput,
): Promise<Result<string>> {
  if (!supabase) return notConfigured;
  const { data, error } = await supabase
    .from('questions')
    .insert({
      chapter_id: chapterId,
      created_by: userId,
      type: q.type,
      cognitive_level: q.cognitive_level,
      body: q.body as NonNullable<Json>,
      answer: q.answer as Json,
      default_marks: q.default_marks,
    })
    .select('id')
    .single();
  return error || !data ? fail(error) : ok(data.id);
}

/** Owner-scoped (RLS). The chapter never moves: edit keeps the question where it was. */
export async function updateQuestion(id: string, q: QuestionInput): Promise<Result<true>> {
  if (!supabase) return notConfigured;
  const { data, error } = await supabase
    .from('questions')
    .update({
      type: q.type,
      cognitive_level: q.cognitive_level,
      body: q.body as NonNullable<Json>,
      answer: q.answer as Json,
      default_marks: q.default_marks,
    })
    .eq('id', id)
    .select('id');
  if (error) return fail(error);
  // RLS hides rows you can't update: zero rows back means "not yours".
  return data && data.length ? ok(true) : { ok: false, error: 'forbidden' };
}

/**
 * Questions of this subject already in a published or closed assessment the
 * user can see. Editing those would change what students answered (rule 7), so
 * the form offers "make a copy" instead. Filtered by subject on the server (no
 * long id list in the URL). Convenience, not security: RLS hides other classes'
 * assessments from a teacher, so this can miss a use there (DECISIONS #65);
 * 017 versioning is the real fix.
 */
export async function lockedQuestionIds(subjectId: string): Promise<Result<Set<string>>> {
  if (!supabase) return notConfigured;
  const { data, error } = await supabase
    .from('assessment_questions')
    .select('question_id, assessment:assessments!inner(status, subject_id)')
    .eq('assessment.subject_id', subjectId)
    .neq('assessment.status', 'draft');
  if (error) return fail(error);
  return ok(new Set((data ?? []).map((r) => r.question_id)));
}
