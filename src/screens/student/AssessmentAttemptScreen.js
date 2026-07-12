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
//
// Visuals: quest theme — questions are parchment cards, answers are chunky
// push-buttons that light up green when picked, progress is an XP bar that
// fills as the child answers, and submitting opens a treasure chest. Same
// logic, same i18n keys, logical start/end layout throughout.
import { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';

import { Text } from '../../components';
import {
  QuestScreen,
  QuestHeader,
  QuestPanel,
  QuestPressable,
  QuestButton,
  QuestBadge,
  QuestBar,
  QuestField,
  QuestLoading,
  QuestEmpty,
  Sprite,
  Enter,
  Pop,
} from '../../components/quest';
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
import { quest, px, spacing } from '../../theme/quest';

// A single-choice answer as a chunky push-button (mcq options, true/false).
// Picked = solid green with cream text, like flipping a switch in a dungeon.
function Choice({ label, selected, onPress, disabled, style }) {
  return (
    <QuestPressable
      onPress={onPress}
      disabled={disabled}
      accessibilityState={{ selected, disabled: !!disabled }}
      face={selected ? quest.green : quest.surface}
      edge={selected ? quest.greenEdge : quest.outline}
      outline={selected ? quest.greenEdge : quest.outline}
      style={style}
      faceStyle={styles.choiceFace}
    >
      <Text variant="label" color={selected ? quest.cream : quest.ink}>
        {label}
      </Text>
    </QuestPressable>
  );
}

// One question card: the number badge, its marks, the stem, and the
// type-specific answer input on a parchment panel.
function QuestionCard({ index, question, value, onChange, disabled }) {
  const stem = question.body?.stem || '';
  return (
    <QuestPanel style={styles.qCard}>
      <View style={styles.qHead}>
        <QuestBadge
          label={t('student.attempt.questionNumber', { number: index + 1 })}
          tone="gold"
        />
        <Text variant="caption" color={quest.faint}>
          {t('student.attempt.marks', { count: question.marks })}
        </Text>
      </View>
      <Text variant="body" color={quest.ink} style={styles.qStem}>
        {stem}
      </Text>

      {question.type === 'mcq' ? (
        <View>
          {(question.body?.options ?? []).map((opt) => (
            <Choice
              key={opt.key}
              label={`${opt.key}. ${opt.text}`}
              selected={value === opt.key}
              onPress={() => onChange(opt.key)}
              disabled={disabled}
              style={styles.option}
            />
          ))}
        </View>
      ) : question.type === 'true_false' ? (
        <View style={styles.choiceRow}>
          <Choice
            label={t('student.attempt.true')}
            selected={value === true}
            onPress={() => onChange(true)}
            disabled={disabled}
            style={styles.choiceHalf}
          />
          <Choice
            label={t('student.attempt.false')}
            selected={value === false}
            onPress={() => onChange(false)}
            disabled={disabled}
            style={[styles.choiceHalf, styles.choiceHalfEnd]}
          />
        </View>
      ) : (
        // numeric
        <QuestField
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
    </QuestPanel>
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
    <QuestHeader
      title={assessment?.title}
      subtitle={
        assessment?.subject?.name
          ? t('student.attempt.context', {
              subject: assessment.subject.name,
              type: t(`student.assessments.types.${assessment.type}`),
            })
          : null
      }
      backLabel={t('student.attempt.back')}
      onBack={onBack}
    />
  );

  // Result state — the attempt is recorded (or safely queued for reconnect).
  // The treasure chest pops in: finishing a test should feel like a reward.
  if (result) {
    return (
      <QuestScreen scroll>
        {header}
        <View style={styles.stateBox}>
          <Pop>
            <Sprite name="chest" size={96} />
          </Pop>
          <Enter delay={200}>
            <Text variant="body" color={quest.ink} align="center" style={styles.resultText}>
              {result === 'submitted'
                ? t('student.attempt.submitted')
                : t('student.attempt.queued')}
            </Text>
          </Enter>
          <QuestButton
            label={t('student.attempt.doneBack')}
            onPress={onBack}
            style={styles.stateAction}
          />
        </View>
      </QuestScreen>
    );
  }

  // Already submitted before this session — read-only notice, no re-attempt.
  if (alreadySubmitted) {
    return (
      <QuestScreen scroll>
        {header}
        <QuestEmpty
          sprite="chest"
          message={t('student.attempt.alreadyDone')}
          actionLabel={t('student.attempt.doneBack')}
          onAction={onBack}
        />
      </QuestScreen>
    );
  }

  if (questions === null && !loadError) {
    return (
      <QuestScreen scroll>
        {header}
        <QuestLoading sprite="sword" />
      </QuestScreen>
    );
  }

  if (loadError) {
    return (
      <QuestScreen scroll>
        {header}
        <QuestEmpty
          message={t('student.attempt.loadError')}
          tone="danger"
          actionLabel={t('student.attempt.retry')}
          onAction={load}
        />
      </QuestScreen>
    );
  }

  if (questions.length === 0) {
    return (
      <QuestScreen scroll>
        {header}
        <QuestEmpty
          message={t('student.attempt.noQuestions')}
          actionLabel={t('student.attempt.doneBack')}
          onAction={onBack}
        />
      </QuestScreen>
    );
  }

  const progressPct = questions.length > 0 ? (answeredCount / questions.length) * 100 : 0;

  return (
    <QuestScreen scroll>
      {header}

      {usingCache ? (
        <View style={styles.offlineBanner}>
          <Text variant="caption" color={quest.skyEdge}>
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

      {/* XP-style progress: fills as the child answers, gold when complete. */}
      <View style={styles.progressBlock}>
        <QuestBar
          value={progressPct}
          color={answeredCount === questions.length ? quest.gold : quest.green}
        />
        <Text variant="caption" color={quest.faint} style={styles.progressText}>
          {t('student.attempt.answeredSummary', {
            answered: answeredCount,
            total: questions.length,
          })}
        </Text>
      </View>

      {errorKey ? (
        <Text variant="caption" color={quest.red} style={styles.formErr}>
          {t(`student.attempt.errors.${errorKey}`)}
        </Text>
      ) : null}

      <QuestButton
        variant="gold"
        size="lg"
        label={submitting ? t('student.attempt.submitting') : t('student.attempt.submit')}
        onPress={submit}
        loading={submitting}
        disabled={submitting}
        style={styles.submit}
      />
    </QuestScreen>
  );
}

const styles = StyleSheet.create({
  offlineBanner: {
    marginTop: spacing.md,
    padding: spacing.sm,
    borderRadius: px.radius,
    backgroundColor: quest.skyTint,
    borderWidth: px.border,
    borderColor: quest.sky,
  },
  qCard: { marginTop: spacing.md },
  qHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  qStem: { marginTop: spacing.sm, marginBottom: spacing.md },
  option: { marginBottom: spacing.sm },
  choiceRow: { flexDirection: 'row' },
  choiceHalf: { flex: 1 },
  choiceHalfEnd: { marginStart: spacing.sm },
  choiceFace: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  numericField: { marginTop: spacing.xs, marginBottom: 0 },
  progressBlock: { marginTop: spacing.lg },
  progressText: { marginTop: spacing.xs },
  formErr: { marginTop: spacing.sm },
  submit: { marginTop: spacing.md },
  stateBox: { marginTop: spacing.xl, alignItems: 'center' },
  resultText: { marginTop: spacing.md, marginBottom: spacing.sm, paddingHorizontal: spacing.lg },
  stateAction: { marginTop: spacing.md, minWidth: 200 },
});
