import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useI18n } from '../../i18n';
import { Badge, Button, EmptyState, ListItem, Text } from '../../ui';
import { space } from '../../ui/tokens';
import { ChipPicker } from '../scope/ChipPicker';
import { LoadState } from '../scope/LoadState';
import { ScopeGate, type ReadyScope } from '../scope/ScopeGate';
import { ALL } from '../scope/ScopePicker';
import { useResult } from '../scope/useResult';
import { listAssessments, type AssessmentSummary } from './api';
import { STATUS_TONE } from './StatusBadge';

function Row({ a }: { a: AssessmentSummary }) {
  const { t } = useI18n();
  const router = useRouter();
  const parts = [
    t('console.assessments.list.meta', { subject: a.subjectName, class: a.className }),
    a.type === 'file'
      ? t('console.assessments.types.file')
      : t('console.assessments.list.questionCount', { count: a.questionCount }),
    a.total_marks != null ? t('console.assessments.list.marks', { total: a.total_marks }) : null,
    a.scheduled_on
      ? t('console.assessments.list.scheduled', { date: a.scheduled_on })
      : t('console.assessments.list.notScheduled'),
  ].filter(Boolean);
  return (
    <ListItem
      title={a.title}
      subtitle={parts.join(' · ')}
      trailing={
        <Badge label={t(`console.assessments.statuses.${a.status}`)} tone={STATUS_TONE[a.status]} />
      }
      onPress={() => router.push(`/assessments/${a.id}`)}
    />
  );
}

function List({ scope }: { scope: ReadyScope }) {
  const { t } = useI18n();
  const router = useRouter();
  const [classId, setClassId] = useState<string>(ALL);
  const res = useResult(`l:${scope.year.id}`, () => listAssessments(scope.year.id));
  const mine = useMemo(() => new Set(scope.classes.map((c) => c.id)), [scope.classes]);
  const all = res.state?.status === 'ready' ? res.state.data : null;
  // RLS already limits a teacher; this also hides classes outside this year's assignments.
  const shown = (all ?? []).filter(
    (a) => mine.has(a.class_id) && (classId === ALL || a.class_id === classId),
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.toolbar}>
        <Text tone="textMuted" style={styles.flex}>
          {t(
            scope.isStaff
              ? 'console.assessments.subtitleAdmin'
              : 'console.assessments.subtitleTeacher',
            {
              year: scope.year.label,
            },
          )}
        </Text>
        <Button
          title={t('staff.quick.cta')}
          icon="sparkles"
          onPress={() => router.push('/assessments/quick')}
        />
        <Button
          title={t('staff.assessments.new')}
          icon="pencil"
          variant="secondary"
          onPress={() => router.push('/assessments/new')}
        />
      </View>
      {scope.classes.length > 1 ? (
        <ChipPicker
          label={t('staff.scope.class')}
          chips={[
            { value: ALL, label: t('staff.scope.allClasses') },
            ...scope.classes.map((c) => ({ value: c.id, label: c.name })),
          ]}
          value={classId}
          onChange={setClassId}
        />
      ) : null}
      <LoadState
        state={res.state}
        title={t('console.assessments.list.loadError')}
        onRetry={res.reload}
      />
      {all && shown.length === 0 ? (
        <EmptyState
          icon="tasks"
          title={t('console.assessments.list.empty')}
          body={t('staff.assessments.emptyBody')}
          action={
            <Button
              title={t('staff.assessments.new')}
              variant="secondary"
              onPress={() => router.push('/assessments/new')}
            />
          }
        />
      ) : null}
      {shown.length > 0 ? (
        <Text variant="bodySm" tone="textMuted">
          {t('console.assessments.list.count', { count: shown.length })}
        </Text>
      ) : null}
      {shown.map((a) => (
        <Row key={a.id} a={a} />
      ))}
    </View>
  );
}

export function AssessmentsScreen() {
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
        {t('console.assessments.title')}
      </Text>
      <ScopeGate>{(scope) => <List scope={scope} />}</ScopeGate>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.md },
  flex: { flexGrow: 1, flexBasis: 240 },
  start: { alignSelf: 'flex-start' },
});
