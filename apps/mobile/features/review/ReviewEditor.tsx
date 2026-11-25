// Edit from the queue: both languages side by side, the key, thinking level,
// difficulty and concept. Saving makes a new version (db/032 drops any
// approval), so the teacher approves it again straight after.
import {
  COGNITIVE_LEVELS,
  buildReviewPatch,
  isReviewEditable,
  reviewDraft,
  type ReviewDraft,
  type ReviewEditError,
  type ReviewItem,
} from '@school/core';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useI18n } from '../../i18n';
import { Button, Card, Text, TextField } from '../../ui';
import { space } from '../../ui/tokens';
import { ChipPicker } from '../scope/ChipPicker';
import { useSaveShortcut } from '../scope/useSaveShortcut';
import type { ConceptRow, TopicRow } from './api';
import { shortId } from './ReviewPane';

export function ReviewEditor({
  item,
  topics,
  concepts,
  saving,
  onSave,
  onCancel,
}: {
  item: ReviewItem;
  topics: TopicRow[];
  concepts: ConceptRow[];
  saving: boolean;
  onSave: (draft: ReviewDraft) => void;
  onCancel: () => void;
}) {
  const { t, locale } = useI18n();
  const [d, setD] = useState<ReviewDraft>(() => reviewDraft(item));
  const [error, setError] = useState<ReviewEditError | null>(null);

  const chapterTopics = topics.filter((tp) => tp.chapter_id === item.chapter_id).map((tp) => tp.id);
  const choices = concepts.filter(
    (c) =>
      chapterTopics.includes(c.topic_id) && (c.status === 'active' || c.id === item.concept_id),
  );
  const name = (c: { title_en: string; title_ur: string | null }) =>
    locale === 'ur' && c.title_ur ? c.title_ur : c.title_en;

  const save = () => {
    if (saving) return;
    const r = buildReviewPatch(item, d);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setError(null);
    onSave(d);
  };
  useSaveShortcut(save);

  if (!isReviewEditable(item.type)) {
    return (
      <Card style={styles.card}>
        <Text>{t('staff.review.editor.notEditable')}</Text>
        <Button title={t('staff.review.editor.cancel')} variant="secondary" onPress={onCancel} />
      </Card>
    );
  }

  const set = (patch: Partial<ReviewDraft>) => setD((x) => ({ ...x, ...patch }));
  const pair = (en: Field, ur: Field) => (
    <View style={styles.pair}>
      <TextFieldLite {...en} />
      <TextFieldLite {...ur} rtl />
    </View>
  );

  return (
    <Card style={styles.card}>
      <Text variant="heading" accessibilityRole="header">
        {t('staff.review.editor.title')} · {t('staff.review.qid', { id: shortId(item.id) })}
      </Text>
      <Text tone="textMuted" variant="bodySm">
        {t('staff.review.editor.note')}
      </Text>
      {pair(
        {
          label: t('staff.review.editor.stemEn'),
          value: d.stemEn,
          onChange: (stemEn) => set({ stemEn }),
          multiline: true,
        },
        {
          label: t('staff.review.editor.stemUr'),
          value: d.stemUr,
          onChange: (stemUr) => set({ stemUr }),
          multiline: true,
        },
      )}

      {item.type === 'mcq' ? (
        <>
          {d.options.map((o, i) => (
            <View key={o.key} style={styles.optionBlock}>
              {pair(
                {
                  label: t('staff.review.editor.optionEn', { key: o.key }),
                  value: o.en,
                  onChange: (en) =>
                    set({ options: d.options.map((x, j) => (j === i ? { ...x, en } : x)) }),
                },
                {
                  label: t('staff.review.editor.optionUr', { key: o.key }),
                  value: o.ur,
                  onChange: (ur) =>
                    set({ options: d.options.map((x, j) => (j === i ? { ...x, ur } : x)) }),
                },
              )}
            </View>
          ))}
          <ChipPicker
            label={t('staff.review.editor.correct')}
            chips={d.options.map((o) => ({ value: o.key, label: o.key }))}
            value={d.correct || null}
            onChange={(correct) => set({ correct })}
          />
        </>
      ) : item.type === 'true_false' ? (
        <ChipPicker
          label={t('staff.review.editor.correct')}
          chips={[
            { value: 'true', label: t('staff.review.pane.true') },
            { value: 'false', label: t('staff.review.pane.false') },
          ]}
          value={d.correct === 'true' || d.correct === 'false' ? d.correct : null}
          onChange={(correct) => set({ correct })}
        />
      ) : (
        <>
          <TextFieldLite
            label={t('staff.review.editor.answer')}
            value={d.correct}
            onChange={(correct) => set({ correct })}
            latin={item.type === 'numeric'}
          />
          {item.type === 'short_text' ? (
            <TextFieldLite
              label={t('staff.review.editor.also')}
              value={d.also}
              onChange={(also) => set({ also })}
              multiline
            />
          ) : null}
        </>
      )}

      {pair(
        {
          label: t('staff.review.editor.explEn'),
          value: d.explEn,
          onChange: (explEn) => set({ explEn }),
          multiline: true,
        },
        {
          label: t('staff.review.editor.explUr'),
          value: d.explUr,
          onChange: (explUr) => set({ explUr }),
          multiline: true,
        },
      )}

      <ChipPicker
        label={t('staff.review.editor.level')}
        chips={COGNITIVE_LEVELS.map((v) => ({
          value: v,
          label: t(`teacher.questions.cognitive.${v}`),
        }))}
        value={d.level}
        onChange={(level) => set({ level })}
      />
      <ChipPicker
        label={t('staff.review.editor.difficulty')}
        chips={['1', '2', '3'].map((v) => ({ value: v, label: v }))}
        value={String(d.difficulty)}
        onChange={(v) => set({ difficulty: Number(v) })}
      />
      {choices.length ? (
        <ChipPicker
          label={t('staff.review.editor.concept')}
          chips={choices.map((c) => ({ value: c.id, label: name(c) }))}
          value={d.conceptId}
          onChange={(conceptId) => set({ conceptId })}
        />
      ) : (
        <Text tone="weak">{t('staff.review.editor.noConcepts')}</Text>
      )}

      {error ? (
        <Text tone="wrong" accessibilityRole="alert">
          {t(`staff.review.editor.errors.${error}`)}
        </Text>
      ) : null}
      <View style={styles.actions}>
        <Button title={t('staff.review.editor.cancel')} variant="ghost" onPress={onCancel} />
        <Button
          title={t('staff.review.editor.save')}
          icon="check"
          loading={saving}
          onPress={save}
        />
      </View>
    </Card>
  );
}

interface Field {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
}

function TextFieldLite({
  label,
  value,
  onChange,
  multiline,
  rtl,
  latin,
}: Field & { rtl?: boolean; latin?: boolean }) {
  return (
    <View style={[styles.field, { direction: rtl ? 'rtl' : 'ltr' }]}>
      <TextField
        label={label}
        value={value}
        onChangeText={onChange}
        multiline={multiline}
        numberOfLines={multiline ? 3 : 1}
        script={rtl && !latin ? 'urdu' : 'latin'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.md },
  pair: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  field: { flexGrow: 1, flexBasis: 260 },
  optionBlock: { gap: space.xs },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.sm },
});
