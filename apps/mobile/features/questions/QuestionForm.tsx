import {
  AUTHORABLE_TYPES,
  changeType,
  COGNITIVE_LEVELS,
  type CognitiveLevel,
  type QuestionDraft,
} from '@school/core';
import { StyleSheet, View } from 'react-native';

import { useI18n } from '../../i18n';
import { Button, Text, TextField } from '../../ui';
import { space } from '../../ui/tokens';
import { ChipPicker } from '../scope/ChipPicker';
import { useSaveShortcut } from '../scope/useSaveShortcut';
import { McqOptionsEditor } from './McqOptionsEditor';

/** The answer part, by type. */
function AnswerFields({
  draft,
  onChange,
  onSubmit,
}: {
  draft: QuestionDraft;
  onChange: (d: QuestionDraft) => void;
  onSubmit: () => void;
}) {
  const { t } = useI18n();
  switch (draft.type) {
    case 'mcq':
      return <McqOptionsEditor draft={draft} onChange={onChange} onSubmit={onSubmit} />;
    case 'true_false':
      return (
        <ChipPicker
          label={t('staff.questions.correctAnswer')}
          chips={[
            { value: 'true', label: t('teacher.questions.tf.true') },
            { value: 'false', label: t('teacher.questions.tf.false') },
          ]}
          value={draft.tf === null ? null : (String(draft.tf) as 'true' | 'false')}
          onChange={(v) => onChange({ ...draft, tf: v === 'true' })}
        />
      );
    case 'numeric':
      return (
        <TextField
          label={t('staff.questions.correctAnswer')}
          placeholder={t('teacher.questions.create.numericPlaceholder')}
          value={draft.numeric}
          onChangeText={(numeric) => onChange({ ...draft, numeric })}
          onSubmitEditing={onSubmit}
          keyboardType="numbers-and-punctuation"
          script="latin"
        />
      );
    case 'short_text':
      return (
        <>
          <TextField
            label={t('staff.questions.correctAnswer')}
            helper={t('staff.questions.shortHint')}
            value={draft.short}
            onChangeText={(short) => onChange({ ...draft, short })}
            onSubmitEditing={onSubmit}
          />
          <TextField
            label={t('staff.questions.shortAlso')}
            helper={t('staff.questions.shortAlsoHint')}
            value={draft.shortAlso}
            onChangeText={(shortAlso) => onChange({ ...draft, shortAlso })}
            multiline
            numberOfLines={3}
          />
        </>
      );
  }
}

/**
 * Write or edit one question. The parent owns the draft and the save; this only
 * renders it. Field order = tab order: type, thinking level, question, answer,
 * marks, save. Enter in a one-line field (or Ctrl+Enter anywhere) saves.
 */
export function QuestionForm({
  draft,
  onChange,
  onSave,
  onCancel,
  context,
  saving,
  error,
  editing,
}: {
  draft: QuestionDraft;
  onChange: (d: QuestionDraft) => void;
  onSave: () => void;
  onCancel?: () => void;
  /** "Chapter · Subject · Class" so the teacher sees where it lands. */
  context: string;
  saving: boolean;
  error: string | null;
  editing: boolean;
}) {
  const { t } = useI18n();
  const submit = () => {
    if (!saving) onSave();
  };
  useSaveShortcut(submit);

  return (
    <View style={styles.form}>
      <Text variant="bodySm" tone="textMuted">
        {context}
      </Text>
      <ChipPicker
        label={t('teacher.questions.create.type')}
        chips={AUTHORABLE_TYPES.map((v) => ({
          value: v,
          label: t(`console.assessments.questionTypes.${v}`),
        }))}
        value={draft.type}
        onChange={(v) => onChange(changeType(draft, v))}
      />
      <View style={styles.group}>
        <ChipPicker<CognitiveLevel>
          label={t('teacher.questions.create.cognitive')}
          chips={COGNITIVE_LEVELS.map((v) => ({
            value: v,
            label: t(`teacher.questions.cognitive.${v}`),
          }))}
          value={draft.cognitive}
          onChange={(cognitive) => onChange({ ...draft, cognitive })}
        />
        <Text variant="bodySm" tone="textMuted">
          {t('teacher.questions.create.cognitiveHint')}
        </Text>
      </View>
      <TextField
        label={t('teacher.questions.create.stem')}
        placeholder={t('teacher.questions.create.stemPlaceholder')}
        value={draft.stem}
        onChangeText={(stem) => onChange({ ...draft, stem })}
        multiline
        numberOfLines={3}
      />
      <AnswerFields draft={draft} onChange={onChange} onSubmit={submit} />
      <TextField
        label={t('teacher.questions.create.marks')}
        placeholder={t('teacher.questions.create.marksPlaceholder')}
        helper={t('staff.questions.marksHint')}
        value={draft.marks}
        onChangeText={(marks) => onChange({ ...draft, marks })}
        onSubmitEditing={submit}
        keyboardType="number-pad"
        script="latin"
        style={styles.marks}
      />
      {error ? (
        <Text tone="onWrongSoft" accessibilityLiveRegion="polite" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <View style={styles.actions}>
        <Button
          title={
            saving
              ? t(
                  editing
                    ? 'teacher.questions.create.updating'
                    : 'teacher.questions.create.submitting',
                )
              : t(
                  editing
                    ? 'teacher.questions.create.updateSubmit'
                    : 'teacher.questions.create.submit',
                )
          }
          icon="check"
          loading={saving}
          disabled={saving}
          onPress={submit}
          accessibilityHint={t('staff.saveShortcut')}
        />
        {onCancel ? (
          <Button
            title={t('teacher.questions.create.cancelEdit')}
            variant="ghost"
            onPress={onCancel}
            disabled={saving}
          />
        ) : null}
      </View>
      <Text variant="caption" tone="textMuted">
        {t('staff.saveShortcut')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: space.lg },
  group: { gap: space.xs },
  marks: { maxWidth: 200 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
});
