import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, Text, useTheme } from '../../ui';
import { useFocusRing } from '../../ui/Sticker';
import { radius, space, strokeWidth } from '../../ui/tokens';

/**
 * A tickable row (multi-select lists: chapters to attach, prerequisites).
 * Box + tick + label, so the state never rests on colour alone; Space/Enter
 * toggle it on web (native checkbox semantics), and it is a full-width target.
 */
export function CheckRow({
  label,
  detail,
  checked,
  disabled,
  note,
  onToggle,
}: {
  label: string;
  detail?: string;
  checked: boolean;
  disabled?: boolean;
  /** Why it can't be ticked (shown under the label when disabled). */
  note?: string;
  onToggle: () => void;
}) {
  const { colours, p } = useTheme();
  const { focusProps, ring } = useFocusRing();
  return (
    <Pressable
      {...focusProps}
      onPress={onToggle}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      accessibilityHint={disabled ? note : undefined}
      accessibilityState={{ checked, disabled: Boolean(disabled) }}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.row,
        {
          minHeight: p.minTarget,
          backgroundColor: checked
            ? colours.primarySoft
            : pressed || hovered
              ? colours.surfaceAlt
              : 'transparent',
          opacity: disabled ? 0.55 : 1,
        },
        ring,
      ]}
    >
      <View
        style={[
          styles.box,
          {
            borderColor: checked ? colours.primary : colours.borderStrong,
            backgroundColor: checked ? colours.primary : colours.surface,
          },
        ]}
      >
        {checked ? <Icon name="check" size={16} tone="onPrimary" /> : null}
      </View>
      <View style={styles.text}>
        <Text tone={checked ? 'onPrimarySoft' : 'text'}>{label}</Text>
        {detail ? (
          <Text variant="bodySm" tone={checked ? 'onPrimarySoft' : 'textMuted'}>
            {detail}
          </Text>
        ) : null}
        {disabled && note ? (
          <Text variant="bodySm" tone="textMuted">
            {note}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.sm,
  },
  box: {
    width: 24,
    height: 24,
    borderRadius: radius.sm / 2,
    borderWidth: strokeWidth.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: space.xxs },
});
