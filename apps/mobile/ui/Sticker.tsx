import { useState, type ReactNode } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  View,
  type AccessibilityProps,
  type Insets,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated from 'react-native-reanimated';

import { useMotion, usePressMotion } from './motion';
import { useTheme } from './theme';
import { opacityLevels, stickerPressDepth, strokeWidth } from './tokens';

export type StickerDepth = keyof typeof stickerPressDepth | 'flat';

/** Focus ring: 3 px `focus` + 2 px offset (DESIGN_SYSTEM.md §5). */
export function useFocusRing() {
  const [focused, setFocused] = useState(false);
  const { colours } = useTheme();
  return {
    focusProps: { onFocus: () => setFocused(true), onBlur: () => setFocused(false) },
    ring: focused
      ? ({
          outlineColor: colours.focus,
          outlineWidth: 3,
          outlineOffset: 2,
          outlineStyle: 'solid',
        } as const)
      : null,
  };
}

/**
 * A pressable "sticker" (DESIGN_SYSTEM.md §1): 2 px outline plus a hard ink shadow
 * drawn as a separate static layer. Pressing moves only the face down into the
 * shadow (transform), so nothing re-lays-out and the shadow never moves. Staff
 * presentation and exam mode render flat (no sticker shadow).
 */
export function PressableSticker({
  onPress,
  onPressIn,
  disabled,
  busy,
  depth = 'sticker',
  radius,
  faceStyle,
  outlined = true,
  hitSlop,
  style,
  children,
  ...a11y
}: AccessibilityProps & {
  onPress?: () => void;
  /** Extra press-in hook (e.g. to start a pattern glide); feedback motion still runs. */
  onPressIn?: () => void;
  disabled?: boolean;
  /** Not pressable (e.g. loading) but not greyed out like `disabled`. */
  busy?: boolean;
  depth?: StickerDepth;
  radius: number;
  /** Face style; receives `pressed` so the off tier can still change colour. */
  faceStyle: (pressed: boolean) => StyleProp<ViewStyle>;
  outlined?: boolean;
  hitSlop?: Insets | number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const { colours, scheme, presentation } = useTheme();
  const { inExam, tier } = useMotion();
  const flat = depth === 'flat' || inExam || presentation === 'staff';
  const d = flat ? 0 : stickerPressDepth[depth];
  const press = usePressMotion(d);
  const { focusProps, ring } = useFocusRing();
  const outline = scheme === 'dark' ? colours.borderStrong : colours.ink;

  return (
    <Pressable
      {...a11y}
      {...focusProps}
      onPress={onPress}
      disabled={disabled || busy}
      hitSlop={hitSlop}
      onPressIn={() => {
        press.onPressIn();
        onPressIn?.();
      }}
      onPressOut={press.onPressOut}
      accessibilityState={{ disabled: Boolean(disabled), ...a11y.accessibilityState }}
      style={[{ paddingBottom: d, borderRadius: radius }, ring, disabled && styles.disabled, style]}
    >
      {({ pressed }) => (
        <>
          {d > 0 ? (
            <View
              style={[
                styles.shadow,
                { top: d, borderRadius: radius, backgroundColor: colours.ink },
              ]}
            />
          ) : null}
          <Animated.View
            style={[
              {
                borderRadius: radius,
                borderWidth: outlined ? strokeWidth.sticker : 0,
                borderColor: outline,
              },
              Platform.OS === 'ios' ? styles.continuous : null,
              faceStyle(pressed),
              // No movement available (off tier, exam, or a flat sticker in full tier, whose
              // press would translate by 0): the press still shows as an instant dim.
              pressed && (tier === 'off' || inExam || (d === 0 && tier === 'full'))
                ? styles.pressedStatic
                : null,
              press.style,
            ]}
          >
            {children}
          </Animated.View>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shadow: { position: 'absolute', start: 0, end: 0, bottom: 0 },
  continuous: { borderCurve: 'continuous' },
  disabled: { opacity: opacityLevels.disabled },
  pressedStatic: { opacity: opacityLevels.pressed },
});
