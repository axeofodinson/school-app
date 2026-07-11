// Themed Button — reusable pressable built on the themed Text primitive.
//
// Direction-aware (label centers; content row flips under RTL via I18nManager),
// font-aware (label uses the locale font through <Text>), plain visuals for now.
// The `label` passed in must already be a localized string from i18n.
import { Pressable, ActivityIndicator, StyleSheet } from 'react-native';

import Text from './Text';
import { colors, spacing } from '../theme/colors';

export default function Button({
  label,
  onPress,
  variant = 'primary', // 'primary' | 'secondary'
  loading = false,
  disabled = false,
  style,
  ...rest
}) {
  const isPrimary = variant === 'primary';
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        isPrimary ? styles.primary : styles.secondary,
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? colors.primaryText : colors.primary} />
      ) : (
        <Text
          variant="label"
          align="center"
          color={isPrimary ? colors.primaryText : colors.primary}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.lg,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {
    backgroundColor: colors.primary,
  },
  secondary: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  disabled: {
    backgroundColor: colors.disabled,
    borderColor: colors.disabled,
  },
  pressed: {
    opacity: 0.85,
  },
});
