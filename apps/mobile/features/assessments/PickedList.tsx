import { movePick, setPickMarks, totalMarks, type PickedQuestion } from '@school/core';
import { StyleSheet, View } from 'react-native';

import { useI18n } from '../../i18n';
import { Button, EmptyState, Text, TextField, useTheme } from '../../ui';
import { space, strokeWidth } from '../../ui/tokens';

/**
 * The paper: picked questions in order with marks each, and the total. Move
 * buttons instead of drag so it works by keyboard and screen reader. Read-only
 * once published (the question set is locked).
 */
export function PickedList({
  picks,
  labelFor,
  onChange,
  onSubmit,
  locked,
  badMarksId,
}: {
  picks: PickedQuestion[];
  labelFor: (questionId: string) => string;
  onChange: (p: PickedQuestion[]) => void;
  onSubmit: () => void;
  locked: boolean;
  badMarksId: string | null;
}) {
  const { t } = useI18n();
  const { colours } = useTheme();
  if (!picks.length) {
    return (
      <EmptyState
        icon="tasks"
        title={t('staff.assessments.noneYet')}
        body={t('staff.assessments.noneYetBody')}
      />
    );
  }
  return (
    <View style={styles.wrap}>
      <Text variant="label" accessibilityLiveRegion="polite">
        {t('console.assessments.build.selectedCount', { count: picks.length })} ·{' '}
        {t('console.assessments.build.totalMarks', { total: totalMarks(picks) })}
      </Text>
      {picks.map((p, i) => {
        const label = labelFor(p.questionId);
        return (
          <View key={p.questionId} style={[styles.item, { borderColor: colours.border }]}>
            <Text style={styles.label}>
              {i + 1}. {label}
            </Text>
            {locked ? (
              <Text tone="textMuted">
                {t('staff.questions.marksBadge', { count: Number(p.marks) })}
              </Text>
            ) : (
              <View style={styles.controls}>
                <TextField
                  label={t('console.assessments.build.marks')}
                  value={p.marks}
                  onChangeText={(m) => onChange(setPickMarks(picks, p.questionId, m))}
                  onSubmitEditing={onSubmit}
                  error={
                    badMarksId === p.questionId
                      ? t('console.assessments.errors.marksInvalid')
                      : undefined
                  }
                  keyboardType="number-pad"
                  script="latin"
                  maxLength={3}
                  style={styles.marks}
                />
                <Button
                  title={t('staff.assessments.moveUp')}
                  variant="ghost"
                  size="sm"
                  disabled={i === 0}
                  accessibilityHint={label}
                  onPress={() => onChange(movePick(picks, p.questionId, -1))}
                />
                <Button
                  title={t('staff.assessments.moveDown')}
                  variant="ghost"
                  size="sm"
                  disabled={i === picks.length - 1}
                  accessibilityHint={label}
                  onPress={() => onChange(movePick(picks, p.questionId, 1))}
                />
                <Button
                  title={t('staff.assessments.remove')}
                  variant="ghost"
                  size="sm"
                  icon="close"
                  accessibilityHint={label}
                  onPress={() => onChange(picks.filter((x) => x.questionId !== p.questionId))}
                />
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  item: {
    gap: space.xs,
    paddingVertical: space.sm,
    borderBottomWidth: strokeWidth.hairline,
  },
  label: { flexShrink: 1 },
  controls: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: space.xs },
  marks: { width: 110 },
});
