// Student report card — the signed-in student's own results for the current year,
// rolled up into one figure using each assessment's weightage, broken down by
// subject, and with a cognitive-level (recall vs conceptual) view of what their
// tests actually checked. Read-only and RLS-scoped to the student (db/004 +
// db/005): a child can only ever see their own marks, and only for PUBLISHED
// assessments their submission counts against.
//
// ALL the aggregate math lives in src/reporting/aggregate.js — this screen only
// FETCHES the raw rows, hands them to buildReport(), and renders the result.
// Weightage rules change there, never here (and the numbers are pinned by
// `npm run verify:report`), so this file stays about layout + honest states.
//
// Honesty (CLAUDE.md rule 3): the headline stands on the MARKED tests only, so a
// pending test never inflates or deflates it; ungraded tests are surfaced as a
// count, not hidden. Build-order prerequisites each get a real empty state, and a
// dropped load falls back to a retry rather than a frozen screen. Bilingual + RTL
// throughout (strings from i18n, logical start/end layout).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';

import { ScreenContainer, Text, Button } from '../../components';
import { supabase } from '../../lib/supabase';
import { buildReport } from '../../reporting/aggregate';
import { t } from '../../i18n';
import { colors, spacing } from '../../theme/colors';

// Map a Supabase error to an i18n key under student.report.errors.
function classifyError(error) {
  if (!error) return null;
  const msg = (error.message || '').toLowerCase();
  if (/network request failed|failed to fetch|network|timeout|econn/.test(msg)) {
    return 'network';
  }
  return 'unknown';
}

// One horizontal share bar (0–100%). Purely presentational; width follows the
// share. Uses logical margins so it mirrors correctly in RTL.
function ShareBar({ share, color }) {
  const pct = Math.max(0, Math.min(100, Number(share) || 0));
  return (
    <View style={styles.barTrack}>
      <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: color }]} />
    </View>
  );
}

export default function StudentReportCardScreen({ onBack }) {
  const [year, setYear] = useState(null); // { id, label } or null
  const [enrollment, setEnrollment] = useState(null); // { id } or null
  const [assessments, setAssessments] = useState(null); // normalized list or null
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

    // The student's own active enrolment for this year (RLS: my_student_id()).
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

    // My submissions, each with the assessment it belongs to (title, type,
    // weightage, total_marks, subject). The assessment join rides RLS (db/005:
    // only PUBLISHED assessments of my class are readable), so a submission whose
    // assessment is no longer readable arrives with a null join — drop those.
    const subRes = await supabase
      .from('submissions')
      .select(
        'id, score, ' +
          'assessment:assessments(id, title, type, weightage, total_marks, ' +
          'subject:subjects(id, name))'
      )
      .eq('enrollment_id', enr.id);
    if (subRes.error) {
      setErrorKey(classifyError(subRes.error));
      setLoaded(true);
      return;
    }
    const subs = (subRes.data ?? []).filter((s) => s.assessment);
    const assessmentIds = subs.map((s) => s.assessment.id);

    // The cognitive make-up of those tests: every question on them, with its
    // marks and cognitive_level. The join rows are readable exactly when the
    // parent assessment is (db/005 p_aq_student_read); questions are readable to
    // any authed user (setup.sql). We never read questions.answer.
    let questionsByAssessment = new Map();
    if (assessmentIds.length > 0) {
      const aqRes = await supabase
        .from('assessment_questions')
        .select('assessment_id, marks, question:questions(cognitive_level)')
        .in('assessment_id', assessmentIds);
      if (aqRes.error) {
        setErrorKey(classifyError(aqRes.error));
        setLoaded(true);
        return;
      }
      for (const row of aqRes.data ?? []) {
        if (!row.question) continue; // question hidden — skip rather than mis-tag
        const list = questionsByAssessment.get(row.assessment_id) ?? [];
        list.push({ cognitiveLevel: row.question.cognitive_level, marks: row.marks });
        questionsByAssessment.set(row.assessment_id, list);
      }
    }

    // Normalize to the shape buildReport() expects (camelCase, questions merged).
    const normalized = subs.map((s) => ({
      id: s.assessment.id,
      title: s.assessment.title,
      type: s.assessment.type,
      subject: s.assessment.subject
        ? { id: s.assessment.subject.id, name: s.assessment.subject.name }
        : null,
      weightage: s.assessment.weightage,
      totalMarks: s.assessment.total_marks,
      score: s.score,
      questions: questionsByAssessment.get(s.assessment.id) ?? [],
    }));
    setAssessments(normalized);
    setLoaded(true);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // The whole report is derived from the fetched rows by the isolated module.
  const report = useMemo(
    () => (assessments ? buildReport({ assessments }) : null),
    [assessments]
  );

  const header = (
    <>
      <View style={styles.header}>
        <Text variant="title">{t('student.report.title')}</Text>
        <Button
          variant="secondary"
          label={t('student.report.back')}
          onPress={onBack}
          style={styles.backBtn}
        />
      </View>
      <Text variant="body" color={colors.muted} style={styles.subtitle}>
        {year
          ? t('student.report.subtitle', { year: year.label })
          : t('student.report.subtitleNoYear')}
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
            {t(`student.report.errors.${errorKey}`)}
          </Text>
          <Button
            variant="secondary"
            label={t('student.report.retry')}
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
        <EmptyState message={t('student.report.noYear')} />
      </ScreenContainer>
    );
  }
  if (!enrollment) {
    return (
      <ScreenContainer scroll>
        {header}
        <EmptyState message={t('student.report.noEnrollment')} />
      </ScreenContainer>
    );
  }
  if (!assessments || assessments.length === 0) {
    return (
      <ScreenContainer scroll>
        {header}
        <EmptyState message={t('student.report.empty')} />
      </ScreenContainer>
    );
  }

  const { overall, subjects, cognitive } = report;

  return (
    <ScreenContainer scroll>
      {header}

      {/* Headline — stands on the marked tests only. */}
      <View style={styles.overallBox}>
        <Text variant="label" color={colors.muted}>
          {t('student.report.overall')}
        </Text>
        {overall.percent != null ? (
          <>
            <Text variant="title" color={colors.primary} style={styles.overallPercent}>
              {t('student.report.overallPercent', { percent: overall.percent })}
            </Text>
            <Text variant="caption" color={colors.muted}>
              {t('student.report.fromMarked', { count: overall.gradedCount })}
            </Text>
            {!overall.weighted ? (
              <Text variant="caption" color={colors.muted} style={styles.note}>
                {t('student.report.unweightedNote')}
              </Text>
            ) : null}
          </>
        ) : (
          <Text variant="body" color={colors.muted} style={styles.note}>
            {t('student.report.noneMarked')}
          </Text>
        )}
        {overall.ungradedCount > 0 ? (
          <Text variant="caption" color={colors.muted} style={styles.note}>
            {t('student.report.waiting', { count: overall.ungradedCount })}
          </Text>
        ) : null}
      </View>

      {/* Per-subject roll-up. */}
      <Text variant="label" style={styles.sectionHeading}>
        {t('student.report.bySubject')}
      </Text>
      {subjects.map((s) => (
        <View key={s.id ?? '__none__'} style={styles.row}>
          <View style={styles.rowInfo}>
            <Text variant="label">{s.name ?? '—'}</Text>
            {s.gradedCount > 0 ? (
              <Text variant="caption" color={colors.muted} style={styles.rowMeta}>
                {t('student.report.subjectMarked', { count: s.gradedCount })}
              </Text>
            ) : null}
          </View>
          {s.percent != null ? (
            <Text variant="label" color={colors.primary}>
              {t('student.report.subjectPercent', { percent: s.percent })}
            </Text>
          ) : (
            <View style={styles.waitingBadge}>
              <Text variant="caption" color={colors.muted}>
                {t('student.report.subjectWaiting')}
              </Text>
            </View>
          )}
        </View>
      ))}

      {/* What was tested — recall vs conceptual, by marks. */}
      {cognitive.totalMarks > 0 ? (
        <View style={styles.cognitiveBox}>
          <Text variant="label" style={styles.sectionHeading}>
            {t('student.report.cognitive.heading')}
          </Text>
          <Text variant="caption" color={colors.muted} style={styles.cognitiveHint}>
            {t('student.report.cognitive.hint')}
          </Text>

          <View style={styles.splitRow}>
            <View style={styles.splitCol}>
              <Text variant="caption" color={colors.muted}>
                {t('student.report.cognitive.recall')}
              </Text>
              <Text variant="label" color={colors.text}>
                {t('student.report.cognitive.share', { share: cognitive.recall.share })}
              </Text>
              <ShareBar share={cognitive.recall.share} color={colors.muted} />
            </View>
            <View style={styles.splitCol}>
              <Text variant="caption" color={colors.muted}>
                {t('student.report.cognitive.conceptual')}
              </Text>
              <Text variant="label" color={colors.primary}>
                {t('student.report.cognitive.share', {
                  share: cognitive.conceptual.share,
                })}
              </Text>
              <ShareBar share={cognitive.conceptual.share} color={colors.primary} />
            </View>
          </View>

          {/* The four levels behind the split, marks + share each. */}
          {cognitive.levels
            .filter((l) => l.marks > 0)
            .map((l) => (
              <View key={l.level} style={styles.levelRow}>
                <Text variant="caption" color={colors.text}>
                  {t(`student.report.cognitive.levels.${l.level}`)}
                </Text>
                <Text variant="caption" color={colors.muted}>
                  {t('student.report.cognitive.levelDetail', {
                    share: l.share,
                    marks: l.marks,
                  })}
                </Text>
              </View>
            ))}
        </View>
      ) : null}
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
  note: { marginTop: spacing.xs },
  overallBox: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  overallPercent: { marginTop: spacing.xs },
  sectionHeading: { marginTop: spacing.lg, marginBottom: spacing.xs },
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
  waitingBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  cognitiveBox: {
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  cognitiveHint: { marginBottom: spacing.md },
  splitRow: { flexDirection: 'row', justifyContent: 'space-between' },
  splitCol: { flex: 1, marginEnd: spacing.md },
  barTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: colors.border,
    marginTop: spacing.xs,
    overflow: 'hidden',
  },
  barFill: { height: 8, borderRadius: 999 },
  levelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
});
