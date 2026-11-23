import { Link } from 'expo-router';

import { useI18n } from '../i18n';
import { AppText } from '../ui/AppText';
import { EmptyState } from '../ui/EmptyState';
import { Screen } from '../ui/Screen';

export default function NotFound() {
  const { t } = useI18n();
  return (
    <Screen>
      <EmptyState
        title={t('shell.notFound.title')}
        action={
          <Link href="/login">
            <AppText>{t('auth.login.studentLink')}</AppText>
          </Link>
        }
      />
    </Screen>
  );
}
