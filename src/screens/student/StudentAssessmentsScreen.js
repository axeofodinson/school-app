// Student assessments — the list of published tests assigned to the student's
// class this year, and the entry point into the attempt flow.
//
// What it shows: for the signed-in student's current-year enrolment, every
// PUBLISHED assessment for their class (RLS db/005 scopes this — a student can't
// see another class's tests, or drafts). Each row badges whether it's still to
// do, already submitted, or saved-offline-and-waiting-to-sync.
//
// Offline tolerance: on open it flushes any queued submissions (from an earlier
// offline attempt) so they reach the server on reconnect, and a dropped list
// load falls back to a clear retry rather than a blank/frozen screen. Opening a
// test hands off to AssessmentAttemptScreen, which caches questions + drafts
// answers locally.
//
// Build-order prerequisites (CLAUDE.md): a current academic year and an active
// enrolment. Each missing step gets a real, honest empty state — never a blank
// page.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';

import { ScreenContainer, Text, Button } from '../../components';
import { useAuth } from '../../auth/AuthProvider';
import { supabase } from '../../lib/supabase';
import { getPendingKeys, syncPendingSubmissions } from '../../lib/attemptStore';
import { t } from '../../i18n';
import { colors, spacing } from '../../theme/colors';
import AssessmentAttemptScreen from './AssessmentAttemptScreen';

// Map a Supabase error to an i18n key under student.assessments.errors.
function classifyError(error) {
  if (!error) return null;
  const msg = (error.message || '').toLowerCase();
  if (/network request failed|failed to fetch|network|timeout|econn/.test(msg)) {
    return 'network';
  }
  return 'unknown';
}

// One assessment in the list: title, subject/type, question count, and a status
// badge (to-do / submitted / waiting-to-sync). Whole row opens the attempt.
function AssessmentRow({ assessment, status, onOpen }) {
  const count = assessment.assessment_questions?.[0]?.count ?? 0;
  const done = status === 'submitted' || status === 'pending';
  return (
    <View style={styles.row}>
      <View style={styles.rowInfo}>
        <Text variant="label">{assessment.title}</Text>
        <Text variant="caption" color={colors.muted} style={styles.rowMeta}>
          {t(`student.assessments.types.${assessment.type}`)}
          {assessment.subject?.name ? ` · ${assessment.subject.name}` : ''}
        </Text>
        <Text variant="caption" color={colors.muted} style={styles.rowMeta}>
          {t('student.assessments.questionCount', { count })}
        </Text>
      </View>
      <View style={styles.rowActions}>
        <View
          style={[
            styles.badge,
            status === 'submitted' && styles.badgeDone,
            status === 'pending' && styles.badgePending,
          ]}
        >
          <Text
            variant="caption"
            color={status === 'todo' ? colors.primary : colors.primaryText}
          >
            {t(`student.assessments.status.${status}`)}
          </Text>
        </View>
        <Button
          variant={done ? 'secondary' : 'primary'}
          label={
            done
              ? t('student.assessments.view')
              : t('student.assessments.start')
          }
          onPress={() => onOpen(assessment, done)}
          style={styles.rowAction}
        />
      </View>
    </View>
  );
}

export default function StudentAssessmentsScreen({ onBack }) {
  const { profile } = useAuth();

  const [year, setYear] = useState(null); // { id, label } or null
  const [enrollment, setEnrollment] = useState(null); // { id, class_id } or null
  const [list, setList] = useState(null); // null = loading
  const [submittedIds, setSubmittedIds] = useState(new Set()); // server-side done
  const [pendingKeys, setPendingKeysState] = useState(new Set()); // queued offline
  const [errorKey, setErrorKey] = useState(null);
  const [loaded, setLoaded] = useState(false);

  const [attempt, setAttempt] = useState(null); // { assessment, alreadySubmitted }

  const load = useCallback(async () => {
    setErrorKey(null);
    setLoaded(false);

    // Push any attempts made offline earlier before reading fresh state.
    await syncPendingSubmissions();

    const yearRes = await supabase
      .from('academic_years')
      .select('id, label')
      .eq('is_current', true)
      .maybeSingle();
    if (yearRes.error) {
      setErrorKey(classifyError(yearRes.error));
      setLoaded(true);
      return;
    }
    const currentYear = yearRes.data ?? null;
    setYear(currentYear);
    if (!currentYear) {
      setLoaded(true);
      return;
    }

    // The student's own enrolment for this year (RLS: my_student_id()). Only an
    // active enrolment counts as "in a class" for taking tests.
    const enrRes = await supabase
      .from('enrollments')
      .select('id, class_id, status, class:classes(id, name)')
      .eq('year_id', currentYear.id)
      .maybeSingle();
    if (enrRes.error) {
      setErrorKey(classifyError(enrRes.error));
      setLoaded(true);
      return;
    }
    const enr = enrRes.data && enrRes.data.status === 'active' ? enrRes.data : null;
    setEnrollment(enr);
    if (!enr) {
      setLoaded(true);
      return;
    }

    // Published assessments for the student's class + year, with a question
    // count so a zero-question test is honest about it.
    const aRes = await supabase
      .from('assessments')
      .select(
        'id, title, type, total_marks, scheduled_on, ' +
          'subject:subjects(id, name), assessment_questions(count)'
      )
      .eq('class_id', enr.class_id)
      .eq('year_id', currentYear.id)
      .eq('status', 'published')
      .order('scheduled_on', { ascending: true, nullsFirst: false })
      .order('title', { ascending: true });
    if (aRes.error) {
      setErrorKey(classifyError(aRes.error));
      setLoaded(true);
      return;
    }
    setList(aRes.data ?? []);

    // Which of those the student has already submitted (server-side).
    const subRes = await supabase
      .from('submissions')
      .select('assessment_id')
      .eq('enrollment_id', enr.id);
    if (!subRes.error && subRes.data) {
      setSubmittedIds(new Set(subRes.data.map((s) => s.assessment_id)));
    }

    // Which are saved locally but not yet synced (offline submissions).
    setPendingKeysState(await getPendingKeys());
    setLoaded(true);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openAttempt = useCallback((assessment, alreadySubmitted) => {
    setAttempt({ assessment, alreadySubmitted });
  }, []);

  // Coming back from the attempt: refresh local + server "done" state and close.
  const closeAttempt = useCallback(() => {
    setAttempt(null);
    load();
  }, [load]);

  // Optimistically reflect a just-made attempt so the list badges update even if
  // the reload below is offline.
  const onSubmitted = useCallback((assessmentId, status) => {
    if (status === 'submitted') {
      setSubmittedIds((prev) => new Set(prev).add(assessmentId));
    } else if (status === 'queued') {
      setPendingKeysState((prev) => {
        const next = new Set(prev);
        if (enrollment) next.add(`${enrollment.id}:${assessmentId}`);
        return next;
      });
    }
  }, [enrollment]);

  const statusFor = useCallback(
    (assessment) => {
      if (submittedIds.has(assessment.id)) return 'submitted';
      if (enrollment && pendingKeys.has(`${enrollment.id}:${assessment.id}`)) {
        return 'pending';
      }
      return 'todo';
    },
    [submittedIds, pendingKeys, enrollment]
  );

  const todoCount = useMemo(
    () => (list ? list.filter((a) => statusFor(a) === 'todo').length : 0),
    [list, statusFor]
  );

  // Drill into a single assessment's attempt flow.
  if (attempt) {
    return (
      <AssessmentAttemptScreen
        enrollment={enrollment}
        assessment={attempt.assessment}
        alreadySubmitted={attempt.alreadySubmitted}
        onBack={closeAttempt}
        onSubmitted={onSubmitted}
      />
    );
  }

  const header = (
    <>
      <View style={styles.header}>
        <Text variant="title">{t('student.assessments.title')}</Text>
        <Button
          variant="secondary"
          label={t('student.assessments.back')}
          onPress={onBack}
          style={styles.backBtn}
        />
      </View>
      <Text variant="body" color={colors.muted} style={styles.subtitle}>
        {t('student.assessments.subtitle')}
      </Text>
    </>
  );

  if (!loaded) {
    return (
      <ScreenContainer scroll>
        {header}
        <ActivityIndicator color={colors.primary} style={styles.loading} />
      </ScreenContainer>
    );
  }

  if (errorKey) {
    return (
      <ScreenContainer scroll>
        {header}
        <View style={styles.stateBox}>
          <Text variant="body" color={colors.danger} align="center">
            {t(`student.assessments.errors.${errorKey}`)}
          </Text>
          <Button
            variant="secondary"
            label={t('student.assessments.retry')}
            onPress={load}
            style={styles.retry}
          />
        </View>
      </ScreenContainer>
    );
  }

  // Prerequisite empty states — honest, not a blank screen (CLAUDE.md).
  if (!year) {
    return (
      <ScreenContainer scroll>
        {header}
        <EmptyState message={t('student.assessments.noYear')} />
      </ScreenContainer>
    );
  }
  if (!enrollment) {
    return (
      <ScreenContainer scroll>
        {header}
        <EmptyState message={t('student.assessments.noEnrollment')} />
      </ScreenContainer>
    );
  }
  if (!list || list.length === 0) {
    return (
      <ScreenContainer scroll>
        {header}
        <EmptyState message={t('student.assessments.empty')} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scroll>
      {header}
      <Text variant="caption" color={colors.muted} style={styles.count}>
        {t('student.assessments.todoCount', { count: todoCount })}
      </Text>
      {list.map((a) => (
        <AssessmentRow
          key={a.id}
          assessment={a}
          status={statusFor(a)}
          onOpen={openAttempt}
        />
      ))}
    </ScreenContainer>
  );
}

function EmptyState({ message }) {
  return (
    <View style={styles.stateBox}>
      <Text variant="body" color={colors.muted} align="center">
        {message}
      </Text>
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
  count: { marginTop: spacing.md, marginBottom: spacing.sm },
  loading: { marginTop: spacing.xl },
  stateBox: { marginTop: spacing.xl, alignItems: 'center' },
  retry: { marginTop: spacing.md },
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
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.primary,
    marginBottom: spacing.sm,
  },
  badgeDone: { backgroundColor: colors.primary, borderColor: colors.primary },
  badgePending: { backgroundColor: colors.muted, borderColor: colors.muted },
  rowAction: { minHeight: 40, paddingVertical: spacing.xs },
});
