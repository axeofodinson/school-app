import { StyleSheet, View } from 'react-native';

import { useAuth } from '../../features/auth/AuthProvider';
import { useI18n } from '../../i18n';
import { Button, EmptyState, Screen, Text } from '../../ui';

// Signed in, but no usable role yet: 'pending' (awaiting an admin), a parent
// (deferred), a student profile not linked to a student record, or (until
// prompt 05) a prep-only Google account.
export default function Pending() {
  const { t } = useI18n();
  const { session, signOut } = useAuth();
  const email = session?.user.email ?? '';
  // Students' synthesized addresses are internal; never show them.
  const showEmail = email && !email.endsWith('.invalid');
  return (
    <Screen>
      <EmptyState
        icon="clock"
        title={t('auth.pending.title')}
        body={t('auth.pending.body')}
        action={
          <View style={styles.actions}>
            {showEmail ? (
              <Text variant="caption">{t('auth.pending.signedInAs', { email })}</Text>
            ) : null}
            <Button title={t('auth.signOut')} variant="secondary" onPress={() => signOut()} />
          </View>
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({ actions: { gap: 12, alignItems: 'center' } });
