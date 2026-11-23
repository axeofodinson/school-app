import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon } from './Icon';
import { useFocusRing } from './Sticker';
import { Text } from './Text';
import { useTheme } from './theme';
import { space } from './tokens';

/**
 * A row in a list. Leading/trailing are slots (icon, badge, avatar). Rows that open
 * something get a chevron that points along the reading direction. Pressed = a
 * colour change only (rows are frequent; no movement).
 */
export function ListItem({
  title,
  subtitle,
  leading,
  trailing,
  onPress,
  disabled,
  style,
}: {
  title: string;
  subtitle?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colours, p } = useTheme();
  const { focusProps, ring } = useFocusRing();
  const body = (
    <>
      {leading}
      <View style={styles.text}>
        <Text>{title}</Text>
        {subtitle ? (
          <Text variant="bodySm" tone="textMuted">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ?? (onPress ? <Icon name="chevronEnd" tone="textMuted" /> : null)}
    </>
  );
  const base = [styles.row, { minHeight: p.minTarget }];
  if (!onPress) return <View style={[base, style]}>{body}</View>;
  return (
    <Pressable
      {...focusProps}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      accessibilityState={{ disabled: Boolean(disabled) }}
      style={({ pressed }) => [
        base,
        pressed && { backgroundColor: colours.surfaceAlt },
        ring,
        style,
      ]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  text: { flex: 1, gap: space.xxs },
});
