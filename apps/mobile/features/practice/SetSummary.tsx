// End of a set: the score pops in (`scoreReveal`, with a mosaic tile burst at 80 %+
// in the full tier), one tile per question sets into a strip (`listEnter` cascade),
// then what was understood, by concept, weakest first, each with "Drill this".
// No streaks, no time spent (principle 10): only what the learner now knows.
import { type ConceptSummary, type PracticeAnswer } from '@school/core';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useI18n } from '../../i18n';
import {
  Button,
  Card,
  Icon,
  Meter,
  Reveal,
  SyncStatusPill,
  Text,
  TileBurst,
  useTheme,
  type SyncStatus,
} from '../../ui';
import { useEnterStyle, useReveal } from '../../ui/motion';
import { radius, space, subjectHues, type SubjectHue } from '../../ui/tokens';

function ResultTile({
  index,
  answer,
  hue,
  label,
}: {
  index: number;
  answer: PracticeAnswer;
  hue: SubjectHue;
  label: string;
}) {
  const { colours, scheme } = useTheme();
  const enter = useReveal(Math.min(index, 8), 10);
  const outline = scheme === 'dark' ? colours.borderStrong : colours.ink;
  return (
    // The cascade moves the outer view; the tilt stays on the inner one.
    <Animated.View accessible accessibilityLabel={label} style={enter}>
      <View
        style={[
          styles.tile,
          {
            borderColor: outline,
            backgroundColor: answer.correct ? subjectHues[hue][scheme] : colours.wrongSoft,
            transform: [{ rotate: index % 2 ? '3deg' : '-3deg' }],
          },
        ]}
      >
        <Icon
          name={answer.correct ? 'check' : 'close'}
          size={18}
          colour={answer.correct ? colours.ink : colours.wrong}
        />
        {answer.flagged ? (
          <View style={[styles.flagDot, { backgroundColor: colours.accent }]} />
        ) : null}
      </View>
    </Animated.View>
  );
}

export function SetSummary({
  answers,
  byConcept,
  conceptTitle,
  hue,
  sync,
  pending,
  onRetrySync,
  onRetryWrong,
  onDrill,
  onAnother,
  onDone,
}: {
  answers: PracticeAnswer[];
  byConcept: ConceptSummary[];
  conceptTitle: (id: string | null) => string;
  hue: SubjectHue;
  sync: SyncStatus;
  pending: number;
  onRetrySync: () => void;
  onRetryWrong: (() => void) | null;
  onDrill: (conceptId: string) => void;
  onAnother: () => void;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const { colours, presentation } = useTheme();
  const right = answers.filter((a) => a.correct).length;
  const total = answers.length;
  const share = total ? right / total : 0;
  const pop = useEnterStyle('scoreReveal', true, { scaleFrom: 0.7 });
  const wrong = total - right;
  const flagged = answers.filter((a) => a.flagged).length;
  const headline =
    share >= 0.8
      ? 'student.practice.summary.great'
      : share >= 0.5
        ? 'student.practice.summary.good'
        : 'student.practice.summary.keepGoing';

  return (
    <View style={styles.wrap}>
      <Card>
        <View style={styles.scoreBox}>
          <TileBurst
            moment={presentation === 'kid' ? 'celebrationKid' : 'celebrationMastery'}
            trigger={share >= 0.8 ? `${right}/${total}` : 0}
            count={share >= 0.8 ? 18 : 0}
          />
          <Animated.View style={[styles.score, pop]}>
            <Text variant="display" script="latin" accessibilityRole="header">
              {t('student.practice.summary.score', { right, total })}
            </Text>
          </Animated.View>
          <Text variant="heading" style={styles.centre}>
            {t(headline)}
          </Text>
          <View style={styles.tiles} accessibilityRole="list">
            {answers.map((a, i) => (
              <ResultTile
                key={a.questionId}
                index={i}
                answer={a}
                hue={hue}
                label={t(
                  a.correct
                    ? 'student.practice.summary.tileRight'
                    : 'student.practice.summary.tileWrong',
                  {
                    n: i + 1,
                  },
                )}
              />
            ))}
          </View>
          <View style={styles.syncRow}>
            <SyncStatusPill status={sync} pending={pending} onRetry={onRetrySync} />
            <Text variant="bodySm" tone="textMuted" style={styles.flexShrink}>
              {t(pending ? 'student.practice.summary.willSend' : 'student.practice.summary.saved')}
            </Text>
          </View>
        </View>
      </Card>

      <Reveal index={2}>
        <View style={styles.actions}>
          {onRetryWrong ? (
            <Button
              title={t('student.practice.summary.retryWrong', { n: wrong })}
              icon="replay"
              size="lg"
              onPress={onRetryWrong}
            />
          ) : null}
          <Button
            title={t('student.practice.summary.another')}
            icon="pencil"
            variant={onRetryWrong ? 'secondary' : 'primary'}
            size="lg"
            onPress={onAnother}
          />
        </View>
      </Reveal>

      {byConcept.length ? (
        <Reveal index={3}>
          <View style={styles.section}>
            <Text variant="heading" accessibilityRole="header">
              {t('student.practice.summary.byConcept')}
            </Text>
            {byConcept.map((c) => {
              const s = c.right / c.total;
              const weak = s < 0.6;
              return (
                <Card key={c.conceptId ?? '-'}>
                  <View style={styles.conceptRow}>
                    <View style={styles.flex}>
                      <Text variant="label" numberOfLines={2}>
                        {conceptTitle(c.conceptId)}
                      </Text>
                      <Text variant="bodySm" tone="textMuted">
                        {t('student.practice.summary.conceptScore', {
                          right: c.right,
                          total: c.total,
                        })}
                      </Text>
                    </View>
                    {weak && c.conceptId ? (
                      <Button
                        title={t('student.practice.summary.drill')}
                        variant="secondary"
                        size="sm"
                        icon="replay"
                        onPress={() => onDrill(c.conceptId!)}
                      />
                    ) : (
                      <Icon name="checkCircle" size={22} tone="correct" />
                    )}
                  </View>
                  <Meter value={s} tone={weak ? 'wrong' : 'correct'} height={10} />
                </Card>
              );
            })}
          </View>
        </Reveal>
      ) : null}

      {flagged ? (
        <Reveal index={4}>
          <View style={[styles.note, { backgroundColor: colours.accentSoft }]}>
            <Icon name="flag" size={18} colour={colours.accent} />
            <Text variant="bodySm" style={styles.flex}>
              {t('student.practice.summary.flagged', { n: flagged })}
            </Text>
          </View>
        </Reveal>
      ) : null}

      <Reveal index={5}>
        <Button title={t('student.practice.summary.done')} variant="ghost" onPress={onDone} />
      </Reveal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.lg },
  scoreBox: { alignItems: 'center', gap: space.md, paddingVertical: space.md },
  score: { alignItems: 'center' },
  centre: { textAlign: 'center' },
  tiles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: space.sm,
    maxWidth: 420,
  },
  tile: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flagDot: { position: 'absolute', top: -5, end: -5, width: 12, height: 12, borderRadius: 6 },
  syncRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  actions: { gap: space.sm },
  section: { gap: space.sm },
  conceptRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.sm },
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
  },
});
