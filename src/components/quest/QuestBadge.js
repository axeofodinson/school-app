// QuestBadge — a small status chip in the pixel style: soft tinted face,
// chunky outline, blocky corners. Text must already be localized.
import { View, StyleSheet } from 'react-native';

import Text from '../Text';
import { quest, px, spacing } from '../../theme/quest';

const TONES = {
  gold: { face: quest.goldTint, outline: quest.goldEdge, text: quest.goldEdge },
  green: { face: quest.greenTint, outline: quest.greenEdge, text: quest.greenEdge },
  sky: { face: quest.skyTint, outline: quest.skyEdge, text: quest.skyEdge },
  red: { face: quest.redTint, outline: quest.redEdge, text: quest.redEdge },
  faint: { face: quest.bgDeep, outline: quest.faint, text: quest.faint },
  // solid fills, for "achieved" states
  greenSolid: { face: quest.green, outline: quest.greenEdge, text: quest.cream },
  goldSolid: { face: quest.gold, outline: quest.goldEdge, text: quest.ink },
};

export default function QuestBadge({ label, tone = 'faint', style }) {
  const t = TONES[tone] ?? TONES.faint;
  return (
    <View style={[styles.badge, { backgroundColor: t.face, borderColor: t.outline }, style]}>
      <Text variant="caption" align="center" color={t.text} style={styles.text}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderWidth: px.border,
    borderRadius: px.radius - 2,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  text: {
    fontWeight: '700',
  },
});
