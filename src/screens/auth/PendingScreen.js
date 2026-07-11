// Shown when a signed-in account has no console access yet: role 'pending'
// (awaiting admin approval), or any non-staff role that reached the staff app.
import { StyleSheet } from 'react-native';

import { ScreenContainer, Text, Button } from '../../components';
import { useAuth } from '../../auth/AuthProvider';
import { t } from '../../i18n';
import { colors, spacing } from '../../theme/colors';

export default function PendingScreen() {
  const { session, signOut } = useAuth();
  const email = session?.user?.email ?? '';

  return (
    <ScreenContainer center>
      <Text variant="title" align="center">
        {t('auth.pending.title')}
      </Text>
      <Text variant="body" color={colors.muted} align="center" style={styles.body}>
        {t('auth.pending.body')}
      </Text>
      {email ? (
        <Text variant="caption" color={colors.muted} align="center" style={styles.email}>
          {t('auth.pending.signedInAs', { email })}
        </Text>
      ) : null}
      <Button
        variant="secondary"
        label={t('auth.signOut')}
        onPress={signOut}
        style={styles.action}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  body: { marginTop: spacing.md },
  email: { marginTop: spacing.sm },
  action: { marginTop: spacing.xl, alignSelf: 'stretch' },
});
