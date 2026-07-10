import { ActivityIndicator, StyleSheet } from 'react-native';

import { ScreenContainer, Text } from '../../components';
import { colors, spacing } from '../../theme/colors';
import { t } from '../../i18n';

export default function LoadingScreen() {
  return (
    <ScreenContainer center>
      <ActivityIndicator color={colors.primary} />
      <Text variant="body" color={colors.muted} align="center" style={styles.label}>
        {t('common.loading')}
      </Text>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  label: { marginTop: spacing.md },
});
