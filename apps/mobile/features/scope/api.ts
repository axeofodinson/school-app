// Where a staff member may author: the current academic year, then the classes
// they can work in (admins: every class; teachers: their teacher_assignments for
// that year), then subjects and chapters. Offering only these keeps the UI in
// line with RLS (setup.sql p_assess_teacher_*, db/003 teaches_chapter), which
// stays the real boundary.
import { supabase } from '../../lib/supabase';
import { fail, notConfigured, ok, type Result } from '../../lib/result';

export interface Year {
  id: string;
  label: string;
}

export interface ScopeClass {
  id: string;
  name: string;
  grade_level: number;
  /** Subjects a teacher is assigned to here; null = the whole class (or staff). */
  subjectIds: string[] | null;
}

export interface Subject {
  id: string;
  name: string;
}

export interface Chapter {
  id: string;
  title: string;
}

export interface Scope {
  year: Year | null;
  classes: ScopeClass[];
}

const byGrade = (a: ScopeClass, b: ScopeClass) =>
  a.grade_level - b.grade_level || a.name.localeCompare(b.name);

export async function loadScope(userId: string, isStaff: boolean): Promise<Result<Scope>> {
  if (!supabase) return notConfigured;
  const yr = await supabase
    .from('academic_years')
    .select('id, label')
    .eq('is_current', true)
    .maybeSingle();
  if (yr.error) return fail(yr.error);
  const year = yr.data ?? null;
  if (!year) return ok({ year: null, classes: [] });

  if (isStaff) {
    const cls = await supabase
      .from('classes')
      .select('id, name, grade_level')
      .order('grade_level')
      .order('name');
    if (cls.error) return fail(cls.error);
    return ok({ year, classes: (cls.data ?? []).map((c) => ({ ...c, subjectIds: null })) });
  }

  const ta = await supabase
    .from('teacher_assignments')
    .select('subject_id, class:classes(id, name, grade_level)')
    .eq('teacher_id', userId)
    .eq('year_id', year.id);
  if (ta.error) return fail(ta.error);
  const map = new Map<string, ScopeClass>();
  for (const row of ta.data ?? []) {
    const c = row.class;
    if (!c) continue;
    const prev = map.get(c.id) ?? { ...c, subjectIds: [] as string[] | null };
    // A class-wide assignment (subject_id null) opens every subject.
    if (row.subject_id === null) prev.subjectIds = null;
    else if (prev.subjectIds) prev.subjectIds.push(row.subject_id);
    map.set(c.id, prev);
  }
  return ok({ year, classes: [...map.values()].sort(byGrade) });
}

export async function listSubjects(cls: ScopeClass): Promise<Result<Subject[]>> {
  if (!supabase) return notConfigured;
  let q = supabase
    .from('subjects')
    .select('id, name')
    .eq('class_id', cls.id)
    .order('sort_order')
    .order('name');
  if (cls.subjectIds) q = q.in('id', cls.subjectIds);
  const { data, error } = await q;
  return error ? fail(error) : ok(data ?? []);
}

export async function listChapters(subjectId: string): Promise<Result<Chapter[]>> {
  if (!supabase) return notConfigured;
  const { data, error } = await supabase
    .from('chapters')
    .select('id, title')
    .eq('subject_id', subjectId)
    .order('sort_order')
    .order('title');
  return error ? fail(error) : ok(data ?? []);
}
