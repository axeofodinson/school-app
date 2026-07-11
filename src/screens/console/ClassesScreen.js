// Classes — the second setup screen in the CLAUDE.md build order. Classes hang
// off the syllabus tree (classes -> subjects -> chapters -> questions) and every
// enrollment/assessment is scoped to one, so the office defines the class list
// here before anything else can reference it.
//
// Admin-only in practice: RootNavigator only routes developer/admin here, and
// RLS (db/setup.sql: p_classes_staff) is the real boundary — a teacher or student
// hitting this query can read but never write.
//
// Classes are content-as-data (CLAUDE.md rule 1): adding one is an INSERT, never
// a code change. `grade_level` drives ordering — PG/pre-primary sit below 0
// (e.g. PG = -2) and matric tops out at 10 — so the list reads bottom-to-top like
// the real school. A class references no academic year directly, but enrollments
// do; with no year created yet there is nothing to enroll into, so we prompt the
// office to set up a year first rather than let classes pile up in a vacuum.
import { useCallback, useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';

import { ScreenContainer, Text, TextField, Button } from '../../components';
import { supabase } from '../../lib/supabase';
import { t } from '../../i18n';
import { colors, spacing } from '../../theme/colors';

// grade_level is an integer that orders the list. Pre-primary/PG can be negative
// and matric tops out at 10; we bound the input so a typo like 900 can't sink the
// ordering. Kept deliberately generous below zero for PG/nursery/prep variations.
const MIN_GRADE = -5;
const MAX_GRADE = 10;

// True only for a string that is a plain integer (no decimals, no stray chars),
// so "9.5" or "9a" is rejected rather than silently coerced by Number().
function parseGrade(str) {
  if (!/^-?\d+$/.test(str)) return null;
  const n = Number(str);
  return Number.isInteger(n) ? n : null;
}

// Map a Supabase error to an i18n key under console.classes.errors.
function classifyError(error) {
  if (!error) return null;
  if (error.code === '23505') return 'nameExists'; // unique (name) violation
  const msg = (error.message || '').toLowerCase();
  if (/network request failed|failed to fetch|network|timeout|econn/.test(msg)) {
    return 'network';
  }
  return 'unknown';
}

function ClassRow({ cls }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowInfo}>
        <Text variant="label">{cls.name}</Text>
        <Text variant="caption" color={colors.muted} style={styles.rowMeta}>
          {t('console.classes.gradeLevel', { level: cls.grade_level })}
        </Text>
      </View>
    </View>
  );
}

export default function ClassesScreen({ onBack, onManageYears }) {
  const [classes, setClasses] = useState(null); // null = not loaded yet
  const [hasYear, setHasYear] = useState(null); // null until loaded
  const [loadError, setLoadError] = useState(false);

  const [name, setName] = useState('');
  const [grade, setGrade] = useState('');

  const [formError, setFormError] = useState(null); // i18n key under errors
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoadError(false);
    // A year isn't a foreign key of classes, but there's no point building the
    // class list before a year exists to enroll into — so gate on it here.
    const [yearRes, classRes] = await Promise.all([
      supabase.from('academic_years').select('id').limit(1),
      supabase
        .from('classes')
        .select('id, name, grade_level')
        .order('grade_level', { ascending: true })
        .order('name', { ascending: true }),
    ]);
    if (yearRes.error || classRes.error) {
      setLoadError(true);
      return;
    }
    setHasYear((yearRes.data ?? []).length > 0);
    setClasses(classRes.data ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const createClass = useCallback(async () => {
    const trimmed = name.trim();
    const rawGrade = grade.trim();

    if (!trimmed) return setFormError('nameRequired');
    if (!rawGrade) return setFormError('gradeRequired');
    const level = parseGrade(rawGrade);
    if (level === null) return setFormError('gradeInvalid');
    if (level < MIN_GRADE || level > MAX_GRADE) return setFormError('gradeRange');

    setFormError(null);
    setSaving(true);
    const { error } = await supabase.from('classes').insert({
      name: trimmed,
      grade_level: level,
    });
    setSaving(false);

    if (error) {
      setFormError(classifyError(error));
      return;
    }
    // Reset and re-read so the DB is the single source of truth for the ordering.
    setName('');
    setGrade('');
    load();
  }, [name, grade, load]);

  const loading = classes === null && !loadError;

  return (
    <ScreenContainer scroll>
      <View style={styles.header}>
        <Text variant="title">{t('console.classes.title')}</Text>
        <Button
          variant="secondary"
          label={t('console.classes.back')}
          onPress={onBack}
          style={styles.backBtn}
        />
      </View>
      <Text variant="body" color={colors.muted} style={styles.subtitle}>
        {t('console.classes.subtitle')}
      </Text>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={styles.loading} />
      ) : loadError ? (
        <View style={styles.stateBox}>
          <Text variant="body" color={colors.danger} align="center">
            {t('console.classes.loadError')}
          </Text>
          <Button
            variant="secondary"
            label={t('console.classes.retry')}
            onPress={load}
            style={styles.retry}
          />
        </View>
      ) : !hasYear ? (
        // Prerequisite missing: send the office to create a year first.
        <View style={styles.stateBox}>
          <Text variant="body" color={colors.muted} align="center">
            {t('console.classes.needYear')}
          </Text>
          {onManageYears ? (
            <Button
              label={t('console.classes.goToYears')}
              onPress={onManageYears}
              style={styles.retry}
            />
          ) : null}
        </View>
      ) : (
        <>
          {/* Create form */}
          <View style={styles.card}>
            <Text variant="label" style={styles.formHeading}>
              {t('console.classes.form.heading')}
            </Text>
            <TextField
              label={t('console.classes.form.name')}
              placeholder={t('console.classes.form.namePlaceholder')}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              autoCorrect={false}
            />
            <TextField
              label={t('console.classes.form.gradeLevel')}
              placeholder={t('console.classes.form.gradePlaceholder')}
              value={grade}
              onChangeText={setGrade}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="numbers-and-punctuation"
            />
            <Text variant="caption" color={colors.muted} style={styles.hint}>
              {t('console.classes.form.gradeHint')}
            </Text>
            {formError ? (
              <Text
                variant="caption"
                color={colors.danger}
                style={styles.formErr}
              >
                {t(`console.classes.errors.${formError}`)}
              </Text>
            ) : null}
            <Button
              label={
                saving
                  ? t('console.classes.form.submitting')
                  : t('console.classes.form.submit')
              }
              onPress={createClass}
              loading={saving}
              disabled={saving}
              style={styles.submit}
            />
          </View>

          {/* List / empty state */}
          {classes.length === 0 ? (
            <View style={styles.stateBox}>
              <Text variant="body" color={colors.muted} align="center">
                {t('console.classes.empty')}
              </Text>
            </View>
          ) : (
            classes.map((cls) => <ClassRow key={cls.id} cls={cls} />)
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
  card: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  formHeading: { marginBottom: spacing.sm },
  hint: { marginTop: -spacing.xs, marginBottom: spacing.sm },
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
  rowMeta: { marginTop: spacing.xs },
});
