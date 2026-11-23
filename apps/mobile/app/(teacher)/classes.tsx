import { useI18n } from '../../i18n';
import { EmptyState, Screen, Text } from '../../ui';

// Placeholder for the teacher surface: no feature screens yet (later prompts).
export default function TeacherHome() {
  const { t } = useI18n();
  return (
    <Screen>
      <Text variant="title" accessibilityRole="header">
        {t('teacher.home.title')}
      </Text>
      <EmptyState title={t('shell.teacher.empty')} />
    </Screen>
  );
}
