import { Pressable, StyleSheet, View } from 'react-native';

import { Text, useTheme } from '../../ui';
import { useFocusRing } from '../../ui/Sticker';
import { radius, space, strokeWidth } from '../../ui/tokens';

export interface Chip<V extends string> {
  value: V;
  label: string;
}

function ChipButton<V extends string>({
  chip,
  selected,
  disabled,
  onChange,
}: {
  chip: Chip<V>;
  selected: boolean;
  disabled?: boolean;
  onChange: (v: V) => void;
}) {
  const { colours, p } = useTheme();
  const { focusProps, ring } = useFocusRing();
  return (
    <Pressable
      {...focusProps}
      onPress={() => onChange(chip.value)}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityLabel={chip.label}
      accessibilityState={{ selected, checked: selected, disabled: Boolean(disabled) }}
      style={({ pressed }) => [
        styles.chip,
        {
          minHeight: p.minTarget - 8,
          borderColor: selected ? colours.primary : colours.borderStrong,
          backgroundColor: selected
            ? colours.primary
            : pressed
              ? colours.surfaceAlt
              : colours.surface,
          opacity: disabled ? 0.5 : 1,
        },
        ring,
      ]}
    >
      <Text variant="label" tone={selected ? 'onPrimary' : 'text'}>
        {chip.label}
      </Text>
    </Pressable>
  );
}

/**
 * One choice out of many (class, subject, chapter, type, level). Wraps onto
 * several lines, unlike SegmentedControl; each chip is a tab stop.
 */
export function ChipPicker<V extends string>({
  label,
  chips,
  value,
  onChange,
  disabled,
}: {
  label: string;
  chips: readonly Chip<V>[];
  value: V | null;
  onChange: (v: V) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.wrap}>
      <Text variant="label">{label}</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.row}>
        {chips.map((c) => (
          <ChipButton
            key={c.value}
            chip={c}
            selected={c.value === value}
            disabled={disabled}
            onChange={onChange}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  chip: {
    justifyContent: 'center',
    paddingHorizontal: space.md,
    borderWidth: strokeWidth.control,
    borderRadius: radius.full,
  },
});
