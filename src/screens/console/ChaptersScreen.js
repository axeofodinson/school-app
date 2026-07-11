// Chapters — the leaf below subjects in the syllabus tree
// (classes -> subjects -> chapters -> questions). Questions hang off a chapter,
// so the office defines the chapter list here before any question can reference
// one. Reached by picking a class then a subject in SubjectsScreen.
//
// Admin-only in practice: RootNavigator only routes developer/admin into the
// console, and RLS (db/setup.sql: p_chapters_staff) is the real boundary — a
// teacher or student hitting this query can read but never write.
//
// Chapters are content-as-data (CLAUDE.md rule 1): adding one is an INSERT, never
// a code change. `sort_order` fixes the reading order of a subject's chapters
// (Chapter 1 before Chapter 2); the office reorders with the up/down arrows and
// the DB stays the single source of truth.
import { useCallback, useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';

import { ScreenContainer, Text, TextField, Button } from '../../components';
import { supabase } from '../../lib/supabase';
import { t } from '../../i18n';
import { colors, spacing } from '../../theme/colors';

// Map a Supabase error to an i18n key under console.chapters.errors.
function classifyError(error) {
  if (!error) return null;
  const msg = (error.message || '').toLowerCase();
  if (/network request failed|failed to fetch|network|timeout|econn/.test(msg)) {
    return 'network';
  }
  return 'unknown';
}

function ChapterRow({ chapter, index, count, onMove, busy }) {
  const isFirst = index === 0;
  const isLast = index === count - 1;
  return (
    <View style={styles.row}>
      <View style={styles.rowInfo}>
        <Text variant="label">{chapter.title}</Text>
      </View>
      <View style={styles.rowActions}>
        {/* Vertical arrows read the same in LTR and RTL, so no flipping needed. */}
        <Button
          variant="secondary"
          label="↑"
          accessibilityLabel={t('console.chapters.moveUp')}
          onPress={() => onMove(index, -1)}
          disabled={isFirst || busy}
          style={styles.moveBtn}
        />
        <Button
          variant="secondary"
          label="↓"
          accessibilityLabel={t('console.chapters.moveDown')}
          onPress={() => onMove(index, 1)}
          disabled={isLast || busy}
          style={styles.moveBtn}
        />
      </View>
    </View>
  );
}

export default function ChaptersScreen({ subject, onBack }) {
  const [chapters, setChapters] = useState(null); // null = not loaded yet
  const [loadError, setLoadError] = useState(false);

  const [title, setTitle] = useState('');
  const [formError, setFormError] = useState(null); // i18n key under errors
  const [saving, setSaving] = useState(false);
  const [movingId, setMovingId] = useState(null); // row currently being reordered

  const load = useCallback(async () => {
    setLoadError(false);
    const { data, error } = await supabase
      .from('chapters')
      .select('id, title, sort_order')
      .eq('subject_id', subject.id)
      .order('sort_order', { ascending: true })
      .order('title', { ascending: true });
    if (error) {
      setLoadError(true);
      return;
    }
    setChapters(data ?? []);
  }, [subject.id]);

  useEffect(() => {
    load();
  }, [load]);

  const createChapter = useCallback(async () => {
    const trimmed = title.trim();
    if (!trimmed) return setFormError('titleRequired');

    setFormError(null);
    setSaving(true);
    // Append to the end: one past the current max keeps every UI-created chapter
    // distinct, which the swap-based reorder below relies on.
    const nextOrder =
      (chapters ?? []).reduce((max, c) => Math.max(max, c.sort_order), -1) + 1;
    const { error } = await supabase.from('chapters').insert({
      subject_id: subject.id,
      title: trimmed,
      sort_order: nextOrder,
    });
    setSaving(false);

    if (error) {
      setFormError(classifyError(error));
      return;
    }
    setTitle('');
    load();
  }, [title, chapters, subject.id, load]);

  const move = useCallback(
    async (index, dir) => {
      const other = index + dir;
      if (!chapters || other < 0 || other >= chapters.length) return;
      const a = chapters[index];
      const b = chapters[other];

      setMovingId(a.id);
      // Swap the two rows' sort_order so the DB reflects the new order. Values
      // are distinct for UI-created chapters (see createChapter), so this can't
      // collide into a no-op.
      const [r1, r2] = await Promise.all([
        supabase.from('chapters').update({ sort_order: b.sort_order }).eq('id', a.id),
        supabase.from('chapters').update({ sort_order: a.sort_order }).eq('id', b.id),
      ]);
      setMovingId(null);
      if (!r1.error && !r2.error) load();
      // On failure the list is unchanged; the row simply stays put.
    },
    [chapters, load]
  );

  const loading = chapters === null && !loadError;

  return (
    <ScreenContainer scroll>
      <View style={styles.header}>
        <Text variant="title">{t('console.chapters.title')}</Text>
        <Button
          variant="secondary"
          label={t('console.chapters.back')}
          onPress={onBack}
          style={styles.backBtn}
        />
      </View>
      <Text variant="body" color={colors.muted} style={styles.subtitle}>
        {t('console.chapters.subtitle', { subject: subject.name })}
      </Text>

      {/* Create form */}
      <View style={styles.card}>
        <Text variant="label" style={styles.formHeading}>
          {t('console.chapters.form.heading')}
        </Text>
        <TextField
          label={t('console.chapters.form.title')}
          placeholder={t('console.chapters.form.titlePlaceholder')}
          value={title}
          onChangeText={setTitle}
          autoCapitalize="sentences"
          autoCorrect={false}
        />
        {formError ? (
          <Text variant="caption" color={colors.danger} style={styles.formErr}>
            {t(`console.chapters.errors.${formError}`)}
          </Text>
        ) : null}
        <Button
          label={
            saving
              ? t('console.chapters.form.submitting')
              : t('console.chapters.form.submit')
          }
          onPress={createChapter}
          loading={saving}
          disabled={saving}
          style={styles.submit}
        />
      </View>

      {/* List / states */}
      {loading ? (
        <ActivityIndicator color={colors.primary} style={styles.loading} />
      ) : loadError ? (
        <View style={styles.stateBox}>
          <Text variant="body" color={colors.danger} align="center">
            {t('console.chapters.loadError')}
          </Text>
          <Button
            variant="secondary"
            label={t('console.chapters.retry')}
            onPress={load}
            style={styles.retry}
          />
        </View>
      ) : chapters.length === 0 ? (
        <View style={styles.stateBox}>
          <Text variant="body" color={colors.muted} align="center">
            {t('console.chapters.empty')}
          </Text>
        </View>
      ) : (
        chapters.map((chapter, index) => (
          <ChapterRow
            key={chapter.id}
            chapter={chapter}
            index={index}
            count={chapters.length}
            onMove={move}
            busy={movingId !== null}
          />
        ))
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: { minHeight: 40, paddingVertical: spacing.xs, marginStart: spacing.md },
  subtitle: { marginTop: spacing.xs },
  card: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  formHeading: { marginBottom: spacing.sm },
  formErr: { marginBottom: spacing.sm },
  submit: { marginTop: spacing.xs },
  loading: { marginTop: spacing.xl },
  stateBox: { marginTop: spacing.xl, alignItems: 'center' },
  retry: { marginTop: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowInfo: { flex: 1, marginEnd: spacing.md },
  rowActions: { flexDirection: 'row', alignItems: 'center' },
  moveBtn: {
    minHeight: 40,
    minWidth: 44,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    marginStart: spacing.sm,
  },
});
