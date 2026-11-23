import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';

import { AppText } from './AppText';
import { duration } from './motion';

/**
 * Every screen's "nothing here yet" state: what is missing and what to do next.
 * Enters with a short fade (opacity only); skipped when the OS asks for less motion.
 * (Reanimated directly, not Moti: see DECISIONS #38.)
 */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <Animated.View
      entering={FadeIn.duration(duration.base).reduceMotion(ReduceMotion.System)}
      style={styles.box}
      accessibilityRole="summary"
    >
      <AppText variant="title">{title}</AppText>
      {body ? <AppText>{body}</AppText> : null}
      {action}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  box: {
    gap: 8,
    padding: 20,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#1b1d2a',
    backgroundColor: '#ffffff',
  },
});
