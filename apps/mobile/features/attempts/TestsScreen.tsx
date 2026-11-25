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
  Icon,
  Reveal,
  Screen,
  SkeletonLines,
  Text,
  useTheme,
  type BadgeTone,
  type IconName,
} from '../../ui';
import { PressableSticker } from '../../ui/Sticker';
import { hueForSubject, radiusFor, space, subjectHues } from '../../ui/tokens';
import { useStudentNav } from '../student/StudentNav';
import { useGradePresentation } from '../student/StudentPresentation';
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

const STATE_ICON: Record<RowState, IconName> = {
  worksheet: 'book',
  todo: 'pencil',
  started: 'pencil',
  waiting: 'cloudOff',
  problem: 'warning',
  submitted: 'checkCircle',
  closed: 'lock',
};

/** One test as a sticker card: a subject-hue tile at the start edge, title, meta, status. */
function TestCard({
  a,
  s,
  meta,
  onPress,
}: {
  a: StudentAssessment;
  s: RowState;
  meta: string;
  onPress: () => void;
}) {
  const { t } = useI18n();
  const { colours, scheme, presentation } = useTheme();
  const hue = hueForSubject(a.subjectId ?? a.subjectName ?? a.id);
  const open = s === 'todo' || s === 'started' || s === 'problem' || s === 'worksheet';
  return (
    <PressableSticker
      radius={radiusFor('lg', presentation)}
      depth={open ? 'sticker' : 'stickerSm'}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${a.title}, ${t(STATE[s].key)}`}
      faceStyle={(pressed) => [
        styles.card,
        { backgroundColor: pressed ? colours.surfaceAlt : colours.surface },
      ]}
    >
      <View
        style={[
          styles.hue,
          {
            backgroundColor: subjectHues[hue][scheme],
            borderColor: scheme === 'dark' ? colours.borderStrong : colours.ink,
          },
        ]}
      >
        <Icon name={STATE_ICON[s]} colour={colours.ink} size={22} />
      </View>
      <View style={styles.flex}>
        <Text variant="heading" numberOfLines={2}>
          {a.title}
        </Text>
        <Text variant="bodySm" tone="textMuted" numberOfLines={2}>
          {meta}
        </Text>
      </View>
      <Badge label={t(STATE[s].key)} tone={STATE[s].tone} />
    </PressableSticker>
  );
}

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
  const nav = useStudentNav('tests');
  const ready = state?.status === 'ready' ? state.data.enrollment : null;
  useGradePresentation(ready && typeof ready !== 'string' ? (ready.gradeLevel ?? null) : undefined);
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
      tab
      title={t('student.assessments.title')}
      subtitle={t('student.assessments.subtitle')}
    />
  );

  if (!state || state.status === 'loading') {
    return (
      <Screen header={header} {...nav}>
        <SkeletonLines lines={4} />
      </Screen>
    );
  }
  if (state.status === 'error') {
    return (
      <Screen header={header} {...nav}>
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
      <Screen header={header} {...nav}>
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

  const row = ({ a, s }: { a: StudentAssessment; s: RowState }, i: number) => {
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
      <Reveal key={a.id} index={i}>
        <TestCard
          a={a}
          s={s}
          meta={meta.join(' · ')}
          onPress={() => router.push(`/tests/${a.id}`)}
        />
      </Reveal>
    );
  };

  return (
    <Screen header={header} {...nav}>
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
            <Text variant="heading" accessibilityRole="header">
              {t('student.assessments.todoCount', { count: todo.length })}
            </Text>
          ) : null}
          {todo.map((r, i) => row(r, i + 1))}
          {rest.length ? (
            <Text variant="heading" accessibilityRole="header" style={styles.gap}>
              {t('student.assessments.doneHeading')}
            </Text>
          ) : null}
          {rest.map((r, i) => row(r, todo.length + i + 2))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.md },
  gap: { marginTop: space.md },
  flex: { flex: 1, gap: 2 },
  card: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md },
  hue: {
    width: 48,
    height: 48,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  banner: { marginBottom: space.md, alignSelf: 'flex-start' },
});
