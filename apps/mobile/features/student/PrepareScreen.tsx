// The Prepare tab (wireframe 7.2 "Prepare: follow-ups first", prompt 41): open
// follow-ups first (exam → diagnostic → teacher → revision) with their next
// steps, the gate in plain words, then the lessons, where a topic a follow-up
// holds back shows as paused. Relief is automatic on the server (db/019) and a
// teacher can relax a gate (db/034), so nobody is stuck. Shared by school
// students (`/study`) and prep learners (root `/topic`).
import type { TopicPos } from '@school/core';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { useI18n } from '../../i18n';
import { Badge, Button, EmptyState, Reveal, Screen, SkeletonLines, Text } from '../../ui';
import { space } from '../../ui/tokens';
import { StudentHeader } from '../attempts/Header';
import { useHome } from '../attempts/useHome';
import { FollowUpsSection } from '../followups/FollowUpsSection';
import { usePrepare } from '../followups/usePrepare';
import { LessonList } from '../learn/LessonList';
import { useStudentNav } from './StudentNav';

/** Follow-ups + lessons; used inside the student tab and the prep learner's home. */
export function PrepareBody({
  classId,
  root = '/lesson',
}: {
  classId: string | null | undefined;
  root?: string;
}) {
  const { t } = useI18n();
  const prep = usePrepare(classId);
  const items = useMemo(
    () => new Map((prep.data?.followUps ?? []).map((f) => [f.id, f])),
    [prep.data],
  );
  const known: TopicPos[] = useMemo(
    () =>
      (prep.data?.followUps ?? [])
        .filter((f) => f.topicId)
        .map((f) => ({
          topicId: f.topicId!,
          subjectId: f.subjectId,
          chapterOrder: f.chapterOrder,
          topicOrder: f.topicOrder,
        })),
    [prep.data],
  );

  let followUps: React.ReactNode = null;
  if (prep.model) {
    followUps = <FollowUpsSection model={prep.model} items={items} root={root} />;
  } else if (!prep.state || prep.state.status === 'loading') {
    followUps = <SkeletonLines lines={3} />;
  } else if (prep.state.status === 'error') {
    followUps = (
      <EmptyState
        icon="cloudOff"
        title={t('student.followUps.loadError')}
        action={
          <Button title={t('student.learn.retry')} variant="secondary" onPress={prep.reload} />
        }
      />
    );
  } // notReady (no 019 on this project yet): Prepare is just the lessons.

  return (
    <>
      {prep.data?.fromCache ? (
        <Badge
          label={t('student.learn.savedCopy')}
          tone="neutral"
          icon="cloudOff"
          style={styles.saved}
        />
      ) : null}
      {followUps}
      <Reveal index={4}>
        <View style={styles.divider} />
        <Text variant="bodySm" tone="textMuted">
          {t('student.followUps.diagnoseHint')}
        </Text>
      </Reveal>
      <Reveal index={5}>
        <LessonList classId={classId} root={root} gate={prep.gate} knownTopics={known} />
      </Reveal>
    </>
  );
}

export function PrepareScreen() {
  const { t } = useI18n();
  const nav = useStudentNav('prepare');
  const home = useHome(false);
  // The class whose lessons to list: undefined while loading, null = every class.
  const classId =
    home.state?.status === 'ready'
      ? typeof home.state.data.enrollment === 'object'
        ? home.state.data.enrollment.classId
        : null
      : home.state?.status === 'error'
        ? null
        : undefined;
  return (
    <Screen
      header={
        <StudentHeader
          tab
          title={t('student.prepare.title')}
          subtitle={t('student.prepare.subtitle')}
        />
      }
      {...nav}
    >
      <PrepareBody classId={classId} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  saved: { alignSelf: 'flex-start' },
  divider: { height: space.sm },
});
