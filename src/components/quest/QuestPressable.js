// QuestPressable — the raised, press-down panel as a generic pressable: same
// physical "push it into the ground" feel as QuestButton, but for arbitrary
// content (home tiles, answer options, list rows). Margin-swap press effect,
// constant total height, zero animation runtime.
import { Pressable, View, StyleSheet } from 'react-native';

import { quest, px, spacing } from '../../theme/quest';

export default function QuestPressable({
  children,
  onPress,
  face = quest.surface,
  edge = quest.outline,
  outline = quest.outline,
  disabled = false,
  padded = true,
  style, // outer (margins, width)
  faceStyle, // inner (layout of children)
  ...rest
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      style={style}
      {...rest}
    >
      {({ pressed }) => {
        const down = pressed && !disabled;
        return (
          <View
            style={{
              backgroundColor: down ? 'transparent' : edge,
              borderRadius: px.radius + 1,
              opacity: disabled ? 0.55 : 1,
            }}
          >
            <View
              style={[
                styles.face,
                {
                  backgroundColor: face,
                  borderColor: outline,
                  marginBottom: down ? 0 : px.edge,
                  marginTop: down ? px.edge : 0,
                },
                padded && styles.padded,
                faceStyle,
              ]}
            >
              {children}
            </View>
          </View>
        );
      }}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  face: {
    borderWidth: px.border,
    borderRadius: px.radius,
  },
  padded: {
    padding: spacing.md,
  },
});
