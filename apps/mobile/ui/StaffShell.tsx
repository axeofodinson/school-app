import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon, type IconName } from './Icon';
import { useFocusRing } from './Sticker';
import { Text } from './Text';
import { useTheme } from './theme';
import { radius, space } from './tokens';

export type StaffNavItem = {
  key: string;
  label: string;
  icon: IconName;
  onPress: () => void;
};

function NavLink({
  item,
  active,
  compact,
}: {
  item: StaffNavItem;
  active: boolean;
  compact?: boolean;
}) {
  const { colours } = useTheme();
  const { focusProps, ring } = useFocusRing();
  return (
    <Pressable
      {...focusProps}
      onPress={item.onPress}
      accessibilityRole="link"
      accessibilityState={{ selected: active }}
      aria-current={active ? 'page' : undefined}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.link,
        {
          backgroundColor: active
            ? colours.primarySoft
            : pressed || hovered
              ? colours.surfaceAlt
              : 'transparent',
        },
        ring,
      ]}
    >
      <Icon name={item.icon} size={18} tone={active ? 'onPrimarySoft' : 'textMuted'} />
      <Text
        variant="bodySm"
        tone={active ? 'onPrimarySoft' : 'text'}
        style={styles.linkText}
        numberOfLines={1}
      >
        {item.label}
      </Text>
    </Pressable>
  );
}

/**
 * Teacher / admin sidebar (wireframes TeacherLaunch, AdminHome): white column with the
 * school mark and the console's sections, active one in soft indigo. Shown from
 * desktop width (StaffFrame); phones reach the same places from the home screen.
 * Sits at the start edge, so it mirrors in Urdu.
 */
export function StaffSidebar({
  brand,
  items,
  active,
  footer,
}: {
  brand: string;
  items: StaffNavItem[];
  active: string | null;
  footer?: ReactNode;
}) {
  const { colours } = useTheme();
  return (
    <SafeAreaView
      edges={['top', 'bottom', 'left']}
      accessibilityRole="navigation"
      style={[styles.side, { backgroundColor: colours.surface, borderEndColor: colours.border }]}
    >
      <View style={styles.brandRow}>
        <View style={[styles.logo, { backgroundColor: colours.primary }]}>
          <Icon name="mosaic" size={18} tone="onPrimary" />
        </View>
        <Text variant="heading" tone="primary" numberOfLines={2} style={styles.flex}>
          {brand}
        </Text>
      </View>
      <ScrollView contentContainerStyle={styles.links}>
        {items.map((it) => (
          <NavLink key={it.key} item={it} active={it.key === active} />
        ))}
      </ScrollView>
      {footer}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  side: {
    width: 248,
    borderEndWidth: 1,
    paddingVertical: space.xl,
    paddingHorizontal: space.md,
    gap: space.lg,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.sm,
  },
  logo: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  links: { gap: 2 },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 44,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
    borderWidth: 0,
  },
  linkText: { flex: 1, fontWeight: '700' },
});
