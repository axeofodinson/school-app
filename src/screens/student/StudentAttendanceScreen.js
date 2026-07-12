// Student attendance — the signed-in student's own attendance record for this
// year. Read-only: a student can only ever see their own days, and can't change
// them. RLS (db/004 p_att_student_read) scopes attendance to my_student_id() via
// the enrolment, so this screen just reads and shows.
//
// Attendance attaches to the enrolment (CLAUDE.md rule 2), so it's implicitly the
// current class + year. The summary mirrors the console history view (present
// rate + a per-status tally) so both surfaces describe the same data the same
// way, then lists each marked day newest-first.
//
// Build-order prerequisites (CLAUDE.md): a current academic year and an active
// enrolment. Each missing step gets a real, honest empty state — never a blank
// page. A dropped load falls back to a clear retry rather than a frozen screen.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';

import { ScreenContainer, Text, Button } from '../../components';
import { supabase } from '../../lib/supabase';
import { t } from '../../i18n';
import { colors, spacing } from '../../theme/colors';

// Map a Supabase error to an i18n key under student.attendance.errors.
function classifyError(error) {
  if (!error) return null;
  const msg = (error.message || '').toLowerCase();
  if (/network request failed|failed to fetch|network|timeout|econn/.test(msg)) {
    return 'network';
  }
  return 'unknown';
}

// Count each status across a list of records. Returns a fixed shape so the
// summary line and present rate never see an undefined bucket. (Same rule as the
// console AttendanceScreen tally.)
export function tally(records) {
  const counts = { present: 0, absent: 0, late: 0, leave: 0 };
  for (const r of records || []) if (r.status in counts) counts[r.status] += 1;
  return counts;
}

// One day in the record: the date and the status marked that day.
function DayRow({ record }) {
  return (
    <View style={styles.row}>
      <Text variant="label">{record.on_date}</Text>
      <View
        style={[
          styles.statusBadge,
          record.status === 'present' && styles.statusPresent,
        ]}
      >
        <Text
          variant="caption"
          color={record.status === 'present' ? colors.primaryText : colors.primary}
        >
          {t(`student.attendance.statuses.${record.status}`)}
        </Text>
      </View>
    </View>
  );
}

export default function StudentAttendanceScreen({ onBack }) {
  const [year, setYear] = useState(null); // { id, label } or null
  const [enrollment, setEnrollment] = useState(null); // { id } or null
  const [records, setRecords] = useState(null); // null = not loaded
  const [errorKey, setErrorKey] = useState(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    setErrorKey(null);
    setLoaded(false);

    const yearRes = await supabase
      .from('academic_years')
      .select('id, label')
      .eq('is_current', true)
      .maybeSingle();
    if (yearRes.error) {
      setErrorKey(classifyError(yearRes.error));
      setLoaded(true);
      return;
    }
    const currentYear = yearRes.data ?? null;
    setYear(currentYear);
    if (!currentYear) {
      setLoaded(true);
      return;
    }

    // The student's own enrolment for this year (RLS: my_student_id()). Only an
    // active enrolment counts as being "in a class" this year.
    const enrRes = await supabase
      .from('enrollments')
      .select('id, status')
      .eq('year_id', currentYear.id)
      .maybeSingle();
    if (enrRes.error) {
      setErrorKey(classifyError(enrRes.error));
      setLoaded(true);
      return;
    }
    const enr = enrRes.data && enrRes.data.status === 'active' ? enrRes.data : null;
    setEnrollment(enr);
    if (!enr) {
      setLoaded(true);
      return;
    }

    // My attendance across the year, newest day first (same read the console
    // history uses, scoped to my own enrolment by RLS).
    const attRes = await supabase
      .from('attendance')
      .select('id, on_date, status')
      .eq('enrollment_id', enr.id)
      .order('on_date', { ascending: false });
    if (attRes.error) {
      setErrorKey(classifyError(attRes.error));
      setLoaded(true);
      return;
    }
    setRecords(attRes.data ?? []);
    setLoaded(true);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => tally(records), [records]);
  const total = records?.length ?? 0;
  const presentRate = total > 0 ? Math.round((counts.present / total) * 100) : 0;

  const header = (
    <>
      <View style={styles.header}>
        <Text variant="title">{t('student.attendance.title')}</Text>
        <Button
          variant="secondary"
          label={t('student.attendance.back')}
          onPress={onBack}
          style={styles.backBtn}
        />
      </View>
      <Text variant="body" color={colors.muted} style={styles.subtitle}>
        {t('student.attendance.subtitle')}
      </Text>
    </>
  );

  if (!loaded) {
    return (
      <ScreenContainer scroll>
        {header}
        <ActivityIndicator color={colors.primary} style={styles.loading} />
      </ScreenContainer>
    );
  }

  if (errorKey) {
    return (
      <ScreenContainer scroll>
        {header}
        <View style={styles.stateBox}>
          <Text variant="body" color={colors.danger} align="center">
            {t(`student.attendance.errors.${errorKey}`)}
          </Text>
          <Button
            variant="secondary"
            label={t('student.attendance.retry')}
            onPress={load}
            style={styles.retry}
          />
        </View>
      </ScreenContainer>
    );
  }

  // Prerequisite empty states — honest, not a blank screen (CLAUDE.md).
  if (!year) {
    return (
      <ScreenContainer scroll>
        {header}
        <EmptyState message={t('student.attendance.noYear')} />
      </ScreenContainer>
    );
  }
  if (!enrollment) {
    return (
      <ScreenContainer scroll>
        {header}
        <EmptyState message={t('student.attendance.noEnrollment')} />
      </ScreenContainer>
    );
  }
  if (total === 0) {
    return (
      <ScreenContainer scroll>
        {header}
        <EmptyState message={t('student.attendance.empty')} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scroll>
      {header}

      <View style={styles.summaryBox}>
        <Text variant="label" color={colors.primary}>
          {t('student.attendance.presentRate', { rate: presentRate })}
        </Text>
        <Text variant="caption" color={colors.muted} style={styles.summarySub}>
          {t('student.attendance.summary', counts)}
        </Text>
      </View>

      {records.map((record) => (
        <DayRow key={record.id} record={record} />
      ))}
    </ScreenContainer>
  );
}

function EmptyState({ message }) {
  return (
    <View style={styles.stateBox}>
      <Text variant="body" color={colors.muted} align="center">
        {message}
      </Text>
    </View>
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
  loading: { marginTop: spacing.xl },
  stateBox: { marginTop: spacing.xl, alignItems: 'center' },
  retry: { marginTop: spacing.md },
  summaryBox: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  summarySub: { marginTop: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  statusPresent: { backgroundColor: colors.primary, borderColor: colors.primary },
});
