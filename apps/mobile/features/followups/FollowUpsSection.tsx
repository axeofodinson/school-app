// "Do these first" on Prepare (wireframe 7.2): open follow-ups, exam → diagnostic →
// teacher → revision, each with its next steps (read again → another way after two
// rounds → a short set of fresh questions). Cleared ones dim to Done and leave on a
// later visit; a relieved one says it was unlocked. Never forced open on launch.
import {
  followUpSteps,
  FOLLOW_UP_SET_SIZE,
  MASTERY_DEFAULTS,
  type PrepareModel,
} from '@school/core';
import { useRouter, type Href } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useI18n } from '../../i18n';
import { Badge, Button, Card, Icon, Reveal, Text, useTheme } from '../../ui';
import { useEnterStyle } from '../../ui/motion';
import { MosaicMark } from '../../ui/MorphTile';
import { PatternFill } from '../../ui/Pattern';
import { hueForSubject, space, subjectHues } from '../../ui/tokens';
import type { FollowUpItem } from './api';

const REASON: Record<FollowUpItem['kind'], string> = {
  exam: 'student.followUps.why.exam',
  diagnostic: 'student.followUps.why.diagnostic',
  teacher: 'student.followUps.why.teacher',
  revision: 'student.followUps.why.revision',
};

function useTitles() {
  const { locale } = useI18n();
  const ur = locale === 'ur';
  return {
    concept: (f: FollowUpItem) => (ur ? f.conceptUr : null) || f.conceptEn,
    topic: (f: FollowUpItem) => (ur ? f.topicUr : null) || f.topicEn,
  };
}

/** Round dots: how many tries so far out of the relief limit (never a countdown to failure). */
function Rounds({ n }: { n: number }) {
  const { t } = useI18n();
  const { colours } = useTheme();
  const max = MASTERY_DEFAULTS.reliefRounds;
  if (n <= 0) return null;
  return (
    <View
      style={styles.dots}
      accessible
      accessibilityLabel={t('student.followUps.roundA11y', { n: n + 1 })}
    >
      {Array.from({ length: max }, (_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            {
              borderColor: colours.ink,
              backgroundColor: i < n ? colours.ink : i === n ? colours.accent : 'transparent',
            },
          ]}
        />
      ))}
      <Text variant="bodySm" tone="textMuted">
        {t('student.followUps.round', { n: n + 1 })}
      </Text>
    </View>
  );
}

function OpenRow({ f, root, first }: { f: FollowUpItem; root: string; first: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const titles = useTitles();
  const { colours, scheme } = useTheme();
  const hue = hueForSubject(f.subjectId);
  const outline = scheme === 'dark' ? colours.borderStrong : colours.ink;
  const steps = followUpSteps(f);
  const topic = f.topicId;
  const go = (path: string) => router.push(path as Href);
  const practise = () =>
    topic && go(`${root}/${topic}/practice?mode=followup&followUp=${f.id}&concept=${f.conceptId}`);
  return (
    <Card padded={false}>
      <View style={styles.open}>
        <View style={styles.rowTop}>
          <View
            style={[
              styles.swatch,
              { backgroundColor: subjectHues[hue][scheme], borderColor: outline },
            ]}
          >
            <Icon
              name={f.kind === 'exam' ? 'clipboard' : f.kind === 'revision' ? 'replay' : 'warning'}
              size={20}
              colour={colours.ink}
            />
          </View>
          <View style={styles.flex}>
            <Text variant="heading" numberOfLines={2}>
              {titles.concept(f)}
            </Text>
            <Text variant="bodySm" tone="textMuted" numberOfLines={1}>
              {[f.subjectName, titles.topic(f)].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <Badge
            label={t(REASON[f.kind] as 'student.followUps.why.exam')}
            tone={f.kind === 'exam' || f.kind === 'diagnostic' ? 'weak' : 'learning'}
          />
        </View>
        <Rounds n={f.rounds} />
        {f.rounds >= 2 ? (
          <Text variant="bodySm">{t('student.followUps.anotherWayHint')}</Text>
        ) : null}
        <View style={styles.actions}>
          {topic && steps.includes('another') ? (
            <Button
              title={t('student.followUps.anotherWay')}
              icon="lightbulb"
              variant="secondary"
              size="sm"
              onPress={() => go(`${root}/${topic}`)}
            />
          ) : null}
          {topic ? (
            <Button
              title={t('student.followUps.readAgain')}
              icon="book"
              variant={steps[0] === 'read' ? 'secondary' : 'ghost'}
              size="sm"
              onPress={() => go(`${root}/${topic}/read`)}
            />
          ) : null}
          <Button
            title={t('student.followUps.practise', { count: FOLLOW_UP_SET_SIZE })}
            icon="pencil"
            size="sm"
            disabled={!topic}
            onPress={practise}
            accessibilityHint={first ? t('student.followUps.firstHint') : undefined}
          />
        </View>
      </View>
    </Card>
  );
}

function DoneRow({ f, index }: { f: FollowUpItem; index: number }) {
  const { t } = useI18n();
  const titles = useTitles();
  const { colours } = useTheme();
  const style = useEnterStyle('followUpCleared', true, {
    translateX: 12,
    scaleFrom: 0.96,
    delay: Math.min(index, 6) * 45,
  });
  const relieved = f.status === 'relieved';
  const byTeacher = (f.closeReason ?? '').startsWith('teacher');
  return (
    <Animated.View style={[styles.done, { borderColor: colours.border }, style]}>
      <Icon
        name={relieved ? 'lockOpen' : 'checkCircle'}
        tone={relieved ? 'textMuted' : 'correct'}
      />
      <View style={styles.flex}>
        <Text tone="textMuted" numberOfLines={1}>
          {titles.concept(f)}
        </Text>
      </View>
      <Text variant="bodySm" tone="textMuted">
        {t(
          relieved
            ? byTeacher
              ? 'student.followUps.unlockedTeacher'
              : 'student.followUps.unlockedAuto'
            : 'student.followUps.done',
        )}
      </Text>
    </Animated.View>
  );
}

/** "We unlocked this for you": automatic relief, said plainly (never a trap). */
function Unlocked({ auto, teacher }: { auto: number; teacher: number }) {
  const { t } = useI18n();
  const { colours } = useTheme();
  const style = useEnterStyle('gateUnlocked', true, { scaleFrom: 0.94 });
  if (!auto && !teacher) return null;
  return (
    <Animated.View style={[styles.unlocked, { backgroundColor: colours.primarySoft }, style]}>
      <Icon name="lockOpen" tone="onPrimarySoft" />
      <Text tone="onPrimarySoft" style={styles.flex}>
        {t(auto ? 'student.followUps.unlockedNote' : 'student.followUps.unlockedTeacherNote')}
      </Text>
    </Animated.View>
  );
}

export function FollowUpsSection({
  model,
  items,
  root = '/lesson',
}: {
  model: PrepareModel;
  /** The same follow-ups with titles, by id. */
  items: ReadonlyMap<string, FollowUpItem>;
  root?: string;
}) {
  const { t } = useI18n();
  const { colours, scheme } = useTheme();
  const open = model.doFirst.map((f) => items.get(f.id)!).filter(Boolean);
  const recent = model.recent.map((f) => items.get(f.id)!).filter(Boolean);
  const outline = scheme === 'dark' ? colours.borderStrong : colours.ink;

  if (!open.length) {
    return (
      <View style={styles.wrap}>
        <Reveal index={1}>
          <View
            style={[
              styles.clear,
              { backgroundColor: subjectHues.mint[scheme], borderColor: outline },
            ]}
          >
            <PatternFill name="hexFlower" animated />
            <View
              style={[styles.badge, { backgroundColor: colours.surface, borderColor: outline }]}
            >
              <MosaicMark size={30} colour={colours.ink} fill={colours.surface} />
            </View>
            <Text variant="heading" tone="ink" style={styles.centre} accessibilityRole="header">
              {t('student.followUps.clearTitle')}
            </Text>
            <Text tone="ink" style={styles.centre}>
              {t('student.followUps.clearBody')}
            </Text>
          </View>
        </Reveal>
        <Unlocked auto={model.autoUnlocked} teacher={model.teacherUnlocked} />
        {recent.map((f, i) => (
          <DoneRow key={f.id} f={f} index={i} />
        ))}
      </View>
    );
  }

  const subjects = [
    ...new Set(open.filter((f) => f.kind === 'diagnostic').map((f) => f.subjectName)),
  ].filter(Boolean);
  return (
    <View style={styles.wrap}>
      <Reveal index={1}>
        <View style={styles.head}>
          <Text variant="heading" accessibilityRole="header" style={styles.flex}>
            {t('student.followUps.title', { count: open.length })}
          </Text>
          <Badge label={String(open.length)} tone="weak" icon="warning" />
        </View>
      </Reveal>
      {open.map((f, i) => (
        <Reveal key={f.id} index={Math.min(i + 2, 8)}>
          <OpenRow f={f} root={root} first={i === 0} />
        </Reveal>
      ))}
      <Reveal index={Math.min(open.length + 2, 9)}>
        <View style={[styles.gateNote, { backgroundColor: colours.accentSoft }]}>
          <Icon name="lock" tone="onAccentSoft" size={18} />
          <Text variant="bodySm" tone="onAccentSoft" style={styles.flex}>
            {model.examBlocks
              ? t('student.followUps.gateExam')
              : subjects.length
                ? t('student.followUps.gateSubject', { subjects: subjects.join(', ') })
                : t('student.followUps.gateNone')}
          </Text>
        </View>
      </Reveal>
      <Unlocked auto={model.autoUnlocked} teacher={model.teacherUnlocked} />
      {recent.map((f, i) => (
        <DoneRow key={f.id} f={f} index={i} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  flex: { flex: 1 },
  centre: { textAlign: 'center' },
  open: { padding: space.md, gap: space.sm },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  swatch: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-4deg' }],
  },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 3,
    borderWidth: 1.5,
    transform: [{ rotate: '45deg' }],
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, justifyContent: 'flex-end' },
  done: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  unlocked: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    borderRadius: 14,
  },
  gateNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    borderRadius: 14,
  },
  clear: {
    overflow: 'hidden',
    alignItems: 'center',
    gap: space.sm,
    padding: space.xl,
    borderRadius: 24,
    borderWidth: 2,
  },
  badge: {
    width: 64,
    height: 64,
    borderRadius: 18,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-6deg' }],
  },
});
