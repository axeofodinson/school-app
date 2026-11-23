import {
  StyleSheet,
  View,
  type DimensionValue,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated from 'react-native-reanimated';

import { useI18n } from '../i18n';
import { usePulse } from './motion';
import { useTheme } from './theme';
import { radius, space } from './tokens';

/** A placeholder block. Slow opacity pulse in the full tier only; static otherwise. */
export function Skeleton({
  width = '100%',
  height = 16,
  rounded = radius.sm,
  style,
}: {
  width?: DimensionValue;
  height?: number;
  rounded?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { colours } = useTheme();
  const pulse = usePulse('skeleton', true);
  return (
    <Animated.View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[
        { width, height, borderRadius: rounded, backgroundColor: colours.surfaceAlt },
        pulse,
        style,
      ]}
    />
  );
}

/** A few text-line placeholders, announced once as "Loading…". */
export function SkeletonLines({
  lines = 3,
  style,
}: {
  lines?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { t } = useI18n();
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t('common.loading')}
      style={[styles.lines, style]}
    >
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} width={i === lines - 1 ? '60%' : '100%'} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({ lines: { gap: space.sm } });
