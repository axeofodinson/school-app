// Subjects — the middle layer of the syllabus tree
// (classes -> subjects -> chapters -> questions). A subject belongs to one class,
// so this screen first picks a class, then lists and creates that class's
// subjects. Tapping a subject drills into its chapters (ChaptersScreen), which
// this screen renders inline rather than routing through the console home.
//
// Admin-only in practice: RootNavigator only routes developer/admin into the
// console, and RLS (db/setup.sql: p_subjects_staff) is the real boundary — a
// teacher or student hitting this query can read but never write.
//
// Subjects are content-as-data (CLAUDE.md rule 1): adding one is an INSERT, never
// a code change. A class is the prerequisite — with none created there is nothing
// to hang subjects off, so we send the office to the classes screen first.
import { useCallback, useEffect, useState } from 'react';
import { View, Pressable, ActivityIndicator, StyleSheet } from 'react-native';

import { ScreenContainer, Text, TextField, Button } from '../../components';
import { supabase } from '../../lib/supabase';
import { t } from '../../i18n';
import { colors, spacing } from '../../theme/colors';
import ChaptersScreen from './ChaptersScreen';

// Map a Supabase error to an i18n key under console.subjects.errors.
function classifyError(error) {
  if (!error) return null;
  if (error.code === '23505') return 'nameExists'; // unique (class_id, name)
  const msg = (error.message || '').toLowerCase();
  if (/network request failed|failed to fetch|network|timeout|econn/.test(msg)) {
    return 'network';
  }
  return 'unknown';
}

// A pressable pill for choosing which class's subjects to view. Selected pill
// fills with the primary colour; logical margins keep it correct under RTL.
function ClassChip({ cls, selected, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipSelected,
        pressed && styles.chipPressed,
      ]}
    >
      <Text
        variant="label"
        color={selected ? colors.primaryText : colors.primary}
      >
        {cls.name}
      </Text>
    </Pressable>
  );
}

function SubjectRow({ subject, onOpen }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowInfo}>
        <Text variant="label">{subject.name}</Text>
      </View>
      <Button
        variant="secondary"
        label={t('console.subjects.openChapters')}
        onPress={() => onOpen(subject)}
        style={styles.rowAction}
      />
    </View>
  );
}

export default function SubjectsScreen({ onBack, onManageClasses }) {
  const [classes, setClasses] = useState(null); // null = not loaded yet
  const [classesError, setClassesError] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState(null);

  const [subjects, setSubjects] = useState(null); // null = not loaded for class
  const [subjectsError, setSubjectsError] = useState(false);

  const [name, setName] = useState('');
  const [formError, setFormError] = useState(null); // i18n key under errors
  const [saving, setSaving] = useState(false);

  const [openSubject, setOpenSubject] = useState(null); // drill into chapters

  const loadClasses = useCallback(async () => {
    setClassesError(false);
    const { data, error } = await supabase
      .from('classes')
      .select('id, name, grade_level')
      .order('grade_level', { ascending: true })
      .order('name', { ascending: true });
    if (error) {
      setClassesError(true);
      return;
    }
    const list = data ?? [];
    setClasses(list);
    // Default to the first class so subjects show without an extra tap; keep the
    // current selection if it still exists after a reload.
    setSelectedClassId((prev) =>
      prev && list.some((c) => c.id === prev) ? prev : list[0]?.id ?? null
    );
  }, []);

  const loadSubjects = useCallback(async (classId) => {
    setSubjects(null);
    setSubjectsError(false);
    const { data, error } = await supabase
      .from('subjects')
      .select('id, name, sort_order, class_id')
      .eq('class_id', classId)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    if (error) {
      setSubjectsError(true);
      return;
    }
    setSubjects(data ?? []);
  }, []);

  useEffect(() => {
    loadClasses();
  }, [loadClasses]);

  useEffect(() => {
    if (selectedClassId) loadSubjects(selectedClassId);
    else setSubjects(null);
  }, [selectedClassId, loadSubjects]);

  // Reset the form when switching classes so an error/name doesn't leak across.
  const selectClass = useCallback((id) => {
    setSelectedClassId(id);
    setName('');
    setFormError(null);
  }, []);

  const createSubject = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) return setFormError('nameRequired');
    if (!selectedClassId) return;

    setFormError(null);
    setSaving(true);
    // Append to the end of this class's list.
    const nextOrder =
      (subjects ?? []).reduce((max, s) => Math.max(max, s.sort_order), -1) + 1;
    const { error } = await supabase.from('subjects').insert({
      class_id: selectedClassId,
      name: trimmed,
      sort_order: nextOrder,
    });
    setSaving(false);

    if (error) {
      setFormError(classifyError(error));
      return;
    }
    setName('');
    loadSubjects(selectedClassId);
  }, [name, selectedClassId, subjects, loadSubjects]);

  // Drill-down: a chosen subject shows its chapters full-screen.
  if (openSubject) {
    return (
      <ChaptersScreen
        subject={openSubject}
        onBack={() => setOpenSubject(null)}
      />
    );
  }

  const loadingClasses = classes === null && !classesError;

  return (
    <ScreenContainer scroll>
      <View style={styles.header}>
        <Text variant="title">{t('console.subjects.title')}</Text>
        <Button
          variant="secondary"
          label={t('console.subjects.back')}
          onPress={onBack}
          style={styles.backBtn}
        />
      </View>
      <Text variant="body" color={colors.muted} style={styles.subtitle}>
        {t('console.subjects.subtitle')}
      </Text>

      {loadingClasses ? (
        <ActivityIndicator color={colors.primary} style={styles.loading} />
      ) : classesError ? (
        <View style={styles.stateBox}>
          <Text variant="body" color={colors.danger} align="center">
            {t('console.subjects.loadError')}
          </Text>
          <Button
            variant="secondary"
            label={t('console.subjects.retry')}
            onPress={loadClasses}
            style={styles.retry}
          />
        </View>
      ) : classes.length === 0 ? (
        // Prerequisite missing: send the office to create a class first.
        <View style={styles.stateBox}>
          <Text variant="body" color={colors.muted} align="center">
            {t('console.subjects.needClass')}
          </Text>
          {onManageClasses ? (
            <Button
              label={t('console.subjects.goToClasses')}
              onPress={onManageClasses}
              style={styles.retry}
            />
          ) : null}
        </View>
      ) : (
        <>
          {/* Class picker */}
          <Text variant="label" style={styles.pickLabel}>
            {t('console.subjects.pickClass')}
          </Text>
          <View style={styles.chipRow}>
            {classes.map((cls) => (
              <ClassChip
                key={cls.id}
                cls={cls}
                selected={cls.id === selectedClassId}
                onPress={() => selectClass(cls.id)}
              />
            ))}
          </View>

          {/* Create form */}
          <View style={styles.card}>
            <Text variant="label" style={styles.formHeading}>
              {t('console.subjects.form.heading')}
            </Text>
            <TextField
              label={t('console.subjects.form.name')}
              placeholder={t('console.subjects.form.namePlaceholder')}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              autoCorrect={false}
            />
            {formError ? (
              <Text
                variant="caption"
                color={colors.danger}
                style={styles.formErr}
              >
                {t(`console.subjects.errors.${formError}`)}
              </Text>
            ) : null}
            <Button
              label={
                saving
                  ? t('console.subjects.form.submitting')
                  : t('console.subjects.form.submit')
              }
              onPress={createSubject}
              loading={saving}
              disabled={saving}
              style={styles.submit}
            />
          </View>

          {/* Subject list / states for the selected class */}
          {subjects === null && !subjectsError ? (
            <ActivityIndicator color={colors.primary} style={styles.loading} />
          ) : subjectsError ? (
            <View style={styles.stateBox}>
              <Text variant="body" color={colors.danger} align="center">
                {t('console.subjects.loadError')}
              </Text>
              <Button
                variant="secondary"
                label={t('console.subjects.retry')}
                onPress={() => loadSubjects(selectedClassId)}
                style={styles.retry}
              />
            </View>
          ) : subjects.length === 0 ? (
            <View style={styles.stateBox}>
              <Text variant="body" color={colors.muted} align="center">
                {t('console.subjects.empty')}
              </Text>
            </View>
          ) : (
            subjects.map((subject) => (
              <SubjectRow
                key={subject.id}
                subject={subject}
                onOpen={setOpenSubject}
              />
            ))
          )}
        </>
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
  pickLabel: { marginTop: spacing.lg, marginBottom: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: {
    minHeight: 40,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.bg,
    marginEnd: spacing.sm,
    marginBottom: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSelected: { backgroundColor: colors.primary },
  chipPressed: { opacity: 0.85 },
  card: {
    marginTop: spacing.md,
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
  rowAction: { minHeight: 40, paddingVertical: spacing.xs },
});
