// Celebration — the pre-reader finish screen: a treasure chest springs in
// under a stagger of popping stars, the tada fanfare plays, and the praise
// line is spoken out loud (the child can't read it). Deliberately about
// FINISHING, not being right — grading stays a later teacher pass (rule 3),
// so every child who does the work gets the same warm landing.
//
// `status` mirrors the attempt flow: 'submitted' (safe on the server) or
// 'queued' (offline — saved locally, will sync). The child's celebration is
// identical for both; the queued case adds one quiet parent-facing line.
import { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';

import Text from '../Text';
import Sprite from '../quest/Sprite';
import Pop from '../quest/Pop';
import Enter from '../quest/Enter';
import QuestButton from '../quest/QuestButton';
import { t, getLocale } from '../../i18n';
import { playEffect, speakPrompt, stopPrompt } from '../../prereader/sound';
import { quest, spacing, displayText } from '../../theme/quest';

// A loose arc of stars over the chest; sizes/delays tuned so they pop like
// popcorn instead of marching in.
const STARS = [
  { size: 26, delay: 250 },
  { size: 34, delay: 100 },
  { size: 44, delay: 400 },
  { size: 34, delay: 550 },
  { size: 26, delay: 320 },
];

export default function Celebration({ status, onDone }) {
  useEffect(() => {
    playEffect('tada');
    speakPrompt({ text: t('student.prereader.celebrate.title'), locale: getLocale() });
    return () => {
      stopPrompt();
    };
  }, []);

  return (
    <View style={styles.box}>
      <View style={styles.starsRow}>
        {STARS.map((s, i) => (
          <Pop key={i} delay={s.delay}>
            <Sprite name="star" size={s.size} />
          </Pop>
        ))}
      </View>
      <Pop delay={150}>
        <Sprite name="chest" size={110} />
      </Pop>
      <Enter delay={350}>
        <Text color={quest.ink} align="center" style={[styles.title, displayText(30)]}>
          {t('student.prereader.celebrate.title')}
        </Text>
      </Enter>
      <Enter delay={500}>
        <Text variant="body" color={quest.faint} align="center" style={styles.line}>
          {status === 'queued'
            ? t('student.attempt.queued')
            : t('student.prereader.celebrate.saved')}
        </Text>
      </Enter>
      <QuestButton
        variant="gold"
        size="lg"
        label={t('student.attempt.doneBack')}
        onPress={onDone}
        style={styles.done}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { marginTop: spacing.xl, alignItems: 'center' },
  starsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    columnGap: spacing.sm,
    marginBottom: spacing.sm,
  },
  title: { marginTop: spacing.md },
  line: { marginTop: spacing.sm, paddingHorizontal: spacing.lg },
  done: { marginTop: spacing.lg, minWidth: 220 },
});
