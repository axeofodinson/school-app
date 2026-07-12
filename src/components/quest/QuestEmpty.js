// QuestEmpty — empty/error states with a friend in them: the sprout buddy
// (or another sprite) plus an honest, already-localized message, and an
// optional action button (retry, back). Keeps CLAUDE.md's "real empty state"
// rule while making the dead ends feel alive.
import { View, StyleSheet } from 'react-native';

import Text from '../Text';
import Sprite from './Sprite';
import QuestButton from './QuestButton';
import Enter from './Enter';
import { quest, spacing } from '../../theme/quest';

export default function QuestEmpty({
  message,
  sprite = 'sprout',
  tone = 'faint', // 'faint' | 'danger' — danger for load errors
  actionLabel,
  onAction,
  actionVariant = 'ghost',
  style,
}) {
  return (
    <Enter style={[styles.box, style]}>
      <Sprite name={sprite} size={64} />
      <Text
        variant="body"
        color={tone === 'danger' ? quest.red : quest.faint}
        align="center"
        style={styles.message}
      >
        {message}
      </Text>
      {actionLabel && onAction ? (
        <QuestButton
          label={actionLabel}
          onPress={onAction}
          variant={actionVariant}
          size="sm"
          style={styles.action}
        />
      ) : null}
    </Enter>
  );
}

const styles = StyleSheet.create({
  box: { marginTop: spacing.xl, alignItems: 'center', paddingHorizontal: spacing.lg },
  message: { marginTop: spacing.md },
  action: { marginTop: spacing.lg, minWidth: 140 },
});
