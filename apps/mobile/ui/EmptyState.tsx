import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Icon, type IconName } from './Icon';
import { useEnterStyle } from './motion';
import { Text } from './Text';
import { useTheme } from './theme';
import { space } from './tokens';

const artSize = { kid: 160, student: 96, staff: 64 } as const;

/**
 * Every screen's "nothing here yet" state (CLAUDE.md): art, what is missing, what to
 * do next, and at most one action. Enters with the `emptyState` moment (rise 8 + fade).
 * The art is an icon in a soft disc until the spot illustrations exist (§1.2).
 */
export function EmptyState({
  title,
  body,
  icon = 'book',
  action,
}: {
  title: string;
  body?: string;
  icon?: IconName;
  action?: ReactNode;
}) {
  const { colours, presentation } = useTheme();
  const enter = useEnterStyle('emptyState', true, { translateY: 8 });
  const art = artSize[presentation];
  return (
    <Animated.View style={[styles.box, enter]} accessibilityRole="summary">
      <View
        style={[
          styles.art,
          { width: art, height: art, borderRadius: art / 2, backgroundColor: colours.primarySoft },
        ]}
      >
        <Icon name={icon} size={Math.round(art * 0.42)} tone="onPrimarySoft" />
      </View>
      <Text variant="heading" accessibilityRole="header" style={styles.center}>
        {title}
      </Text>
      {body ? (
        <Text tone="textMuted" style={styles.center}>
          {body}
        </Text>
      ) : null}
      {action}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.xl,
    paddingHorizontal: space.lg,
  },
  art: { alignItems: 'center', justifyContent: 'center' },
  center: { textAlign: 'center' },
});
