import { ASSESSMENT_TYPES, type AssessmentDraft, type AssessmentType } from '@school/core';
import { StyleSheet, View } from 'react-native';

import { useI18n } from '../../i18n';
import { TextField } from '../../ui';
import { space } from '../../ui/tokens';
import { ChipPicker } from '../scope/ChipPicker';

type Details = Pick<AssessmentDraft, 'title' | 'type' | 'weightage' | 'scheduledOn'>;

/** Title, type, weightage, date. Enter in any field saves (onSubmit). */
export function DetailsForm({
  value,
  onChange,
  onSubmit,
  typeLocked,
  fieldError,
}: {
  value: Details;
  onChange: (d: Partial<Details>) => void;
  onSubmit: () => void;
  typeLocked: boolean;
  fieldError: { field: 'title' | 'weightage' | 'scheduledOn'; message: string } | null;
}) {
  const { t } = useI18n();
  const err = (f: 'title' | 'weightage' | 'scheduledOn') =>
    fieldError?.field === f ? fieldError.message : undefined;
  return (
    <View style={styles.form}>
      <TextField
        label={t('console.assessments.build.title')}
        placeholder={t('console.assessments.build.titlePlaceholder')}
        value={value.title}
        onChangeText={(title) => onChange({ title })}
        onSubmitEditing={onSubmit}
        error={err('title')}
        maxLength={120}
      />
      <ChipPicker<AssessmentType>
        label={t('console.assessments.build.type')}
        chips={ASSESSMENT_TYPES.map((v) => ({
          value: v,
          label: t(`console.assessments.types.${v}`),
        }))}
        value={value.type}
        onChange={(type) => onChange({ type })}
        disabled={typeLocked}
      />
      <View style={styles.row}>
        <TextField
          label={t('console.assessments.build.weightage')}
          placeholder={t('console.assessments.build.weightagePlaceholder')}
          helper={t('console.assessments.build.weightageHint')}
          value={value.weightage}
          onChangeText={(weightage) => onChange({ weightage })}
          onSubmitEditing={onSubmit}
          error={err('weightage')}
          keyboardType="decimal-pad"
          script="latin"
          style={styles.cell}
        />
        <TextField
          label={t('console.assessments.build.scheduledOn')}
          placeholder={t('console.assessments.build.datePlaceholder')}
          helper={t('staff.assessments.dateHint')}
          value={value.scheduledOn}
          onChangeText={(scheduledOn) => onChange({ scheduledOn })}
          onSubmitEditing={onSubmit}
          error={err('scheduledOn')}
          keyboardType="numbers-and-punctuation"
          script="latin"
          maxLength={10}
          style={styles.cell}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: space.lg },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  cell: { flexGrow: 1, flexBasis: 220 },
});
