// Student Home (Mosaic wireframe "Student Home", DECISIONS #94): a brand hero with the
// drifting tile pattern, the open test as a saffron banner, the student's subjects as
// mosaics, and big tiles for everything else. Until mastery exists (prompt 40) a
// subject's tiles are its tests: one tile per test this year, set when it is done.
// Prepare (follow-ups) arrives with prompt 41; its tab already has a real empty state.
import { attemptKey, SUBMISSION_KIND } from '@school/core';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useI18n } from '../../i18n';
import {
  Badge,
  Button,
  EmptyState,
  HeroBand,
  HeroLanguageButton,
  Icon,
  Reveal,
  Screen,
  SkeletonLines,
  SubjectCard,
  SyncStatusPill,
  Text,
  TileBurst,
  useCues,
  useHeroTone,
  useLayout,
  useTheme,
  type IconName,
} from '../../ui';
import { PressableSticker } from '../../ui/Sticker';
import { radiusFor, space, type ColourRoles } from '../../ui/tokens';
import { useAuth } from '../auth/AuthProvider';
import { useMessages } from '../messages/MessagesProvider';
import { useStudentNav } from '../student/StudentNav';
import { useGradePresentation } from '../student/StudentPresentation';
import type { Home, StudentAssessment } from './api';
import { useAttemptSync } from './AttemptSync';
import { useHome } from './useHome';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function HomeHero({ home, firstName }: { home: Home | null; firstName: string | null }) {
  const { t } = useI18n();
  const tone = useHeroTone();
  const { status, pending, flushNow } = useAttemptSync();
  const enr = home && typeof home.enrollment !== 'string' ? home.enrollment : null;
  const [since] = useState(() => Date.now() - WEEK_MS);
  const thisWeek = home
    ? home.submissions.filter((s) => s.submittedAt && Date.parse(s.submittedAt) >= since).length
    : 0;
  return (
    <HeroBand trigger={thisWeek}>
      <View style={styles.heroTop}>
        <Text variant="label" tone={tone} style={styles.flex} numberOfLines={1}>
          {enr ? enr.className : ' '}
        </Text>
        <HeroLanguageButton />
        <SyncStatusPill status={status} pending={pending} onRetry={() => flushNow()} />
      </View>
      <Reveal index={0} rise={10}>
        <Text variant="display" tone={tone} accessibilityRole="header">
          {firstName ? t('student.home.greeting', { name: firstName }) : t('student.home.title')}
        </Text>
      </Reveal>
      <Reveal index={1} rise={6}>
        <Text tone={tone}>
          {thisWeek > 0
            ? t('student.home.weekDone', { count: thisWeek })
            : t('student.home.weekStart')}
        </Text>
      </Reveal>
    </HeroBand>
  );
}

/** The saffron "a test is open" banner: the one thing to do next. */
function OpenTest({ a, more }: { a: StudentAssessment; more: number }) {
  const { t } = useI18n();
  const router = useRouter();
  const { colours, presentation, scheme } = useTheme();
  const { cue } = useCues();
  const r = radiusFor('lg', presentation);
  return (
    <View>
      <PressableSticker
        radius={r}
        onPress={() => {
          cue('pop');
          router.push(`/tests/${a.id}`);
        }}
        accessibilityRole="button"
        accessibilityLabel={t('student.home.openTestA11y', {
          title: a.title,
          subject: a.subjectName,
        })}
        faceStyle={() => [styles.banner, { backgroundColor: colours.accent }]}
      >
        <View
          style={[
            styles.bannerIcon,
            {
              backgroundColor: colours.surface,
              borderColor: scheme === 'dark' ? colours.borderStrong : colours.ink,
            },
          ]}
        >
          <Icon name="timer" size={28} tone="text" />
        </View>
        <View style={styles.flex}>
          <Text variant="caption" tone="onAccent" style={styles.kicker}>
            {more > 0
              ? t('student.home.testsOpen', { count: more + 1 })
              : t('student.home.testOpen')}
          </Text>
          <Text variant="heading" tone="onAccent" numberOfLines={2}>
            {a.title}
          </Text>
          <Text variant="bodySm" tone="onAccent" numberOfLines={1}>
            {[
              a.subjectName,
              a.questionCount > 0
                ? t('student.assessments.questionCount', { count: a.questionCount })
                : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
        <View style={[styles.startChip, { backgroundColor: colours.text }]}>
          <Text variant="label" tone="bg">
            {t('student.home.start')}
          </Text>
        </View>
      </PressableSticker>
    </View>
  );
}

function QuickTile({
  title,
  note,
  icon,
  soft,
  fg,
  badge,
  onPress,
}: {
  title: string;
  note: string;
  icon: IconName;
  soft: keyof ColourRoles;
  fg: keyof ColourRoles;
  badge?: string;
  onPress: () => void;
}) {
  const { colours, presentation } = useTheme();
  return (
    <PressableSticker
      radius={radiusFor('lg', presentation)}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={badge ? `${title}, ${badge}` : title}
      style={styles.quickCell}
      faceStyle={(pressed) => [
        styles.quick,
        { backgroundColor: pressed ? colours.surfaceAlt : colours.surface },
      ]}
    >
      <View style={styles.quickTop}>
        <View style={[styles.quickIcon, { backgroundColor: colours[soft] }]}>
          <Icon name={icon} tone={fg} size={24} />
        </View>
        {badge ? <Badge label={badge} tone="primary" icon="star" /> : null}
      </View>
      <Text variant="heading" numberOfLines={2}>
        {title}
      </Text>
      <Text variant="bodySm" tone="textMuted" numberOfLines={2}>
        {note}
      </Text>
    </PressableSticker>
  );
}

type SubjectRow = {
  id: string;
  name: string;
  done: number;
  total: number;
  firstOpen: string | null;
};

function subjectsOf(home: Home, isDone: (a: StudentAssessment) => boolean): SubjectRow[] {
  const map = new Map<string, SubjectRow>();
  for (const a of home.assessments) {
    const key = a.subjectId ?? a.subjectName;
    if (!key) continue;
    const row = map.get(key) ?? {
      id: key,
      name: a.subjectName,
      done: 0,
      total: 0,
      firstOpen: null,
    };
    row.total += 1;
    if (isDone(a)) row.done += 1;
    else if (!row.firstOpen && a.status === 'published' && a.type !== 'file') row.firstOpen = a.id;
    map.set(key, row);
  }
  return [...map.values()].sort((x, y) => x.name.localeCompare(y.name));
}

export function StudentHome() {
  const { t } = useI18n();
  const router = useRouter();
  const { profile } = useAuth();
  const { items } = useAttemptSync();
  const { state, reload } = useHome();
  const { unreadCount } = useMessages();
  const { breakpoint } = useLayout();
  const { colours } = useTheme();
  const nav = useStudentNav('home');
  const home = state?.status === 'ready' ? state.data : null;
  const enr = home && typeof home.enrollment !== 'string' ? home.enrollment : null;
  useGradePresentation(enr ? (enr.gradeLevel ?? null) : undefined);
  const firstName = profile?.full_name?.trim() || null;

  const done = new Set(home?.submissions.map((s) => s.assessmentId) ?? []);
  const queued = (a: StudentAssessment) =>
    !!enr && items.some((i) => i.kind === SUBMISSION_KIND && i.key === attemptKey(enr.id, a.id));
  const todo =
    enr && home
      ? home.assessments.filter(
          (a) => a.status === 'published' && a.type !== 'file' && !done.has(a.id) && !queued(a),
        )
      : [];
  const subjects = home && enr ? subjectsOf(home, (a) => done.has(a.id) || queued(a)) : [];
  const cols = breakpoint === 'phone' ? 2 : breakpoint === 'tablet' ? 3 : 4;

  let body: React.ReactNode;
  if (!state || state.status === 'loading') {
    body = <SkeletonLines lines={5} />;
  } else if (state.status === 'error') {
    body = (
      <EmptyState
        icon="cloudOff"
        title={t(`student.assessments.errors.${state.error === 'network' ? 'network' : 'unknown'}`)}
        action={
          <Button title={t('student.assessments.retry')} variant="secondary" onPress={reload} />
        }
      />
    );
  } else if (!enr) {
    body = (
      <EmptyState
        icon="info"
        title={t(`student.assessments.${home!.enrollment as 'noYear' | 'noEnrollment'}`)}
      />
    );
  } else {
    body = (
      <>
        {todo[0] ? (
          <Reveal index={2}>
            <OpenTest a={todo[0]} more={todo.length - 1} />
          </Reveal>
        ) : (
          <Reveal index={2}>
            <View style={[styles.allDone, { backgroundColor: colours.correctSoft }]}>
              <TileBurst
                moment="celebrationKid"
                count={10}
                radius={90}
                trigger={home?.submissions.length ?? 0}
              />
              <Icon name="sparkles" tone="correct" />
              <Text variant="label" tone="onCorrectSoft" style={styles.flex}>
                {t('student.home.allDone')}
              </Text>
            </View>
          </Reveal>
        )}

        <Reveal index={3}>
          <Text variant="heading" accessibilityRole="header" style={styles.section}>
            {t('student.home.subjects')}
          </Text>
        </Reveal>
        {subjects.length === 0 ? (
          <Reveal index={4}>
            <EmptyState icon="book" title={t('student.home.noSubjects')} />
          </Reveal>
        ) : (
          <View style={styles.grid}>
            {subjects.map((s, i) => (
              <Reveal
                key={s.id}
                index={4 + i}
                style={{ width: `${100 / cols}%`, padding: space.xs }}
              >
                <SubjectCard
                  subject={{
                    id: s.id,
                    name: s.name,
                    mastered: s.done,
                    total: Math.max(1, s.total),
                  }}
                  label={t('student.home.subjectA11y', {
                    subject: s.name,
                    count: s.done,
                    total: s.total,
                  })}
                  countLabel={t('student.home.subjectCount', { count: s.done, total: s.total })}
                  onPress={() =>
                    s.firstOpen ? router.push(`/tests/${s.firstOpen}`) : router.push('/tests')
                  }
                />
              </Reveal>
            ))}
          </View>
        )}

        <Reveal index={5 + subjects.length}>
          <Text variant="heading" accessibilityRole="header" style={styles.section}>
            {t('student.home.more')}
          </Text>
        </Reveal>
        <Reveal index={6 + subjects.length}>
          <View style={styles.quickGrid}>
            <QuickTile
              title={t('student.home.assessments')}
              note={
                todo.length
                  ? t('student.assessments.todoCount', { count: todo.length })
                  : t('student.home.assessmentsNote')
              }
              icon="clipboard"
              soft="accentSoft"
              fg="onAccentSoft"
              onPress={() => router.push('/tests')}
            />
            <QuickTile
              title={t('student.inbox.title')}
              note={t('student.inbox.subtitle')}
              icon="mail"
              soft="primarySoft"
              fg="onPrimarySoft"
              badge={
                unreadCount > 0 ? t('student.inbox.newCount', { count: unreadCount }) : undefined
              }
              onPress={() => router.push('/inbox')}
            />
            <QuickTile
              title={t('student.home.scores')}
              note={t('student.home.scoresNote')}
              icon="chart"
              soft="correctSoft"
              fg="onCorrectSoft"
              onPress={() => router.push('/results')}
            />
            <QuickTile
              title={t('student.home.attendance')}
              note={t('student.home.attendanceNote')}
              icon="calendar"
              soft="learningSoft"
              fg="onLearningSoft"
              onPress={() => router.push('/attendance')}
            />
          </View>
        </Reveal>
      </>
    );
  }

  return (
    <Screen header={<HomeHero home={home} firstName={firstName} />} {...nav}>
      {body}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.xs },
  banner: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md },
  bannerIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kicker: { fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
  startChip: {
    minHeight: 44,
    paddingHorizontal: space.lg,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  allDone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    borderRadius: 16,
  },
  section: { marginTop: space.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -space.xs },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  quickCell: { flexGrow: 1, flexBasis: 150 },
  quick: { padding: space.md, gap: space.xs, minHeight: 132 },
  quickTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.xs,
  },
  quickIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
