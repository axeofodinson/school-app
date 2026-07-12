// Landing screen for a signed-in student. Three tiles are now live: "My tests"
// opens the published assessments and the attempt flow (StudentAssessmentsScreen),
// "My scores" opens the student's own graded results (StudentResultsScreen), and
// "My attendance" opens their attendance record (StudentAttendanceScreen). All
// three are read-only and RLS-scoped to the signed-in student. Greets by the name
// on the profile. Bilingual + RTL.
//
// No navigation library yet, so it switches screens with local state (same
// pattern as the console). The home itself reads only the already-loaded profile
// — no network on mount — so it opens instantly. The journey card below the
// greeting paints from its offline cache and refreshes itself in the
// background, so it never delays the screen either.
//
// Visuals: quest theme — each tile is a big colored game-tile with its own
// sprite, entering with a small stagger; pressing pushes it into the ground.
// All copy is the same i18n keys as before; layout is logical start/end so the
// whole screen mirrors under Urdu/RTL.
import { useState } from 'react';
import { View, StyleSheet } from 'react-native';

import { Text } from '../../components';
import {
  QuestScreen,
  QuestPanel,
  QuestPressable,
  QuestButton,
  QuestLanguageSwitch,
  Sprite,
  Enter,
} from '../../components/quest';
import { JourneyCard } from '../../components/engagement';
import { useAuth } from '../../auth/AuthProvider';
import { t } from '../../i18n';
import { quest, spacing, displayText } from '../../theme/quest';
import StudentAssessmentsScreen from './StudentAssessmentsScreen';
import StudentResultsScreen from './StudentResultsScreen';
import StudentReportCardScreen from './StudentReportCardScreen';
import StudentAttendanceScreen from './StudentAttendanceScreen';

// The live tiles, in order, each mapping to a screen the home switches to —
// now also carrying their quest look (sprite + tile colours).
const TILES = [
  {
    key: 'assessments',
    screen: 'assessments',
    note: 'assessmentsNote',
    sprite: 'sword',
    face: quest.green,
    edge: quest.greenEdge,
    text: quest.cream,
  },
  {
    key: 'scores',
    screen: 'results',
    note: 'scoresNote',
    sprite: 'star',
    face: quest.gold,
    edge: quest.goldEdge,
    text: quest.ink,
  },
  {
    key: 'report',
    screen: 'report',
    note: 'reportNote',
    sprite: 'scroll',
    face: quest.purple,
    edge: quest.purpleEdge,
    text: quest.cream,
  },
  {
    key: 'attendance',
    screen: 'attendance',
    note: 'attendanceNote',
    sprite: 'heart',
    face: quest.berry,
    edge: quest.berryEdge,
    text: quest.cream,
  },
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
    <QuestScreen scroll>
      <View style={styles.header}>
        <Text color={quest.ink} style={[styles.headerTitle, displayText(24)]}>
          {t('student.home.title')}
        </Text>
        <QuestLanguageSwitch />
      </View>

      {/* Greeting card — the sprout buddy welcomes the child by name. */}
      <Enter>
        <QuestPanel style={styles.greetingCard} faceStyle={styles.greetingFace}>
          <Sprite name="sprout" size={56} />
          <View style={styles.greetingText}>
            <Text color={quest.ink} style={displayText(20)}>
              {name ? t('student.home.greeting', { name }) : t('student.home.welcome')}
            </Text>
            <Text variant="caption" color={quest.faint} style={styles.greetingNote}>
              {t('student.home.placeholder')}
            </Text>
          </View>
        </QuestPanel>
      </Enter>

      {/* My journey — tests finished, medals, show-up streak (real data,
          cache-first; renders its own invite state for a brand-new student). */}
      <JourneyCard />

      <View style={styles.tiles}>
        {TILES.map((tile, i) => (
          <Enter key={tile.key} delay={80 + i * 70}>
            <QuestPressable
              onPress={() => setScreen(tile.screen)}
              face={tile.face}
              edge={tile.edge}
              outline={tile.edge}
              style={styles.tile}
              faceStyle={styles.tileFace}
            >
              <Sprite name={tile.sprite} size={44} />
              <View style={styles.tileText}>
                <Text color={tile.text} style={displayText(18)}>
                  {t(`student.home.${tile.key}`)}
                </Text>
                <Text
                  variant="caption"
                  color={tile.text}
                  style={styles.tileNote}
                >
                  {t(`student.home.${tile.note}`)}
                </Text>
              </View>
            </QuestPressable>
          </Enter>
        ))}
      </View>

      <QuestButton
        variant="ghost"
        size="sm"
        label={t('student.home.signOut')}
        onPress={signOut}
        style={styles.signOut}
      />
    </QuestScreen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: { flex: 1, marginEnd: spacing.md },
  greetingCard: { marginTop: spacing.lg },
  greetingFace: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  greetingText: { flex: 1, marginStart: spacing.md },
  greetingNote: { marginTop: spacing.xs },
  tiles: { marginTop: spacing.lg },
  tile: { marginBottom: spacing.md },
  tileFace: {
    minHeight: 84,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tileText: { flex: 1, marginStart: spacing.md },
  tileNote: { marginTop: 2, opacity: 0.85 },
  signOut: { marginTop: spacing.md, alignSelf: 'center', minWidth: 160 },
});
