// Shared-device mode: a big "Switch student" button always in view (bottom bar)
// on student screens (LMS_AUDIT §3.4). Signing out wipes this student's storage namespace
// except their unsynced queue.
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useI18n } from '../../i18n';
import { Button, Text, useTheme } from '../../ui';
import { useAuth } from './AuthProvider';

export function SwitchStudentBar() {
  const { t, isRTL } = useI18n();
  const { colours } = useTheme();
  const { sharedMode, profile, signOut } = useAuth();
  if (!sharedMode) return null;
  return (
    <SafeAreaView
      edges={['bottom']}
      style={[
        styles.bar,
        {
          backgroundColor: colours.surface,
          borderColor: colours.border,
          direction: isRTL ? 'rtl' : 'ltr',
        },
      ]}
    >
      <Text style={styles.name} numberOfLines={1}>
        {profile?.full_name ?? ''}
      </Text>
      <Button
        title={t('auth.shared.switchStudent')}
        icon="user"
        size="lg"
        onPress={() => signOut('switch')}
        accessibilityHint={t('auth.shared.switchHint')}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  name: { flex: 1 },
});
