import { useI18n } from '../../i18n';
import { AppText } from '../../ui/AppText';
import { EmptyState } from '../../ui/EmptyState';
import { Screen } from '../../ui/Screen';

// Placeholder for the student surface: no feature screens yet (later prompts).
export default function StudentHome() {
  const { t } = useI18n();
  return (
    <Screen>
      <AppText variant="title" accessibilityRole="header">
        {t('student.home.title')}
      </AppText>
      <EmptyState title={t('student.assessments.empty')} />
    </Screen>
  );
}
