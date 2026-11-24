import { useState, type ComponentRef, type Ref } from 'react';
import {
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { useI18n } from '../i18n';
import { Icon } from './Icon';
import { Text } from './Text';
import { useTheme } from './theme';
import {
  isolateLtrRuns,
  radiusFor,
  scriptOf,
  space,
  strokeWidth,
  textMetrics,
  type Script,
} from './tokens';

/** What a TextField ref points at (the native input: focus(), blur()). */
export type TextFieldHandle = ComponentRef<typeof TextInput>;

export type TextFieldProps = Omit<TextInputProps, 'style'> & {
  label: string;
  helper?: string;
  error?: string;
  /** Script of what is typed. Admission numbers, emails, PINs: 'latin'. Default: UI language. */
  script?: Script;
  style?: StyleProp<ViewStyle>;
  /** React 19: a plain prop. Lets a form move focus (e.g. to a required reason). */
  ref?: Ref<TextFieldHandle>;
};

/**
 * Labelled text input. The label is always visible (no placeholder-as-label), the
 * height grows with the font (Nastaliq needs more), and errors show an icon + text,
 * never colour alone.
 */
export function TextField({
  label,
  helper,
  error,
  script,
  style,
  onFocus,
  onBlur,
  placeholder,
  ref,
  accessibilityLabel,
  ...input
}: TextFieldProps) {
  const { isRTL } = useI18n();
  const { colours, p, presentation } = useTheme();
  const [focused, setFocused] = useState(false);
  const s: Script = script ?? (isRTL ? 'urdu' : 'latin');
  const m = textMetrics('body', s, presentation);
  const rtlInput = s === 'urdu';
  const border = error ? colours.wrong : focused ? colours.primary : colours.borderStrong;

  return (
    <View style={[styles.wrap, style]}>
      <Text variant="label">{label}</Text>
      <TextInput
        {...input}
        ref={ref}
        // An Urdu placeholder with a number in it ("مثلاً 2025-041") keeps the number in order.
        placeholder={
          placeholder && scriptOf(placeholder) === 'urdu'
            ? isolateLtrRuns(placeholder)
            : placeholder
        }
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityHint={error ?? helper}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        placeholderTextColor={colours.textMuted}
        style={[
          styles.input,
          {
            minHeight: Math.max(p.controlHeight, m.lineHeight + space.sm),
            fontFamily: m.fontFamily,
            fontSize: m.fontSize,
            color: colours.text,
            backgroundColor: colours.surface,
            borderColor: border,
            borderRadius: radiusFor('md', presentation),
            textAlign: rtlInput ? 'right' : 'left',
            writingDirection: rtlInput ? 'rtl' : 'ltr',
          },
          focused && {
            outlineColor: colours.focus,
            outlineWidth: 3,
            outlineOffset: 2,
            outlineStyle: 'solid',
          },
        ]}
      />
      {error ? (
        <View style={styles.row} accessibilityLiveRegion="polite">
          <Icon name="warning" size={18} tone="wrong" />
          <Text variant="bodySm" tone="onWrongSoft" style={styles.flex}>
            {error}
          </Text>
        </View>
      ) : helper ? (
        <Text variant="bodySm" tone="textMuted">
          {helper}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs },
  input: {
    borderWidth: strokeWidth.control,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  flex: { flex: 1 },
});
