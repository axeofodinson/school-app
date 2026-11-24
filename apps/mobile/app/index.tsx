import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useAuth } from '../features/auth/AuthProvider';
import { homeFor } from '../features/auth/routes';
import { useI18n } from '../i18n';
import { useTheme } from '../ui';

// Entry: send each user to their surface by role (features/auth). While the
// session and profile load, a quiet spinner (no layout jump).
export default function Index() {
  const { destination } = useAuth();
  const { t } = useI18n();
  const { colours } = useTheme();
  const href = homeFor(destination);
  if (href) return <Redirect href={href} />;
  return (
    <View style={[styles.fill, { backgroundColor: colours.bg }]}>
      <ActivityIndicator color={colours.primary} accessibilityLabel={t('common.loading')} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
