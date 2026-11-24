import { useRouter } from 'expo-router';

import { AccountActions } from '../../features/auth/AccountActions';
import { useAuth } from '../../features/auth/AuthProvider';
import { useI18n } from '../../i18n';
import { ListItem, Screen, Text } from '../../ui';

// Teacher home: the tools built so far. More arrive with later prompts.
export default function TeacherHome() {
  const { t } = useI18n();
  const router = useRouter();
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
      <ListItem
        title={t('teacher.questions.title')}
        subtitle={t('staff.home.questionsHint')}
        onPress={() => router.push('/questions')}
      />
      <ListItem
        title={t('console.assessments.title')}
        subtitle={t('staff.home.assessmentsHint')}
        onPress={() => router.push('/assessments')}
      />
    </Screen>
  );
}
