import { useI18n } from '../../i18n';
import { AppText } from '../../ui/AppText';
import { EmptyState } from '../../ui/EmptyState';
import { Screen } from '../../ui/Screen';

// Placeholder for the teacher surface: no feature screens yet (later prompts).
export default function TeacherHome() {
  const { t } = useI18n();
  return (
    <Screen>
      <AppText variant="title" accessibilityRole="header">
        {t('teacher.home.title')}
      </AppText>
      <EmptyState title={t('shell.teacher.empty')} />
    </Screen>
  );
}
