import { useRouter } from 'expo-router';

import { QrScanner } from '../../features/auth/QrScanner';
import { useI18n } from '../../i18n';
import { Screen, Text } from '../../ui';

// Scan a QR login card: fills the admission number on the sign-in screen. The
// PIN is always typed there (the card never carries one).
export default function Scan() {
  const { t } = useI18n();
  const router = useRouter();
  return (
    <Screen>
      <Text variant="title" accessibilityRole="header">
        {t('auth.scan.title')}
      </Text>
      <QrScanner
        onAdmissionNo={(admission) => router.replace({ pathname: '/login', params: { admission } })}
        onTypeInstead={() => router.replace('/login')}
      />
    </Screen>
  );
}
