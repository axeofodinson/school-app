import { toAsciiDigits } from '@school/core';
import { useState } from 'react';
import {
  Platform,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useI18n } from '../i18n';
import { Icon } from './Icon';
import { PressableSticker } from './Sticker';
import { Text } from './Text';
import { useTheme } from './theme';
import { radiusFor, space, strokeWidth } from './tokens';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'] as const;

/**
 * PIN entry (CLAUDE.md: the PIN is always typed, never scanned). One real TextInput
 * (number pad, physical keyboard on Chromebooks, screen readers) drawn as masked
 * boxes. Boxes and keypad stay left-to-right in Urdu too (digits are Western 0–9).
 * The kid presentation adds big on-screen keys and hides the OS keyboard.
 */
export function PinField({
  value,
  onChange,
  label,
  length = 4,
  minLength,
  error,
  keypad,
  autoFocus,
  style,
}: {
  value: string;
  onChange: (pin: string) => void;
  label: string;
  /** Max digits. */
  length?: number;
  /** For variable-length PINs: boxes shown before typing; one more appears per digit up to `length`. */
  minLength?: number;
  error?: string;
  /** Default: on for the kid presentation. */
  keypad?: boolean;
  autoFocus?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { t } = useI18n();
  const { colours, p, presentation } = useTheme();
  const [focused, setFocused] = useState(false);
  const showKeypad = keypad ?? presentation === 'kid';
  const box = presentation === 'kid' ? 60 : presentation === 'staff' ? 44 : 52;
  const r = radiusFor('md', presentation);

  const boxes = minLength ? Math.min(length, Math.max(minLength, value.length)) : length;
  // Urdu-keyboard digits (۱۲۳) count as 0–9.
  const set = (next: string) => onChange(toAsciiDigits(next).replace(/\D/g, '').slice(0, length));
  const press = (k: (typeof KEYS)[number]) => {
    if (k === 'del') set(value.slice(0, -1));
    else if (k) set(value + k);
  };

  return (
    <View style={[styles.wrap, style]}>
      <Text variant="label">{label}</Text>
      {/* The boxes are drawn for sighted users and hidden from screen readers; the real
          TextInput sits on top of them (so a tap focuses it) and stays accessible. */}
      <View style={styles.boxes}>
        <View
          style={styles.boxRow}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {Array.from({ length: boxes }, (_, i) => {
            const filled = i < value.length;
            const active = focused && i === Math.min(value.length, boxes - 1);
            return (
              <View
                key={i}
                style={[
                  styles.box,
                  {
                    width: box,
                    height: box,
                    borderRadius: r,
                    backgroundColor: colours.surface,
                    borderColor: error
                      ? colours.wrong
                      : active
                        ? colours.primary
                        : colours.borderStrong,
                    borderWidth: active ? 3 : strokeWidth.control,
                  },
                ]}
              >
                {filled ? <View style={[styles.dot, { backgroundColor: colours.text }]} /> : null}
              </View>
            );
          })}
        </View>
        <TextInput
          value={value}
          onChangeText={set}
          autoFocus={autoFocus}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          keyboardType="number-pad"
          inputMode="numeric"
          maxLength={length}
          autoComplete="off"
          autoCorrect={false}
          caretHidden
          showSoftInputOnFocus={!showKeypad}
          secureTextEntry={Platform.OS !== 'web'}
          accessibilityLabel={label}
          accessibilityHint={error ?? t('ui.pin.entered', { count: value.length, total: boxes })}
          style={styles.hiddenInput}
        />
      </View>
      {error ? (
        <View style={styles.row} accessibilityLiveRegion="polite">
          <Icon name="warning" size={18} tone="wrong" />
          <Text variant="bodySm" tone="onWrongSoft" style={styles.flex}>
            {error}
          </Text>
        </View>
      ) : null}
      {showKeypad ? (
        <View style={[styles.keypad, { width: (p.controlHeight + space.sm) * 3 + space.sm * 2 }]}>
          {KEYS.map((k, i) =>
            k === '' ? (
              <View
                key={i}
                style={{ width: p.controlHeight + space.sm, height: p.controlHeight }}
              />
            ) : (
              <PressableSticker
                key={i}
                onPress={() => press(k)}
                radius={r}
                depth="stickerSm"
                accessibilityRole="button"
                accessibilityLabel={k === 'del' ? t('ui.pin.delete') : k}
                faceStyle={(pressed) => [
                  styles.key,
                  {
                    width: p.controlHeight + space.sm,
                    minHeight: p.controlHeight,
                    backgroundColor: pressed ? colours.surfaceAlt : colours.surface,
                  },
                ]}
              >
                {k === 'del' ? (
                  <Icon name="backspace" />
                ) : (
                  <Text variant="title" script="latin">
                    {k}
                  </Text>
                )}
              </PressableSticker>
            ),
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  // PIN boxes are LTR in every language.
  boxes: { alignSelf: 'flex-start' },
  boxRow: { flexDirection: 'row', direction: 'ltr', gap: space.sm },
  box: { alignItems: 'center', justifyContent: 'center' },
  dot: { width: 14, height: 14, borderRadius: 7 },
  hiddenInput: {
    position: 'absolute',
    top: 0,
    start: 0,
    end: 0,
    bottom: 0,
    opacity: 0.01,
    color: 'transparent',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  flex: { flex: 1 },
  keypad: { flexDirection: 'row', flexWrap: 'wrap', direction: 'ltr', gap: space.sm },
  key: { alignItems: 'center', justifyContent: 'center' },
});
