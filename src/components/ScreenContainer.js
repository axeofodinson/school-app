// ScreenContainer — the base layout wrapper every screen sits inside.
//
// Provides safe-area insets, consistent padding, and the app background, and
// establishes the reading direction so children lay out start-to-end correctly
// in both English (LTR) and Urdu (RTL). Optionally scrolls and keeps content
// clear of the keyboard for form screens.
//
// Safe area: insets come from useSafeAreaInsets() (react-native-safe-area-
// context), the SAME source the toast layer uses — NOT the react-native
// SafeAreaView, which is iOS-only and silently applies nothing on Android,
// leaving headers under the notch and footers under the gesture nav bar. The
// insets are ADDED to the design padding (not a flat replacement), so a header
// clears the status bar/notch and the last element (e.g. sign-out) clears the
// bottom nav bar, on every device profile.
import {
  View,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, spacing } from '../theme/colors';
import { isRTL } from '../i18n';

export default function ScreenContainer({
  children,
  scroll = false,
  center = false,
  padded = true,
  backgroundColor = colors.bg, // themed surfaces (student app) can override
  style,
  contentContainerStyle,
}) {
  const insets = useSafeAreaInsets();
  const direction = isRTL ? 'rtl' : 'ltr';

  // Safe-area gutters reserved on every edge, on top of the design padding
  // below. Horizontal insets cover landscape notches; top/bottom cover the
  // status bar/notch and the gesture nav bar.
  const safeArea = {
    paddingTop: insets.top,
    paddingBottom: insets.bottom,
    paddingLeft: insets.left,
    paddingRight: insets.right,
  };

  const inner = [
    styles.content,
    padded && styles.padded,
    center && styles.center,
    { direction, backgroundColor },
    scroll ? contentContainerStyle : style,
  ];

  const body = scroll ? (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.grow, inner]}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, inner]}>{children}</View>
  );

  return (
    <View style={[styles.safe, safeArea, { backgroundColor }, style]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {body}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  grow: { flexGrow: 1 },
  content: { backgroundColor: colors.bg },
  padded: { padding: spacing.lg },
  center: { justifyContent: 'center' },
});
