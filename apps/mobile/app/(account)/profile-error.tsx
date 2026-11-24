import { StyleSheet, View } from 'react-native';

import { useAuth } from '../../features/auth/AuthProvider';
import { useI18n } from '../../i18n';
import { Button, EmptyState, Screen } from '../../ui';

// Signed in, but the profile row couldn't be read (usually no network). Distinct
// from 'pending': we don't know the role yet, so we never guess one.
export default function ProfileError() {
  const { t } = useI18n();
  const { retryProfile, signOut } = useAuth();
  return (
    <Screen>
      <EmptyState
        icon="cloudOff"
        title={t('auth.profileError.title')}
        body={t('auth.profileError.body')}
        action={
          <View style={styles.actions}>
            <Button title={t('auth.profileError.retry')} onPress={retryProfile} />
            <Button title={t('auth.signOut')} variant="ghost" onPress={() => signOut()} />
          </View>
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({ actions: { gap: 12 } });
