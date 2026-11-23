import type { ReactNode } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useI18n } from '../i18n';
import { useTheme } from './theme';
import { layout, layoutFor, space } from './tokens';

/**
 * Breakpoint, gutter, content width and two-pane / rail decisions for the current
 * window (phone < 600, tablet/Chromebook window 600–899, desktop ≥ 900, wide ≥ 1280).
 * Reacts to Chromebook window resizes.
 */
export function useLayout() {
  const { width } = useWindowDimensions();
  const { presentation } = useTheme();
  return layoutFor(width, presentation);
}

/**
 * Screen container. Sets `direction` from the locale so Yoga mirrors rows for Urdu
 * without the sticky native RTL flag; gutter and max width follow the breakpoint.
 */
export function Screen({
  children,
  scroll = true,
  style,
}: {
  children: ReactNode;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { isRTL } = useI18n();
  const { colours } = useTheme();
  const { gutter, maxContentWidth } = useLayout();
  const content = [styles.content, { paddingHorizontal: gutter, maxWidth: maxContentWidth }, style];
  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colours.bg, direction: isRTL ? 'rtl' : 'ltr' }]}
    >
      {scroll ? (
        <ScrollView contentContainerStyle={content}>{children}</ScrollView>
      ) : (
        <View style={[content, styles.fill]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

/**
 * List + detail. Side by side from desktop (list pane 360–420, mirrored in RTL);
 * below that, one pane at a time: the detail when `showDetail`, else the list.
 */
export function TwoPane({
  list,
  detail,
  showDetail = false,
  style,
}: {
  list: ReactNode;
  detail: ReactNode;
  showDetail?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { twoPane } = useLayout();
  const { colours } = useTheme();
  if (!twoPane) return <View style={[styles.fill, style]}>{showDetail ? detail : list}</View>;
  return (
    <View style={[styles.row, style]}>
      <View
        style={[
          styles.listPane,
          {
            borderEndColor: colours.border,
            minWidth: layout.listPane.min,
            maxWidth: layout.listPane.max,
          },
        ]}
      >
        {list}
      </View>
      <View style={styles.fill}>{detail}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: {
    flexGrow: 1,
    width: '100%',
    alignSelf: 'center',
    paddingVertical: space.xl,
    gap: space.lg,
  },
  fill: { flex: 1 },
  row: { flex: 1, flexDirection: 'row' },
  listPane: { flexBasis: layout.listPane.max, flexShrink: 1, borderEndWidth: 1 },
});
