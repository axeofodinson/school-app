import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';

import { Icon, type IconName } from './Icon';
import { useFocusRing } from './Sticker';
import { Text } from './Text';
import { useEnterStyle } from './motion';
import { useTheme } from './theme';
import { radius, space } from './tokens';

export type TabBarItem = {
  key: string;
  label: string;
  icon: IconName;
  /** A small count chip on the icon (e.g. unread messages). */
  count?: number;
  onPress: () => void;
};

function Item({ item, active, rail }: { item: TabBarItem; active: boolean; rail?: boolean }) {
  const { colours, p } = useTheme();
  const { focusProps, ring } = useFocusRing();
  // Tabs are peers: the bar never slides (tabSwitch = none); the pill only cross-fades.
  const pill = useEnterStyle('selectionChange', active);
  return (
    <Pressable
      {...focusProps}
      onPress={item.onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      aria-selected={active}
      accessibilityLabel={item.count ? `${item.label}, ${item.count}` : item.label}
      style={[styles.item, rail && styles.railItem, { minHeight: Math.max(56, p.minTarget) }, ring]}
    >
      <View style={styles.iconWrap}>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            styles.pill,
            { backgroundColor: colours.primarySoft },
            pill,
          ]}
        />
        <Icon name={item.icon} tone={active ? 'onPrimarySoft' : 'textMuted'} size={24} />
        {item.count ? (
          <View
            style={[styles.count, { backgroundColor: colours.accent, borderColor: colours.ink }]}
          >
            <Text variant="caption" tone="onAccent" style={styles.countText}>
              {item.count > 9 ? '9+' : String(item.count)}
            </Text>
          </View>
        ) : null}
      </View>
      <Text
        variant="caption"
        tone={active ? 'text' : 'textMuted'}
        numberOfLines={1}
        style={styles.label}
      >
        {item.label}
      </Text>
    </Pressable>
  );
}

/**
 * Bottom navigation for the student app (wireframe: Home · Prepare · Tests · Me).
 * An ink rule on top, the active tab's icon sits in a soft indigo pill.
 */
export function TabBar({
  items,
  active,
  variant = 'bar',
}: {
  items: TabBarItem[];
  active: string;
  /** `rail`: a column at the start edge (desktop/Chromebook full screen). */
  variant?: 'bar' | 'rail';
}) {
  const { colours, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  if (variant === 'rail') {
    return (
      <View
        accessibilityRole="tablist"
        style={[
          styles.rail,
          {
            backgroundColor: colours.surface,
            borderEndColor: scheme === 'dark' ? colours.border : colours.ink,
          },
        ]}
      >
        <View style={[styles.railMark, { backgroundColor: colours.primary }]}>
          <Icon name="mosaic" size={22} tone="onPrimary" />
        </View>
        {items.map((it) => (
          <Item key={it.key} item={it} active={it.key === active} rail />
        ))}
      </View>
    );
  }
  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.bar,
        {
          backgroundColor: colours.surface,
          borderTopColor: scheme === 'dark' ? colours.border : colours.ink,
          paddingBottom: Math.max(insets.bottom, space.xs),
        },
      ]}
    >
      <View style={styles.row}>
        {items.map((it) => (
          <Item key={it.key} item={it} active={it.key === active} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { borderTopWidth: 2, paddingTop: space.xs },
  row: { flexDirection: 'row', width: '100%', maxWidth: 680, alignSelf: 'center' },
  rail: {
    width: 96,
    borderEndWidth: 2,
    paddingVertical: space.lg,
    gap: space.sm,
    alignItems: 'stretch',
  },
  railItem: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto', paddingVertical: space.sm },
  railMark: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.md,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: space.xs,
  },
  iconWrap: {
    paddingHorizontal: space.lg,
    paddingVertical: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: { borderRadius: radius.full },
  count: {
    position: 'absolute',
    top: -4,
    end: 4,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 4,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: { fontWeight: '800', lineHeight: 14 },
  label: { fontWeight: '800' },
});
