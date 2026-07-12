// Student results — the signed-in student's own score for each assessment they've
// submitted this year. Read-only: a student can never see another student's
// results, and never their own ungraded raw answers here — RLS (db/004
// p_subs_student_read) scopes submissions to my_student_id(), and this screen
// only reads score + the assessment it belongs to.
//
// A submission carries a score only once a teacher has graded it (setup.sql:
// score is null until a graded pass — rule 3). So each row is one of two honest
// states: MARKED (score / total, with a percent) or NOT MARKED YET (submitted,
// waiting on the teacher). The overall line aggregates only the marked ones, so a
// child sees a real number and isn't misled by tests still being graded.
//
// Build-order prerequisites (CLAUDE.md): a current academic year and an active
// enrolment. Each missing step gets a real, honest empty state — never a blank
// page. A dropped load falls back to a clear retry rather than a frozen screen.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';

import { ScreenContainer, Text, Button } from '../../components';
import { supabase } from '../../lib/supabase';
import { t } from '../../i18n';
import { colors, spacing } from '../../theme/colors';

// Map a Supabase error to an i18n key under student.results.errors.
function classifyError(error) {
  if (!error) return null;
  const msg = (error.message || '').toLowerCase();
  if (/network request failed|failed to fetch|network|timeout|econn/.test(msg)) {
    return 'network';
  }
  return 'unknown';
}

// A whole-number percent of score out of total, or null when there's nothing to
// take a percent of (an ungraded row, or a zero-mark test). Kept pure so the
// aggregate below can be checked without a device or a network.
export function percentOf(score, total) {
  if (score == null || !total || total <= 0) return null;
  return Math.round((score / total) * 100);
}

// Overall performance across the MARKED submissions only: total marks earned over
// total marks available. Ungraded rows (score null) and zero-mark tests are left
// out of both sums so they neither help nor hurt the figure. Returns the fixed
// shape { count, percent } (percent null when nothing is marked yet).
export function overallResult(submissions) {
  let earned = 0;
  let possible = 0;
  let count = 0;
  for (const s of submissions || []) {
    const total = s.assessment?.total_marks;
    if (s.score == null || !total || total <= 0) continue;
    earned += Number(s.score);
    possible += total;
    count += 1;
  }
  return {
    count,
    percent: possible > 0 ? Math.round((earned / possible) * 100) : null,
  };
}

// One result row: the assessment (title, type · subject) and a badge showing the
// score out of total, or a "not marked yet" note while it's still being graded.
function ResultRow({ submission }) {
  const a = submission.assessment;
  const graded = submission.score != null;
  const total = a?.total_marks ?? 0;
  const percent = percentOf(submission.score, total);
  return (
    <View style={styles.row}>
      <View style={styles.rowInfo}>
        <Text variant="label">{a?.title}</Text>
        <Text variant="caption" color={colors.muted} style={styles.rowMeta}>
          {t(`student.assessments.types.${a?.type}`)}
          {a?.subject?.name ? ` · ${a.subject.name}` : ''}
        </Text>
      </View>
      {graded ? (
        <View style={styles.scoreBox}>
          <Text variant="label" color={colors.primary}>
            {t('student.results.score', { score: submission.score, total })}
          </Text>
          {percent != null ? (
            <Text variant="caption" color={colors.muted} style={styles.percent}>
              {t('student.results.percent', { percent })}
            </Text>
          ) : null}
        </View>
      ) : (
        <View style={styles.waitingBadge}>
          <Text variant="caption" color={colors.muted}>
            {t('student.results.waiting')}
          </Text>
        </View>
      )}
    </View>
  );
}

export default function StudentResultsScreen({ onBack }) {
  const [year, setYear] = useState(null); // { id, label } or null
  const [enrollment, setEnrollment] = useState(null); // { id } or null
  const [submissions, setSubmissions] = useState(null); // null = not loaded
  const [errorKey, setErrorKey] = useState(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    setErrorKey(null);
    setLoaded(false);

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
    // active enrolment counts as being "in a class" this year.
    const enrRes = await supabase
      .from('enrollments')
      .select('id, status')
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

    // My submissions, each with the assessment it belongs to. The assessment join
    // rides RLS too (db/005: only PUBLISHED assessments of my class are readable),
    // so a submission whose assessment is no longer readable arrives with a null
    // join — we drop those rather than render a titleless row. Newest first.
    const subRes = await supabase
      .from('submissions')
      .select(
        'id, score, submitted_at, graded_at, ' +
          'assessment:assessments(id, title, type, total_marks, subject:subjects(name))'
      )
      .eq('enrollment_id', enr.id)
      .order('submitted_at', { ascending: false, nullsFirst: false });
    if (subRes.error) {
      setErrorKey(classifyError(subRes.error));
      setLoaded(true);
      return;
    }
    setSubmissions((subRes.data ?? []).filter((s) => s.assessment));
    setLoaded(true);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const overall = useMemo(() => overallResult(submissions), [submissions]);

  const header = (
    <>
      <View style={styles.header}>
        <Text variant="title">{t('student.results.title')}</Text>
        <Button
          variant="secondary"
          label={t('student.results.back')}
          onPress={onBack}
          style={styles.backBtn}
        />
      </View>
      <Text variant="body" color={colors.muted} style={styles.subtitle}>
        {t('student.results.subtitle')}
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
            {t(`student.results.errors.${errorKey}`)}
          </Text>
          <Button
            variant="secondary"
            label={t('student.results.retry')}
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
        <EmptyState message={t('student.results.noYear')} />
      </ScreenContainer>
    );
  }
  if (!enrollment) {
    return (
      <ScreenContainer scroll>
        {header}
        <EmptyState message={t('student.results.noEnrollment')} />
      </ScreenContainer>
    );
  }
  if (!submissions || submissions.length === 0) {
    return (
      <ScreenContainer scroll>
        {header}
        <EmptyState message={t('student.results.empty')} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scroll>
      {header}

      {/* Overall stands on the marked tests only — honest when some are pending. */}
      {overall.percent != null ? (
        <View style={styles.overallBox}>
          <Text variant="label" color={colors.primary}>
            {t('student.results.overall', { percent: overall.percent })}
          </Text>
          <Text variant="caption" color={colors.muted} style={styles.overallSub}>
            {t('student.results.markedCount', { count: overall.count })}
          </Text>
        </View>
      ) : (
        <Text variant="caption" color={colors.muted} style={styles.noneMarked}>
          {t('student.results.noneMarked')}
        </Text>
      )}

      {submissions.map((s) => (
        <ResultRow key={s.id} submission={s} />
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
  loading: { marginTop: spacing.xl },
  stateBox: { marginTop: spacing.xl, alignItems: 'center' },
  retry: { marginTop: spacing.md },
  overallBox: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  overallSub: { marginTop: spacing.xs },
  noneMarked: { marginTop: spacing.lg, marginBottom: spacing.sm },
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
  scoreBox: { alignItems: 'flex-end' },
  percent: { marginTop: spacing.xs },
  waitingBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
});
