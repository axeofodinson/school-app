// My report card: this year's marked work rolled into one weighted figure, per
// subject, and what the tests checked (recall vs thinking). All the math is
// core buildReport() (identical to the old app's, tested side by side); this
// screen only gathers rows. Overall + subjects come from the same device copy as
// the tests list, so they show offline; the "what your tests checked" part needs
// the papers' questions and loads when online.
import { buildReport, type ReportAssessment } from '@school/core';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { useI18n } from '../../i18n';
import { Badge, Button, Card, EmptyState, Screen, SkeletonLines, Text, useTheme } from '../../ui';
import { radius, space } from '../../ui/tokens';
import { StudentHeader } from '../attempts/Header';
import { useHome } from '../attempts/useHome';
import { useResult } from '../scope/useResult';
import { loadCognitive } from './api';

function Bar({ share }: { share: number }) {
  const { colours } = useTheme();
  return (
    <View style={[styles.track, { backgroundColor: colours.surfaceAlt }]}>
      <View
        style={[
          styles.fill,
          { backgroundColor: colours.primary, width: `${Math.max(0, Math.min(100, share))}%` },
        ]}
      />
    </View>
  );
}

export function ReportCardScreen() {
  const { t } = useI18n();
  const { state, reload } = useHome();
  const home = state?.status === 'ready' ? state.data : null;
  const enrolled = home && typeof home.enrollment !== 'string';

  // The report covers work this student has a submission for (as the old app did).
  const rows = useMemo(() => {
    if (!home) return [];
    const subs = new Map(home.submissions.map((s) => [s.assessmentId, s]));
    return home.assessments
      .filter((a) => subs.has(a.id))
      .map((a) => ({ a, score: subs.get(a.id)!.score }));
  }, [home]);
  const ids = rows.map((r) => r.a.id);
  const cog = useResult(ids.length ? `cog:${ids.join()}` : null, () => loadCognitive(ids));

  const report = useMemo(() => {
    const byAssessment = new Map<string, { cognitiveLevel: string | null; marks: number }[]>();
    if (cog.state?.status === 'ready') {
      for (const r of cog.state.data) {
        if (!r.question) continue;
        const list = byAssessment.get(r.assessment_id) ?? [];
        list.push({ cognitiveLevel: r.question.cognitive_level, marks: r.marks });
        byAssessment.set(r.assessment_id, list);
      }
    }
    const assessments: ReportAssessment[] = rows.map(({ a, score }) => ({
      id: a.id,
      title: a.title,
      type: a.type,
      subject: a.subjectId ? { id: a.subjectId, name: a.subjectName } : null,
      weightage: a.weightage ?? 0,
      totalMarks: a.totalMarks,
      score,
      questions: byAssessment.get(a.id) ?? [],
    }));
    return buildReport({ assessments });
  }, [rows, cog.state]);

  const header = (
    <StudentHeader
      title={t('student.report.title')}
      subtitle={
        home && typeof home.enrollment !== 'string'
          ? t('student.report.subtitle', { year: home.enrollment.yearLabel })
          : t('student.report.subtitleNoYear')
      }
    />
  );

  if (!state || state.status === 'loading') {
    return (
      <Screen>
        {header}
        <SkeletonLines lines={5} />
      </Screen>
    );
  }
  // A device copy saved before prompt 12 has no weightage/subject ids: its
  // numbers would be wrong, so offline it reads as "not available yet".
  const stale =
    state.status === 'ready' &&
    state.data.fromCache &&
    state.data.assessments.some((a) => a.weightage === undefined);
  if (state.status === 'error' || stale) {
    return (
      <Screen>
        {header}
        <EmptyState
          icon="cloudOff"
          title={t(
            `student.report.errors.${stale || (state.status === 'error' && state.error === 'network') ? 'network' : 'unknown'}`,
          )}
          action={<Button title={t('student.report.retry')} variant="secondary" onPress={reload} />}
        />
      </Screen>
    );
  }
  if (!enrolled) {
    return (
      <Screen>
        {header}
        <EmptyState icon="info" title={t(`student.report.${home!.enrollment as 'noYear'}`)} />
      </Screen>
    );
  }
  if (!rows.length) {
    return (
      <Screen>
        {header}
        <EmptyState icon="star" title={t('student.report.empty')} />
      </Screen>
    );
  }

  const { overall, subjects, cognitive } = report;
  return (
    <Screen>
      {header}
      {home!.fromCache ? (
        <Badge
          icon="cloudOff"
          label={t('student.assessments.offline')}
          tone="accent"
          style={styles.start}
        />
      ) : null}
      <Card>
        <View style={styles.section}>
          <Text variant="label" tone="textMuted">
            {t('student.report.overall')}
          </Text>
          {overall.percent != null ? (
            <>
              <Text variant="display">
                {t('student.report.overallPercent', { percent: overall.percent })}
              </Text>
              <Text tone="textMuted">
                {t('student.report.fromMarked', { count: overall.gradedCount })}
              </Text>
              {!overall.weighted ? (
                <Text variant="bodySm" tone="textMuted">
                  {t('student.report.unweightedNote')}
                </Text>
              ) : null}
            </>
          ) : (
            <Text tone="textMuted">{t('student.report.noneMarked')}</Text>
          )}
          {overall.ungradedCount > 0 ? (
            <Text variant="bodySm" tone="textMuted">
              {t('student.report.waiting', { count: overall.ungradedCount })}
            </Text>
          ) : null}
        </View>
      </Card>

      <Text variant="heading" style={styles.gapTop}>
        {t('student.report.bySubject')}
      </Text>
      <View style={styles.list}>
        {subjects.map((s) => (
          <Card key={s.id ?? 'none'}>
            <View style={styles.section}>
              <View style={styles.row}>
                <Text variant="label" style={styles.flex}>
                  {s.name ?? '—'}
                </Text>
                <Text variant="heading">
                  {s.percent != null
                    ? t('student.report.subjectPercent', { percent: s.percent })
                    : t('student.report.subjectWaiting')}
                </Text>
              </View>
              {s.percent != null ? <Bar share={s.percent} /> : null}
              <Text variant="bodySm" tone="textMuted">
                {t('student.report.subjectMarked', { count: s.gradedCount })}
              </Text>
            </View>
          </Card>
        ))}
      </View>

      <Text variant="heading" style={styles.gapTop}>
        {t('student.report.cognitive.heading')}
      </Text>
      <Text tone="textMuted">{t('student.report.cognitive.hint')}</Text>
      {cog.state?.status !== 'ready' ? (
        cog.state?.status === 'error' ? (
          <Text tone="textMuted">{t('student.report.cognitiveOffline')}</Text>
        ) : (
          <SkeletonLines lines={2} />
        )
      ) : cognitive.totalMarks === 0 ? (
        <Text tone="textMuted">{t('student.report.cognitiveNone')}</Text>
      ) : (
        <Card>
          <View style={styles.section}>
            {[
              { key: 'recall' as const, v: cognitive.recall },
              { key: 'conceptual' as const, v: cognitive.conceptual },
            ].map(({ key, v }) => (
              <View key={key} style={styles.section}>
                <View style={styles.row}>
                  <Text variant="label" style={styles.flex}>
                    {t(`student.report.cognitive.${key}`)}
                  </Text>
                  <Text>{t('student.report.cognitive.share', { share: v.share ?? 0 })}</Text>
                </View>
                <Bar share={v.share ?? 0} />
              </View>
            ))}
            {cognitive.levels.map((l) => (
              <Text key={l.level} variant="bodySm" tone="textMuted">
                {`${t(`student.report.cognitive.levels.${l.level}`)} · ${t(
                  'student.report.cognitive.levelDetail',
                  { share: l.share ?? 0, marks: l.marks },
                )}`}
              </Text>
            ))}
          </View>
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  start: { alignSelf: 'flex-start', marginBottom: space.md },
  section: { gap: space.xs },
  list: { gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  flex: { flex: 1 },
  gapTop: { marginTop: space.lg },
  track: { height: space.sm, borderRadius: radius.full, overflow: 'hidden' },
  fill: { height: space.sm, borderRadius: radius.full },
});
