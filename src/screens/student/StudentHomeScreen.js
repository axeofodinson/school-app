// Landing screen for a signed-in student. Three tiles are now live: "My tests"
// opens the published assessments and the attempt flow (StudentAssessmentsScreen),
// "My scores" opens the student's own graded results (StudentResultsScreen), and
// "My attendance" opens their attendance record (StudentAttendanceScreen). All
// three are read-only and RLS-scoped to the signed-in student. Greets by the name
// on the profile. Bilingual + RTL.
//
// No navigation library yet, so it switches screens with local state (same
// pattern as the console). The home itself reads only the already-loaded profile
// — no network on mount — so it opens instantly.
import { useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';

import { ScreenContainer, Text, Button, LanguageSwitch } from '../../components';
import { useAuth } from '../../auth/AuthProvider';
import { t } from '../../i18n';
import { colors, spacing } from '../../theme/colors';
import StudentAssessmentsScreen from './StudentAssessmentsScreen';
import StudentResultsScreen from './StudentResultsScreen';
import StudentReportCardScreen from './StudentReportCardScreen';
import StudentAttendanceScreen from './StudentAttendanceScreen';

// The live tiles, in order, each mapping to a screen the home switches to.
const TILES = [
  { key: 'assessments', screen: 'assessments', note: 'assessmentsNote' },
  { key: 'scores', screen: 'results', note: 'scoresNote' },
  { key: 'report', screen: 'report', note: 'reportNote' },
  { key: 'attendance', screen: 'attendance', note: 'attendanceNote' },
];

export default function StudentHomeScreen() {
  const { profile, signOut } = useAuth();
  const name = profile?.full_name?.trim();
  const [screen, setScreen] = useState('home'); // 'home' | 'assessments' | 'results' | 'report' | 'attendance'

  if (screen === 'assessments') {
    return <StudentAssessmentsScreen onBack={() => setScreen('home')} />;
  }
  if (screen === 'results') {
    return <StudentResultsScreen onBack={() => setScreen('home')} />;
  }
  if (screen === 'report') {
    return <StudentReportCardScreen onBack={() => setScreen('home')} />;
  }
  if (screen === 'attendance') {
    return <StudentAttendanceScreen onBack={() => setScreen('home')} />;
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
        {TILES.map((tile) => (
          <Pressable
            key={tile.key}
            onPress={() => setScreen(tile.screen)}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.tile,
              styles.tileActive,
              pressed && styles.tilePressed,
            ]}
          >
            <Text variant="label" color={colors.primary}>
              {t(`student.home.${tile.key}`)}
            </Text>
            <Text variant="caption" color={colors.muted} style={styles.tileNote}>
              {t(`student.home.${tile.note}`)}
            </Text>
          </Pressable>
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
