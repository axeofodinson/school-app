// Past imports: what each batch brought in, and the one action that undoes a
// bad one — retire the whole batch. Retiring keeps every row (CLAUDE.md rule 3):
// its questions and lessons become `retired`, so nothing new draws them, and a
// paper that already used one keeps its exact version.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useI18n } from '../../i18n';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Reveal,
  Sheet,
  Text,
  TextField,
  useToast,
} from '../../ui';
import { space } from '../../ui/tokens';
import { LoadState } from '../scope/LoadState';
import { useResult } from '../scope/useResult';

import { listBatches, retireBatch, type BatchRow } from './api';
import { errorKey } from './ImporterScreen';

export function BatchesPanel() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const batches = useResult('import-batches', () => listBatches());
  const [retiring, setRetiring] = useState<BatchRow | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const rows = batches.state?.status === 'ready' ? batches.state.data : null;

  const confirm = async () => {
    if (!retiring) return;
    setBusy(true);
    const res = await retireBatch(retiring.id, note);
    setBusy(false);
    if (!res.ok) {
      toast(t(errorKey(res.error)), 'warn');
      return;
    }
    toast(
      t('staff.importer.retired', { questions: res.data.questions, lessons: res.data.lessons }),
      'success',
    );
    setRetiring(null);
    setNote('');
    batches.reload();
  };

  return (
    <View style={styles.pane}>
      <LoadState
        state={batches.state}
        title={t('staff.importer.errors.loadError')}
        onRetry={batches.reload}
      />
      {rows && rows.length === 0 ? (
        <EmptyState
          icon="archive"
          title={t('staff.importer.noBatches')}
          body={t('staff.importer.noBatchesBody')}
        />
      ) : null}
      {(rows ?? []).map((b, i) => (
        <Reveal key={b.id} index={i}>
          <Card>
            <View style={styles.head}>
              <Text variant="label" script="latin" numberOfLines={1} style={styles.flex}>
                {b.file_name ?? b.id.slice(0, 8)}
              </Text>
              <Badge
                tone={b.status === 'retired' ? 'neutral' : b.status === 'done' ? 'correct' : 'weak'}
                label={t(`staff.importer.batchStatus.${b.status}` as never)}
              />
            </View>
            <Text variant="bodySm" tone="textMuted">
              {t('staff.importer.batchMeta', {
                count: b.question_count,
                origin: t(
                  b.origin === 'ai' ? 'staff.importer.originAi' : 'staff.importer.originHuman',
                ),
                when: new Date(b.created_at).toLocaleString(locale === 'ur' ? 'ur-PK' : 'en-GB'),
              })}
            </Text>
            {b.source_note ? <Text variant="bodySm">{b.source_note}</Text> : null}
            {b.status === 'retired' ? (
              <Text variant="bodySm" tone="textMuted">
                {t('staff.importer.retiredNote', { note: b.retire_note ?? '' })}
              </Text>
            ) : (
              <View style={styles.row}>
                <Button
                  title={t('staff.importer.retire')}
                  variant="secondary"
                  size="sm"
                  onPress={() => {
                    setNote('');
                    setRetiring(b);
                  }}
                />
              </View>
            )}
          </Card>
        </Reveal>
      ))}

      <Sheet
        visible={retiring !== null}
        onClose={() => setRetiring(null)}
        title={t('staff.importer.retireTitle')}
      >
        <Text>
          {t('staff.importer.retireBody', {
            count: retiring?.question_count ?? 0,
            file: retiring?.file_name ?? '',
          })}
        </Text>
        <TextField
          label={t('staff.importer.retireReason')}
          value={note}
          onChangeText={setNote}
          placeholder={t('staff.importer.retireReasonPlaceholder')}
          maxLength={200}
        />
        <View style={styles.row}>
          <Button
            title={t('staff.importer.retireConfirm')}
            onPress={confirm}
            disabled={busy || note.trim().length < 3}
          />
          <Button
            title={t('staff.importer.cancel')}
            variant="ghost"
            onPress={() => setRetiring(null)}
          />
        </View>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  pane: { gap: space.md },
  head: { alignItems: 'center', flexDirection: 'row', gap: space.sm },
  flex: { flex: 1 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
