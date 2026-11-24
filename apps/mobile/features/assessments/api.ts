// Typed access to assessments + assessment_questions (setup.sql). RLS: staff
// do anything; a teacher reads/inserts/updates only assessments of classes they
// teach and their question rows (p_assess_teacher_*, p_aq_teacher). Teachers
// have no DELETE on assessments, and nothing here deletes one: a failed create
// leaves a draft the teacher can fix, never a half-published test.
import type { AssessmentFields, AssessmentItemRow, AssessmentStatus } from '@school/core';
import { diffItems, isAssessmentStatus } from '@school/core';

import { supabase } from '../../lib/supabase';
import { fail, notConfigured, ok, type ApiErrorKind, type Result } from '../../lib/result';

export interface AssessmentSummary {
  id: string;
  title: string;
  type: string;
  status: AssessmentStatus;
  weightage: number;
  total_marks: number | null;
  scheduled_on: string | null;
  class_id: string;
  subject_id: string;
  className: string;
  subjectName: string;
  questionCount: number;
  /** 'file' worksheets (db/014): where the uploaded file lives. */
  file_path: string | null;
  file_name: string | null;
  file_mime: string | null;
}

export interface AssessmentDetail extends AssessmentSummary {
  items: { question_id: string; marks: number }[];
}

const COLUMNS =
  'id, title, type, status, weightage, total_marks, scheduled_on, class_id, subject_id, ' +
  'file_path, file_name, file_mime, ' +
  'class:classes(name), subject:subjects(name), items:assessment_questions(question_id, marks, sort_order)';

interface Row {
  id: string;
  title: string;
  type: string;
  status: string;
  weightage: number;
  total_marks: number | null;
  scheduled_on: string | null;
  class_id: string;
  subject_id: string;
  file_path: string | null;
  file_name: string | null;
  file_mime: string | null;
  class: { name: string } | null;
  subject: { name: string } | null;
  items: { question_id: string; marks: number; sort_order: number }[];
}

function toDetail(r: Row): AssessmentDetail {
  const items = [...(r.items ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(({ question_id, marks }) => ({ question_id, marks }));
  return {
    id: r.id,
    title: r.title,
    type: r.type,
    status: isAssessmentStatus(r.status) ? r.status : 'draft',
    weightage: Number(r.weightage),
    total_marks: r.total_marks,
    scheduled_on: r.scheduled_on,
    class_id: r.class_id,
    subject_id: r.subject_id,
    className: r.class?.name ?? '',
    subjectName: r.subject?.name ?? '',
    questionCount: items.length,
    file_path: r.file_path ?? null,
    file_name: r.file_name ?? null,
    file_mime: r.file_mime ?? null,
    items,
  };
}

/** This year's assessments the user can see (RLS narrows a teacher to their classes). */
export async function listAssessments(yearId: string): Promise<Result<AssessmentSummary[]>> {
  if (!supabase) return notConfigured;
  const { data, error } = await supabase
    .from('assessments')
    .select(COLUMNS)
    .eq('year_id', yearId)
    .order('created_at', { ascending: false })
    .limit(300)
    .overrideTypes<Row[], { merge: false }>();
  return error ? fail(error) : ok((data ?? []).map(toDetail));
}

export async function getAssessment(id: string): Promise<Result<AssessmentDetail | null>> {
  if (!supabase) return notConfigured;
  const { data, error } = await supabase
    .from('assessments')
    .select(COLUMNS)
    .eq('id', id)
    .maybeSingle()
    .overrideTypes<Row | null, { merge: false }>();
  return error ? fail(error) : ok(data ? toDetail(data) : null);
}

async function writeItems(
  assessmentId: string,
  existing: readonly string[],
  items: readonly AssessmentItemRow[],
): Promise<Result<true>> {
  const db = supabase!;
  const { remove, upsert } = diffItems(existing, items);
  if (remove.length) {
    const { error } = await db
      .from('assessment_questions')
      .delete()
      .eq('assessment_id', assessmentId)
      .in('question_id', remove);
    if (error) return fail(error);
  }
  if (upsert.length) {
    const { error } = await db.from('assessment_questions').upsert(
      upsert.map((r) => ({ ...r, assessment_id: assessmentId })),
      { onConflict: 'assessment_id,question_id' },
    );
    if (error) return fail(error);
  }
  return ok(true);
}

export interface CreateInput {
  yearId: string;
  classId: string;
  subjectId: string;
  userId: string;
  fields: AssessmentFields;
  items: AssessmentItemRow[];
  publish: boolean;
}

export type CreateResult =
  { ok: true; data: string } | { ok: false; error: ApiErrorKind; draftId?: string };

/**
 * Insert as a draft, add the questions, then publish if asked. If a later step
 * fails the draft stays (no deletes), and `draftId` lets the screen open it.
 */
export async function createAssessment(input: CreateInput): Promise<CreateResult> {
  if (!supabase) return notConfigured;
  const { data, error } = await supabase
    .from('assessments')
    .insert({
      year_id: input.yearId,
      class_id: input.classId,
      subject_id: input.subjectId,
      created_by: input.userId,
      status: 'draft',
      ...input.fields,
      // Set once the questions are in, so a half-made draft never claims marks.
      total_marks: null,
    })
    .select('id')
    .single();
  if (error || !data) return fail(error);
  const id = data.id;
  const items = await writeItems(id, [], input.items);
  if (!items.ok) return { ...items, draftId: id };
  if (input.fields.total_marks !== null) {
    const tot = await supabase
      .from('assessments')
      .update({ total_marks: input.fields.total_marks })
      .eq('id', id);
    if (tot.error) return { ...fail(tot.error), draftId: id } as CreateResult;
  }
  if (input.publish) {
    const pub = await setStatus(id, 'published');
    if (!pub.ok) return { ...pub, draftId: id };
  }
  return ok(id);
}

/**
 * Save edits. `items` is null when the question set is locked (published or
 * closed): only the descriptive fields change then.
 */
export async function updateAssessment(
  id: string,
  fields: Partial<AssessmentFields>,
  items: { existing: string[]; wanted: AssessmentItemRow[] } | null,
): Promise<Result<true>> {
  if (!supabase) return notConfigured;
  const { data, error } = await supabase
    .from('assessments')
    .update(fields)
    .eq('id', id)
    .select('id');
  if (error) return fail(error);
  if (!data?.length) return { ok: false, error: 'forbidden' };
  return items ? writeItems(id, items.existing, items.wanted) : ok(true);
}

export async function setStatus(id: string, status: AssessmentStatus): Promise<Result<true>> {
  if (!supabase) return notConfigured;
  const { data, error } = await supabase
    .from('assessments')
    .update({ status })
    .eq('id', id)
    .select('id');
  if (error) return fail(error);
  return data?.length ? ok(true) : { ok: false, error: 'forbidden' };
}
