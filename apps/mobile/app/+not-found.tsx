import { Link } from 'expo-router';

import { useI18n } from '../i18n';
import { EmptyState, Screen, Text } from '../ui';

export default function NotFound() {
  const { t } = useI18n();
  return (
    <Screen>
      <EmptyState
        title={t('shell.notFound.title')}
        action={
          <Link href="/login">
            <Text>{t('auth.login.studentLink')}</Text>
          </Link>
        }
      />
    </Screen>
  );
}
