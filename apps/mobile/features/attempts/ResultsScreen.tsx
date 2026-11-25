// My scores: every submission of mine this year, newest first, plus attempts
// still waiting on this device. Score shows only once a teacher has marked it.
import { attemptKey, scorePercent, SUBMISSION_KIND } from '@school/core';
import { StyleSheet, View } from 'react-native';

import { useI18n } from '../../i18n';
import Animated from 'react-native-reanimated';

import {
  Badge,
  Button,
  Card,
  EmptyState,
  Icon,
  Meter,
  Reveal,
  Screen,
  SkeletonLines,
  Text,
  TileBurst,
  useTheme,
} from '../../ui';
import { useEnterStyle } from '../../ui/motion';
import { hueForSubject, space, subjectHues, type ColourRoles } from '../../ui/tokens';
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
      <Screen header={header}>
        <SkeletonLines lines={4} />
      </Screen>
    );
  }
  if (state.status === 'error') {
    return (
      <Screen header={header}>
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
      <Screen header={header}>
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
      <Screen header={header}>
        <EmptyState icon="star" title={t('student.results.empty')} />
      </Screen>
    );
  }

  return (
    <Screen header={header}>
      <Reveal index={0}>
        <ScoreSummary overall={overall} markedCount={marked.length} />
      </Reveal>
      {home.fromCache ? (
        <Badge
          icon="cloudOff"
          label={t('student.assessments.offline')}
          tone="accent"
          style={styles.start}
        />
      ) : null}
      <View style={styles.list}>
        {waiting.map((a, i) => (
          <Reveal key={`w-${a.id}`} index={i + 1}>
            <ResultCard
              title={a.title}
              subject={a.subjectName}
              hueKey={a.subjectId ?? a.subjectName ?? a.id}
              badge={<Badge icon="cloudOff" label={t('student.results.notSent')} tone="accent" />}
            />
          </Reveal>
        ))}
        {subs.map((s, i) => {
          const a = byId.get(s.assessmentId);
          const pct = scorePercent(s.score, a?.totalMarks ?? null);
          const label =
            s.score == null
              ? t('student.results.waiting')
              : a?.totalMarks
                ? t('student.results.score', { score: s.score, total: a.totalMarks })
                : String(s.score);
          return (
            <Reveal key={s.id} index={waiting.length + i + 1}>
              <ResultCard
                title={a?.title ?? t('student.results.unknownTest')}
                subject={[
                  a?.subjectName,
                  pct != null ? t('student.results.percent', { percent: pct }) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                hueKey={a?.subjectId ?? a?.subjectName ?? s.id}
                pct={pct}
                badge={<Badge label={label} tone={s.score == null ? 'neutral' : 'correct'} />}
              />
            </Reveal>
          );
        })}
      </View>
    </Screen>
  );
}

/** Band tone for a percentage: words + shape elsewhere, colour only reinforces. */
function bandTone(pct: number): keyof ColourRoles {
  return pct >= 80 ? 'correct' : pct >= 50 ? 'learning' : 'weak';
}

/** The big number at the top (wireframe "Result"): pops in, celebrates 80 %+ in full tier. */
function ScoreSummary({ overall, markedCount }: { overall: number | null; markedCount: number }) {
  const { t } = useI18n();
  const { colours, scheme } = useTheme();
  const pop = useEnterStyle('scoreReveal', true, { scaleFrom: 0.7 });
  const tone =
    overall == null
      ? 'surfaceAlt'
      : overall >= 80
        ? 'correctSoft'
        : overall >= 50
          ? 'learningSoft'
          : 'weakSoft';
  return (
    <View
      style={[
        styles.summary,
        {
          backgroundColor: colours[tone],
          borderColor: scheme === 'dark' ? colours.borderStrong : colours.ink,
        },
      ]}
    >
      {overall != null && overall >= 80 ? (
        <TileBurst moment="scoreReveal" count={16} radius={140} />
      ) : null}
      {overall != null ? (
        <>
          <Text variant="caption" style={styles.kicker}>
            {t('student.results.overallLabel')}
          </Text>
          <Animated.View style={pop}>
            <Text variant="display" style={styles.big} accessibilityRole="header">
              {t('student.results.percent', { percent: overall })}
            </Text>
          </Animated.View>
          <Meter
            value={overall / 100}
            tone={bandTone(overall)}
            height={14}
            style={styles.summaryMeter}
          />
          <Text tone="textMuted">{t('student.results.markedCount', { count: markedCount })}</Text>
        </>
      ) : (
        <>
          <Icon name="timer" size={32} />
          <Text tone="textMuted" style={styles.centre}>
            {t('student.results.noneMarked')}
          </Text>
        </>
      )}
    </View>
  );
}

function ResultCard({
  title,
  subject,
  hueKey,
  pct,
  badge,
}: {
  title: string;
  subject?: string;
  hueKey: string;
  pct?: number | null;
  badge: React.ReactNode;
}) {
  const { colours, scheme } = useTheme();
  const hue = hueForSubject(hueKey);
  return (
    <Card>
      <View style={styles.cardRow}>
        <View
          style={[
            styles.dot,
            {
              backgroundColor: subjectHues[hue][scheme],
              borderColor: scheme === 'dark' ? colours.borderStrong : colours.ink,
            },
          ]}
        />
        <View style={styles.flex}>
          <Text variant="heading" numberOfLines={2}>
            {title}
          </Text>
          {subject ? (
            <Text variant="bodySm" tone="textMuted">
              {subject}
            </Text>
          ) : null}
        </View>
        {badge}
      </View>
      {pct != null ? <Meter value={pct / 100} tone={bandTone(pct)} /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  start: { alignSelf: 'flex-start', marginBottom: space.md },
  summary: {
    alignItems: 'center',
    gap: space.xs,
    padding: space.xl,
    borderRadius: 24,
    borderWidth: 2,
    overflow: 'hidden',
  },
  summaryMeter: { alignSelf: 'stretch', marginVertical: space.sm },
  kicker: { fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
  big: { fontSize: 64, lineHeight: 72, textAlign: 'center' },
  centre: { textAlign: 'center' },
  list: { gap: space.md },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  dot: { width: 20, height: 20, borderRadius: 6, borderWidth: 2, transform: [{ rotate: '45deg' }] },
  flex: { flex: 1 },
});
