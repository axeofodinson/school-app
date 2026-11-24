// The student's tests for this year: to do first, then done. Each row says where
// the attempt is (to do / started / waiting to send / not sent / done / closed).
import { attemptKey, attemptState, SUBMISSION_KIND, type AttemptState } from '@school/core';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useI18n, type TKey } from '../../i18n';
import {
  Badge,
  Button,
  EmptyState,
  ListItem,
  Screen,
  SkeletonLines,
  Text,
  type BadgeTone,
} from '../../ui';
import { space } from '../../ui/tokens';
import { useAttemptSync } from './AttemptSync';
import type { StudentAssessment } from './api';
import { StudentHeader } from './Header';
import { useHome } from './useHome';

type RowState = AttemptState | 'closed' | 'worksheet';

const STATE: Record<RowState, { key: TKey; tone: BadgeTone }> = {
  worksheet: { key: 'student.worksheet.open', tone: 'primary' },
  todo: { key: 'student.assessments.status.todo', tone: 'primary' },
  started: { key: 'student.assessments.status.started', tone: 'primary' },
  waiting: { key: 'student.assessments.status.waiting', tone: 'accent' },
  problem: { key: 'student.assessments.status.problem', tone: 'wrong' },
  submitted: { key: 'student.assessments.status.submitted', tone: 'correct' },
  closed: { key: 'student.assessments.status.closed', tone: 'neutral' },
};

const TYPE_KEYS: Record<string, TKey> = {
  assignment: 'student.assessments.types.assignment',
  test: 'student.assessments.types.test',
  exam: 'student.assessments.types.exam',
  quiz: 'student.assessments.types.quiz',
  file: 'student.assessments.types.file',
};

export function TestsScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const { state, reload } = useHome();
  const { items, drafts } = useAttemptSync();
  const [draftKeys, setDraftKeys] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    let live = true;
    drafts
      ?.keys()
      .then((k) => live && setDraftKeys(new Set(k)))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [drafts, items, state]);

  const header = (
    <StudentHeader
      title={t('student.assessments.title')}
      subtitle={t('student.assessments.subtitle')}
    />
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
          title={t(
            `student.assessments.errors.${state.error === 'network' ? 'network' : 'unknown'}`,
          )}
          action={
            <Button title={t('student.assessments.retry')} variant="secondary" onPress={reload} />
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
        <EmptyState icon="info" title={t(`student.assessments.${home.enrollment}`)} />
      </Screen>
    );
  }
  const enrollmentId = home.enrollment.id;
  const onServer = new Set(home.submissions.map((s) => s.assessmentId));
  const marked = new Set(
    home.submissions.filter((x) => x.score != null).map((x) => x.assessmentId),
  );
  const rowState = (a: StudentAssessment): RowState => {
    // A worksheet is done on paper: open while published, done once it is marked.
    if (a.type === 'file') {
      return marked.has(a.id) ? 'submitted' : a.status === 'closed' ? 'closed' : 'worksheet';
    }
    const key = attemptKey(enrollmentId, a.id);
    const s = attemptState({
      onServer: onServer.has(a.id),
      queued: items.find((i) => i.kind === SUBMISSION_KIND && i.key === key),
      hasDraft: draftKeys.has(key),
    });
    return a.status === 'closed' && (s === 'todo' || s === 'started') ? 'closed' : s;
  };
  const rows = home.assessments.map((a) => ({ a, s: rowState(a) }));
  const todo = rows.filter(
    (r) => r.s === 'todo' || r.s === 'started' || r.s === 'problem' || r.s === 'worksheet',
  );
  const rest = rows.filter((r) => !todo.includes(r));

  const row = ({ a, s }: { a: StudentAssessment; s: RowState }) => {
    const meta = [
      a.subjectName,
      TYPE_KEYS[a.type] ? t(TYPE_KEYS[a.type]!) : null,
      // A closed test's questions are no longer readable, so its count is unknown.
      a.questionCount > 0
        ? t('student.assessments.questionCount', { count: a.questionCount })
        : null,
      a.scheduledOn,
    ].filter(Boolean);
    return (
      <ListItem
        key={a.id}
        title={a.title}
        subtitle={meta.join(' · ')}
        trailing={<Badge label={t(STATE[s].key)} tone={STATE[s].tone} />}
        onPress={() => router.push(`/tests/${a.id}`)}
      />
    );
  };

  return (
    <Screen>
      {header}
      {home.fromCache ? (
        <Badge
          icon="cloudOff"
          label={t('student.assessments.offline')}
          tone="accent"
          style={styles.banner}
        />
      ) : null}
      {rows.length === 0 ? (
        <EmptyState icon="tasks" title={t('student.assessments.empty')} />
      ) : (
        <View style={styles.list}>
          {todo.length ? (
            <Text variant="label" tone="textMuted">
              {t('student.assessments.todoCount', { count: todo.length })}
            </Text>
          ) : null}
          {todo.map(row)}
          {rest.length && todo.length ? <View style={styles.gap} /> : null}
          {rest.map(row)}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.sm },
  gap: { height: space.md },
  banner: { marginBottom: space.md, alignSelf: 'flex-start' },
});
