// TapImageChoices — the answer grid for one tap_image question. Shared by the
// paged pre-reader flow (size="big") and by mixed tests that carry a tap_image
// question inline among reading questions (size="compact").
//
// Layout: two choices stack full-width (the classic "which one?" face-off);
// three or more wrap into a two-column grid. Column order follows the reading
// direction automatically (flex row + wrap).
import { View, StyleSheet } from 'react-native';

import TapChoiceCard from './TapChoiceCard';
import { t, getLocale } from '../../i18n';
import { tapChoices } from '../../prereader/tapImage';
import { spacing } from '../../theme/quest';

export default function TapImageChoices({
  body, // questions.body jsonb
  selectedId,
  onSelect, // (choiceId) => void
  disabled,
  size = 'big',
  style,
}) {
  const choices = tapChoices(body, getLocale());
  const stacked = choices.length <= 2;

  return (
    <View style={[styles.grid, style]}>
      {choices.map((choice, i) => (
        <TapChoiceCard
          key={choice.id}
          choice={choice}
          selected={selectedId === choice.id}
          onPress={() => onSelect(choice.id)}
          disabled={disabled}
          size={size}
          accessibilityLabel={
            choice.label ?? t('student.prereader.choiceFallback', { number: i + 1 })
          }
          style={stacked ? styles.fullRow : styles.halfCell}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  fullRow: {
    width: '100%',
    marginBottom: spacing.md,
  },
  halfCell: {
    width: '48.5%',
    marginBottom: spacing.md,
  },
});
