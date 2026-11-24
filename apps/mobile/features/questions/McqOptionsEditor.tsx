import {
  addOption,
  MAX_OPTIONS,
  MIN_OPTIONS,
  optionKey,
  removeOption,
  type QuestionDraft,
} from '@school/core';
import { Pressable, StyleSheet, View } from 'react-native';

import { useI18n } from '../../i18n';
import { Button, Icon, IconButton, Text, TextField, useTheme } from '../../ui';
import { useFocusRing } from '../../ui/Sticker';
import { radius, space, strokeWidth } from '../../ui/tokens';

function CorrectToggle({
  letter,
  selected,
  onPress,
}: {
  letter: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { t } = useI18n();
  const { colours, p } = useTheme();
  const { focusProps, ring } = useFocusRing();
  return (
    <Pressable
      {...focusProps}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityLabel={t('staff.questions.markCorrect', { letter })}
      accessibilityState={{ checked: selected, selected }}
      style={[
        styles.letter,
        {
          width: p.minTarget,
          height: p.minTarget,
          borderColor: selected ? colours.correct : colours.borderStrong,
          backgroundColor: selected ? colours.correctSoft : colours.surface,
        },
        ring,
      ]}
    >
      {selected ? (
        <Icon name="check" tone="onCorrectSoft" size={20} />
      ) : (
        <Text variant="label" script="latin">
          {letter}
        </Text>
      )}
    </Pressable>
  );
}

/** mcq options: tap a letter to mark the correct one (a check, not colour alone). */
export function McqOptionsEditor({
  draft,
  onChange,
  onSubmit,
}: {
  draft: QuestionDraft;
  onChange: (d: QuestionDraft) => void;
  onSubmit: () => void;
}) {
  const { t } = useI18n();
  return (
    <View style={styles.wrap}>
      <Text variant="label">{t('staff.questions.options')}</Text>
      <Text variant="bodySm" tone="textMuted">
        {t('staff.questions.optionsHint')}
      </Text>
      <View accessibilityRole="radiogroup" accessibilityLabel={t('staff.questions.correctOption')}>
        {draft.options.map((text, i) => {
          const letter = optionKey(i);
          return (
            <View key={i} style={styles.row}>
              <CorrectToggle
                letter={letter}
                selected={draft.correctIndex === i}
                onPress={() => onChange({ ...draft, correctIndex: i })}
              />
              <TextField
                label={t('staff.questions.optionLabel', { letter })}
                value={text}
                onChangeText={(v) =>
                  onChange({ ...draft, options: draft.options.map((o, j) => (j === i ? v : o)) })
                }
                onSubmitEditing={onSubmit}
                style={styles.flex}
              />
              <IconButton
                icon="close"
                label={t('staff.questions.removeOption', { letter })}
                disabled={draft.options.length <= MIN_OPTIONS}
                onPress={() => onChange(removeOption(draft, i))}
              />
            </View>
          );
        })}
      </View>
      {draft.options.length < MAX_OPTIONS ? (
        <Button
          title={t('staff.questions.addOption')}
          variant="ghost"
          size="sm"
          onPress={() => onChange(addOption(draft))}
          style={styles.start}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, marginBottom: space.xs },
  flex: { flex: 1 },
  letter: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: strokeWidth.control,
    borderRadius: radius.full,
  },
  start: { alignSelf: 'flex-start' },
});
