import { useEffect, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { useI18n } from '../i18n';
import { animateTo, useMoment } from './motion';
import { useTheme } from './theme';
import { radius, type ColourRoles } from './tokens';

/**
 * A chunky progress bar (wireframe "Result: by topic"): ink-outlined track, coloured
 * fill. The fill is full width and slides in from the start edge (`progressBar`:
 * translateX inside an overflow-hidden track, mirrored in RTL); lite fades, off is
 * instant. Decorative to screen readers: always show the number next to it.
 */
export function Meter({
  value,
  tone = 'primary',
  height = 12,
  style,
}: {
  /** 0..1 */
  value: number;
  tone?: keyof ColourRoles;
  height?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { colours, scheme } = useTheme();
  const { isRTL } = useI18n();
  const b = useMoment('progressBar');
  const [w, setW] = useState(0);
  const v = Math.max(0, Math.min(1, value));
  const p = useSharedValue(b.kind === 'none' ? v : 0);
  const slides = b.kind !== 'none' && b.kind !== 'lottie' && b.props.includes('translateX');

  useEffect(() => {
    p.set(animateTo(b, v));
  }, [v, b.kind, p]); // eslint-disable-line react-hooks/exhaustive-deps

  const fill = useAnimatedStyle(() => {
    const shown = slides ? p.get() : v;
    const dx = -(1 - shown) * w;
    return {
      opacity: slides ? 1 : Math.min(1, p.get() / Math.max(v, 0.0001)),
      transform: [{ translateX: isRTL ? -dx : dx }],
    };
  });

  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={[
        styles.track,
        {
          height,
          borderRadius: radius.sm,
          backgroundColor: colours.surfaceAlt,
          borderColor: scheme === 'dark' ? colours.borderStrong : colours.ink,
        },
        style,
      ]}
    >
      {w > 0 ? (
        <Animated.View
          style={[StyleSheet.absoluteFill, { backgroundColor: colours[tone] }, fill]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({ track: { overflow: 'hidden', borderWidth: 2 } });
