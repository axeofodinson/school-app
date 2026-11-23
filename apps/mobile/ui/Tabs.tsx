import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon, type IconName } from './Icon';
import { useLayout } from './layout';
import { useFocusRing } from './Sticker';
import { Text } from './Text';
import { useTheme } from './theme';
import { radius, space } from './tokens';

export type TabItem<K extends string> = { key: K; label: string; icon: IconName };

function Tab<K extends string>({
  item,
  selected,
  onChange,
  rail,
}: {
  item: TabItem<K>;
  selected: boolean;
  onChange: (k: K) => void;
  rail: boolean;
}) {
  const { colours, p } = useTheme();
  const { focusProps, ring } = useFocusRing();
  const tone = selected ? 'onPrimarySoft' : 'textMuted';
  return (
    <Pressable
      {...focusProps}
      onPress={() => onChange(item.key)}
      accessibilityRole="tab"
      accessibilityLabel={item.label}
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.tab,
        rail ? styles.railTab : styles.barTab,
        { minHeight: p.minTarget },
        selected
          ? { backgroundColor: colours.primarySoft }
          : pressed && { backgroundColor: colours.surfaceAlt },
        ring,
      ]}
    >
      <Icon name={item.icon} tone={tone} />
      {/* Labels are always shown (kid rule; and clearer for everyone). */}
      <Text variant="caption" tone={selected ? 'onPrimarySoft' : 'text'} numberOfLines={1}>
        {item.label}
      </Text>
    </Pressable>
  );
}

/**
 * Peer navigation: bottom bar below 900, side rail from desktop (DESIGN_SYSTEM.md §5).
 * Tabs never slide or animate (`tabSwitch` is `none` in every tier).
 */
export function Tabs<K extends string>({
  items,
  value,
  onChange,
  variant,
  accessibilityLabel,
  style,
}: {
  items: readonly TabItem<K>[];
  value: K;
  onChange: (k: K) => void;
  /** Default: from the window width. */
  variant?: 'bar' | 'rail';
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { navigation } = useLayout();
  const { colours } = useTheme();
  const rail = (variant ?? navigation) === 'rail';
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      style={[
        rail ? styles.rail : styles.bar,
        { backgroundColor: colours.surface, borderColor: colours.border },
        style,
      ]}
    >
      {items.map((it) => (
        <Tab key={it.key} item={it} selected={it.key === value} onChange={onChange} rail={rail} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingHorizontal: space.xs,
    paddingVertical: space.xs,
    gap: space.xs,
  },
  rail: {
    flexDirection: 'column',
    borderEndWidth: 1,
    padding: space.sm,
    gap: space.sm,
    alignSelf: 'flex-start',
  },
  tab: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xxs,
    borderRadius: radius.md,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  barTab: { flex: 1 },
  railTab: { width: 88 },
});
