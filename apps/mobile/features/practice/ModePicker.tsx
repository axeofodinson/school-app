// How to practise this topic: a practice set, smart review, retry the wrong ones,
// or drill one concept. Each mode is a big sticker card with its count; a mode
// with nothing to give says why instead of disappearing. Timer is optional and
// off by default (display only, never a success metric).
import { type PracticeMode } from '@school/core';
import { StyleSheet, View } from 'react-native';

import { useI18n } from '../../i18n';
import { Icon, Reveal, SegmentedControl, Text, useTheme, type IconName } from '../../ui';
import { PressableSticker } from '../../ui/Sticker';
import { radiusFor, space, subjectHues, type SubjectHue } from '../../ui/tokens';

function ModeCard({
  icon,
  hue,
  title,
  body,
  count,
  disabled,
  onPress,
}: {
  icon: IconName;
  hue: SubjectHue;
  title: string;
  body: string;
  count: number | null;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { colours, scheme, presentation } = useTheme();
  const outline = scheme === 'dark' ? colours.borderStrong : colours.ink;
  return (
    <PressableSticker
      onPress={onPress}
      disabled={disabled}
      radius={radiusFor('lg', presentation)}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${body}`}
      accessibilityState={{ disabled: Boolean(disabled) }}
      faceStyle={(pressed) => [
        styles.card,
        { backgroundColor: pressed ? colours.surfaceAlt : colours.surface },
      ]}
    >
      <View
        style={[
          styles.icon,
          {
            backgroundColor: disabled ? colours.surfaceAlt : subjectHues[hue][scheme],
            borderColor: outline,
          },
        ]}
      >
        <Icon name={icon} size={26} colour={colours.ink} />
      </View>
      <View style={styles.flex}>
        <Text variant="heading" tone={disabled ? 'textMuted' : 'text'}>
          {title}
        </Text>
        <Text variant="bodySm" tone="textMuted">
          {body}
        </Text>
      </View>
      {count !== null && !disabled ? (
        <View style={[styles.count, { borderColor: outline, backgroundColor: colours.surface }]}>
          <Text variant="label" script="latin">
            {String(count)}
          </Text>
        </View>
      ) : null}
    </PressableSticker>
  );
}

export function ModePicker({
  counts,
  concepts,
  hue,
  timer,
  onTimer,
  onStart,
}: {
  counts: { practice: number; review: number; retry: number; unseen: number };
  concepts: { id: string; title: string; count: number }[];
  hue: SubjectHue;
  timer: boolean;
  onTimer: (on: boolean) => void;
  onStart: (mode: PracticeMode, conceptId?: string) => void;
}) {
  const { t } = useI18n();
  const { colours, scheme, presentation } = useTheme();
  const outline = scheme === 'dark' ? colours.borderStrong : colours.ink;
  return (
    <View style={styles.wrap}>
      <Reveal index={1}>
        <ModeCard
          icon="pencil"
          hue={hue}
          title={t('student.practice.modes.practice')}
          body={
            counts.unseen
              ? t('student.practice.modes.practiceBody', { n: counts.unseen })
              : t('student.practice.modes.practiceAllSeen')
          }
          count={counts.practice}
          onPress={() => onStart('practice')}
        />
      </Reveal>
      <Reveal index={2}>
        <ModeCard
          icon="star"
          hue="sunflower"
          title={t('student.practice.modes.review')}
          body={
            counts.review
              ? t('student.practice.modes.reviewBody')
              : t('student.practice.modes.reviewEmpty')
          }
          count={counts.review}
          disabled={!counts.review}
          onPress={() => onStart('review')}
        />
      </Reveal>
      <Reveal index={3}>
        <ModeCard
          icon="replay"
          hue="coral"
          title={t('student.practice.modes.retry')}
          body={
            counts.retry
              ? t('student.practice.modes.retryBody')
              : t('student.practice.modes.retryEmpty')
          }
          count={counts.retry}
          disabled={!counts.retry}
          onPress={() => onStart('retry')}
        />
      </Reveal>

      {concepts.length > 1 ? (
        <Reveal index={4}>
          <View style={styles.section}>
            <Text variant="heading" accessibilityRole="header">
              {t('student.practice.modes.drill')}
            </Text>
            <Text variant="bodySm" tone="textMuted">
              {t('student.practice.modes.drillBody')}
            </Text>
            <View style={styles.chips}>
              {concepts.map((c) => (
                <PressableSticker
                  key={c.id}
                  onPress={() => onStart('drill', c.id)}
                  disabled={!c.count}
                  radius={radiusFor('md', presentation)}
                  depth="stickerSm"
                  accessibilityRole="button"
                  accessibilityLabel={t('student.practice.modes.drillOne', {
                    concept: c.title,
                    n: c.count,
                  })}
                  faceStyle={(pressed) => [
                    styles.chip,
                    {
                      backgroundColor: pressed ? subjectHues[hue][scheme] : colours.surface,
                      borderColor: outline,
                    },
                  ]}
                >
                  <Text variant="label" numberOfLines={1} tone={c.count ? 'text' : 'textMuted'}>
                    {c.title}
                  </Text>
                  <Text variant="bodySm" tone="textMuted" script="latin">
                    {String(c.count)}
                  </Text>
                </PressableSticker>
              ))}
            </View>
          </View>
        </Reveal>
      ) : null}

      <Reveal index={5}>
        <View style={styles.timerRow}>
          <Icon name="timer" size={20} tone="textMuted" />
          <Text variant="label" style={styles.flex}>
            {t('student.practice.timer')}
          </Text>
          <SegmentedControl
            segments={[
              { value: 'off', label: t('student.practice.timerOff') },
              { value: 'on', label: t('student.practice.timerOn') },
            ]}
            value={timer ? 'on' : 'off'}
            onChange={(v) => onTimer(v === 'on')}
            accessibilityLabel={t('student.practice.timer')}
          />
        </View>
      </Reveal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
  },
  icon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-4deg' }],
  },
  count: {
    minWidth: 40,
    height: 40,
    paddingHorizontal: 8,
    borderRadius: 20,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1 },
  section: { gap: space.sm, marginTop: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderWidth: 0,
    maxWidth: 320,
  },
  timerRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm },
});
