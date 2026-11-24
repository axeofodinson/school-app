// My scores: every submission of mine this year, newest first, plus attempts
// still waiting on this device. Score shows only once a teacher has marked it.
import { attemptKey, scorePercent, SUBMISSION_KIND } from '@school/core';
import { StyleSheet, View } from 'react-native';

import { useI18n } from '../../i18n';
import { Badge, Button, EmptyState, ListItem, Screen, SkeletonLines, Text } from '../../ui';
import { space } from '../../ui/tokens';
import { useAttemptSync } from './AttemptSync';
import { StudentHeader } from './Header';
import { useHome } from './useHome';

export function ResultsScreen() {
  const { t } = useI18n();
  const { state, reload } = useHome();
  const { items } = useAttemptSync();
  const header = (
    <StudentHeader title={t('student.results.title')} subtitle={t('student.results.subtitle')} />
  );

  if (!state || state.status === 'loading') {
    return (
      <Screen>
        {header}
        <SkeletonLines lines={4} />
      </Screen>
    );
  }
  if (state.status === 'error') {
    return (
      <Screen>
        {header}
        <EmptyState
          icon="cloudOff"
          title={t(`student.results.errors.${state.error === 'network' ? 'network' : 'unknown'}`)}
          action={
            <Button title={t('student.results.retry')} variant="secondary" onPress={reload} />
          }
        />
      </Screen>
    );
  }
  const home = state.data;
  if (typeof home.enrollment === 'string') {
    return (
      <Screen>
        {header}
        <EmptyState icon="info" title={t(`student.results.${home.enrollment}`)} />
      </Screen>
    );
  }
  const enrollmentId = home.enrollment.id;
  const byId = new Map(home.assessments.map((a) => [a.id, a]));
  const onServer = new Set(home.submissions.map((s) => s.assessmentId));
  const waiting = home.assessments.filter((a) => {
    if (onServer.has(a.id)) return false;
    const key = attemptKey(enrollmentId, a.id);
    return items.some((i) => i.kind === SUBMISSION_KIND && i.key === key);
  });
  const subs = [...home.submissions].sort((x, y) =>
    (y.submittedAt ?? '').localeCompare(x.submittedAt ?? ''),
  );

  const marked = subs.filter((s) => s.score != null && byId.get(s.assessmentId)?.totalMarks);
  const got = marked.reduce((n, s) => n + (s.score ?? 0), 0);
  const of = marked.reduce((n, s) => n + (byId.get(s.assessmentId)?.totalMarks ?? 0), 0);
  const overall = scorePercent(got, of);

  if (subs.length === 0 && waiting.length === 0) {
    return (
      <Screen>
        {header}
        <EmptyState icon="star" title={t('student.results.empty')} />
      </Screen>
    );
  }

  return (
    <Screen>
      {header}
      {home.fromCache ? (
        <Badge
          icon="cloudOff"
          label={t('student.assessments.offline')}
          tone="accent"
          style={styles.start}
        />
      ) : null}
      <View style={styles.summary}>
        {overall != null ? (
          <>
            <Text variant="heading">{t('student.results.overall', { percent: overall })}</Text>
            <Text tone="textMuted">
              {t('student.results.markedCount', { count: marked.length })}
            </Text>
          </>
        ) : (
          <Text tone="textMuted">{t('student.results.noneMarked')}</Text>
        )}
      </View>
      <View style={styles.list}>
        {waiting.map((a) => (
          <ListItem
            key={`w-${a.id}`}
            title={a.title}
            subtitle={a.subjectName}
            trailing={<Badge icon="cloudOff" label={t('student.results.notSent')} tone="accent" />}
          />
        ))}
        {subs.map((s) => {
          const a = byId.get(s.assessmentId);
          const pct = scorePercent(s.score, a?.totalMarks ?? null);
          const label =
            s.score == null
              ? t('student.results.waiting')
              : a?.totalMarks
                ? t('student.results.score', { score: s.score, total: a.totalMarks })
                : String(s.score);
          return (
            <ListItem
              key={s.id}
              title={a?.title ?? t('student.results.unknownTest')}
              subtitle={[
                a?.subjectName,
                pct != null ? t('student.results.percent', { percent: pct }) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
              trailing={<Badge label={label} tone={s.score == null ? 'neutral' : 'correct'} />}
            />
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  start: { alignSelf: 'flex-start', marginBottom: space.md },
  summary: { gap: space.xxs, marginBottom: space.md },
  list: { gap: space.sm },
});
