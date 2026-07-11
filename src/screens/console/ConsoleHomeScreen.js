// Landing screen for developer/admin. Setup screens follow the CLAUDE.md build
// order (academic year -> classes -> ...). No navigation library yet, so the
// console switches between its own screens with local state.
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { ScreenContainer, Text, Button } from '../../components';
import { useAuth } from '../../auth/AuthProvider';
import { t } from '../../i18n';
import { colors, spacing } from '../../theme/colors';
import AcademicYearsScreen from './AcademicYearsScreen';

export default function ConsoleHomeScreen() {
  const { profile, session, signOut } = useAuth();
  const name = profile?.full_name || session?.user?.email || '';
  const [screen, setScreen] = useState('home'); // 'home' | 'academicYears'

  if (screen === 'academicYears') {
    return <AcademicYearsScreen onBack={() => setScreen('home')} />;
  }

  return (
    <ScreenContainer>
      <Text variant="title">{t('console.home.title')}</Text>
      <Text variant="body" style={styles.welcome}>
        {t('console.home.welcome', { name })}
      </Text>
      <Text variant="body" color={colors.muted} style={styles.placeholder}>
        {t('console.home.placeholder')}
      </Text>
      <Button
        label={t('console.home.openAcademicYears')}
        onPress={() => setScreen('academicYears')}
        style={styles.nav}
      />
      <Button
        variant="secondary"
        label={t('auth.signOut')}
        onPress={signOut}
        style={styles.action}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  welcome: { marginTop: spacing.sm },
  placeholder: { marginTop: spacing.md },
  nav: { marginTop: spacing.xl },
  action: { marginTop: spacing.md },
});
