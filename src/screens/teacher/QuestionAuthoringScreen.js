// Teacher question authoring — where a teacher writes questions for the chapters
// in the classes they teach. Two modes (tabs): write a new question, and review /
// edit the ones they've already written.
//
// Content is data, not code (CLAUDE.md rule 1): a question is an INSERT into the
// shared `questions` table, never a code change. body/answer are jsonb so one
// table holds every question shape (rule 5) — here we author mcq / numeric /
// true_false; body carries the stem (+ mcq options), answer carries the key.
//
// Cognitive level is REQUIRED (rule 6): the form starts with none selected and
// refuses to save until the teacher tags one — the DB's default is never relied on.
//
// Scoping to a teacher's own classes is enforced by RLS
// (db/003: p_questions_teacher_write via teaches_chapter); this screen only ever
// OFFERS chapters inside the teacher's teacher_assignments for the current year,
// so the UI matches the security boundary rather than leaning on it.
//
// Prerequisites, in build order: a current academic year, an assignment to a
// class, and a syllabus (subjects + chapters) in that class. Each missing step
// guides the teacher to whoever can create it (an admin) rather than failing on
// insert.
import { useCallback, useEffect, useState } from 'react';
import { View, Pressable, ActivityIndicator, StyleSheet } from 'react-native';

import { ScreenContainer, Text, TextField, Button } from '../../components';
import { useAuth } from '../../auth/AuthProvider';
import { supabase } from '../../lib/supabase';
import { t } from '../../i18n';
import { colors, spacing } from '../../theme/colors';

// The question types this screen can author, mirroring the DB check constraint
// (db/setup.sql: questions.type). The table allows more shapes (tap_image, …);
// those belong to the young-kid conceptual UX built elsewhere, not this form.
const TYPES = ['mcq', 'numeric', 'true_false'];

// The cognitive-level enum (db/setup.sql: questions.cognitive_level). No default
// is pre-selected — rule 6 means the teacher must choose one explicitly.
const COGNITIVE_LEVELS = ['recall', 'understand', 'apply', 'analyze'];

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 6;
const MAX_MARKS = 100;

// Option key from its position: 0 -> 'A', 1 -> 'B', …, matching the seed data
// shape (body.options[].key) in db/setup.sql.
const optionKey = (index) => String.fromCharCode(65 + index);

// Parse a numeric answer. Accepts an optionally-signed integer or decimal so
// "3.14" and "-2" pass while "3a", "" and "1/2" are rejected. Returns a Number
// or null.
function parseNumeric(str) {
  const s = str.trim();
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// Marks are a small positive integer; blank means the default of 1. Returns the
// integer, or null when the input is present but not a valid whole number.
function parseMarks(str) {
  const s = str.trim();
  if (!s) return 1;
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isInteger(n) || n < 1 || n > MAX_MARKS) return null;
  return n;
}

// Map a Supabase error to an i18n key under teacher.questions.errors.
function classifyError(error) {
  if (!error) return null;
  const msg = (error.message || '').toLowerCase();
  if (/network request failed|failed to fetch|network|timeout|econn/.test(msg)) {
    return 'network';
  }
  return 'unknown';
}

// A pressable pill used for tabs and every single-choice picker (class, subject,
// chapter, type, cognitive level, true/false). Selected fills with the primary
// colour; logical margins keep it correct under RTL.
function Chip({ label, selected, onPress, disabled }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: !!disabled }}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipSelected,
        disabled && styles.chipDisabled,
        pressed && !disabled && styles.chipPressed,
      ]}
    >
      <Text variant="label" color={selected ? colors.primaryText : colors.primary}>
        {label}
      </Text>
    </Pressable>
  );
}

// One row in the "my questions" list: the stem, plus its type / level / place in
// the syllabus, and an edit action.
function QuestionRow({ question, onEdit }) {
  const chapter = question.chapter;
  const subject = chapter?.subject;
  const cls = subject?.class;
  const stem = question.body?.stem || '';
  return (
    <View style={styles.row}>
      <View style={styles.rowInfo}>
        <Text variant="label">{stem}</Text>
        <Text variant="caption" color={colors.muted} style={styles.rowMeta}>
          {t(`teacher.questions.types.${question.type}`)}
          {' · '}
          {t(`teacher.questions.cognitive.${question.cognitive_level}`)}
        </Text>
        {chapter ? (
          <Text variant="caption" color={colors.muted} style={styles.rowMeta}>
            {t('teacher.questions.mine.context', {
              chapter: chapter.title,
              subject: subject?.name ?? '',
              class: cls?.name ?? '',
            })}
          </Text>
        ) : null}
      </View>
      <Button
        variant="secondary"
        label={t('teacher.questions.mine.edit')}
        onPress={() => onEdit(question)}
        style={styles.rowAction}
      />
    </View>
  );
}

export default function QuestionAuthoringScreen({ onBack }) {
  const { session } = useAuth();
  const teacherId = session?.user?.id;

  // Bootstrap: current year + the classes this teacher is assigned to for it.
  const [year, setYear] = useState(null); // { id, label } or null
  const [classes, setClasses] = useState([]); // assigned classes, ordered
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const [tab, setTab] = useState('create'); // 'create' | 'mine'

  // Syllabus pickers (create mode only; edit keeps the chapter fixed).
  const [selectedClassId, setSelectedClassId] = useState(null);
  const [subjects, setSubjects] = useState(null); // null = not loaded for class
  const [subjectsError, setSubjectsError] = useState(false);
  const [selectedSubjectId, setSelectedSubjectId] = useState(null);
  const [chapters, setChapters] = useState(null); // null = not loaded for subject
  const [chaptersError, setChaptersError] = useState(false);
  const [selectedChapterId, setSelectedChapterId] = useState(null);

  // Question form.
  const [type, setType] = useState('mcq');
  const [cognitive, setCognitive] = useState(null); // required — no default
  const [stem, setStem] = useState('');
  const [options, setOptions] = useState([{ text: '' }, { text: '' }]);
  const [correctIndex, setCorrectIndex] = useState(null);
  const [numericValue, setNumericValue] = useState('');
  const [tfValue, setTfValue] = useState(null); // true | false | null
  const [marks, setMarks] = useState('');

  const [editing, setEditing] = useState(null); // the question row being edited
  const [formError, setFormError] = useState(null); // i18n key under errors
  const [success, setSuccess] = useState(null); // 'created' | null
  const [saving, setSaving] = useState(false);

  // My questions.
  const [myQuestions, setMyQuestions] = useState(null); // null = not loaded
  const [mineError, setMineError] = useState(false);

  // Reset only the answer/content fields, leaving the chapter selection so a
  // teacher can add several questions to the same chapter in a row.
  const resetForm = useCallback(() => {
    setType('mcq');
    setCognitive(null);
    setStem('');
    setOptions([{ text: '' }, { text: '' }]);
    setCorrectIndex(null);
    setNumericValue('');
    setTfValue(null);
    setMarks('');
    setFormError(null);
  }, []);

  const load = useCallback(async () => {
    if (!teacherId) return;
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
      // No active year — nothing to scope assignments to.
      setClasses([]);
      setLoaded(true);
      return;
    }

    // The classes this teacher is assigned to for the current year. Distinct on
    // class because a teacher may hold several subject assignments in one class.
    const taRes = await supabase
      .from('teacher_assignments')
      .select('class:classes(id, name, grade_level)')
      .eq('teacher_id', teacherId)
      .eq('year_id', currentYear.id);
    if (taRes.error) {
      setLoadError(true);
      return;
    }
    const byId = new Map();
    for (const row of taRes.data ?? []) {
      if (row.class) byId.set(row.class.id, row.class);
    }
    const classList = [...byId.values()].sort(
      (a, b) => a.grade_level - b.grade_level || a.name.localeCompare(b.name)
    );
    setClasses(classList);
    setSelectedClassId((prev) =>
      prev && classList.some((c) => c.id === prev) ? prev : classList[0]?.id ?? null
    );
    setLoaded(true);
  }, [teacherId]);

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
    const list = data ?? [];
    setSubjects(list);
    setSelectedSubjectId((prev) =>
      prev && list.some((s) => s.id === prev) ? prev : list[0]?.id ?? null
    );
  }, []);

  const loadChapters = useCallback(async (subjectId) => {
    setChapters(null);
    setChaptersError(false);
    const { data, error } = await supabase
      .from('chapters')
      .select('id, title, sort_order')
      .eq('subject_id', subjectId)
      .order('sort_order', { ascending: true })
      .order('title', { ascending: true });
    if (error) {
      setChaptersError(true);
      return;
    }
    const list = data ?? [];
    setChapters(list);
    setSelectedChapterId((prev) =>
      prev && list.some((c) => c.id === prev) ? prev : list[0]?.id ?? null
    );
  }, []);

  const loadMine = useCallback(async () => {
    if (!teacherId) return;
    setMyQuestions(null);
    setMineError(false);
    const { data, error } = await supabase
      .from('questions')
      .select(
        'id, type, cognitive_level, default_marks, body, answer, chapter_id, ' +
          'chapter:chapters(id, title, subject:subjects(id, name, class:classes(id, name)))'
      )
      .eq('created_by', teacherId)
      .order('created_at', { ascending: false });
    if (error) {
      setMineError(true);
      return;
    }
    setMyQuestions(data ?? []);
  }, [teacherId]);

  // Load subjects when the class changes (create mode only). Editing pins the
  // chapter, so the pickers are hidden and needn't track selections.
  useEffect(() => {
    if (editing) return;
    if (selectedClassId) loadSubjects(selectedClassId);
    else {
      setSubjects(null);
      setSelectedSubjectId(null);
    }
  }, [editing, selectedClassId, loadSubjects]);

  useEffect(() => {
    if (editing) return;
    if (selectedSubjectId) loadChapters(selectedSubjectId);
    else {
      setChapters(null);
      setSelectedChapterId(null);
    }
  }, [editing, selectedSubjectId, loadChapters]);

  // Load the teacher's own questions the first time the tab is opened.
  useEffect(() => {
    if (tab === 'mine' && myQuestions === null && !mineError) loadMine();
  }, [tab, myQuestions, mineError, loadMine]);

  const selectClass = useCallback((id) => {
    setSelectedClassId(id);
    setSelectedSubjectId(null);
    setSelectedChapterId(null);
    setFormError(null);
    setSuccess(null);
  }, []);

  const selectSubject = useCallback((id) => {
    setSelectedSubjectId(id);
    setSelectedChapterId(null);
    setFormError(null);
    setSuccess(null);
  }, []);

  const setOptionText = useCallback((index, text) => {
    setOptions((prev) => prev.map((o, i) => (i === index ? { text } : o)));
  }, []);

  const addOption = useCallback(() => {
    setOptions((prev) =>
      prev.length >= MAX_OPTIONS ? prev : [...prev, { text: '' }]
    );
  }, []);

  const removeOption = useCallback(
    (index) => {
      setOptions((prev) =>
        prev.length <= MIN_OPTIONS ? prev : prev.filter((_, i) => i !== index)
      );
      // Keep the correct-answer pointer valid as rows shift.
      setCorrectIndex((prev) => {
        if (prev === null) return prev;
        if (prev === index) return null;
        return prev > index ? prev - 1 : prev;
      });
    },
    []
  );

  const startEdit = useCallback((q) => {
    setEditing(q);
    setType(q.type);
    setCognitive(q.cognitive_level);
    setStem(q.body?.stem || '');
    setMarks(q.default_marks != null ? String(q.default_marks) : '');
    setNumericValue('');
    setTfValue(null);
    setOptions([{ text: '' }, { text: '' }]);
    setCorrectIndex(null);

    if (q.type === 'mcq') {
      const opts = Array.isArray(q.body?.options) ? q.body.options : [];
      const rows =
        opts.length >= MIN_OPTIONS
          ? opts.map((o) => ({ text: o?.text ?? '' }))
          : [{ text: '' }, { text: '' }];
      setOptions(rows);
      const correctKey = q.answer?.correct;
      const idx = opts.findIndex((o) => o?.key === correctKey);
      setCorrectIndex(idx >= 0 ? idx : null);
    } else if (q.type === 'numeric') {
      setNumericValue(q.answer?.correct != null ? String(q.answer.correct) : '');
    } else if (q.type === 'true_false') {
      setTfValue(typeof q.answer?.correct === 'boolean' ? q.answer.correct : null);
    }

    setFormError(null);
    setSuccess(null);
    setTab('create');
  }, []);

  const cancelEdit = useCallback(() => {
    setEditing(null);
    resetForm();
    setSuccess(null);
  }, [resetForm]);

  // Change the question type mid-form: clear the answer state that doesn't apply
  // to the new type so a stale value can't be saved.
  const selectType = useCallback((next) => {
    setType(next);
    setFormError(null);
    setSuccess(null);
    setCorrectIndex(null);
    setNumericValue('');
    setTfValue(null);
    setOptions((prev) => (prev.length >= MIN_OPTIONS ? prev : [{ text: '' }, { text: '' }]));
  }, []);

  // Validate the form and build the (body, answer) jsonb pair, or return an
  // i18n error key. Kept together so every type's rules live in one place.
  const buildPayload = useCallback(() => {
    if (!cognitive) return { error: 'cognitiveRequired' };
    const stemT = stem.trim();
    if (!stemT) return { error: 'stemRequired' };

    let body;
    let answer;
    if (type === 'mcq') {
      const texts = options.map((o) => o.text.trim());
      if (texts.some((x) => !x)) return { error: 'optionTextRequired' };
      if (correctIndex === null || correctIndex >= texts.length) {
        return { error: 'correctRequired' };
      }
      body = {
        stem: stemT,
        options: texts.map((text, i) => ({ key: optionKey(i), text })),
      };
      answer = { correct: optionKey(correctIndex) };
    } else if (type === 'numeric') {
      if (!numericValue.trim()) return { error: 'numericRequired' };
      const n = parseNumeric(numericValue);
      if (n === null) return { error: 'numericInvalid' };
      body = { stem: stemT };
      answer = { correct: n };
    } else {
      // true_false
      if (tfValue === null) return { error: 'tfRequired' };
      body = { stem: stemT };
      answer = { correct: tfValue };
    }

    const marksVal = parseMarks(marks);
    if (marksVal === null) return { error: 'marksInvalid' };

    return { body, answer, marks: marksVal };
  }, [cognitive, stem, type, options, correctIndex, numericValue, tfValue, marks]);

  const save = useCallback(async () => {
    const chapterId = editing ? editing.chapter_id : selectedChapterId;
    if (!chapterId) return setFormError('chapterRequired');

    const built = buildPayload();
    if (built.error) return setFormError(built.error);

    setFormError(null);
    setSuccess(null);
    setSaving(true);

    let error;
    if (editing) {
      // Owner-scoped update (RLS: created_by = auth.uid()); chapter stays fixed.
      ({ error } = await supabase
        .from('questions')
        .update({
          type,
          cognitive_level: cognitive,
          body: built.body,
          answer: built.answer,
          default_marks: built.marks,
        })
        .eq('id', editing.id));
    } else {
      // created_by must be set so the teacher owns the row (RLS owner-update)
      // and it shows up in their "my questions" list.
      ({ error } = await supabase.from('questions').insert({
        chapter_id: chapterId,
        type,
        cognitive_level: cognitive,
        body: built.body,
        answer: built.answer,
        default_marks: built.marks,
        created_by: teacherId,
      }));
    }
    setSaving(false);

    if (error) {
      setFormError(classifyError(error));
      return;
    }

    // Refresh the list so both tabs stay in sync.
    setMyQuestions(null);
    loadMine();

    if (editing) {
      // Done editing — drop back to a clean create form and show the change.
      setEditing(null);
      resetForm();
      setTab('mine');
    } else {
      // Keep the chapter selected so the next question lands in the same place.
      resetForm();
      setSuccess('created');
    }
  }, [
    editing,
    selectedChapterId,
    buildPayload,
    type,
    cognitive,
    teacherId,
    loadMine,
    resetForm,
  ]);

  const loading = !loaded && !loadError;

  // --- Header (shared across every state) ---
  const header = (
    <>
      <View style={styles.header}>
        <Text variant="title">{t('teacher.questions.title')}</Text>
        <Button
          variant="secondary"
          label={t('teacher.questions.back')}
          onPress={onBack}
          style={styles.backBtn}
        />
      </View>
      <Text variant="body" color={colors.muted} style={styles.subtitle}>
        {t('teacher.questions.subtitle')}
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
            {t('teacher.questions.loadError')}
          </Text>
          <Button
            variant="secondary"
            label={t('teacher.questions.retry')}
            onPress={load}
            style={styles.retry}
          />
        </View>
      </ScreenContainer>
    );
  }

  // Prerequisites: an active year, then an assignment to a class.
  if (!year) {
    return (
      <ScreenContainer scroll>
        {header}
        <Guidance message={t('teacher.questions.needYear')} />
      </ScreenContainer>
    );
  }
  if (classes.length === 0) {
    return (
      <ScreenContainer scroll>
        {header}
        <Guidance message={t('teacher.questions.noAssignments')} />
      </ScreenContainer>
    );
  }

  const chapterReady = editing || !!selectedChapterId;

  return (
    <ScreenContainer scroll>
      {header}

      {/* Mode switch */}
      <View style={styles.tabRow}>
        <Chip
          label={t('teacher.questions.tabs.create')}
          selected={tab === 'create'}
          onPress={() => setTab('create')}
        />
        <Chip
          label={t('teacher.questions.tabs.mine')}
          selected={tab === 'mine'}
          onPress={() => setTab('mine')}
        />
      </View>

      {tab === 'create' ? (
        <View style={styles.card}>
          <View style={styles.formHeadingRow}>
            <Text variant="label" style={styles.formHeading}>
              {editing
                ? t('teacher.questions.create.editHeading')
                : t('teacher.questions.create.heading')}
            </Text>
            {editing ? (
              <Button
                variant="secondary"
                label={t('teacher.questions.create.cancelEdit')}
                onPress={cancelEdit}
                style={styles.cancelBtn}
              />
            ) : null}
          </View>

          {editing ? (
            // Edit mode: the chapter is fixed, shown as read-only context.
            <View style={styles.contextBox}>
              <Text variant="caption" color={colors.muted}>
                {t('teacher.questions.create.chapterContext', {
                  chapter: editing.chapter?.title ?? '',
                  subject: editing.chapter?.subject?.name ?? '',
                  class: editing.chapter?.subject?.class?.name ?? '',
                })}
              </Text>
            </View>
          ) : (
            // Create mode: pick class -> subject -> chapter within assigned classes.
            <>
              <Text variant="label" style={styles.pickLabel}>
                {t('teacher.questions.create.pickClass')}
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

              <Text variant="label" style={styles.pickLabel}>
                {t('teacher.questions.create.pickSubject')}
              </Text>
              {subjects === null && !subjectsError ? (
                <ActivityIndicator color={colors.primary} style={styles.pickLoading} />
              ) : subjectsError ? (
                <InlineRetry
                  message={t('teacher.questions.create.loadSubjectsError')}
                  onRetry={() => loadSubjects(selectedClassId)}
                />
              ) : subjects.length === 0 ? (
                <Text variant="caption" color={colors.muted} style={styles.hint}>
                  {t('teacher.questions.create.needSyllabus')}
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

              {subjects && subjects.length > 0 ? (
                <>
                  <Text variant="label" style={styles.pickLabel}>
                    {t('teacher.questions.create.pickChapter')}
                  </Text>
                  {chapters === null && !chaptersError ? (
                    <ActivityIndicator
                      color={colors.primary}
                      style={styles.pickLoading}
                    />
                  ) : chaptersError ? (
                    <InlineRetry
                      message={t('teacher.questions.create.loadChaptersError')}
                      onRetry={() => loadChapters(selectedSubjectId)}
                    />
                  ) : chapters.length === 0 ? (
                    <Text variant="caption" color={colors.muted} style={styles.hint}>
                      {t('teacher.questions.create.needChapters')}
                    </Text>
                  ) : (
                    <View style={styles.chipRow}>
                      {chapters.map((c) => (
                        <Chip
                          key={c.id}
                          label={c.title}
                          selected={c.id === selectedChapterId}
                          onPress={() => {
                            setSelectedChapterId(c.id);
                            setSuccess(null);
                          }}
                        />
                      ))}
                    </View>
                  )}
                </>
              ) : null}
            </>
          )}

          {/* The question form is only useful once a chapter is settled. */}
          {chapterReady ? (
            <>
              {/* Type */}
              <Text variant="label" style={styles.pickLabel}>
                {t('teacher.questions.create.type')}
              </Text>
              <View style={styles.chipRow}>
                {TYPES.map((tp) => (
                  <Chip
                    key={tp}
                    label={t(`teacher.questions.types.${tp}`)}
                    selected={tp === type}
                    onPress={() => selectType(tp)}
                  />
                ))}
              </View>

              {/* Cognitive level — required */}
              <Text variant="label" style={styles.pickLabel}>
                {t('teacher.questions.create.cognitive')}
              </Text>
              <Text variant="caption" color={colors.muted} style={styles.hint}>
                {t('teacher.questions.create.cognitiveHint')}
              </Text>
              <View style={styles.chipRow}>
                {COGNITIVE_LEVELS.map((lvl) => (
                  <Chip
                    key={lvl}
                    label={t(`teacher.questions.cognitive.${lvl}`)}
                    selected={lvl === cognitive}
                    onPress={() => {
                      setCognitive(lvl);
                      setFormError(null);
                    }}
                  />
                ))}
              </View>

              {/* Stem */}
              <TextField
                label={t('teacher.questions.create.stem')}
                placeholder={t('teacher.questions.create.stemPlaceholder')}
                value={stem}
                onChangeText={setStem}
                autoCapitalize="sentences"
                multiline
                style={styles.stemField}
              />

              {/* Type-specific answer entry */}
              {type === 'mcq' ? (
                <>
                  <Text variant="label" style={styles.pickLabel}>
                    {t('teacher.questions.create.options')}
                  </Text>
                  <Text variant="caption" color={colors.muted} style={styles.hint}>
                    {t('teacher.questions.create.optionsHint')}
                  </Text>
                  {options.map((opt, index) => {
                    const isCorrect = correctIndex === index;
                    return (
                      <View key={index} style={styles.optionRow}>
                        <Pressable
                          onPress={() => {
                            setCorrectIndex(index);
                            setFormError(null);
                          }}
                          accessibilityRole="radio"
                          accessibilityState={{ checked: isCorrect }}
                          accessibilityLabel={t('teacher.questions.create.markCorrect')}
                          style={[styles.correctDot, isCorrect && styles.correctDotOn]}
                        >
                          <Text
                            variant="label"
                            color={isCorrect ? colors.primaryText : colors.muted}
                          >
                            {optionKey(index)}
                          </Text>
                        </Pressable>
                        <TextField
                          value={opt.text}
                          onChangeText={(txt) => setOptionText(index, txt)}
                          placeholder={t('teacher.questions.create.optionPlaceholder', {
                            letter: optionKey(index),
                          })}
                          autoCapitalize="sentences"
                          style={styles.optionField}
                        />
                        {options.length > MIN_OPTIONS ? (
                          <Button
                            variant="secondary"
                            label="✕"
                            accessibilityLabel={t('teacher.questions.create.removeOption')}
                            onPress={() => removeOption(index)}
                            style={styles.removeBtn}
                          />
                        ) : null}
                      </View>
                    );
                  })}
                  {options.length < MAX_OPTIONS ? (
                    <Button
                      variant="secondary"
                      label={t('teacher.questions.create.addOption')}
                      onPress={addOption}
                      style={styles.addOptionBtn}
                    />
                  ) : null}
                </>
              ) : type === 'numeric' ? (
                <TextField
                  label={t('teacher.questions.create.numericAnswer')}
                  placeholder={t('teacher.questions.create.numericPlaceholder')}
                  value={numericValue}
                  onChangeText={(txt) => {
                    setNumericValue(txt);
                    setFormError(null);
                  }}
                  keyboardType="numbers-and-punctuation"
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.answerField}
                />
              ) : (
                <>
                  <Text variant="label" style={styles.pickLabel}>
                    {t('teacher.questions.create.tfAnswer')}
                  </Text>
                  <View style={styles.chipRow}>
                    <Chip
                      label={t('teacher.questions.tf.true')}
                      selected={tfValue === true}
                      onPress={() => {
                        setTfValue(true);
                        setFormError(null);
                      }}
                    />
                    <Chip
                      label={t('teacher.questions.tf.false')}
                      selected={tfValue === false}
                      onPress={() => {
                        setTfValue(false);
                        setFormError(null);
                      }}
                    />
                  </View>
                </>
              )}

              {/* Marks (optional, defaults to 1) */}
              <TextField
                label={t('teacher.questions.create.marks')}
                placeholder={t('teacher.questions.create.marksPlaceholder')}
                value={marks}
                onChangeText={setMarks}
                keyboardType="number-pad"
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.answerField}
              />

              {formError ? (
                <Text variant="caption" color={colors.danger} style={styles.formErr}>
                  {t(`teacher.questions.errors.${formError}`)}
                </Text>
              ) : null}
              {success ? (
                <Text variant="caption" color={colors.primary} style={styles.formErr}>
                  {t('teacher.questions.create.success')}
                </Text>
              ) : null}

              <Button
                label={
                  saving
                    ? editing
                      ? t('teacher.questions.create.updating')
                      : t('teacher.questions.create.submitting')
                    : editing
                    ? t('teacher.questions.create.updateSubmit')
                    : t('teacher.questions.create.submit')
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
        // "My questions" tab
        <>
          {myQuestions === null && !mineError ? (
            <ActivityIndicator color={colors.primary} style={styles.loading} />
          ) : mineError ? (
            <View style={styles.stateBox}>
              <Text variant="body" color={colors.danger} align="center">
                {t('teacher.questions.mine.loadError')}
              </Text>
              <Button
                variant="secondary"
                label={t('teacher.questions.retry')}
                onPress={loadMine}
                style={styles.retry}
              />
            </View>
          ) : myQuestions.length === 0 ? (
            <View style={styles.stateBox}>
              <Text variant="body" color={colors.muted} align="center">
                {t('teacher.questions.mine.empty')}
              </Text>
            </View>
          ) : (
            <>
              <Text variant="caption" color={colors.muted} style={styles.count}>
                {t('teacher.questions.mine.count', { count: myQuestions.length })}
              </Text>
              {myQuestions.map((q) => (
                <QuestionRow key={q.id} question={q} onEdit={startEdit} />
              ))}
            </>
          )}
        </>
      )}
    </ScreenContainer>
  );
}

// An informational prompt (no action) for prerequisites only an admin can fix.
function Guidance({ message }) {
  return (
    <View style={styles.stateBox}>
      <Text variant="body" color={colors.muted} align="center">
        {message}
      </Text>
    </View>
  );
}

// A compact inline error + retry for the subject/chapter sub-loads.
function InlineRetry({ message, onRetry }) {
  return (
    <View style={styles.inlineRetry}>
      <Text variant="caption" color={colors.danger}>
        {message}
      </Text>
      <Button
        variant="secondary"
        label={t('teacher.questions.retry')}
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
  chipDisabled: { borderColor: colors.disabled, opacity: 0.6 },
  chipPressed: { opacity: 0.85 },
  pickLoading: { alignSelf: 'flex-start', marginBottom: spacing.sm },
  stemField: { marginTop: spacing.md },
  optionRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.sm },
  correctDot: {
    minHeight: 48,
    minWidth: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    marginEnd: spacing.sm,
  },
  correctDotOn: { backgroundColor: colors.primary },
  optionField: { flex: 1, marginBottom: 0 },
  removeBtn: {
    minHeight: 48,
    minWidth: 44,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    marginStart: spacing.sm,
  },
  addOptionBtn: { alignSelf: 'flex-start', minHeight: 40, paddingVertical: spacing.xs },
  answerField: { marginTop: spacing.md },
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
  rowAction: { minHeight: 40, paddingVertical: spacing.xs },
});
