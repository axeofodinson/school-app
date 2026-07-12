// QuestButton — the chunky game button. A raised face on a hard dark edge;
// pressing physically pushes the face down onto the edge (the classic
// pixel-game "click"), which reads as satisfying without any animation
// runtime cost: it's just a margin swap between two plain Views, plus the
// total height never changes so nothing below it reflows.
//
// The label must already be a localized string from i18n (same contract as
// the base Button). Label renders in the display face (pixel font in English,
// Nastaliq Bold in Urdu) via <Text> so RTL/font handling stays centralized.
import { Pressable, ActivityIndicator, View, StyleSheet } from 'react-native';

import Text from '../Text';
import { quest, px, spacing, displayText } from '../../theme/quest';

const VARIANTS = {
  primary: { face: quest.green, edge: quest.greenEdge, outline: quest.greenEdge, text: quest.cream },
  gold: { face: quest.gold, edge: quest.goldEdge, outline: quest.goldEdge, text: quest.ink },
  sky: { face: quest.sky, edge: quest.skyEdge, outline: quest.skyEdge, text: quest.cream },
  danger: { face: quest.red, edge: quest.redEdge, outline: quest.redEdge, text: quest.cream },
  // ghost: parchment face + ink outline — for secondary actions (Back, Retry)
  ghost: { face: quest.surface, edge: quest.outline, outline: quest.outline, text: quest.ink },
};

export default function QuestButton({
  label,
  onPress,
  variant = 'primary',
  size = 'md', // 'md' | 'lg' | 'sm'
  loading = false,
  disabled = false,
  style,
  ...rest
}) {
  const v = VARIANTS[variant] ?? VARIANTS.primary;
  const isDisabled = disabled || loading;
  const fontSize = size === 'lg' ? 20 : size === 'sm' ? 14 : 16;
  const minHeight = size === 'lg' ? 56 : size === 'sm' ? 38 : 48;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={style}
      {...rest}
    >
      {({ pressed }) => {
        const down = pressed && !isDisabled;
        return (
          <View
            style={{
              backgroundColor: down ? 'transparent' : v.edge,
              borderRadius: px.radius + 1,
              opacity: isDisabled ? 0.55 : 1,
            }}
          >
            <View
              style={[
                styles.face,
                {
                  backgroundColor: v.face,
                  borderColor: v.outline,
                  minHeight,
                  // Pressed: the face drops onto the edge; total height constant.
                  marginBottom: down ? 0 : px.edge,
                  marginTop: down ? px.edge : 0,
                },
              ]}
            >
              {loading ? (
                <ActivityIndicator color={v.text} />
              ) : (
                <Text align="center" color={v.text} style={displayText(fontSize)}>
                  {label}
                </Text>
              )}
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
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
