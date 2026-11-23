import type { ReactNode } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useI18n } from '../i18n';

/**
 * Screen container. Sets `direction` from the locale so Yoga mirrors flex rows
 * for Urdu without the native RTL flag. Content is width-capped so it reads well
 * in a resizable Chromebook window and on desktop.
 */
export function Screen({ children }: { children: ReactNode }) {
  const { isRTL } = useI18n();
  return (
    <SafeAreaView style={[styles.safe, { direction: isRTL ? 'rtl' : 'ltr' }]}>
      <ScrollView contentContainerStyle={styles.content}>{children}</ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fbf7ef' },
  content: {
    flexGrow: 1,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 24,
    gap: 16,
  },
});
