import { useI18n } from '../../i18n';
import { EmptyState, Screen, Text } from '../../ui';

// Placeholder for the admin surface: no feature screens yet (later prompts).
export default function AdminHome() {
  const { t } = useI18n();
  return (
    <Screen>
      <Text variant="title" accessibilityRole="header">
        {t('console.home.title')}
      </Text>
      <EmptyState title={t('console.academicYears.empty')} />
    </Screen>
  );
}
