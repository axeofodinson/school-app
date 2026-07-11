// Academic years — the first setup screen in the CLAUDE.md build order.
// Everything else (classes, enrollments, assessments) is scoped to a year, so
// this is where the office starts a fresh year and marks which one is current.
//
// Admin-only in practice: RootNavigator only routes developer/admin here, and
// RLS (db/setup.sql: p_academic_years_staff) is the real boundary — a teacher
// or student hitting this query can read but never write.
//
// "Only one current year" is enforced in the DB (db/002_*.sql: a trigger demotes
// the previous current + a partial unique index as a backstop). The screen just
// writes the one row and re-reads the list, so the UI always reflects DB truth.
import { useCallback, useEffect, useState } from 'react';
import { View, Switch, ActivityIndicator, StyleSheet } from 'react-native';

import { ScreenContainer, Text, TextField, Button } from '../../components';
import { supabase } from '../../lib/supabase';
import { t } from '../../i18n';
import { colors, spacing } from '../../theme/colors';

// A label is required; dates are optional but, when given, must be YYYY-MM-DD.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Confirms the string is BOTH well-formed and a real calendar date, so "2025-13-40"
// is rejected rather than silently normalised by the Date constructor.
function isValidDate(str) {
  if (!DATE_RE.test(str)) return false;
  const d = new Date(`${str}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && str === d.toISOString().slice(0, 10);
}

// Map a Supabase error to an i18n key under console.academicYears.errors.
function classifyError(error) {
  if (!error) return null;
  if (error.code === '23505') return 'labelExists'; // unique (label) violation
  const msg = (error.message || '').toLowerCase();
  if (/network request failed|failed to fetch|network|timeout|econn/.test(msg)) {
    return 'network';
  }
  return 'unknown';
}

function YearRow({ year, onSetCurrent, busy }) {
  const range =
    year.starts_on && year.ends_on
      ? t('console.academicYears.dateRange', {
          start: year.starts_on,
          end: year.ends_on,
        })
      : year.starts_on || year.ends_on || t('console.academicYears.noDates');

  return (
    <View style={styles.row}>
      <View style={styles.rowInfo}>
        <Text variant="label">{year.label}</Text>
        <Text variant="caption" color={colors.muted} style={styles.rowRange}>
          {range}
        </Text>
      </View>
      {year.is_current ? (
        <View style={styles.badge}>
          <Text variant="caption" color={colors.primaryText}>
            {t('console.academicYears.current')}
          </Text>
        </View>
      ) : (
        <Button
          variant="secondary"
          label={t('console.academicYears.setCurrent')}
          onPress={() => onSetCurrent(year)}
          loading={busy}
          disabled={busy}
          style={styles.rowAction}
        />
      )}
    </View>
  );
}

export default function AcademicYearsScreen({ onBack }) {
  const [years, setYears] = useState(null); // null = not loaded yet
  const [loadError, setLoadError] = useState(false);

  const [label, setLabel] = useState('');
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [isCurrent, setIsCurrent] = useState(false);

  const [formError, setFormError] = useState(null); // i18n key under errors
  const [saving, setSaving] = useState(false);
  const [settingId, setSettingId] = useState(null); // row currently being promoted

  const load = useCallback(async () => {
    setLoadError(false);
    const { data, error } = await supabase
      .from('academic_years')
      .select('id, label, starts_on, ends_on, is_current')
      .order('starts_on', { ascending: false, nullsFirst: false })
      .order('label', { ascending: false });
    if (error) {
      setLoadError(true);
      return;
    }
    setYears(data ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const createYear = useCallback(async () => {
    const trimmed = label.trim();
    const start = startsOn.trim();
    const end = endsOn.trim();

    if (!trimmed) return setFormError('labelRequired');
    if (start && !isValidDate(start)) return setFormError('invalidDate');
    if (end && !isValidDate(end)) return setFormError('invalidDate');
    if (start && end && end <= start) return setFormError('dateOrder');

    setFormError(null);
    setSaving(true);
    const { error } = await supabase.from('academic_years').insert({
      label: trimmed,
      starts_on: start || null,
      ends_on: end || null,
      is_current: isCurrent,
    });
    setSaving(false);

    if (error) {
      setFormError(classifyError(error));
      return;
    }
    // Reset the form and re-read so the DB (which may have demoted a previous
    // current year) is the single source of truth for what's shown.
    setLabel('');
    setStartsOn('');
    setEndsOn('');
    setIsCurrent(false);
    load();
  }, [label, startsOn, endsOn, isCurrent, load]);

  const setCurrent = useCallback(
    async (year) => {
      setSettingId(year.id);
      const { error } = await supabase
        .from('academic_years')
        .update({ is_current: true })
        .eq('id', year.id);
      setSettingId(null);
      if (!error) load();
      // On failure the list is unchanged; the row simply stays not-current.
    },
    [load]
  );

  const loading = years === null && !loadError;

  return (
    <ScreenContainer scroll>
      <View style={styles.header}>
        <Text variant="title">{t('console.academicYears.title')}</Text>
        <Button
          variant="secondary"
          label={t('console.academicYears.back')}
          onPress={onBack}
          style={styles.backBtn}
        />
      </View>
      <Text variant="body" color={colors.muted} style={styles.subtitle}>
        {t('console.academicYears.subtitle')}
      </Text>

      {/* Create form */}
      <View style={styles.card}>
        <Text variant="label" style={styles.formHeading}>
          {t('console.academicYears.form.heading')}
        </Text>
        <TextField
          label={t('console.academicYears.form.label')}
          placeholder={t('console.academicYears.form.labelPlaceholder')}
          value={label}
          onChangeText={setLabel}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TextField
          label={t('console.academicYears.form.startsOn')}
          placeholder={t('console.academicYears.form.datePlaceholder')}
          value={startsOn}
          onChangeText={setStartsOn}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="numbers-and-punctuation"
        />
        <TextField
          label={t('console.academicYears.form.endsOn')}
          placeholder={t('console.academicYears.form.datePlaceholder')}
          value={endsOn}
          onChangeText={setEndsOn}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="numbers-and-punctuation"
        />
        <View style={styles.switchRow}>
          <Text variant="body" style={styles.switchLabel}>
            {t('console.academicYears.form.isCurrent')}
          </Text>
          <Switch
            value={isCurrent}
            onValueChange={setIsCurrent}
            trackColor={{ true: colors.primary }}
          />
        </View>
        {formError ? (
          <Text variant="caption" color={colors.danger} style={styles.formErr}>
            {t(`console.academicYears.errors.${formError}`)}
          </Text>
        ) : null}
        <Button
          label={
            saving
              ? t('console.academicYears.form.submitting')
              : t('console.academicYears.form.submit')
          }
          onPress={createYear}
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
            {t('console.academicYears.loadError')}
          </Text>
          <Button
            variant="secondary"
            label={t('console.academicYears.retry')}
            onPress={load}
            style={styles.retry}
          />
        </View>
      ) : years.length === 0 ? (
        <View style={styles.stateBox}>
          <Text variant="body" color={colors.muted} align="center">
            {t('console.academicYears.empty')}
          </Text>
        </View>
      ) : (
        years.map((year) => (
          <YearRow
            key={year.id}
            year={year}
            onSetCurrent={setCurrent}
            busy={settingId === year.id}
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
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  switchLabel: { flex: 1, marginEnd: spacing.md },
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
  rowRange: { marginTop: spacing.xs },
  rowAction: { minHeight: 40, paddingVertical: spacing.xs },
  badge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    backgroundColor: colors.primary,
  },
});
