// Assessment builder — where the office (admin) and teachers assemble a
// test/quiz/assignment/exam for a class + subject in the current academic year,
// then pull questions out of the shared bank into it with marks per question.
//
// Two DB tables, one flow (db/setup.sql):
//   * assessments           — the test itself (title, type, weightage, scheduled
//                             date, status, total_marks) scoped to class+subject+year.
//   * assessment_questions  — the join that puts bank questions into the test,
//                             carrying the marks + order for each.
//
// Role scoping mirrors RLS (the real security boundary — CLAUDE.md rule 4):
//   * staff (developer/admin): every class (p_assess_staff).
//   * teacher: only classes they're assigned to for the current year
//     (p_assess_teacher_write / _read via teaches_class). We only OFFER those
//     classes, so the UI matches the boundary rather than leaning on it.
//
// Content is data (rule 1): questions come from the `questions` bank, never
// hardcoded; building a test is INSERTs into assessment_questions. Time is
// modelled (rule 2): the assessment is pinned to the current academic_year, never
// a loose column.
//
// Prerequisites, in build order: a current academic year, then a class (staff) or
// an assignment (teacher), then a subject with questions in it. Each missing step
// guides the user to whoever can create it rather than failing on insert.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Pressable, ActivityIndicator, StyleSheet } from 'react-native';

import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { decode as decodeBase64 } from 'base64-arraybuffer';

import { ScreenContainer, Text, TextField, Button } from '../../components';
import { useAuth } from '../../auth/AuthProvider';
import { supabase } from '../../lib/supabase';
import { t } from '../../i18n';
import { colors, spacing } from '../../theme/colors';

// Enums mirror the DB check constraints (db/setup.sql + db/014: assessments.type).
// 'file' is a worksheet uploaded to Storage instead of assembled from questions.
const TYPES = ['assignment', 'test', 'exam', 'quiz', 'file'];
const STATUSES = ['draft', 'published', 'closed'];

// Marks per question are a small positive integer (matches questions.default_marks
// bounds used elsewhere). Weightage is a percent toward the annual aggregate.
const MAX_MARKS = 100;
const MAX_WEIGHTAGE = 100;

// A valid YYYY-MM-DD calendar date (same rule as AcademicYearsScreen), so
// "2025-13-40" is rejected rather than silently normalised by Date().
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function isValidDate(str) {
  if (!DATE_RE.test(str)) return false;
  const d = new Date(`${str}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && str === d.toISOString().slice(0, 10);
}

// Marks: a whole number in [1, MAX_MARKS]. Returns the integer, or null when the
// input is blank or not a valid whole number in range.
export function parseMarks(str) {
  const s = String(str ?? '').trim();
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isInteger(n) || n < 1 || n > MAX_MARKS) return null;
  return n;
}

// Weightage: a percent in [0, MAX_WEIGHTAGE] with up to two decimals (matches
// numeric(5,2)). Blank means 0 (the DB default). Returns the number, or null when
// present-but-invalid.
export function parseWeightage(str) {
  const s = String(str ?? '').trim();
  if (!s) return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0 || n > MAX_WEIGHTAGE) return null;
  return n;
}

// Sum the marks for the picked questions. `picks` maps questionId -> marks string;
// only entries that parse to a valid mark count. Returns a whole number (0 when
// nothing valid is picked) — this is what lands in assessments.total_marks.
export function sumMarks(picks) {
  let total = 0;
  for (const raw of Object.values(picks)) {
    const m = parseMarks(raw);
    if (m !== null) total += m;
  }
  return total;
}

// Best label for a bank question that could be any shape (rule 5: one table, all
// ages). Text questions carry body.stem; young-kid conceptual ones carry a
// prompt_text. Fall back so a row never renders blank.
function questionLabel(q) {
  return q.body?.stem || q.body?.prompt_text || '';
}

// Map a Supabase error to an i18n key under console.assessments.errors.
function classifyError(error) {
  if (!error) return null;
  const msg = (error.message || '').toLowerCase();
  if (/network request failed|failed to fetch|network|timeout|econn/.test(msg)) {
    return 'network';
  }
  return 'unknown';
}

// Total marks for a file worksheet are OPTIONAL (set only if it'll be graded).
// Blank -> null; otherwise a whole number >= 1. Returns { value } or { error }.
export function parseOptionalMarks(str) {
  const s = String(str ?? '').trim();
  if (!s) return { value: null };
  if (!/^\d+$/.test(s)) return { error: 'fileMarksInvalid' };
  const n = Number(s);
  if (!Number.isInteger(n) || n < 1) return { error: 'fileMarksInvalid' };
  return { value: n };
}

// A dropped upload vs a real failure — same network heuristic as classifyError,
// but its own i18n key so the message is about uploading.
function classifyUploadError(error) {
  if (!error) return 'uploadFailed';
  const msg = (error.message || '').toLowerCase();
  if (/network request failed|failed to fetch|network|timeout|econn/.test(msg)) {
    return 'network';
  }
  return 'uploadFailed';
}

// Upload a picked file into the private assessment-files bucket under the
// assessment's id (path "{assessmentId}/{ts}.{ext}" — the storage RLS in db/014
// keys on that first segment). Reads the file as base64 (Expo FileSystem) and
// decodes to bytes, the reliable way to send a local file through supabase-js in
// React Native. Returns { path, name, mime } or { error }.
async function uploadAssessmentFile(assessmentId, asset) {
  const name = asset.name || 'file';
  const ext = (name.split('.').pop() || 'bin').toLowerCase();
  const path = `${assessmentId}/${Date.now()}.${ext}`;
  const contentType = asset.mimeType || 'application/octet-stream';
  try {
    const base64 = await FileSystem.readAsStringAsync(asset.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const bytes = decodeBase64(base64);
    const { error } = await supabase.storage
      .from('assessment-files')
      .upload(path, bytes, { contentType, upsert: true });
    if (error) return { error };
    return { path, name, mime: contentType };
  } catch (e) {
    return { error: e };
  }
}

// A pressable pill used for tabs and every single-choice picker (class, subject,
// type, status). Selected fills with the primary colour; logical margins keep it
// correct under RTL.
function Chip({ label, selected, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipSelected,
        pressed && styles.chipPressed,
      ]}
    >
      <Text variant="label" color={selected ? colors.primaryText : colors.primary}>
        {label}
      </Text>
    </Pressable>
  );
}

// One question in the picker: a checkbox, the stem, and its type/level/chapter.
// When picked it reveals an inline marks field (seeded with the question's
// default marks). Tapping the row toggles inclusion in the assessment.
function QuestionPickRow({ question, picked, marks, onToggle, onMarks }) {
  const chapter = question.chapter;
  return (
    <View style={styles.pickWrap}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: picked }}
        style={({ pressed }) => [
          styles.pickRow,
          picked && styles.pickRowSelected,
          pressed && styles.chipPressed,
        ]}
      >
        <View style={[styles.checkbox, picked && styles.checkboxOn]}>
          {picked ? (
            <Text variant="label" color={colors.primaryText}>
              ✓
            </Text>
          ) : null}
        </View>
        <View style={styles.rowInfo}>
          <Text variant="label" color={picked ? colors.primary : colors.text}>
            {questionLabel(question)}
          </Text>
          <Text variant="caption" color={colors.muted} style={styles.rowMeta}>
            {t(`console.assessments.questionTypes.${question.type}`)}
            {' · '}
            {t(`console.assessments.cognitive.${question.cognitive_level}`)}
            {chapter ? ` · ${chapter.title}` : ''}
          </Text>
        </View>
      </Pressable>
      {picked ? (
        <TextField
          label={t('console.assessments.build.marks')}
          value={marks}
          onChangeText={onMarks}
          keyboardType="number-pad"
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.marksField}
        />
      ) : null}
    </View>
  );
}

// One row in the "Assessments" list: title + type, where it lives, its status,
// and a quick summary (questions, total marks, weightage, date).
function AssessmentRow({ assessment, onEdit }) {
  const cls = assessment.class;
  const subject = assessment.subject;
  const count = assessment.assessment_questions?.[0]?.count ?? 0;
  return (
    <View style={styles.row}>
      <View style={styles.rowInfo}>
        <Text variant="label">{assessment.title}</Text>
        <Text variant="caption" color={colors.muted} style={styles.rowMeta}>
          {t(`console.assessments.types.${assessment.type}`)}
          {' · '}
          {t('console.assessments.list.meta', {
            subject: subject?.name ?? '',
            class: cls?.name ?? '',
          })}
        </Text>
        <Text variant="caption" color={colors.muted} style={styles.rowMeta}>
          {t('console.assessments.list.questionCount', { count })}
          {' · '}
          {t('console.assessments.list.marks', {
            total: assessment.total_marks ?? 0,
          })}
          {' · '}
          {t('console.assessments.list.weightage', {
            weightage: assessment.weightage ?? 0,
          })}
        </Text>
        <Text variant="caption" color={colors.muted} style={styles.rowMeta}>
          {assessment.scheduled_on
            ? t('console.assessments.list.scheduled', { date: assessment.scheduled_on })
            : t('console.assessments.list.notScheduled')}
        </Text>
      </View>
      <View style={styles.rowActions}>
        <View style={styles.statusBadge}>
          <Text variant="caption" color={colors.primary}>
            {t(`console.assessments.statuses.${assessment.status}`)}
          </Text>
        </View>
        <Button
          variant="secondary"
          label={t('console.assessments.list.edit')}
          onPress={() => onEdit(assessment)}
          style={styles.rowAction}
        />
      </View>
    </View>
  );
}

export default function AssessmentBuilderScreen({ onBack, onManageYears, onManageClasses }) {
  const { role, session } = useAuth();
  const isStaff = role === 'developer' || role === 'admin';
  const userId = session?.user?.id;

  // Bootstrap: current year + the classes this user may build for.
  const [year, setYear] = useState(null); // { id, label } or null
  const [classes, setClasses] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const [tab, setTab] = useState('build'); // 'build' | 'list'

  // Class -> subject pickers (create mode; edit pins them as context).
  const [selectedClassId, setSelectedClassId] = useState(null);
  const [subjects, setSubjects] = useState(null); // null = not loaded for class
  const [subjectsError, setSubjectsError] = useState(false);
  const [selectedSubjectId, setSelectedSubjectId] = useState(null);

  // Question bank for the selected subject.
  const [bank, setBank] = useState(null); // null = not loaded for subject
  const [bankError, setBankError] = useState(false);

  // Assessment form.
  const [title, setTitle] = useState('');
  const [type, setType] = useState('assignment');
  const [weightage, setWeightage] = useState('');
  const [scheduledOn, setScheduledOn] = useState('');
  const [status, setStatus] = useState('draft');
  // picks: questionId -> marks string. Presence = included in the assessment.
  const [picks, setPicks] = useState({});
  // File type: the picked file (DocumentPicker asset) and its optional total marks.
  const [pickedFile, setPickedFile] = useState(null);
  const [fileMarks, setFileMarks] = useState('');

  const [editing, setEditing] = useState(null); // assessment row being edited
  const [formError, setFormError] = useState(null); // i18n key under errors
  const [success, setSuccess] = useState(null); // { title } or null
  const [saving, setSaving] = useState(false);

  // Assessments list.
  const [list, setList] = useState(null); // null = not loaded
  const [listError, setListError] = useState(false);

  const resetForm = useCallback(() => {
    setTitle('');
    setType('assignment');
    setWeightage('');
    setScheduledOn('');
    setStatus('draft');
    setPicks({});
    setPickedFile(null);
    setFileMarks('');
    setFormError(null);
  }, []);

  const load = useCallback(async () => {
    setLoadError(false);
    const yearRes = await supabase
      .from('academic_years')
      .select('id, label')
      .eq('is_current', true)
      .maybeSingle();
    if (yearRes.error) {
      setLoadError(true);
      return;
    }
    const currentYear = yearRes.data ?? null;
    setYear(currentYear);

    if (!currentYear) {
      setClasses([]);
      setLoaded(true);
      return;
    }

    // Staff build for any class; a teacher only for classes they're assigned to
    // this year. Distinct on class since a teacher may hold several subject
    // assignments in one class.
    let classList = [];
    if (isStaff) {
      const { data, error } = await supabase
        .from('classes')
        .select('id, name, grade_level')
        .order('grade_level', { ascending: true })
        .order('name', { ascending: true });
      if (error) {
        setLoadError(true);
        return;
      }
      classList = data ?? [];
    } else {
      const { data, error } = await supabase
        .from('teacher_assignments')
        .select('class:classes(id, name, grade_level)')
        .eq('teacher_id', userId)
        .eq('year_id', currentYear.id);
      if (error) {
        setLoadError(true);
        return;
      }
      const byId = new Map();
      for (const r of data ?? []) if (r.class) byId.set(r.class.id, r.class);
      classList = [...byId.values()].sort(
        (a, b) => a.grade_level - b.grade_level || a.name.localeCompare(b.name)
      );
    }
    setClasses(classList);
    setSelectedClassId((prev) =>
      prev && classList.some((c) => c.id === prev) ? prev : classList[0]?.id ?? null
    );
    setLoaded(true);
  }, [isStaff, userId]);

  useEffect(() => {
    load();
  }, [load]);

  const loadSubjects = useCallback(async (classId) => {
    setSubjects(null);
    setSubjectsError(false);
    const { data, error } = await supabase
      .from('subjects')
      .select('id, name, sort_order')
      .eq('class_id', classId)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    if (error) {
      setSubjectsError(true);
      return;
    }
    const listData = data ?? [];
    setSubjects(listData);
    setSelectedSubjectId((prev) =>
      prev && listData.some((s) => s.id === prev) ? prev : listData[0]?.id ?? null
    );
  }, []);

  // The question bank for a subject: every question in the subject's chapters.
  // !inner filters questions by their chapter's subject in one round trip.
  const loadBank = useCallback(async (subjectId) => {
    setBank(null);
    setBankError(false);
    const { data, error } = await supabase
      .from('questions')
      .select(
        'id, type, cognitive_level, default_marks, body, ' +
          'chapter:chapters!inner(id, title, subject_id)'
      )
      .eq('chapter.subject_id', subjectId)
      .order('created_at', { ascending: true });
    if (error) {
      setBankError(true);
      return;
    }
    setBank(data ?? []);
  }, []);

  const loadList = useCallback(async () => {
    if (!year) return;
    setList(null);
    setListError(false);
    // RLS scopes rows: staff see all, a teacher only their classes' assessments.
    // Scoped to the current year so the list matches what's being built.
    const { data, error } = await supabase
      .from('assessments')
      .select(
        'id, title, type, weightage, total_marks, scheduled_on, status, ' +
          'file_path, file_name, file_mime, ' +
          'class:classes(id, name), subject:subjects(id, name), ' +
          'assessment_questions(count)'
      )
      .eq('year_id', year.id)
      .order('created_at', { ascending: false });
    if (error) {
      setListError(true);
      return;
    }
    setList(data ?? []);
  }, [year]);

  // Load subjects when the class changes (create mode only). Editing pins the
  // subject, so the picker is hidden and needn't track a selection.
  useEffect(() => {
    if (editing) return;
    if (selectedClassId) loadSubjects(selectedClassId);
    else {
      setSubjects(null);
      setSelectedSubjectId(null);
    }
  }, [editing, selectedClassId, loadSubjects]);

  // Load the bank whenever the working subject changes (both modes).
  useEffect(() => {
    if (selectedSubjectId) loadBank(selectedSubjectId);
    else {
      setBank(null);
    }
  }, [selectedSubjectId, loadBank]);

  // Load the list the first time its tab opens.
  useEffect(() => {
    if (tab === 'list' && list === null && !listError) loadList();
  }, [tab, list, listError, loadList]);

  const selectClass = useCallback((id) => {
    setSelectedClassId(id);
    setSelectedSubjectId(null);
    setPicks({}); // picks belong to a subject's bank — a class change invalidates them
    setFormError(null);
    setSuccess(null);
  }, []);

  const selectSubject = useCallback((id) => {
    setSelectedSubjectId(id);
    setPicks({});
    setFormError(null);
    setSuccess(null);
  }, []);

  // Toggle a question in/out of the assessment. On include, seed its marks with
  // the question's default so the common case needs no typing.
  const toggleQuestion = useCallback((q) => {
    setPicks((prev) => {
      const next = { ...prev };
      if (q.id in next) {
        delete next[q.id];
      } else {
        next[q.id] = String(q.default_marks ?? 1);
      }
      return next;
    });
    setFormError(null);
    setSuccess(null);
  }, []);

  const setQuestionMarks = useCallback((id, value) => {
    setPicks((prev) => (id in prev ? { ...prev, [id]: value } : prev));
    setFormError(null);
  }, []);

  const startEdit = useCallback(
    async (a) => {
      // Pin class + subject (changing them would orphan the picked questions);
      // load that subject's bank and the assessment's current composition.
      setEditing(a);
      setTab('build');
      setSelectedClassId(a.class?.id ?? null);
      setSelectedSubjectId(a.subject?.id ?? null);
      setTitle(a.title ?? '');
      setType(a.type ?? 'assignment');
      setWeightage(a.weightage != null ? String(a.weightage) : '');
      setScheduledOn(a.scheduled_on ?? '');
      setStatus(a.status ?? 'draft');
      setPicks({});
      setPickedFile(null);
      setFileMarks(a.type === 'file' && a.total_marks != null ? String(a.total_marks) : '');
      setFormError(null);
      setSuccess(null);

      // A file assessment has no bank questions to reload.
      if (a.type === 'file') return;

      const { data, error } = await supabase
        .from('assessment_questions')
        .select('question_id, marks')
        .eq('assessment_id', a.id);
      if (!error && data) {
        const map = {};
        for (const r of data) map[r.question_id] = String(r.marks);
        setPicks(map);
      }
      // A load failure just leaves picks empty; the user can re-pick. loadBank is
      // driven by the selectedSubjectId effect above.
    },
    []
  );

  const cancelEdit = useCallback(() => {
    setEditing(null);
    resetForm();
    setSuccess(null);
    // Fall back to the first class/subject for a fresh create.
    setSelectedClassId((prev) =>
      prev && classes.some((c) => c.id === prev) ? prev : classes[0]?.id ?? null
    );
  }, [resetForm, classes]);

  // Validate the form; return either an { error } i18n key or the built payload.
  const buildPayload = useCallback(() => {
    const titleT = title.trim();
    if (!titleT) return { error: 'titleRequired' };

    const w = parseWeightage(weightage);
    if (w === null) return { error: 'weightageInvalid' };

    const dateT = scheduledOn.trim();
    if (dateT && !isValidDate(dateT)) return { error: 'dateInvalid' };

    // A file worksheet carries no bank questions — just an optional total for
    // grading. The file itself is validated + uploaded in save().
    if (type === 'file') {
      const fm = parseOptionalMarks(fileMarks);
      if (fm.error) return { error: fm.error };
      return {
        title: titleT,
        weightage: w,
        scheduledOn: dateT || null,
        total_marks: fm.value,
        questionRows: [],
      };
    }

    // Every picked question needs a valid mark.
    const ids = Object.keys(picks);
    for (const id of ids) {
      if (parseMarks(picks[id]) === null) return { error: 'marksInvalid' };
    }
    // A published/closed assessment must actually have questions; a draft may be
    // saved empty and filled in later.
    if (status !== 'draft' && ids.length === 0) return { error: 'needQuestions' };

    const total = sumMarks(picks);
    return {
      title: titleT,
      weightage: w,
      scheduledOn: dateT || null,
      total_marks: ids.length > 0 ? total : null,
      // sort_order preserves the picking order; marks come from the picks map.
      questionRows: ids.map((id, i) => ({
        question_id: id,
        marks: parseMarks(picks[id]),
        sort_order: i,
      })),
    };
  }, [title, type, weightage, scheduledOn, status, picks, fileMarks]);

  const save = useCallback(async () => {
    if (!editing && !selectedClassId) return setFormError('classRequired');
    if (!editing && !selectedSubjectId) return setFormError('subjectRequired');

    const built = buildPayload();
    if (built.error) return setFormError(built.error);

    // A published/closed file worksheet must actually have a file attached (a new
    // pick, or one already on the assessment being edited). A draft may wait.
    if (
      type === 'file' &&
      status !== 'draft' &&
      !pickedFile &&
      !(editing && editing.file_path)
    ) {
      return setFormError('needFile');
    }

    setFormError(null);
    setSuccess(null);
    setSaving(true);

    if (editing) {
      // Update the assessment's own fields; class/subject/year stay fixed.
      const { error: upErr } = await supabase
        .from('assessments')
        .update({
          title: built.title,
          type,
          weightage: built.weightage,
          scheduled_on: built.scheduledOn,
          status,
          total_marks: built.total_marks,
        })
        .eq('id', editing.id);
      if (upErr) {
        setSaving(false);
        setFormError(classifyError(upErr));
        return;
      }

      if (type === 'file') {
        // Upload a newly chosen file (if any) and point the assessment at it.
        if (pickedFile) {
          const up = await uploadAssessmentFile(editing.id, pickedFile);
          if (up.error) {
            setSaving(false);
            setFormError(classifyUploadError(up.error));
            return;
          }
          const { error: fErr } = await supabase
            .from('assessments')
            .update({ file_path: up.path, file_name: up.name, file_mime: up.mime })
            .eq('id', editing.id);
          if (fErr) {
            setSaving(false);
            setFormError(classifyError(fErr));
            return;
          }
        }
        // If this used to be a structured test, drop the questions it carried.
        await supabase.from('assessment_questions').delete().eq('assessment_id', editing.id);
      } else {
        // Reconcile the question set: remove what was dropped, upsert the rest
        // (updates marks/order or inserts new). We diff rather than wipe-and-refill
        // so unchanged rows are never briefly deleted.
        const existingRes = await supabase
          .from('assessment_questions')
          .select('question_id')
          .eq('assessment_id', editing.id);
        const existingIds = new Set(
          (existingRes.data ?? []).map((r) => r.question_id)
        );
        const keepIds = new Set(built.questionRows.map((r) => r.question_id));
        const toRemove = [...existingIds].filter((id) => !keepIds.has(id));

        if (toRemove.length > 0) {
          const { error: delErr } = await supabase
            .from('assessment_questions')
            .delete()
            .eq('assessment_id', editing.id)
            .in('question_id', toRemove);
          if (delErr) {
            setSaving(false);
            setFormError(classifyError(delErr));
            return;
          }
        }
        if (built.questionRows.length > 0) {
          const { error: upsertErr } = await supabase
            .from('assessment_questions')
            .upsert(
              built.questionRows.map((r) => ({ ...r, assessment_id: editing.id })),
              { onConflict: 'assessment_id,question_id' }
            );
          if (upsertErr) {
            setSaving(false);
            setFormError(classifyError(upsertErr));
            return;
          }
        }
      }

      setSaving(false);
      setList(null);
      loadList();
      setEditing(null);
      resetForm();
      setSelectedClassId((prev) =>
        prev && classes.some((c) => c.id === prev) ? prev : classes[0]?.id ?? null
      );
      setTab('list');
      return;
    }

    // Create: insert the assessment, get its id, then insert its questions.
    const { data: created, error: insErr } = await supabase
      .from('assessments')
      .insert({
        year_id: year.id,
        class_id: selectedClassId,
        subject_id: selectedSubjectId,
        title: built.title,
        type,
        weightage: built.weightage,
        scheduled_on: built.scheduledOn,
        status,
        total_marks: built.total_marks,
        created_by: userId,
      })
      .select('id')
      .single();
    if (insErr || !created) {
      setSaving(false);
      setFormError(classifyError(insErr));
      return;
    }

    if (type === 'file') {
      // Upload the file (if one was chosen — a draft may be saved without) and
      // point the fresh assessment at it. Any failure rolls the create back so
      // the user sees all-or-nothing (the row is brand new, no consequences).
      if (pickedFile) {
        const up = await uploadAssessmentFile(created.id, pickedFile);
        if (up.error) {
          await supabase.from('assessments').delete().eq('id', created.id);
          setSaving(false);
          setFormError(classifyUploadError(up.error));
          return;
        }
        const { error: fErr } = await supabase
          .from('assessments')
          .update({ file_path: up.path, file_name: up.name, file_mime: up.mime })
          .eq('id', created.id);
        if (fErr) {
          await supabase.from('assessments').delete().eq('id', created.id);
          setSaving(false);
          setFormError(classifyError(fErr));
          return;
        }
      }
    } else if (built.questionRows.length > 0) {
      const { error: aqErr } = await supabase.from('assessment_questions').insert(
        built.questionRows.map((r) => ({ ...r, assessment_id: created.id }))
      );
      if (aqErr) {
        // The questions failed after the assessment landed. Roll the create back
        // by deleting the just-made assessment — safe because it's brand new with
        // no submissions attached yet (nothing with consequences — CLAUDE.md
        // rule 3), so the user sees an all-or-nothing create.
        await supabase.from('assessments').delete().eq('id', created.id);
        setSaving(false);
        setFormError(classifyError(aqErr));
        return;
      }
    }

    setSaving(false);
    setSuccess({ title: built.title });
    resetForm();
    setList(null); // list is stale now; reload lazily when its tab opens
  }, [
    editing,
    selectedClassId,
    selectedSubjectId,
    buildPayload,
    type,
    status,
    year,
    userId,
    loadList,
    resetForm,
    classes,
    pickedFile,
  ]);

  // Open the OS file picker; keep the chosen file for upload on save. Accepts any
  // image or document (the user asked for both); rendering picks the right viewer.
  const chooseFile = useCallback(async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled) return;
      const asset = res.assets?.[0];
      if (asset) {
        setPickedFile(asset);
        setFormError(null);
        setSuccess(null);
      }
    } catch (e) {
      setFormError('unknown');
    }
  }, []);

  const pickedCount = useMemo(() => Object.keys(picks).length, [picks]);
  const totalMarks = useMemo(() => sumMarks(picks), [picks]);

  const loading = !loaded && !loadError;

  // --- Header (shared across every state) ---
  const header = (
    <>
      <View style={styles.header}>
        <Text variant="title">{t('console.assessments.title')}</Text>
        <Button
          variant="secondary"
          label={t('console.assessments.back')}
          onPress={onBack}
          style={styles.backBtn}
        />
      </View>
      <Text variant="body" color={colors.muted} style={styles.subtitle}>
        {year
          ? t(
              isStaff
                ? 'console.assessments.subtitleAdmin'
                : 'console.assessments.subtitleTeacher',
              { year: year.label }
            )
          : t('console.assessments.subtitleNoYear')}
      </Text>
    </>
  );

  if (loading) {
    return (
      <ScreenContainer scroll>
        {header}
        <ActivityIndicator color={colors.primary} style={styles.loading} />
      </ScreenContainer>
    );
  }

  if (loadError) {
    return (
      <ScreenContainer scroll>
        {header}
        <View style={styles.stateBox}>
          <Text variant="body" color={colors.danger} align="center">
            {t('console.assessments.loadError')}
          </Text>
          <Button
            variant="secondary"
            label={t('console.assessments.retry')}
            onPress={load}
            style={styles.retry}
          />
        </View>
      </ScreenContainer>
    );
  }

  // Prerequisites: an active year, then a class (staff) / assignment (teacher).
  if (!year) {
    return (
      <ScreenContainer scroll>
        {header}
        <Prerequisite
          message={t('console.assessments.needYear')}
          actionLabel={isStaff ? t('console.assessments.goToYears') : null}
          onAction={isStaff ? onManageYears : null}
        />
      </ScreenContainer>
    );
  }
  if (classes.length === 0) {
    return (
      <ScreenContainer scroll>
        {header}
        <Prerequisite
          message={
            isStaff
              ? t('console.assessments.needClass')
              : t('console.assessments.noAssignments')
          }
          actionLabel={isStaff ? t('console.assessments.goToClasses') : null}
          onAction={isStaff ? onManageClasses : null}
        />
      </ScreenContainer>
    );
  }

  const subjectReady = editing || !!selectedSubjectId;
  const editContext = editing
    ? t('console.assessments.build.context', {
        subject: editing.subject?.name ?? '',
        class: editing.class?.name ?? '',
      })
    : '';

  return (
    <ScreenContainer scroll>
      {header}

      {/* Mode switch */}
      <View style={styles.tabRow}>
        <Chip
          label={t('console.assessments.tabs.build')}
          selected={tab === 'build'}
          onPress={() => setTab('build')}
        />
        <Chip
          label={t('console.assessments.tabs.list')}
          selected={tab === 'list'}
          onPress={() => setTab('list')}
        />
      </View>

      {tab === 'build' ? (
        <View style={styles.card}>
          <View style={styles.formHeadingRow}>
            <Text variant="label" style={styles.formHeading}>
              {editing
                ? t('console.assessments.build.editHeading')
                : t('console.assessments.build.heading')}
            </Text>
            {editing ? (
              <Button
                variant="secondary"
                label={t('console.assessments.build.cancelEdit')}
                onPress={cancelEdit}
                style={styles.cancelBtn}
              />
            ) : null}
          </View>

          {editing ? (
            // Edit: class + subject are fixed, shown as read-only context.
            <View style={styles.contextBox}>
              <Text variant="caption" color={colors.muted}>
                {editContext}
              </Text>
            </View>
          ) : (
            <>
              {/* Class */}
              <Text variant="label" style={styles.pickLabel}>
                {t('console.assessments.build.pickClass')}
              </Text>
              <View style={styles.chipRow}>
                {classes.map((cls) => (
                  <Chip
                    key={cls.id}
                    label={cls.name}
                    selected={cls.id === selectedClassId}
                    onPress={() => selectClass(cls.id)}
                  />
                ))}
              </View>

              {/* Subject */}
              <Text variant="label" style={styles.pickLabel}>
                {t('console.assessments.build.pickSubject')}
              </Text>
              {subjects === null && !subjectsError ? (
                <ActivityIndicator color={colors.primary} style={styles.pickLoading} />
              ) : subjectsError ? (
                <InlineRetry
                  message={t('console.assessments.build.loadSubjectsError')}
                  onRetry={() => loadSubjects(selectedClassId)}
                />
              ) : subjects.length === 0 ? (
                <Text variant="caption" color={colors.muted} style={styles.hint}>
                  {isStaff
                    ? t('console.assessments.build.needSubjects')
                    : t('console.assessments.build.needSubjectsTeacher')}
                </Text>
              ) : (
                <View style={styles.chipRow}>
                  {subjects.map((s) => (
                    <Chip
                      key={s.id}
                      label={s.name}
                      selected={s.id === selectedSubjectId}
                      onPress={() => selectSubject(s.id)}
                    />
                  ))}
                </View>
              )}
            </>
          )}

          {/* The rest of the form is only useful once a subject is settled. */}
          {subjectReady ? (
            <>
              {/* Title */}
              <TextField
                label={t('console.assessments.build.title')}
                placeholder={t('console.assessments.build.titlePlaceholder')}
                value={title}
                onChangeText={setTitle}
                autoCapitalize="sentences"
                style={styles.field}
              />

              {/* Type */}
              <Text variant="label" style={styles.pickLabel}>
                {t('console.assessments.build.type')}
              </Text>
              <View style={styles.chipRow}>
                {TYPES.map((tp) => (
                  <Chip
                    key={tp}
                    label={t(`console.assessments.types.${tp}`)}
                    selected={tp === type}
                    onPress={() => {
                      setType(tp);
                      setSuccess(null);
                    }}
                  />
                ))}
              </View>

              {/* Weightage */}
              <TextField
                label={t('console.assessments.build.weightage')}
                placeholder={t('console.assessments.build.weightagePlaceholder')}
                value={weightage}
                onChangeText={setWeightage}
                keyboardType="numbers-and-punctuation"
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.field}
              />
              <Text variant="caption" color={colors.muted} style={styles.hint}>
                {t('console.assessments.build.weightageHint')}
              </Text>

              {/* Scheduled date (optional) */}
              <TextField
                label={t('console.assessments.build.scheduledOn')}
                placeholder={t('console.assessments.build.datePlaceholder')}
                value={scheduledOn}
                onChangeText={setScheduledOn}
                keyboardType="numbers-and-punctuation"
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.field}
              />

              {/* Status */}
              <Text variant="label" style={styles.pickLabel}>
                {t('console.assessments.build.status')}
              </Text>
              <View style={styles.chipRow}>
                {STATUSES.map((s) => (
                  <Chip
                    key={s}
                    label={t(`console.assessments.statuses.${s}`)}
                    selected={s === status}
                    onPress={() => {
                      setStatus(s);
                      setFormError(null);
                      setSuccess(null);
                    }}
                  />
                ))}
              </View>

              {type === 'file' ? (
                /* File worksheet — upload instead of picking bank questions. */
                <>
                  <Text variant="label" style={styles.pickLabel}>
                    {t('console.assessments.build.file')}
                  </Text>
                  <Text variant="caption" color={colors.muted} style={styles.hint}>
                    {t('console.assessments.build.fileHint')}
                  </Text>
                  <Button
                    variant="secondary"
                    label={
                      pickedFile || editing?.file_name
                        ? t('console.assessments.build.changeFile')
                        : t('console.assessments.build.pickFile')
                    }
                    onPress={chooseFile}
                    style={styles.field}
                  />
                  <Text variant="caption" color={colors.muted} style={styles.hint}>
                    {pickedFile
                      ? t('console.assessments.build.fileSelected', { name: pickedFile.name })
                      : editing?.file_name
                      ? t('console.assessments.build.fileCurrent', { name: editing.file_name })
                      : t('console.assessments.build.fileNone')}
                  </Text>
                  <TextField
                    label={t('console.assessments.build.fileMarks')}
                    value={fileMarks}
                    onChangeText={setFileMarks}
                    keyboardType="number-pad"
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={styles.field}
                  />
                  <Text variant="caption" color={colors.muted} style={styles.hint}>
                    {t('console.assessments.build.fileMarksHint')}
                  </Text>
                </>
              ) : (
                <>
                  {/* Questions from the bank */}
                  <Text variant="label" style={styles.pickLabel}>
                    {t('console.assessments.build.questions')}
                  </Text>
                  <Text variant="caption" color={colors.muted} style={styles.hint}>
                    {t('console.assessments.build.questionsHint')}
                  </Text>
                  {bank === null && !bankError ? (
                    <ActivityIndicator color={colors.primary} style={styles.pickLoading} />
                  ) : bankError ? (
                    <InlineRetry
                      message={t('console.assessments.build.loadQuestionsError')}
                      onRetry={() => loadBank(selectedSubjectId)}
                    />
                  ) : bank.length === 0 ? (
                    <Text variant="caption" color={colors.muted} style={styles.hint}>
                      {isStaff
                        ? t('console.assessments.build.noQuestions')
                        : t('console.assessments.build.noQuestionsTeacher')}
                    </Text>
                  ) : (
                    <>
                      {bank.map((q) => (
                        <QuestionPickRow
                          key={q.id}
                          question={q}
                          picked={q.id in picks}
                          marks={picks[q.id] ?? ''}
                          onToggle={() => toggleQuestion(q)}
                          onMarks={(v) => setQuestionMarks(q.id, v)}
                        />
                      ))}
                      <Text variant="caption" color={colors.muted} style={styles.summary}>
                        {t('console.assessments.build.selectedCount', { count: pickedCount })}
                        {' · '}
                        {t('console.assessments.build.totalMarks', { total: totalMarks })}
                      </Text>
                    </>
                  )}
                </>
              )}

              {formError ? (
                <Text variant="caption" color={colors.danger} style={styles.formErr}>
                  {t(`console.assessments.errors.${formError}`)}
                </Text>
              ) : null}
              {success ? (
                <Text variant="caption" color={colors.primary} style={styles.formErr}>
                  {t('console.assessments.build.success', { title: success.title })}
                </Text>
              ) : null}

              <Button
                label={
                  saving
                    ? editing
                      ? t('console.assessments.build.updating')
                      : t('console.assessments.build.submitting')
                    : editing
                    ? t('console.assessments.build.updateSubmit')
                    : t('console.assessments.build.submit')
                }
                onPress={save}
                loading={saving}
                disabled={saving}
                style={styles.submit}
              />
            </>
          ) : null}
        </View>
      ) : (
        // "Assessments" list tab
        <>
          {list === null && !listError ? (
            <ActivityIndicator color={colors.primary} style={styles.loading} />
          ) : listError ? (
            <View style={styles.stateBox}>
              <Text variant="body" color={colors.danger} align="center">
                {t('console.assessments.list.loadError')}
              </Text>
              <Button
                variant="secondary"
                label={t('console.assessments.retry')}
                onPress={loadList}
                style={styles.retry}
              />
            </View>
          ) : list.length === 0 ? (
            <View style={styles.stateBox}>
              <Text variant="body" color={colors.muted} align="center">
                {t('console.assessments.list.empty')}
              </Text>
            </View>
          ) : (
            <>
              <Text variant="caption" color={colors.muted} style={styles.count}>
                {t('console.assessments.list.count', { count: list.length })}
              </Text>
              {list.map((a) => (
                <AssessmentRow key={a.id} assessment={a} onEdit={startEdit} />
              ))}
            </>
          )}
        </>
      )}
    </ScreenContainer>
  );
}

// Shared prerequisite prompt: a message plus (for staff) a button that jumps to
// the screen where the missing thing gets created. Teachers get message-only,
// since only an admin can fix their missing year/assignment.
function Prerequisite({ message, actionLabel, onAction }) {
  return (
    <View style={styles.stateBox}>
      <Text variant="body" color={colors.muted} align="center">
        {message}
      </Text>
      {onAction && actionLabel ? (
        <Button label={actionLabel} onPress={onAction} style={styles.retry} />
      ) : null}
    </View>
  );
}

// A compact inline error + retry for the subject / bank sub-loads.
function InlineRetry({ message, onRetry }) {
  return (
    <View style={styles.inlineRetry}>
      <Text variant="caption" color={colors.danger}>
        {message}
      </Text>
      <Button
        variant="secondary"
        label={t('console.assessments.retry')}
        onPress={onRetry}
        style={styles.inlineRetryBtn}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: { minHeight: 40, paddingVertical: spacing.xs, marginStart: spacing.md },
  subtitle: { marginTop: spacing.xs },
  tabRow: { flexDirection: 'row', marginTop: spacing.lg },
  card: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  formHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  formHeading: { flex: 1, marginEnd: spacing.sm },
  cancelBtn: { minHeight: 40, paddingVertical: spacing.xs },
  contextBox: {
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: 8,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pickLabel: { marginTop: spacing.md, marginBottom: spacing.sm },
  hint: { marginBottom: spacing.sm },
  field: { marginTop: spacing.md },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: {
    minHeight: 40,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.bg,
    marginEnd: spacing.sm,
    marginBottom: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSelected: { backgroundColor: colors.primary },
  chipPressed: { opacity: 0.85 },
  pickLoading: { alignSelf: 'flex-start', marginBottom: spacing.sm },
  pickWrap: { marginBottom: spacing.sm },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.bg,
  },
  pickRowSelected: { borderColor: colors.primary, backgroundColor: colors.surface },
  checkbox: {
    minHeight: 28,
    minWidth: 28,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    marginEnd: spacing.md,
  },
  checkboxOn: { backgroundColor: colors.primary },
  marksField: { marginTop: spacing.sm, marginStart: spacing.xl },
  summary: { marginTop: spacing.xs, marginBottom: spacing.sm },
  formErr: { marginTop: spacing.sm, marginBottom: spacing.sm },
  submit: { marginTop: spacing.xs },
  loading: { marginTop: spacing.xl },
  stateBox: { marginTop: spacing.xl, alignItems: 'center' },
  retry: { marginTop: spacing.md },
  inlineRetry: { marginBottom: spacing.sm },
  inlineRetryBtn: {
    alignSelf: 'flex-start',
    minHeight: 40,
    paddingVertical: spacing.xs,
    marginTop: spacing.xs,
  },
  count: { marginTop: spacing.md, marginBottom: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowInfo: { flex: 1, marginEnd: spacing.md },
  rowMeta: { marginTop: spacing.xs },
  rowActions: { alignItems: 'flex-end' },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.primary,
    marginBottom: spacing.sm,
  },
  rowAction: { minHeight: 40, paddingVertical: spacing.xs },
});
