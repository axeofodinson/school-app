// Themed text input — direction- and font-aware, with an optional label and
// inline error. The `label`, `placeholder`, and `error` passed in must already
// be localized strings from i18n.
import { useState } from 'react';
import { View, TextInput, StyleSheet } from 'react-native';

import Text from './Text';
import { colors, spacing } from '../theme/colors';
import { localeFont } from '../theme/fonts';
import { isRTL } from '../i18n';

export default function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  style,
  ...rest
}) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.wrap, style]}>
      {label ? (
        <Text variant="label" style={styles.label}>
          {label}
        </Text>
      ) : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          styles.input,
          {
            fontFamily: localeFont(),
            textAlign: isRTL ? 'right' : 'left',
            writingDirection: isRTL ? 'rtl' : 'ltr',
          },
          focused && styles.inputFocused,
          error && styles.inputError,
        ]}
        {...rest}
      />
      {error ? (
        <Text variant="caption" color={colors.danger} style={styles.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  label: { marginBottom: spacing.xs },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.bg,
  },
  inputFocused: { borderColor: colors.primary },
  inputError: { borderColor: colors.danger },
  error: { marginTop: spacing.xs },
});
