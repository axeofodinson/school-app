// QuestField — the pixel-style text input: parchment face, chunky outline,
// green "lit" border when focused. Mirrors the base TextField's contract
// (label/placeholder/error already localized; direction- and font-aware) so
// screens can swap without touching logic.
import { useState } from 'react';
import { View, TextInput, StyleSheet } from 'react-native';

import Text from '../Text';
import { quest, px, spacing } from '../../theme/quest';
import { localeFont } from '../../theme/fonts';
import { isRTL } from '../../i18n';

export default function QuestField({
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
        <Text variant="label" color={quest.ink} style={styles.label}>
          {label}
        </Text>
      ) : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={quest.faint}
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
        <Text variant="caption" color={quest.red} style={styles.error}>
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
    minHeight: 52,
    borderWidth: px.border,
    borderColor: quest.outline,
    borderRadius: px.radius,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 18,
    color: quest.ink,
    backgroundColor: quest.surface,
  },
  inputFocused: { borderColor: quest.green },
  inputError: { borderColor: quest.red },
  error: { marginTop: spacing.xs },
});
