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
        title={t('teacher.home.openMessages')}
        subtitle={t('staff.home.messagesHint')}
        onPress={() => router.push('/messages')}
      />
      <ListItem
        title={t('console.attendance.title')}
        subtitle={t('staff.home.attendanceHint')}
        onPress={() => router.push('/attendance')}
      />
      <ListItem
        title={t('staff.attendanceSummary.title')}
        subtitle={t('staff.home.attendanceSummaryHint')}
        onPress={() => router.push('/attendance-summary')}
      />
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
      <ListItem
        title={t('console.grading.title')}
        subtitle={t('staff.home.gradingHint')}
        onPress={() => router.push('/grading')}
      />
      <ListItem
        title={t('console.overdue.title')}
        subtitle={t('staff.home.overdueHint')}
        onPress={() => router.push('/overdue')}
      />
    </Screen>
  );
}
