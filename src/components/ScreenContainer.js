// ScreenContainer — the base layout wrapper every screen sits inside.
//
// Provides safe-area insets, consistent padding, and the app background, and
// establishes the reading direction so children lay out start-to-end correctly
// in both English (LTR) and Urdu (RTL). Optionally scrolls and keeps content
// clear of the keyboard for form screens.
import {
  View,
  ScrollView,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';

import { colors, spacing } from '../theme/colors';
import { isRTL } from '../i18n';

export default function ScreenContainer({
  children,
  scroll = false,
  center = false,
  padded = true,
  style,
  contentContainerStyle,
}) {
  const direction = isRTL ? 'rtl' : 'ltr';

  const inner = [
    styles.content,
    padded && styles.padded,
    center && styles.center,
    { direction },
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
    <SafeAreaView style={[styles.safe, style]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {body}
      </KeyboardAvoidingView>
    </SafeAreaView>
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
