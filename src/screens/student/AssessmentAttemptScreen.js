// Assessment attempt — a student opens one published test, answers each
// question, and submits. The submission lands in `submissions` with the raw
// `responses` (rule 3: keep responses, not just a score); grading is a later
// teacher/graded pass, so this screen never fetches questions.answer and never
// computes a mark.
//
// Offline tolerance (CLAUDE.md: core student flows must survive patchy data):
//   * The loaded question set is cached, so re-opening a test works with no
//     connection.
//   * Answers are drafted to storage on every change, so a dropped connection —
//     or the app being killed — mid-attempt never loses work.
//   * Submitting while offline queues the attempt and syncs on reconnect
//     (see src/lib/attemptStore.js); the student gets a clear "saved, will send"
//     confirmation instead of a frozen screen or a lost attempt.
//
// Question shapes handled: mcq (pick one option), numeric (type a number),
// true_false (pick True/False) — matching what the authoring screen writes
// (one `questions` table, jsonb body — rule 5). RLS (db/005) is the real
// boundary; this screen only shows what the student may read.
import { useCallback, useEffect, useState } from 'react';
import { View, Pressable, ActivityIndicator, StyleSheet } from 'react-native';

import { ScreenContainer, Text, TextField, Button } from '../../components';
import { supabase } from '../../lib/supabase';
import {
  buildResponses,
  isAnswered,
  isNetworkError,
  loadDraft,
  saveDraft,
  cacheQuestions,
  loadCachedQuestions,
  submitAttempt,
} from '../../lib/attemptStore';
import { t } from '../../i18n';
import { colors, spacing } from '../../theme/colors';

// A pressable pill for single-choice answers (mcq options, true/false). Selected
// fills with the primary colour; logical margins keep it RTL-correct.
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

// One question card: the stem, its marks, and the type-specific answer input.
function QuestionCard({ index, question, value, onChange, disabled }) {
  const stem = question.body?.stem || '';
  return (
    <View style={styles.qCard}>
      <View style={styles.qHead}>
        <Text variant="label" style={styles.qNum}>
          {t('student.attempt.questionNumber', { number: index + 1 })}
        </Text>
        <Text variant="caption" color={colors.muted}>
          {t('student.attempt.marks', { count: question.marks })}
        </Text>
      </View>
      <Text variant="body" style={styles.qStem}>
        {stem}
      </Text>

      {question.type === 'mcq' ? (
        <View style={styles.optionCol}>
          {(question.body?.options ?? []).map((opt) => (
            <Chip
              key={opt.key}
              label={`${opt.key}. ${opt.text}`}
              selected={value === opt.key}
              onPress={() => onChange(opt.key)}
              disabled={disabled}
            />
          ))}
        </View>
      ) : question.type === 'true_false' ? (
        <View style={styles.chipRow}>
          <Chip
            label={t('student.attempt.true')}
            selected={value === true}
            onPress={() => onChange(true)}
            disabled={disabled}
          />
          <Chip
            label={t('student.attempt.false')}
            selected={value === false}
            onPress={() => onChange(false)}
            disabled={disabled}
          />
        </View>
      ) : (
        // numeric
        <TextField
          value={value ?? ''}
          onChangeText={onChange}
          placeholder={t('student.attempt.numericPlaceholder')}
          keyboardType="numbers-and-punctuation"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!disabled}
          style={styles.numericField}
        />
      )}
    </View>
  );
}

export default function AssessmentAttemptScreen({
  enrollment,
  assessment,
  alreadySubmitted = false,
  onBack,
  onSubmitted,
}) {
  const [questions, setQuestions] = useState(null); // null = loading
  const [loadError, setLoadError] = useState(false);
  const [usingCache, setUsingCache] = useState(false); // showing cached (offline)

  const [answers, setAnswers] = useState({}); // { questionId: rawValue }
  const [ready, setReady] = useState(false); // draft applied — safe to autosave

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null); // 'submitted' | 'queued' | null
  const [errorKey, setErrorKey] = useState(null);

  const enrollmentId = enrollment?.id;
  const assessmentId = assessment?.id;

  // Load the question set (server first, cache on failure) and any saved draft.
  const load = useCallback(async () => {
    setLoadError(false);
    setUsingCache(false);

    const { data, error } = await supabase
      .from('assessment_questions')
      .select('marks, sort_order, question:questions(id, type, body)')
      .eq('assessment_id', assessmentId)
      .order('sort_order', { ascending: true });

    let list = null;
    if (!error && data) {
      // Normalise to a flat, cache-friendly shape (never carry the answer).
      list = data
        .filter((row) => row.question)
        .map((row) => ({
          id: row.question.id,
          type: row.question.type,
          body: row.question.body,
          marks: row.marks,
        }));
      await cacheQuestions(assessmentId, list);
    } else if (isNetworkError(error)) {
      const cached = await loadCachedQuestions(assessmentId);
      if (cached) {
        list = cached;
        setUsingCache(true);
      }
    }

    if (list === null) {
      setLoadError(true);
      return;
    }

    // Apply any saved draft so a resumed attempt keeps its answers.
    const draft = await loadDraft(enrollmentId, assessmentId);
    setAnswers(draft?.answers ?? {});
    setQuestions(list);
    setReady(true);
  }, [assessmentId, enrollmentId]);

  useEffect(() => {
    load();
  }, [load]);

  // Autosave the draft on every change once the initial draft has been applied
  // (so we never overwrite a saved draft with the empty initial state).
  useEffect(() => {
    if (!ready || alreadySubmitted) return;
    saveDraft(enrollmentId, assessmentId, answers);
  }, [ready, alreadySubmitted, answers, enrollmentId, assessmentId]);

  const setAnswer = useCallback((questionId, value) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
    setErrorKey(null);
  }, []);

  const submit = useCallback(async () => {
    setSubmitting(true);
    setErrorKey(null);
    const responses = buildResponses(questions, answers);
    const res = await submitAttempt({ enrollmentId, assessmentId, responses });
    setSubmitting(false);

    if (res.status === 'error') {
      setErrorKey(isNetworkError(res.error) ? 'network' : 'unknown');
      return;
    }
    // 'submitted' or 'queued' — the attempt is safe (server or local queue).
    setResult(res.status);
    onSubmitted?.(assessmentId, res.status);
  }, [questions, answers, enrollmentId, assessmentId, onSubmitted]);

  const answeredCount = questions
    ? questions.filter((q) => isAnswered(q.type, answers[q.id])).length
    : 0;

  // --- Header (shared across states) ---
  const header = (
    <>
      <View style={styles.header}>
        <Text variant="title" style={styles.title}>
          {assessment?.title}
        </Text>
        <Button
          variant="secondary"
          label={t('student.attempt.back')}
          onPress={onBack}
          style={styles.backBtn}
        />
      </View>
      {assessment?.subject?.name ? (
        <Text variant="caption" color={colors.muted} style={styles.subtitle}>
          {t('student.attempt.context', {
            subject: assessment.subject.name,
            type: t(`student.assessments.types.${assessment.type}`),
          })}
        </Text>
      ) : null}
    </>
  );

  // Result state — the attempt is recorded (or safely queued for reconnect).
  if (result) {
    return (
      <ScreenContainer scroll>
        {header}
        <View style={styles.stateBox}>
          <Text variant="body" align="center" style={styles.resultText}>
            {result === 'submitted'
              ? t('student.attempt.submitted')
              : t('student.attempt.queued')}
          </Text>
          <Button
            label={t('student.attempt.doneBack')}
            onPress={onBack}
            style={styles.retry}
          />
        </View>
      </ScreenContainer>
    );
  }

  // Already submitted before this session — read-only notice, no re-attempt.
  if (alreadySubmitted) {
    return (
      <ScreenContainer scroll>
        {header}
        <View style={styles.stateBox}>
          <Text variant="body" color={colors.muted} align="center">
            {t('student.attempt.alreadyDone')}
          </Text>
          <Button
            variant="secondary"
            label={t('student.attempt.doneBack')}
            onPress={onBack}
            style={styles.retry}
          />
        </View>
      </ScreenContainer>
    );
  }

  if (questions === null && !loadError) {
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
            {t('student.attempt.loadError')}
          </Text>
          <Button
            variant="secondary"
            label={t('student.attempt.retry')}
            onPress={load}
            style={styles.retry}
          />
        </View>
      </ScreenContainer>
    );
  }

  if (questions.length === 0) {
    return (
      <ScreenContainer scroll>
        {header}
        <View style={styles.stateBox}>
          <Text variant="body" color={colors.muted} align="center">
            {t('student.attempt.noQuestions')}
          </Text>
          <Button
            variant="secondary"
            label={t('student.attempt.doneBack')}
            onPress={onBack}
            style={styles.retry}
          />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scroll>
      {header}

      {usingCache ? (
        <View style={styles.offlineBanner}>
          <Text variant="caption" color={colors.muted}>
            {t('student.attempt.offlineBanner')}
          </Text>
        </View>
      ) : null}

      {questions.map((q, i) => (
        <QuestionCard
          key={q.id}
          index={i}
          question={q}
          value={answers[q.id]}
          onChange={(v) => setAnswer(q.id, v)}
          disabled={submitting}
        />
      ))}

      <Text variant="caption" color={colors.muted} style={styles.progress}>
        {t('student.attempt.answeredSummary', {
          answered: answeredCount,
          total: questions.length,
        })}
      </Text>

      {errorKey ? (
        <Text variant="caption" color={colors.danger} style={styles.formErr}>
          {t(`student.attempt.errors.${errorKey}`)}
        </Text>
      ) : null}

      <Button
        label={submitting ? t('student.attempt.submitting') : t('student.attempt.submit')}
        onPress={submit}
        loading={submitting}
        disabled={submitting}
        style={styles.submit}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { flex: 1, marginEnd: spacing.md },
  backBtn: { minHeight: 40, paddingVertical: spacing.xs },
  subtitle: { marginTop: spacing.xs },
  offlineBanner: {
    marginTop: spacing.md,
    padding: spacing.sm,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  qCard: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  qHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  qNum: {},
  qStem: { marginTop: spacing.sm, marginBottom: spacing.md },
  optionCol: {},
  chipRow: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: {
    minHeight: 44,
    paddingVertical: spacing.sm,
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
  numericField: { marginTop: spacing.xs },
  progress: { marginTop: spacing.md },
  formErr: { marginTop: spacing.sm },
  submit: { marginTop: spacing.md },
  loading: { marginTop: spacing.xl },
  stateBox: { marginTop: spacing.xl, alignItems: 'center' },
  resultText: { marginBottom: spacing.sm },
  retry: { marginTop: spacing.md },
});
