import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useI18n } from '../../i18n';
import { Button } from '../../ui';
import { useAuth } from './AuthProvider';

/** Settings + sign out, for the top of each home screen until real navigation exists. */
export function AccountActions() {
  const { t } = useI18n();
  const router = useRouter();
  const { signOut, sharedMode } = useAuth();
  return (
    <View style={styles.row}>
      <Button
        title={t('auth.settings.open')}
        variant="ghost"
        size="sm"
        onPress={() => router.push('/settings')}
      />
      {/* In shared mode students use the big Switch student bar instead. */}
      {sharedMode ? null : (
        <Button title={t('auth.signOut')} variant="ghost" size="sm" onPress={() => signOut()} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' } });
