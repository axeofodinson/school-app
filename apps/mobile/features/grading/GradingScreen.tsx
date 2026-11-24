// Grades: class → assessment → the class roster, one score field per student.
// Corrections need a reason and show their history (db/013 record_grade()).
// Only published and closed assessments are offered: a draft isn't visible to
// students yet. `assessment` (from the builder's "Grade" button) preselects one.
import { gradeState, type GradeState } from '@school/core';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useI18n } from '../../i18n';
import { Button, Card, EmptyState, Text, useTheme } from '../../ui';
import { space } from '../../ui/tokens';
import { listAssessments, type AssessmentSummary } from '../assessments/api';
import { ChipPicker } from '../scope/ChipPicker';
import { LoadState } from '../scope/LoadState';
import { ScopeGate, type ReadyScope } from '../scope/ScopeGate';
import { useResult } from '../scope/useResult';
import { loadRoster, type GradeRow as Row, type GradeSubmission } from './api';
import { GradeRow } from './GradeRow';

function Roster({ scope, assessment }: { scope: ReadyScope; assessment: AssessmentSummary }) {
  const { t } = useI18n();
  const { colours } = useTheme();
  const res = useResult(`r:${assessment.id}`, () =>
    loadRoster(assessment.class_id, scope.year.id, assessment.id),
  );
  // Saved rows, merged over the loaded roster (no reload, no lost typing elsewhere).
  const [saved, setSaved] = useState<Record<string, GradeSubmission>>({});
  const onSaved = useCallback(
    (enrollmentId: string, s: GradeSubmission) => setSaved((m) => ({ ...m, [enrollmentId]: s })),
    [],
  );
  const rows: Row[] = useMemo(
    () =>
      res.state?.status === 'ready'
        ? res.state.data.map((r) => ({ ...r, submission: saved[r.enrollmentId] ?? r.submission }))
        : [],
    [res.state, saved],
  );

  if (res.state?.status !== 'ready') {
    return (
      <LoadState
        state={res.state}
        title={t('console.grading.rosterLoadError')}
        onRetry={res.reload}
      />
    );
  }
  if (!rows.length) {
    return <EmptyState icon="user" title={t('console.grading.rosterEmpty')} />;
  }
  const counts = rows.reduce<Record<GradeState, number>>(
    (c, r) => ({ ...c, [gradeState(r.submission)]: c[gradeState(r.submission)] + 1 }),
    { graded: 0, ungraded: 0, notSubmitted: 0 },
  );
  return (
    <View style={styles.wrap}>
      <Text tone="textMuted">
        {t('staff.grading.summary', {
          count: rows.length,
          graded: counts.graded,
          waiting: counts.ungraded,
        })}
      </Text>
      <Card>
        {rows.map((r, i) => (
          <View
            key={r.enrollmentId}
            style={i > 0 ? [styles.divider, { borderColor: colours.border }] : null}
          >
            <GradeRow row={r} assessment={assessment} onSaved={onSaved} />
          </View>
        ))}
      </Card>
    </View>
  );
}

function Grading({ scope, initialId }: { scope: ReadyScope; initialId: string | null }) {
  const { t } = useI18n();
  const router = useRouter();
  const list = useResult(`l:${scope.year.id}`, () => listAssessments(scope.year.id));
  const all = useMemo(
    () => (list.state?.status === 'ready' ? list.state.data : null),
    [list.state],
  );
  const mine = useMemo(() => new Set(scope.classes.map((c) => c.id)), [scope.classes]);
  const initial = all?.find((a) => a.id === initialId && mine.has(a.class_id)) ?? null;
  const [classId, setClassId] = useState<string | null>(null);
  const [assessmentId, setAssessmentId] = useState<string | null>(null);

  const cls = classId ?? initial?.class_id ?? scope.classes[0]?.id ?? null;
  const gradable = (all ?? []).filter(
    (a) => a.class_id === cls && mine.has(a.class_id) && a.status !== 'draft',
  );
  const chosenId = assessmentId ?? (initial?.class_id === cls ? initial.id : null);
  const chosen = gradable.find((a) => a.id === chosenId) ?? gradable[0] ?? null;

  return (
    <View style={styles.wrap}>
      <Text tone="textMuted">
        {t(scope.isStaff ? 'console.grading.subtitleAdmin' : 'console.grading.subtitleTeacher', {
          year: scope.year.label,
        })}
      </Text>
      {scope.classes.length > 1 ? (
        <ChipPicker
          label={t('console.grading.pickClass')}
          chips={scope.classes.map((c) => ({ value: c.id, label: c.name }))}
          value={cls}
          onChange={(v) => {
            setClassId(v);
            setAssessmentId(null);
          }}
        />
      ) : null}
      <LoadState
        state={list.state}
        title={t('console.grading.loadAssessmentsError')}
        onRetry={list.reload}
      />
      {all && !gradable.length ? (
        <EmptyState
          icon="tasks"
          title={t('staff.grading.nothingToGrade')}
          body={t('staff.grading.nothingToGradeBody')}
          action={
            <Button
              title={t('console.grading.goToAssessments')}
              variant="secondary"
              onPress={() => router.push('/assessments')}
            />
          }
        />
      ) : null}
      {gradable.length ? (
        <ChipPicker
          label={t('console.grading.pickAssessment')}
          chips={gradable.map((a) => ({
            value: a.id,
            label:
              a.status === 'closed' ? t('staff.grading.closedChip', { title: a.title }) : a.title,
          }))}
          value={chosen?.id ?? null}
          onChange={setAssessmentId}
        />
      ) : null}
      {chosen ? (
        <>
          <Text variant="heading">{chosen.title}</Text>
          <Text tone="textMuted">
            {[
              t('console.assessments.list.meta', {
                subject: chosen.subjectName,
                class: chosen.className,
              }),
              t(`console.assessments.types.${chosen.type as 'test'}`),
              chosen.total_marks != null
                ? t('console.assessments.list.marks', { total: chosen.total_marks })
                : t('staff.grading.noTotal'),
            ].join(' · ')}
          </Text>
          <Roster key={chosen.id} scope={scope} assessment={chosen} />
        </>
      ) : null}
    </View>
  );
}

export function GradingScreen({ assessmentId }: { assessmentId: string | null }) {
  const { t } = useI18n();
  const router = useRouter();
  return (
    <>
      <Button
        title={t('staff.back')}
        icon="back"
        variant="ghost"
        size="sm"
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        style={styles.start}
      />
      <Text variant="title" accessibilityRole="header">
        {t('console.grading.title')}
      </Text>
      <ScopeGate>{(scope) => <Grading scope={scope} initialId={assessmentId} />}</ScopeGate>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  start: { alignSelf: 'flex-start' },
  divider: { borderTopWidth: StyleSheet.hairlineWidth },
});
