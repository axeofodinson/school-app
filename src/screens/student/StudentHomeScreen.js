// Landing screen for a signed-in student. The "My tests" tile is now live — it
// opens the published assessments assigned to the student's class and the
// attempt flow (StudentAssessmentsScreen). Scores and attendance are still
// honest "coming soon" placeholders so the screen has a real empty state instead
// of a blank page (CLAUDE.md). Greets by the name on the profile. Bilingual + RTL.
//
// No navigation library yet, so it switches to the assessments screen with local
// state (same pattern as the console). The home itself reads only the
// already-loaded profile — no network on mount — so it opens instantly.
import { useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';

import { ScreenContainer, Text, Button, LanguageSwitch } from '../../components';
import { useAuth } from '../../auth/AuthProvider';
import { t } from '../../i18n';
import { colors, spacing } from '../../theme/colors';
import StudentAssessmentsScreen from './StudentAssessmentsScreen';

export default function StudentHomeScreen() {
  const { profile, signOut } = useAuth();
  const name = profile?.full_name?.trim();
  const [screen, setScreen] = useState('home'); // 'home' | 'assessments'

  if (screen === 'assessments') {
    return <StudentAssessmentsScreen onBack={() => setScreen('home')} />;
  }

  return (
    <ScreenContainer scroll>
      <View style={styles.header}>
        <Text variant="title">{t('student.home.title')}</Text>
        <LanguageSwitch />
      </View>

      <Text variant="subtitle" style={styles.greeting}>
        {name ? t('student.home.greeting', { name }) : t('student.home.welcome')}
      </Text>
      <Text variant="body" color={colors.muted} style={styles.placeholder}>
        {t('student.home.placeholder')}
      </Text>

      <View style={styles.tiles}>
        {/* Live tile — opens the assessments list + attempt flow. */}
        <Pressable
          onPress={() => setScreen('assessments')}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.tile,
            styles.tileActive,
            pressed && styles.tilePressed,
          ]}
        >
          <Text variant="label" color={colors.primary}>
            {t('student.home.assessments')}
          </Text>
          <Text variant="caption" color={colors.muted} style={styles.tileNote}>
            {t('student.home.assessmentsNote')}
          </Text>
        </Pressable>

        {/* Not built yet — honest placeholders. */}
        {['scores', 'attendance'].map((key) => (
          <View key={key} style={styles.tile}>
            <Text variant="label">{t(`student.home.${key}`)}</Text>
            <Text variant="caption" color={colors.muted} style={styles.tileNote}>
              {t('student.home.comingSoon')}
            </Text>
          </View>
        ))}
      </View>

      <Button
        variant="secondary"
        label={t('student.home.signOut')}
        onPress={signOut}
        style={styles.signOut}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  greeting: { marginTop: spacing.md },
  placeholder: { marginTop: spacing.sm },
  tiles: { marginTop: spacing.xl },
  tile: {
    minHeight: 72,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: spacing.lg,
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    justifyContent: 'center',
  },
  tileActive: { borderColor: colors.primary },
  tilePressed: { opacity: 0.85 },
  tileNote: { marginTop: spacing.xs },
  signOut: { marginTop: spacing.lg },
});
