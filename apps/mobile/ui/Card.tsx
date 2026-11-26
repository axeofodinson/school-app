import type { ReactNode } from 'react';
import {
  StyleSheet,
  View,
  type AccessibilityProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { PressableSticker } from './Sticker';
import { useTheme } from './theme';
import { elevation, radiusFor, space } from './tokens';

/**
 * A surface for grouped content. Passive cards use the soft `card` shadow (a border in
 * dark mode, where soft shadows disappear); pressable cards are stickers.
 * Composition: put anything inside; the card only owns surface, radius and padding.
 */
export function Card({
  children,
  onPress,
  padded = true,
  style,
  ...a11y
}: AccessibilityProps & {
  children: ReactNode;
  onPress?: () => void;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colours, scheme, presentation } = useTheme();
  const r = radiusFor('lg', presentation);
  const pad = padded ? (presentation === 'kid' ? space.xl : space.lg) : 0;

  if (onPress) {
    return (
      <PressableSticker
        {...a11y}
        onPress={onPress}
        sound="tap"
        radius={r}
        accessibilityRole={a11y.accessibilityRole ?? 'button'}
        style={style}
        faceStyle={(pressed) => [
          styles.clip,
          { padding: pad, backgroundColor: pressed ? colours.surfaceAlt : colours.surface },
        ]}
      >
        {children}
      </PressableSticker>
    );
  }
  return (
    <View
      {...a11y}
      style={[
        styles.clip,
        {
          borderRadius: r,
          padding: pad,
          backgroundColor: colours.surface,
          boxShadow: scheme === 'light' ? elevation.card.light : undefined,
          borderWidth: scheme === 'dark' ? 1 : 0,
          borderColor: colours.border,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({ clip: { overflow: 'hidden', gap: space.sm } });
