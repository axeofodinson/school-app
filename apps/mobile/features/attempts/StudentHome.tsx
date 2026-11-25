// Student home until the Learn surface exists (prompt 30): greeting, where my
// work is (sync status), what they can open, and how many messages are new.
import { attemptKey, SUBMISSION_KIND } from '@school/core';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useI18n } from '../../i18n';
import { Badge, ListItem, Screen, SyncStatusPill, Text } from '../../ui';
import { space } from '../../ui/tokens';
import { AccountActions } from '../auth/AccountActions';
import { useAuth } from '../auth/AuthProvider';
import { useMessages } from '../messages/MessagesProvider';
import { useAttemptSync } from './AttemptSync';
import { useHome } from './useHome';

export function StudentHome() {
  const { t } = useI18n();
  const router = useRouter();
  const { profile } = useAuth();
  const { status, pending, flushNow, items } = useAttemptSync();
  const { state } = useHome();
  const { unreadCount } = useMessages();
  const home = state?.status === 'ready' ? state.data : null;
  let todo: number | null = null;
  if (home && typeof home.enrollment !== 'string') {
    const eid = home.enrollment.id;
    const done = new Set(home.submissions.map((s) => s.assessmentId));
    todo = home.assessments.filter(
      (a) =>
        a.status === 'published' &&
        a.type !== 'file' &&
        !done.has(a.id) &&
        !items.some((i) => i.kind === SUBMISSION_KIND && i.key === attemptKey(eid, a.id)),
    ).length;
  }

  return (
    <Screen>
      <View style={styles.top}>
        <AccountActions />
        <SyncStatusPill status={status} pending={pending} onRetry={() => flushNow()} />
      </View>
      <Text variant="title" accessibilityRole="header">
        {profile?.full_name
          ? t('student.home.greeting', { name: profile.full_name })
          : t('student.home.title')}
      </Text>
      <View style={styles.list}>
        <ListItem
          title={t('student.home.assessments')}
          subtitle={
            todo
              ? t('student.assessments.todoCount', { count: todo })
              : t('student.home.assessmentsNote')
          }
          onPress={() => router.push('/tests')}
        />
        <ListItem
          title={t('student.inbox.title')}
          subtitle={t('student.inbox.subtitle')}
          trailing={
            unreadCount > 0 ? (
              <Badge label={t('student.inbox.newCount', { count: unreadCount })} tone="primary" />
            ) : undefined
          }
          onPress={() => router.push('/inbox')}
        />
        <ListItem
          title={t('student.home.scores')}
          subtitle={t('student.home.scoresNote')}
          onPress={() => router.push('/results')}
        />
        <ListItem
          title={t('student.home.attendance')}
          subtitle={t('student.home.attendanceNote')}
          onPress={() => router.push('/attendance')}
        />
        <ListItem
          title={t('student.home.report')}
          subtitle={t('student.home.reportNote')}
          onPress={() => router.push('/report')}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  list: { gap: space.sm, marginTop: space.lg },
});
