import { AccountActions } from '../../features/auth/AccountActions';
import { useAuth } from '../../features/auth/AuthProvider';
import { useI18n } from '../../i18n';
import { EmptyState, Screen, Text } from '../../ui';

// Placeholder for the teacher surface: no feature screens yet (later prompts).
export default function TeacherHome() {
  const { t } = useI18n();
  const { profile } = useAuth();
  return (
    <Screen>
      <AccountActions />
      <Text variant="title" accessibilityRole="header">
        {t('teacher.home.title')}
      </Text>
      {profile?.full_name ? (
        <Text>{t('teacher.home.welcome', { name: profile.full_name })}</Text>
      ) : null}
      <EmptyState title={t('shell.teacher.empty')} />
    </Screen>
  );
}
