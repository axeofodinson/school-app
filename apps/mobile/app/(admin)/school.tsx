import { useRouter } from 'expo-router';

import { AccountActions } from '../../features/auth/AccountActions';
import { useAuth } from '../../features/auth/AuthProvider';
import { useI18n } from '../../i18n';
import { EmptyState, ListItem, Screen, Text } from '../../ui';

// Placeholder for the admin surface: setup screens come in later prompts.
export default function AdminHome() {
  const { t } = useI18n();
  const router = useRouter();
  const { profile } = useAuth();
  return (
    <Screen>
      <AccountActions />
      <Text variant="title" accessibilityRole="header">
        {t('console.home.title')}
      </Text>
      {profile?.full_name ? (
        <Text>{t('console.home.welcome', { name: profile.full_name })}</Text>
      ) : null}
      <ListItem title={t('auth.cards.open')} onPress={() => router.push('/qr-cards')} />
      <ListItem title={t('auth.settings.deviceTitle')} onPress={() => router.push('/settings')} />
      <EmptyState title={t('console.academicYears.empty')} />
    </Screen>
  );
}
