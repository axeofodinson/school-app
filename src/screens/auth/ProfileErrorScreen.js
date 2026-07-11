// Shown when the user is signed in but we couldn't read their profiles row
// (typically no network). Offers a retry and a way out.
import { StyleSheet } from 'react-native';

import { ScreenContainer, Text, Button } from '../../components';
import { useAuth } from '../../auth/AuthProvider';
import { t } from '../../i18n';
import { colors, spacing } from '../../theme/colors';

export default function ProfileErrorScreen() {
  const { retryProfile, signOut } = useAuth();

  return (
    <ScreenContainer center>
      <Text variant="title" align="center">
        {t('auth.profileError.title')}
      </Text>
      <Text variant="body" color={colors.muted} align="center" style={styles.body}>
        {t('auth.profileError.body')}
      </Text>
      <Button
        label={t('auth.profileError.retry')}
        onPress={retryProfile}
        style={styles.action}
      />
      <Button
        variant="secondary"
        label={t('auth.signOut')}
        onPress={signOut}
        style={styles.secondaryAction}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  body: { marginTop: spacing.md },
  action: { marginTop: spacing.xl, alignSelf: 'stretch' },
  secondaryAction: { marginTop: spacing.sm, alignSelf: 'stretch' },
});
