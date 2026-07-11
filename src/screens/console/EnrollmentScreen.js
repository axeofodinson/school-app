// Enrollment — links a student to a class for the current academic year. This is
// where a student finally gets a class (CLAUDE.md rule 2: class lives in
// enrollments, scoped to a year, never on the students table). The screen has two
// modes: enroll a student, and view a class roster for the current year.
//
// Admin-only in practice: RootNavigator only routes developer/admin into the
// console, and RLS (db/setup.sql: p_enroll_staff) is the real boundary — a
// teacher can read only classes they teach, a student none, and only staff write.
//
// Three prerequisites, in CLAUDE.md build order: a current academic year, at least
// one class, and at least one student. Enrollment sits after all of them, so if
// any is missing we send the office to create it first rather than fail on insert.
//
// One enrollment per student per year is enforced in the DB
// (enrollments unique (student_id, year_id)); a duplicate surfaces here as a
// friendly "already enrolled this year" message, not a raw 23505.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Pressable, ActivityIndicator, StyleSheet } from 'react-native';

import { ScreenContainer, Text, TextField, Button } from '../../components';
import { supabase } from '../../lib/supabase';
import { t } from '../../i18n';
import { colors, spacing } from '../../theme/colors';

// The enrollment status enum, mirroring the DB check constraint
// (db/setup.sql: enrollments.status). New enrollments default to 'active'; the
// office can pick another state (e.g. a mid-year transfer) at enroll time.
const STATUSES = ['active', 'transferred', 'graduated', 'withdrawn'];

// roll_number is an optional positive integer. Bounded so a typo can't store an
// absurd value; there's no DB uniqueness on it, so the office owns collisions.
const MAX_ROLL = 100000;

// True only for a plain positive integer within range, so "12a", "0", "-1", or
// "1.5" are rejected rather than silently coerced by Number().
function parseRoll(str) {
  if (!/^\d+$/.test(str)) return null;
  const n = Number(str);
  if (!Number.isInteger(n) || n < 1 || n > MAX_ROLL) return null;
  return n;
}

// Order a roster: by roll number ascending (unnumbered students last), then by
// name. Sorted client-side because roll_number lives on enrollments while the
// name tiebreak lives on the joined students row.
function compareRoster(a, b) {
  const ra = a.roll_number;
  const rb = b.roll_number;
  if (ra != null && rb != null && ra !== rb) return ra - rb;
  if (ra != null && rb == null) return -1;
  if (ra == null && rb != null) return 1;
  const na = a.student?.full_name || '';
  const nb = b.student?.full_name || '';
  return na.localeCompare(nb);
}

// Map a Supabase error to an i18n key under console.enrollments.errors.
function classifyError(error) {
  if (!error) return null;
  if (error.code === '23505') return 'alreadyEnrolled'; // unique (student_id, year_id)
  const msg = (error.message || '').toLowerCase();
  if (/network request failed|failed to fetch|network|timeout|econn/.test(msg)) {
    return 'network';
  }
  return 'unknown';
}

// A pressable pill used for tabs, class picks, and status picks. Selected fills
// with the primary colour; logical margins keep it correct under RTL.
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

// A selectable student in the enroll picker. Selected row is outlined and tinted
// so the current choice is obvious even in a long list.
function StudentPickRow({ student, selected, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.pickRow,
        selected && styles.pickRowSelected,
        pressed && styles.chipPressed,
      ]}
    >
      <View style={styles.rowInfo}>
        <Text variant="label" color={selected ? colors.primary : colors.text}>
          {student.full_name}
        </Text>
        <Text variant="caption" color={colors.muted} style={styles.rowMeta}>
          {t('console.enrollments.enroll.code', { code: student.student_code })}
        </Text>
      </View>
    </Pressable>
  );
}

function RosterRow({ entry }) {
  const student = entry.student;
  const roll =
    entry.roll_number != null
      ? t('console.enrollments.roster.roll', { roll: entry.roll_number })
      : t('console.enrollments.roster.noRoll');
  return (
    <View style={styles.row}>
      <View style={styles.rowInfo}>
        <Text variant="label">{student?.full_name}</Text>
        <Text variant="caption" color={colors.muted} style={styles.rowMeta}>
          {t('console.enrollments.roster.code', { code: student?.student_code })}
        </Text>
      </View>
      <View style={styles.rosterMeta}>
        <Text variant="label" color={colors.primary}>
          {roll}
        </Text>
        <Text variant="caption" color={colors.muted} style={styles.rowMeta}>
          {t(`console.enrollments.statuses.${entry.status}`)}
        </Text>
      </View>
    </View>
  );
}

export default function EnrollmentScreen({
  onBack,
  onManageYears,
  onManageClasses,
  onManageStudents,
}) {
  // Bootstrap: current year + classes + students (the enroll picker needs the
  // full student list). `loaded` distinguishes "no current year" from "not read".
  const [year, setYear] = useState(null); // current academic year { id, label } or null
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const [tab, setTab] = useState('enroll'); // 'enroll' | 'roster'

  // Enroll form
  const [studentQuery, setStudentQuery] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState(null);
  const [enrollClassId, setEnrollClassId] = useState(null);
  const [rollNumber, setRollNumber] = useState('');
  const [status, setStatus] = useState('active');
  const [formError, setFormError] = useState(null); // i18n key under errors
  const [success, setSuccess] = useState(null); // { name, className } or null
  const [saving, setSaving] = useState(false);

  // Roster
  const [rosterClassId, setRosterClassId] = useState(null);
  const [roster, setRoster] = useState(null); // null = not loaded for class
  const [rosterError, setRosterError] = useState(false);

  const load = useCallback(async () => {
    setLoadError(false);
    const [yearRes, classRes, studentRes] = await Promise.all([
      supabase
        .from('academic_years')
        .select('id, label')
        .eq('is_current', true)
        .maybeSingle(),
      supabase
        .from('classes')
        .select('id, name, grade_level')
        .order('grade_level', { ascending: true })
        .order('name', { ascending: true }),
      supabase
        .from('students')
        .select('id, student_code, full_name')
        .order('full_name', { ascending: true }),
    ]);
    if (yearRes.error || classRes.error || studentRes.error) {
      setLoadError(true);
      return;
    }
    const classList = classRes.data ?? [];
    setYear(yearRes.data ?? null);
    setClasses(classList);
    setStudents(studentRes.data ?? []);
    // Default both class pickers to the first class; keep a still-valid selection
    // across reloads.
    const keepOrFirst = (prev) =>
      prev && classList.some((c) => c.id === prev) ? prev : classList[0]?.id ?? null;
    setEnrollClassId(keepOrFirst);
    setRosterClassId(keepOrFirst);
    setLoaded(true);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const loadRoster = useCallback(
    async (classId) => {
      if (!year || !classId) return;
      setRoster(null);
      setRosterError(false);
      const { data, error } = await supabase
        .from('enrollments')
        .select('id, roll_number, status, student:students(id, student_code, full_name)')
        .eq('class_id', classId)
        .eq('year_id', year.id);
      if (error) {
        setRosterError(true);
        return;
      }
      setRoster([...(data ?? [])].sort(compareRoster));
    },
    [year]
  );

  // (Re)load the roster whenever the roster tab is showing a class.
  useEffect(() => {
    if (tab === 'roster' && rosterClassId) loadRoster(rosterClassId);
  }, [tab, rosterClassId, loadRoster]);

  // Client-side search over the loaded students — instant and offline-friendly.
  // Matches name or admission number, case-insensitively.
  const filteredStudents = useMemo(() => {
    const q = studentQuery.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) =>
      [s.full_name, s.student_code]
        .filter(Boolean)
        .some((field) => field.toLowerCase().includes(q))
    );
  }, [students, studentQuery]);

  const enroll = useCallback(async () => {
    if (!selectedStudentId) return setFormError('studentRequired');
    if (!enrollClassId) return setFormError('classRequired');
    const rollRaw = rollNumber.trim();
    let rollVal = null;
    if (rollRaw) {
      rollVal = parseRoll(rollRaw);
      if (rollVal === null) return setFormError('rollInvalid');
    }

    setFormError(null);
    setSuccess(null);
    setSaving(true);
    const { error } = await supabase.from('enrollments').insert({
      student_id: selectedStudentId,
      class_id: enrollClassId,
      year_id: year.id,
      roll_number: rollVal,
      status,
    });
    setSaving(false);

    if (error) {
      setFormError(classifyError(error));
      return;
    }

    // Success: report who went where, then clear the selection so the next
    // enrollment starts fresh. Refresh the roster if it's showing this class.
    const enrolledName =
      students.find((s) => s.id === selectedStudentId)?.full_name ?? '';
    const className = classes.find((c) => c.id === enrollClassId)?.name ?? '';
    setSuccess({ name: enrolledName, className });
    setSelectedStudentId(null);
    setStudentQuery('');
    setRollNumber('');
    setStatus('active');
    if (rosterClassId === enrollClassId) loadRoster(enrollClassId);
  }, [
    selectedStudentId,
    enrollClassId,
    rollNumber,
    status,
    year,
    students,
    classes,
    rosterClassId,
    loadRoster,
  ]);

  const selectStudent = useCallback((id) => {
    setSelectedStudentId((prev) => (prev === id ? null : id));
    setFormError(null);
    setSuccess(null);
  }, []);

  const loading = !loaded && !loadError;

  // --- Header (shared across every state) ---
  const header = (
    <>
      <View style={styles.header}>
        <Text variant="title">{t('console.enrollments.title')}</Text>
        <Button
          variant="secondary"
          label={t('console.enrollments.back')}
          onPress={onBack}
          style={styles.backBtn}
        />
      </View>
      <Text variant="body" color={colors.muted} style={styles.subtitle}>
        {year
          ? t('console.enrollments.subtitle', { year: year.label })
          : t('console.enrollments.subtitleNoYear')}
      </Text>
    </>
  );

  // --- Loading / error / prerequisite states ---
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
            {t('console.enrollments.loadError')}
          </Text>
          <Button
            variant="secondary"
            label={t('console.enrollments.retry')}
            onPress={load}
            style={styles.retry}
          />
        </View>
      </ScreenContainer>
    );
  }

  // Prerequisites, in build order: year -> classes -> students.
  if (!year) {
    return (
      <ScreenContainer scroll>
        {header}
        <Prerequisite
          message={t('console.enrollments.needYear')}
          actionLabel={t('console.enrollments.goToYears')}
          onAction={onManageYears}
        />
      </ScreenContainer>
    );
  }
  if (classes.length === 0) {
    return (
      <ScreenContainer scroll>
        {header}
        <Prerequisite
          message={t('console.enrollments.needClass')}
          actionLabel={t('console.enrollments.goToClasses')}
          onAction={onManageClasses}
        />
      </ScreenContainer>
    );
  }
  if (students.length === 0) {
    return (
      <ScreenContainer scroll>
        {header}
        <Prerequisite
          message={t('console.enrollments.needStudent')}
          actionLabel={t('console.enrollments.goToStudents')}
          onAction={onManageStudents}
        />
      </ScreenContainer>
    );
  }

  const selectedClassName =
    classes.find((c) => c.id === rosterClassId)?.name ?? '';

  return (
    <ScreenContainer scroll>
      {header}

      {/* Mode switch */}
      <View style={styles.tabRow}>
        <Chip
          label={t('console.enrollments.tabs.enroll')}
          selected={tab === 'enroll'}
          onPress={() => setTab('enroll')}
        />
        <Chip
          label={t('console.enrollments.tabs.roster')}
          selected={tab === 'roster'}
          onPress={() => setTab('roster')}
        />
      </View>

      {tab === 'enroll' ? (
        <>
          <View style={styles.card}>
            <Text variant="label" style={styles.formHeading}>
              {t('console.enrollments.enroll.heading')}
            </Text>

            {/* Student picker */}
            <TextField
              label={t('console.enrollments.enroll.searchStudents')}
              placeholder={t('console.enrollments.enroll.searchPlaceholder')}
              value={studentQuery}
              onChangeText={setStudentQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {filteredStudents.length === 0 ? (
              <Text variant="caption" color={colors.muted} style={styles.pickEmpty}>
                {t('console.enrollments.enroll.noStudentMatches', {
                  query: studentQuery.trim(),
                })}
              </Text>
            ) : (
              <View style={styles.pickList}>
                {filteredStudents.map((student) => (
                  <StudentPickRow
                    key={student.id}
                    student={student}
                    selected={student.id === selectedStudentId}
                    onPress={() => selectStudent(student.id)}
                  />
                ))}
              </View>
            )}

            {/* Class picker */}
            <Text variant="label" style={styles.pickLabel}>
              {t('console.enrollments.enroll.pickClass')}
            </Text>
            <View style={styles.chipRow}>
              {classes.map((cls) => (
                <Chip
                  key={cls.id}
                  label={cls.name}
                  selected={cls.id === enrollClassId}
                  onPress={() => setEnrollClassId(cls.id)}
                />
              ))}
            </View>

            {/* Roll number (optional) */}
            <TextField
              label={t('console.enrollments.enroll.rollNumber')}
              placeholder={t('console.enrollments.enroll.rollNumberPlaceholder')}
              value={rollNumber}
              onChangeText={setRollNumber}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="number-pad"
              style={styles.rollField}
            />

            {/* Status */}
            <Text variant="label" style={styles.pickLabel}>
              {t('console.enrollments.enroll.status')}
            </Text>
            <View style={styles.chipRow}>
              {STATUSES.map((s) => (
                <Chip
                  key={s}
                  label={t(`console.enrollments.statuses.${s}`)}
                  selected={s === status}
                  onPress={() => setStatus(s)}
                />
              ))}
            </View>

            {formError ? (
              <Text variant="caption" color={colors.danger} style={styles.formErr}>
                {t(`console.enrollments.errors.${formError}`)}
              </Text>
            ) : null}
            {success ? (
              <Text variant="caption" color={colors.primary} style={styles.formErr}>
                {t('console.enrollments.enroll.success', {
                  name: success.name,
                  class: success.className,
                })}
              </Text>
            ) : null}

            <Button
              label={
                saving
                  ? t('console.enrollments.enroll.submitting')
                  : t('console.enrollments.enroll.submit')
              }
              onPress={enroll}
              loading={saving}
              disabled={saving}
              style={styles.submit}
            />
          </View>
        </>
      ) : (
        <>
          {/* Roster class picker */}
          <Text variant="label" style={styles.pickLabel}>
            {t('console.enrollments.roster.pickClass')}
          </Text>
          <View style={styles.chipRow}>
            {classes.map((cls) => (
              <Chip
                key={cls.id}
                label={cls.name}
                selected={cls.id === rosterClassId}
                onPress={() => setRosterClassId(cls.id)}
              />
            ))}
          </View>

          {/* Roster list / states */}
          {roster === null && !rosterError ? (
            <ActivityIndicator color={colors.primary} style={styles.loading} />
          ) : rosterError ? (
            <View style={styles.stateBox}>
              <Text variant="body" color={colors.danger} align="center">
                {t('console.enrollments.roster.loadError')}
              </Text>
              <Button
                variant="secondary"
                label={t('console.enrollments.retry')}
                onPress={() => loadRoster(rosterClassId)}
                style={styles.retry}
              />
            </View>
          ) : roster.length === 0 ? (
            <View style={styles.stateBox}>
              <Text variant="body" color={colors.muted} align="center">
                {t('console.enrollments.roster.empty', {
                  class: selectedClassName,
                  year: year.label,
                })}
              </Text>
            </View>
          ) : (
            <>
              <Text variant="caption" color={colors.muted} style={styles.count}>
                {t('console.enrollments.roster.count', { count: roster.length })}
              </Text>
              {roster.map((entry) => (
                <RosterRow key={entry.id} entry={entry} />
              ))}
            </>
          )}
        </>
      )}
    </ScreenContainer>
  );
}

// Shared prerequisite prompt: a message plus a button that jumps to the screen
// where the missing thing gets created.
function Prerequisite({ message, actionLabel, onAction }) {
  return (
    <View style={styles.stateBox}>
      <Text variant="body" color={colors.muted} align="center">
        {message}
      </Text>
      {onAction ? (
        <Button label={actionLabel} onPress={onAction} style={styles.retry} />
      ) : null}
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
  tabRow: { flexDirection: 'row', marginTop: spacing.lg },
  card: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  formHeading: { marginBottom: spacing.sm },
  pickLabel: { marginTop: spacing.md, marginBottom: spacing.sm },
  pickEmpty: { marginBottom: spacing.sm },
  pickList: { marginBottom: spacing.xs },
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
  rollField: { marginTop: spacing.md },
  formErr: { marginBottom: spacing.sm },
  submit: { marginTop: spacing.xs },
  loading: { marginTop: spacing.xl },
  stateBox: { marginTop: spacing.xl, alignItems: 'center' },
  retry: { marginTop: spacing.md },
  count: { marginTop: spacing.md, marginBottom: spacing.sm },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.bg,
    marginBottom: spacing.sm,
  },
  pickRowSelected: { borderColor: colors.primary, backgroundColor: colors.surface },
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
  rosterMeta: { alignItems: 'flex-end' },
});
