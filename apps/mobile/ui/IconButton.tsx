import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon, type IconName } from './Icon';
import { PressableSticker } from './Sticker';
import { Text } from './Text';
import { useTheme } from './theme';
import { radiusFor, space, type ColourRoles } from './tokens';

/**
 * Icon-only control. `label` is required: it is the accessible name, and the kid
 * presentation always shows it under the icon (icon-only controls are not allowed for kid).
 */
export function IconButton({
  icon,
  label,
  onPress,
  variant = 'ghost',
  disabled,
  selected,
  style,
}: {
  icon: IconName;
  label: string;
  onPress?: () => void;
  variant?: 'ghost' | 'secondary' | 'primary';
  disabled?: boolean;
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colours, p, presentation } = useTheme();
  const fg: keyof ColourRoles =
    variant === 'primary' ? 'onPrimary' : selected ? 'onPrimarySoft' : 'text';
  const showLabel = p.labelWithIcon;
  return (
    <PressableSticker
      onPress={onPress}
      disabled={disabled}
      depth={variant === 'ghost' ? 'flat' : 'stickerSm'}
      outlined={variant !== 'ghost'}
      radius={radiusFor(showLabel ? 'md' : 'full', presentation)}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={selected === undefined ? undefined : { selected }}
      style={style}
      faceStyle={(pressed) => [
        styles.face,
        {
          minWidth: p.minTarget,
          minHeight: p.minTarget,
          backgroundColor:
            variant === 'primary'
              ? colours.primary
              : selected
                ? colours.primarySoft
                : variant === 'secondary' || pressed
                  ? colours.surfaceAlt
                  : 'transparent',
        },
      ]}
    >
      <View style={styles.inner}>
        <Icon name={icon} tone={fg} />
        {showLabel ? (
          <Text variant="caption" tone={fg} numberOfLines={1}>
            {label}
          </Text>
        ) : null}
      </View>
    </PressableSticker>
  );
}

const styles = StyleSheet.create({
  face: { alignItems: 'center', justifyContent: 'center', padding: space.xs },
  inner: { alignItems: 'center', gap: space.xxs },
});
