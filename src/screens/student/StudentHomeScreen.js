// Landing screen for a signed-in student. This is where the student app proper
// (assessments, scores, attendance) will grow; for now the tiles are honest
// "coming soon" placeholders so the screen has a real empty state instead of a
// blank page (CLAUDE.md). Greets by the name on the profile, big friendly
// tiles, one way out. Bilingual + RTL.
//
// It reads only the already-loaded profile — no network on mount — so it opens
// instantly and works on patchy connections.
import { View, StyleSheet } from 'react-native';

import { ScreenContainer, Text, Button, LanguageSwitch } from '../../components';
import { useAuth } from '../../auth/AuthProvider';
import { t } from '../../i18n';
import { colors, spacing } from '../../theme/colors';

const TILES = ['assessments', 'scores', 'attendance'];

export default function StudentHomeScreen() {
  const { profile, signOut } = useAuth();
  const name = profile?.full_name?.trim();

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
        {TILES.map((key) => (
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
  tileNote: { marginTop: spacing.xs },
  signOut: { marginTop: spacing.lg },
});
