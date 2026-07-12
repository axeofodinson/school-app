// JourneyCard — the home screen's light engagement strip: how many tests the
// child has finished this year, the medal they're walking toward, the medals
// already earned, and their show-up streak. Every number comes from
// engagementStore (real submissions/attendance under RLS + the offline
// queue) — nothing here is invented.
//
// Healthy by design (mirrors src/engagement/engagement.js):
//   * Effort only — finished tests and days shown up; never scores or ranks.
//   * One goal ahead: only the NEXT medal is named, never a wall of locked
//     ones. Earned medals stay forever.
//   * No loss states: a streak of 0 or 1 simply isn't mentioned; if there was
//     a longer run before, it shows as "best run" (pride, not guilt).
//
// Rendering: cache-first so the home stays instant and works offline — the
// card paints from the last known summary immediately, then refreshes in the
// background. Brand-new students get a warm invite line, not a zeroed
// dashboard (every screen has a real empty state).
import { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';

import Text from '../Text';
import { QuestPanel, QuestBar, QuestBadge, Sprite, Enter } from '../quest';
import { getCachedSummary, loadEngagementSummary } from '../../lib/engagementStore';
import {
  earnedMilestones,
  nextMilestone,
  milestoneProgress,
} from '../../engagement/engagement';
import { t } from '../../i18n';
import { quest, spacing, displayText } from '../../theme/quest';

export default function JourneyCard() {
  // undefined = still loading (render nothing yet), null = nothing to show,
  // object = summary. Cache paints first; the live load corrects it after.
  const [summary, setSummary] = useState(undefined);

  useEffect(() => {
    let alive = true;
    (async () => {
      const cached = await getCachedSummary();
      if (alive && cached) setSummary(cached);
      const fresh = await loadEngagementSummary();
      if (alive) setSummary(fresh ?? cached ?? null);
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (summary === undefined) return null;

  const finished = summary?.testsFinished ?? 0;
  const streak = summary?.streak ?? { current: 0, best: 0 };
  const started = finished > 0 || streak.best >= 2;

  // Brand-new journey: one warm invitation, not a dashboard of zeros.
  if (!started) {
    return (
      <Enter delay={40}>
        <QuestPanel style={styles.card} faceStyle={styles.inviteFace}>
          <Sprite name="medal" size={40} />
          <Text variant="caption" color={quest.faint} style={styles.inviteText}>
            {t('student.journey.invite')}
          </Text>
        </QuestPanel>
      </Enter>
    );
  }

  const earned = earnedMilestones(finished);
  const next = nextMilestone(finished);

  return (
    <Enter delay={40}>
      <QuestPanel style={styles.card}>
        <View style={styles.headRow}>
          <Sprite name="medal" size={36} />
          <View style={styles.headText}>
            <Text color={quest.ink} style={displayText(18)}>
              {t('student.journey.title')}
            </Text>
            <Text variant="caption" color={quest.faint}>
              {finished > 0
                ? t('student.journey.tests', { count: finished })
                : t('student.journey.invite')}
            </Text>
          </View>
        </View>

        {/* The road to the next medal — a single goal ahead, bar filling
            from the last medal earned. A finished ladder reads as a full
            gold bar and a proud line. */}
        <QuestBar
          value={milestoneProgress(finished)}
          color={next ? quest.gold : quest.goldEdge}
          style={styles.bar}
        />
        <Text variant="caption" color={quest.faint} style={styles.nextLine}>
          {next
            ? t('student.journey.next', {
                name: t(`student.journey.milestones.${next.key}`),
                count: next.count - finished,
              })
            : t('student.journey.allDone')}
        </Text>

        {earned.length > 0 ? (
          <View style={styles.medalRow}>
            {earned.map((m) => (
              <QuestBadge
                key={m.key}
                label={t(`student.journey.milestones.${m.key}`)}
                tone="goldSolid"
                style={styles.medal}
              />
            ))}
          </View>
        ) : null}

        {/* The show-up streak — only ever good news: a live run of 2+ days,
            or the best run so far. A run of 0 or 1 says nothing at all. */}
        {streak.current >= 2 ? (
          <View style={styles.streakRow}>
            <Sprite name="flame" size={28} />
            <Text variant="label" color={quest.ink} style={styles.streakText}>
              {t('student.journey.streak', { count: streak.current })}
            </Text>
          </View>
        ) : streak.best >= 2 ? (
          <View style={styles.streakRow}>
            <Sprite name="flame" size={28} />
            <Text variant="caption" color={quest.faint} style={styles.streakText}>
              {t('student.journey.bestStreak', { count: streak.best })}
            </Text>
          </View>
        ) : null}
      </QuestPanel>
    </Enter>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: spacing.md },
  inviteFace: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inviteText: { flex: 1, marginStart: spacing.md },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headText: { flex: 1, marginStart: spacing.md },
  bar: { marginTop: spacing.md },
  nextLine: { marginTop: spacing.xs },
  medalRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.sm,
  },
  medal: { marginEnd: spacing.xs, marginTop: spacing.xs },
  streakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
  },
  streakText: { flex: 1, marginStart: spacing.sm },
});
