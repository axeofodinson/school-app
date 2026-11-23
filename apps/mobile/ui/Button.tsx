import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon, type IconName } from './Icon';
import { PressableSticker } from './Sticker';
import { Text } from './Text';
import { useTheme } from './theme';
import { radiusFor, space, type ColourRoles } from './tokens';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const look: Record<
  ButtonVariant,
  { bg: keyof ColourRoles | null; fg: keyof ColourRoles; sticker: boolean }
> = {
  primary: { bg: 'primary', fg: 'onPrimary', sticker: true },
  secondary: { bg: 'surface', fg: 'text', sticker: true },
  ghost: { bg: null, fg: 'primary', sticker: false },
  danger: { bg: 'wrong', fg: 'onPrimary', sticker: true },
};

/**
 * Main action. Height grows with text (minHeight, never a fixed height) so Urdu
 * never clips; the minimum comes from the presentation (kid 60, student 52, staff 40).
 */
export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  loading = false,
  disabled = false,
  accessibilityHint,
  style,
}: {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { colours, p, presentation } = useTheme();
  const l = look[variant];
  const minHeight =
    size === 'lg'
      ? p.controlHeight + space.sm
      : size === 'sm'
        ? Math.max(36, p.controlHeight - space.md)
        : p.controlHeight;
  // Small buttons keep the full touch target through hitSlop, not a bigger visual.
  const slop = Math.max(0, (p.minTarget - minHeight) / 2);
  const r = radiusFor('md', presentation);

  return (
    <PressableSticker
      onPress={onPress}
      disabled={disabled}
      busy={loading}
      depth={l.sticker ? (size === 'sm' ? 'stickerSm' : 'sticker') : 'flat'}
      outlined={l.sticker}
      radius={r}
      hitSlop={slop ? { top: slop, bottom: slop } : undefined}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ busy: loading }}
      style={style}
      faceStyle={(pressed) => [
        styles.face,
        {
          minHeight,
          paddingHorizontal: size === 'sm' ? space.md : size === 'lg' ? space.xl : space.lg,
          backgroundColor: l.bg ? colours[l.bg] : pressed ? colours.surfaceAlt : 'transparent',
        },
      ]}
    >
      <View style={styles.row}>
        {loading ? (
          <ActivityIndicator color={colours[l.fg]} />
        ) : icon ? (
          <Icon name={icon} tone={l.fg} />
        ) : null}
        <Text variant="label" tone={l.fg} numberOfLines={2} style={styles.label}>
          {title}
        </Text>
      </View>
    </PressableSticker>
  );
}

const styles = StyleSheet.create({
  face: { alignItems: 'center', justifyContent: 'center', paddingVertical: space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  label: { textAlign: 'center' },
});
