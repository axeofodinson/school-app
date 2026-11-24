// Teacher side of a 'file' worksheet in the assessment builder: the file now on
// the assessment (with a preview), the newly chosen one (uploaded on save), and
// the optional total marks for grading it.
import { formatBytes, planUpload } from '@school/core';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useI18n, type TKey } from '../../i18n';
import { Button, Text, TextField } from '../../ui';
import { space } from '../../ui/tokens';
import { FileViewer, type WorksheetFile } from './FileViewer';
import { pickWorksheet, type PickedWorksheet } from './pick';

const UPLOAD_ERRORS: Record<string, TKey> = {
  fileMissing: 'staff.files.errors.fileMissing',
  fileEmpty: 'staff.files.errors.fileEmpty',
  fileTooBig: 'staff.files.errors.fileTooBig',
  fileType: 'staff.files.errors.fileType',
};

export function WorksheetCard({
  current,
  picked,
  onPick,
  fileMarks,
  onFileMarks,
  marksLocked,
  marksError,
  onSubmit,
}: {
  current: WorksheetFile | null;
  picked: PickedWorksheet | null;
  onPick: (p: PickedWorksheet) => void;
  fileMarks: string;
  onFileMarks: (v: string) => void;
  marksLocked: boolean;
  marksError?: string;
  onSubmit: () => void;
}) {
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);

  const choose = async () => {
    setError(null);
    try {
      const p = await pickWorksheet();
      if (!p) return;
      const plan = planUpload(p);
      if ('error' in plan) return setError(t(UPLOAD_ERRORS[plan.error]!));
      onPick(p);
    } catch {
      setError(t('staff.files.errors.pickFailed'));
    }
  };

  return (
    <View style={styles.wrap}>
      <Text tone="textMuted">{t('console.assessments.build.fileHint')}</Text>
      <Text variant="caption" tone="textMuted">
        {t('staff.files.limits')}
      </Text>
      {current?.path && current.name ? (
        <Text>{t('console.assessments.build.fileCurrent', { name: current.name })}</Text>
      ) : !picked ? (
        <Text tone="textMuted">{t('console.assessments.build.fileNone')}</Text>
      ) : null}
      {picked ? (
        <Text variant="label">
          {t('console.assessments.build.fileSelected', {
            name: [picked.name, formatBytes(picked.size)].filter(Boolean).join(' · '),
          })}
        </Text>
      ) : null}
      {picked && current?.path ? (
        <Text variant="caption" tone="textMuted">
          {t('staff.files.replaceNote')}
        </Text>
      ) : null}
      {error ? (
        <Text tone="onWrongSoft" accessibilityRole="alert" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <View style={styles.row}>
        <Button
          title={t(
            current?.path || picked
              ? 'console.assessments.build.changeFile'
              : 'console.assessments.build.pickFile',
          )}
          icon="book"
          variant="secondary"
          onPress={choose}
        />
        {current?.path ? (
          <Button
            title={t(preview ? 'staff.files.hidePreview' : 'staff.files.preview')}
            icon={preview ? 'eyeOff' : 'eye'}
            variant="ghost"
            onPress={() => setPreview((v) => !v)}
          />
        ) : null}
      </View>
      {preview && current?.path ? <FileViewer file={current} /> : null}
      <TextField
        label={t('console.assessments.build.fileMarks')}
        helper={t(
          marksLocked ? 'staff.files.marksLocked' : 'console.assessments.build.fileMarksHint',
        )}
        value={fileMarks}
        onChangeText={onFileMarks}
        onSubmitEditing={onSubmit}
        error={marksError}
        keyboardType="number-pad"
        script="latin"
        editable={!marksLocked}
        maxLength={4}
        style={styles.marks}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  marks: { maxWidth: 320 },
});
