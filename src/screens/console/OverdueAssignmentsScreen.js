// Overdue assignments dashboard — where the office (admin) sees, at a glance,
// which published assignments are well past due and exactly which enrolled
// students still haven't turned anything in.
//
// "Overdue" here means an ACTIVE assignment (assessments.type = 'assignment',
// status = 'published') whose due date (assessments.scheduled_on — the only date
// an assessment carries) is at least OVERDUE_DAYS days in the past. A closed or
// draft assessment is not active, so it never shows.
//
// "Hasn't submitted" is read straight off existing data — no new tracking table
// (that was a deliberate constraint). A student counts as having submitted when a
// submissions row exists for their enrollment + this assessment WITH submitted_at
// set (a real turned-in attempt; a score-only row a teacher may have entered
// without a student attempt does not count). The missing list is then just the
// active enrollments for the assignment's class/year minus those who submitted.
//
// Everything is scoped to the current academic year and to ACTIVE enrollments
// (db/009: enrollments.status) — a withdrawn/struck-off student is no longer in
// the class and must not be flagged as missing work. Filterable by class.
//
// This is a staff surface (ConsoleHomeScreen is developer/admin only), and RLS is
// the real boundary (CLAUDE.md rule 4): staff policies already grant read on
// assessments / enrollments / submissions, so the dashboard just reads and joins.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Pressable, ActivityIndicator, StyleSheet } from 'react-native';

import { ScreenContainer, Text, Button } from '../../components';
import { supabase } from '../../lib/supabase';
import { OVERDUE_DAYS, buildOverdueDashboard } from '../../reporting/overdue';
import { t } from '../../i18n';
import { colors, spacing } from '../../theme/colors';

// Local-time today as YYYY-MM-DD (not toISOString, which is UTC and can roll a day
// at the edges). Matches AttendanceScreen's date handling.
function todayISO() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// The date n days before today, as YYYY-MM-DD in local time — the SQL cutoff so
// the database only returns already-overdue rows (the reporting module re-applies
// the same rule as the source of truth for daysOverdue).
function isoDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// A pressable pill used for the class filter. Selected fills with the primary
// colour; logical margins keep it correct under RTL.
function Chip({ label, selected, onPress }) {
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
      <Text variant="label" color={selected ? colors.primaryText : colors.primary}>
        {label}
      </Text>
    </Pressable>
  );
}

// One missing student line: roll number (or "no roll") + name + admission code.
function StudentRow({ entry }) {
  const roll =
    entry.roll_number != null
      ? t('console.overdue.student.roll', { roll: entry.roll_number })
      : t('console.overdue.student.noRoll');
  return (
    <View style={styles.studentRow}>
      <Text variant="label" color={colors.muted} style={styles.studentRoll}>
        {roll}
      </Text>
      <View style={styles.studentMeta}>
        <Text variant="body">{entry.student?.full_name ?? ''}</Text>
        {entry.student?.student_code ? (
          <Text variant="caption" color={colors.muted}>
            {entry.student.student_code}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

// One overdue-assignment card: what the assignment is, how late it is, and the
// list of active students with no submitted attempt.
function OverdueCard({ card }) {
  const missing = card.missing;
  return (
    <View style={styles.card}>
      <Text variant="label">{card.title}</Text>
      <Text variant="caption" color={colors.muted} style={styles.cardMeta}>
        {t('console.overdue.card.meta', {
          class: card.className,
          subject: card.subjectName,
        })}
      </Text>
      <View style={styles.cardStatusRow}>
        <Text variant="caption" color={colors.muted}>
          {t('console.overdue.card.due', { date: card.scheduled_on })}
        </Text>
        <Text variant="caption" color={colors.danger}>
          {t('console.overdue.card.daysOverdue', { count: card.daysOverdue })}
        </Text>
      </View>

      {card.totalActive === 0 ? (
        <Text variant="body" color={colors.muted} style={styles.cardNote}>
          {t('console.overdue.card.noRoster')}
        </Text>
      ) : missing.length === 0 ? (
        <Text variant="body" color={colors.muted} style={styles.cardNote}>
          {t('console.overdue.card.allSubmitted', { total: card.totalActive })}
        </Text>
      ) : (
        <>
          <Text variant="label" color={colors.danger} style={styles.cardCount}>
            {t('console.overdue.card.missing', {
              count: missing.length,
              total: card.totalActive,
            })}
          </Text>
          {missing.map((e) => (
            <StudentRow key={e.id} entry={e} />
          ))}
        </>
      )}
    </View>
  );
}

export default function OverdueAssignmentsScreen({ onBack, onManageYears }) {
  // Bootstrap: current year + the classes available for the filter.
  const [year, setYear] = useState(null); // { id, label } or null
  const [classes, setClasses] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);

  // Filter: null = all classes, else a class id.
  const [filterClassId, setFilterClassId] = useState(null);

  // Result of computing the overdue dashboard for the current filter.
  const [cards, setCards] = useState(null); // null = not computed yet
  const [computeError, setComputeError] = useState(false);

  const load = useCallback(async () => {
    setLoadError(false);
    const yearRes = await supabase
      .from('academic_years')
      .select('id, label')
      .eq('is_current', true)
      .maybeSingle();
    if (yearRes.error) {
      setLoadError(true);
      return;
    }
    const currentYear = yearRes.data ?? null;
    setYear(currentYear);

    if (!currentYear) {
      setClasses([]);
      setLoaded(true);
      return;
    }

    const { data, error } = await supabase
      .from('classes')
      .select('id, name, grade_level')
      .order('grade_level', { ascending: true })
      .order('name', { ascending: true });
    if (error) {
      setLoadError(true);
      return;
    }
    setClasses(data ?? []);
    setLoaded(true);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Build the dashboard for the current year and (optional) class filter. Three
  // scoped reads, then a client-side join — no new tracking table:
  //   1. the overdue published assignments (type/status/date filtered in SQL),
  //   2. the active enrollments for the classes those assignments belong to,
  //   3. the submitted attempts for those assignments,
  // then per assignment: active roster minus those who submitted = missing.
  const compute = useCallback(
    async (classId) => {
      if (!year) return;
      setCards(null);
      setComputeError(false);

      const cutoff = isoDaysAgo(OVERDUE_DAYS);
      let query = supabase
        .from('assessments')
        .select(
          'id, title, class_id, scheduled_on, ' +
            'subject:subjects(name), class:classes(name)'
        )
        .eq('year_id', year.id)
        .eq('type', 'assignment')
        .eq('status', 'published')
        .not('scheduled_on', 'is', null)
        .lte('scheduled_on', cutoff)
        .order('scheduled_on', { ascending: true });
      if (classId) query = query.eq('class_id', classId);

      const assessRes = await query;
      if (assessRes.error) {
        setComputeError(true);
        return;
      }
      const assessments = assessRes.data ?? [];
      if (assessments.length === 0) {
        setCards([]);
        return;
      }

      const classIds = [...new Set(assessments.map((a) => a.class_id))];
      const assessIds = assessments.map((a) => a.id);

      // Active enrollments for every class that has an overdue assignment.
      const enrRes = await supabase
        .from('enrollments')
        .select('id, class_id, roll_number, student:students(full_name, student_code)')
        .eq('year_id', year.id)
        .eq('status', 'active')
        .in('class_id', classIds);
      if (enrRes.error) {
        setComputeError(true);
        return;
      }

      // Submitted attempts across those assignments. submitted_at must be set — a
      // score-only row is not a student-submitted attempt.
      const subRes = await supabase
        .from('submissions')
        .select('assessment_id, enrollment_id, submitted_at')
        .in('assessment_id', assessIds);
      if (subRes.error) {
        setComputeError(true);
        return;
      }

      // Flatten the joined class/subject names, then hand the plain rows to the
      // pure reporting module — the ONE place the overdue + missing-student math
      // lives (src/reporting/overdue.js, checked by npm run verify:overdue).
      const shaped = assessments.map((a) => ({
        id: a.id,
        title: a.title,
        class_id: a.class_id,
        scheduled_on: a.scheduled_on,
        className: a.class?.name ?? '',
        subjectName: a.subject?.name ?? '',
      }));

      setCards(
        buildOverdueDashboard({
          assessments: shaped,
          enrollments: enrRes.data ?? [],
          submissions: subRes.data ?? [],
          today: todayISO(),
          overdueDays: OVERDUE_DAYS,
        })
      );
    },
    [year]
  );

  // (Re)compute whenever the year is known or the filter changes.
  useEffect(() => {
    if (loaded && year) compute(filterClassId);
  }, [loaded, year, filterClassId, compute]);

  // Total students still missing work across the shown assignments (attempt
  // instances, not distinct students) — the headline number.
  const totalMissing = useMemo(
    () => (cards ?? []).reduce((sum, c) => sum + c.missing.length, 0),
    [cards]
  );

  const loading = !loaded && !loadError;

  const header = (
    <>
      <View style={styles.header}>
        <Text variant="title">{t('console.overdue.title')}</Text>
        <Button
          variant="secondary"
          label={t('console.overdue.back')}
          onPress={onBack}
          style={styles.backBtn}
        />
      </View>
      <Text variant="body" color={colors.muted} style={styles.subtitle}>
        {year
          ? t('console.overdue.subtitle', { days: OVERDUE_DAYS, year: year.label })
          : t('console.overdue.subtitleNoYear', { days: OVERDUE_DAYS })}
      </Text>
    </>
  );

  if (loading) {
    return (
      <ScreenContainer scroll>
        {header}
        <ActivityIndicator color={colors.primary} style={styles.loading} />
      </ScreenContainer>
    );
  }

  if (loadError) {
    return (
      <ScreenContainer scroll>
        {header}
        <View style={styles.stateBox}>
          <Text variant="body" color={colors.danger} align="center">
            {t('console.overdue.loadError')}
          </Text>
          <Button
            variant="secondary"
            label={t('console.overdue.retry')}
            onPress={load}
            style={styles.retry}
          />
        </View>
      </ScreenContainer>
    );
  }

  // Prerequisite: a current academic year (everything is scoped to it).
  if (!year) {
    return (
      <ScreenContainer scroll>
        {header}
        <View style={styles.stateBox}>
          <Text variant="body" color={colors.muted} align="center">
            {t('console.overdue.needYear')}
          </Text>
          <Button
            label={t('console.overdue.goToYears')}
            onPress={onManageYears}
            style={styles.retry}
          />
        </View>
      </ScreenContainer>
    );
  }

  const computing = cards === null && !computeError;

  return (
    <ScreenContainer scroll>
      {header}

      {/* Class filter */}
      <Text variant="label" style={styles.pickLabel}>
        {t('console.overdue.filterLabel')}
      </Text>
      <View style={styles.chipRow}>
        <Chip
          label={t('console.overdue.filterAll')}
          selected={filterClassId === null}
          onPress={() => setFilterClassId(null)}
        />
        {classes.map((cls) => (
          <Chip
            key={cls.id}
            label={cls.name}
            selected={cls.id === filterClassId}
            onPress={() => setFilterClassId(cls.id)}
          />
        ))}
      </View>

      {computing ? (
        <ActivityIndicator color={colors.primary} style={styles.loading} />
      ) : computeError ? (
        <View style={styles.stateBox}>
          <Text variant="body" color={colors.danger} align="center">
            {t('console.overdue.loadError')}
          </Text>
          <Button
            variant="secondary"
            label={t('console.overdue.retry')}
            onPress={() => compute(filterClassId)}
            style={styles.retry}
          />
        </View>
      ) : cards.length === 0 ? (
        <View style={styles.stateBox}>
          <Text variant="body" color={colors.muted} align="center">
            {t('console.overdue.empty', { days: OVERDUE_DAYS })}
          </Text>
        </View>
      ) : (
        <>
          <Text variant="body" style={styles.summary}>
            {t('console.overdue.summary', {
              count: cards.length,
              students: totalMissing,
            })}
          </Text>
          {cards.map((card) => (
            <OverdueCard key={card.id} card={card} />
          ))}
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
  loading: { marginTop: spacing.xl },
  stateBox: {
    marginTop: spacing.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  retry: { marginTop: spacing.md },
  summary: { marginTop: spacing.md, marginBottom: spacing.sm },
  card: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  cardMeta: { marginTop: spacing.xs },
  cardStatusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  cardNote: { marginTop: spacing.md },
  cardCount: { marginTop: spacing.md, marginBottom: spacing.xs },
  studentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  studentRoll: { minWidth: 64, marginEnd: spacing.sm },
  studentMeta: { flex: 1 },
});
