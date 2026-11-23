import { useI18n } from '../../i18n';
import { AppText } from '../../ui/AppText';
import { EmptyState } from '../../ui/EmptyState';
import { Screen } from '../../ui/Screen';

// Placeholder for the admin surface: no feature screens yet (later prompts).
export default function AdminHome() {
  const { t } = useI18n();
  return (
    <Screen>
      <AppText variant="title" accessibilityRole="header">
        {t('console.home.title')}
      </AppText>
      <EmptyState title={t('console.academicYears.empty')} />
    </Screen>
  );
}
