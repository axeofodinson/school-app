import { useRouter } from 'expo-router';
import { StyleSheet } from 'react-native';

import { QrCardSheet } from '../../features/auth/QrCardSheet';
import { useI18n } from '../../i18n';
import { Button, Screen, Text } from '../../ui';

export default function QrCards() {
  const { t } = useI18n();
  const router = useRouter();
  return (
    <Screen>
      <Button
        title={t('auth.settings.back')}
        icon="back"
        variant="ghost"
        size="sm"
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/school'))}
        style={styles.back}
      />
      <Text variant="title" accessibilityRole="header">
        {t('auth.cards.title')}
      </Text>
      <Text tone="textMuted">{t('auth.cards.subtitle')}</Text>
      <QrCardSheet />
    </Screen>
  );
}

const styles = StyleSheet.create({ back: { alignSelf: 'flex-start' } });
