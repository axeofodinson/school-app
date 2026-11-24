import { AccountActions } from '../../features/auth/AccountActions';
import { useAuth } from '../../features/auth/AuthProvider';
import { useI18n } from '../../i18n';
import { EmptyState, Screen, Text } from '../../ui';

// Placeholder for the student surface: no feature screens yet (later prompts).
export default function StudentHome() {
  const { t } = useI18n();
  const { profile } = useAuth();
  return (
    <Screen>
      <AccountActions />
      <Text variant="title" accessibilityRole="header">
        {profile?.full_name
          ? t('student.home.greeting', { name: profile.full_name })
          : t('student.home.title')}
      </Text>
      <EmptyState title={t('student.assessments.empty')} />
    </Screen>
  );
}
