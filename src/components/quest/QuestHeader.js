// QuestHeader — the shared top-of-screen band for student sub-screens:
// display-font title (pixel in English, Nastaliq in Urdu), optional subtitle,
// and the Back action as a small ghost button. Row layout uses flex order, so
// it mirrors correctly under RTL with no special casing.
import { View, StyleSheet } from 'react-native';

import Text from '../Text';
import QuestButton from './QuestButton';
import { quest, spacing, displayText } from '../../theme/quest';

export default function QuestHeader({ title, subtitle, backLabel, onBack, right }) {
  return (
    <>
      <View style={styles.row}>
        <Text color={quest.ink} style={[styles.title, displayText(24)]}>
          {title}
        </Text>
        {right}
        {onBack ? (
          <QuestButton
            label={backLabel}
            onPress={onBack}
            variant="ghost"
            size="sm"
            style={styles.back}
          />
        ) : null}
      </View>
      {subtitle ? (
        <Text variant="body" color={quest.faint} style={styles.subtitle}>
          {subtitle}
        </Text>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { flex: 1, marginEnd: spacing.md },
  back: { marginStart: spacing.sm },
  subtitle: { marginTop: spacing.xs },
});
