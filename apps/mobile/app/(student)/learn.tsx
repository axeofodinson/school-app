import { useI18n } from '../../i18n';
import { EmptyState, Screen, Text } from '../../ui';

// Placeholder for the student surface: no feature screens yet (later prompts).
export default function StudentHome() {
  const { t } = useI18n();
  return (
    <Screen>
      <Text variant="title" accessibilityRole="header">
        {t('student.home.title')}
      </Text>
      <EmptyState title={t('student.assessments.empty')} />
    </Screen>
  );
}
