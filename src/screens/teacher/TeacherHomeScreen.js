// Landing screen for teachers. Placeholder home — assigned classes/subjects
// (teacher-scoped by RLS) will populate this later.
import { StyleSheet } from 'react-native';

import { ScreenContainer, Text, Button } from '../../components';
import { useAuth } from '../../auth/AuthProvider';
import { t } from '../../i18n';
import { colors, spacing } from '../../theme/colors';

export default function TeacherHomeScreen() {
  const { profile, session, signOut } = useAuth();
  const name = profile?.full_name || session?.user?.email || '';

  return (
    <ScreenContainer>
      <Text variant="title">{t('teacher.home.title')}</Text>
      <Text variant="body" style={styles.welcome}>
        {t('teacher.home.welcome', { name })}
      </Text>
      <Text variant="body" color={colors.muted} style={styles.placeholder}>
        {t('teacher.home.placeholder')}
      </Text>
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
  welcome: { marginTop: spacing.sm },
  placeholder: { marginTop: spacing.md },
  action: { marginTop: spacing.xl },
});
