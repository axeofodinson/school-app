// The end of a pre-reader paper. Full motion tier only (and never in an exam): a
// bouncy burst of stars (`celebrationKid`). Lite, off and exam mode get the same
// words and icon, standing still. Words always say what happened (saved / will send).
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useI18n } from '../../i18n';
import { Icon, Text, useTheme } from '../../ui';
import { useEnterStyle, useMotion } from '../../ui/motion';
import { space } from '../../ui/tokens';

const STARS = [
  { size: 40, dy: 0 },
  { size: 56, dy: -16 },
  { size: 72, dy: -28 },
  { size: 56, dy: -16 },
  { size: 40, dy: 0 },
];

function Burst() {
  const pop = useEnterStyle('celebrationKid', true, { scaleFrom: 0.6 });
  return (
    <Animated.View style={[styles.burst, pop]} accessible={false}>
      {STARS.map((s, i) => (
        <View key={i} style={{ transform: [{ translateY: s.dy }] }}>
          <Icon name="star" size={s.size} tone="accent" />
        </View>
      ))}
    </Animated.View>
  );
}

export function PreReaderDone({ queued, action }: { queued: boolean; action?: ReactNode }) {
  const { t } = useI18n();
  const { tier, inExam } = useMotion();
  const { colours } = useTheme();
  const celebrate = tier === 'full' && !inExam;
  return (
    <View style={styles.box} accessibilityRole="summary">
      {celebrate ? (
        <Burst />
      ) : (
        <View style={[styles.still, { backgroundColor: colours.primarySoft }]}>
          <Icon name="checkCircle" size={64} tone="onPrimarySoft" />
        </View>
      )}
      <Text variant="display" style={styles.center} accessibilityRole="header">
        {t('student.prereader.celebrate.title')}
      </Text>
      <Text style={styles.center} accessibilityLiveRegion="polite">
        {queued ? t('student.prereader.celebrate.queued') : t('student.prereader.celebrate.saved')}
      </Text>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', gap: space.lg, paddingVertical: space.xxl },
  burst: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, height: 112 },
  still: {
    width: 112,
    height: 112,
    borderRadius: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { textAlign: 'center' },
});
