// Daily attendance — where the office (admin) and teachers mark who was
// present/absent/late/on-leave for a class on a given day, and review a single
// student's attendance history.
//
// One table (db/setup.sql: attendance), one row per enrollment per day
// (unique (enrollment_id, on_date)). Marking upserts on that key, so re-marking a
// day corrects the existing row instead of stacking duplicates. Attendance
// attaches to the enrollment (CLAUDE.md rule 2), never to the student directly,
// so it's implicitly scoped to the class + academic year the enrollment lives in.
//
// Role scoping mirrors RLS (the real security boundary — CLAUDE.md rule 4):
//   * staff (developer/admin): every class (p_att_staff / p_enroll_staff).
//   * teacher: only classes they're assigned to this year (p_att_teacher /
//     teaches_class). We only OFFER those classes, so the UI matches the boundary
//     rather than leaning on it.
//
// Fast whole-class marking: every student defaults to Present the moment the
// roster loads (present is the common case, and the DB default), so a teacher only
// taps the exceptions. A "Mark all present" reset undoes a mis-tap in one touch.
//
// Prerequisites, in build order: a current academic year, then a class (staff) or
// an assignment (teacher), then students enrolled in that class. Each missing step
// guides the user to whoever can create it rather than failing on upsert.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Pressable, ActivityIndicator, StyleSheet } from 'react-native';

import { ScreenContainer, Text, TextField, Button } from '../../components';
import { useAuth } from '../../auth/AuthProvider';
import { supabase } from '../../lib/supabase';
import { t } from '../../i18n';
import { colors, spacing } from '../../theme/colors';

// The attendance status enum, mirroring the DB check constraint
// (db/setup.sql: attendance.status). 'present' is first — it's the default the
// roster seeds to and the fast path.
const STATUSES = ['present', 'absent', 'late', 'leave'];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Today as YYYY-MM-DD in local time — the default marking date. Built from local
// parts (not toISOString, which is UTC and can roll a day at the edges).
function todayISO() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// Confirms the string is BOTH well-formed and a real calendar date, so "2025-13-40"
// is rejected rather than silently normalised by the Date constructor.
function isValidDate(str) {
  if (!DATE_RE.test(str)) return false;
  const d = new Date(`${str}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && str === d.toISOString().slice(0, 10);
}

// Order a roster: by roll number ascending (unnumbered students last), then by
// name. Sorted client-side because roll_number lives on enrollments while the
// name tiebreak lives on the joined students row. (Same rule as EnrollmentScreen.)
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

// Count each status across a marks map (enrollmentId -> status). Returns a fixed
// shape so the summary line and history rate never see an undefined bucket.
function tally(values) {
  const counts = { present: 0, absent: 0, late: 0, leave: 0 };
  for (const s of values) if (s in counts) counts[s] += 1;
  return counts;
}

// Map a Supabase error to an i18n key under console.attendance.errors.
function classifyError(error) {
  if (!error) return null;
  const msg = (error.message || '').toLowerCase();
  if (/network request failed|failed to fetch|network|timeout|econn/.test(msg)) {
    return 'network';
  }
  return 'unknown';
}

// A pressable pill used for tabs and every single-choice picker (class, status).
// Selected fills with the primary colour; logical margins keep it correct under
// RTL. `compact` shrinks it for the four-across status row on a roster line.
function Chip({ label, selected, onPress, compact }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.chip,
        compact && styles.chipCompact,
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

// One roster line in the Mark tab: the student, and a four-across status picker.
// Tapping a status sets it for this student; the current pick is filled.
function MarkRow({ entry, status, onSet }) {
  const student = entry.student;
  const roll =
    entry.roll_number != null
      ? t('console.attendance.mark.roll', { roll: entry.roll_number })
      : t('console.attendance.mark.noRoll');
  return (
    <View style={styles.markRow}>
      <View style={styles.rowInfo}>
        <Text variant="label">{student?.full_name}</Text>
        <Text variant="caption" color={colors.muted} style={styles.rowMeta}>
          {roll}
          {' · '}
          {t('console.attendance.mark.code', { code: student?.student_code })}
        </Text>
      </View>
      <View style={styles.statusRow}>
        {STATUSES.map((s) => (
          <Chip
            key={s}
            compact
            label={t(`console.attendance.statuses.${s}`)}
            selected={s === status}
            onPress={() => onSet(entry.id, s)}
          />
        ))}
      </View>
    </View>
  );
}

// A selectable student in the History student picker. Selected row is outlined
// and tinted so the current choice is obvious even in a long list.
function StudentPickRow({ entry, selected, onPress }) {
  const student = entry.student;
  const roll =
    entry.roll_number != null
      ? t('console.attendance.mark.roll', { roll: entry.roll_number })
      : t('console.attendance.mark.noRoll');
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
          {student?.full_name}
        </Text>
        <Text variant="caption" color={colors.muted} style={styles.rowMeta}>
          {roll}
          {entry.status && entry.status !== 'active'
            ? ` · ${t(`console.attendance.enrollmentStatuses.${entry.status}`)}`
            : ''}
        </Text>
      </View>
    </Pressable>
  );
}

// One line in a student's attendance history: the date and the status recorded.
function HistoryRow({ record }) {
  return (
    <View style={styles.row}>
      <Text variant="label">{record.on_date}</Text>
      <View style={styles.statusBadge}>
        <Text variant="caption" color={colors.primary}>
          {t(`console.attendance.statuses.${record.status}`)}
        </Text>
      </View>
    </View>
  );
}

export default function AttendanceScreen({
  onBack,
  onManageYears,
  onManageClasses,
  onManageEnrollments,
}) {
  const { role, session } = useAuth();
  const isStaff = role === 'developer' || role === 'admin';
  const userId = session?.user?.id;

  // Bootstrap: current year + the classes this user may mark for.
  const [year, setYear] = useState(null); // { id, label } or null
  const [classes, setClasses] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const [tab, setTab] = useState('mark'); // 'mark' | 'history'

  // --- Mark tab ---
  const [markClassId, setMarkClassId] = useState(null);
  const [date, setDate] = useState(todayISO());
  const [dateError, setDateError] = useState(null); // i18n key under errors, or null
  const [roster, setRoster] = useState(null); // null = not loaded for class+date
  const [rosterError, setRosterError] = useState(false);
  const [marks, setMarks] = useState({}); // enrollmentId -> status
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null); // i18n key under errors
  const [savedDate, setSavedDate] = useState(null); // date string of last successful save

  // --- History tab ---
  const [histClassId, setHistClassId] = useState(null);
  const [histRoster, setHistRoster] = useState(null); // null = not loaded for class
  const [histRosterError, setHistRosterError] = useState(false);
  const [histEnrollmentId, setHistEnrollmentId] = useState(null);
  const [history, setHistory] = useState(null); // null = not loaded for student
  const [historyError, setHistoryError] = useState(false);

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

    // Staff mark any class; a teacher only classes they're assigned to this year.
    // Distinct on class since a teacher may hold several subject assignments in one
    // class. Mirrors AssessmentBuilderScreen so the two surfaces scope identically.
    let classList = [];
    if (isStaff) {
      const { data, error } = await supabase
        .from('classes')
        .select('id, name, grade_level')
        .order('grade_level', { ascending: true })
        .order('name', { ascending: true });
      if (error) {
        setLoadError(true);
        return;
      }
      classList = data ?? [];
    } else {
      const { data, error } = await supabase
        .from('teacher_assignments')
        .select('class:classes(id, name, grade_level)')
        .eq('teacher_id', userId)
        .eq('year_id', currentYear.id);
      if (error) {
        setLoadError(true);
        return;
      }
      const byId = new Map();
      for (const r of data ?? []) if (r.class) byId.set(r.class.id, r.class);
      classList = [...byId.values()].sort(
        (a, b) => a.grade_level - b.grade_level || a.name.localeCompare(b.name)
      );
    }
    setClasses(classList);
    const keepOrFirst = (prev) =>
      prev && classList.some((c) => c.id === prev) ? prev : classList[0]?.id ?? null;
    setMarkClassId(keepOrFirst);
    setHistClassId(keepOrFirst);
    setLoaded(true);
  }, [isStaff, userId]);

  useEffect(() => {
    load();
  }, [load]);

  // Load the roster for a class + date and seed the marks map: everyone starts
  // Present, then any status already recorded for that day overrides. Two reads:
  // the enrollments (the roster) and the existing attendance rows for the day.
  const loadMark = useCallback(
    async (classId, forDate) => {
      if (!year || !classId || !isValidDate(forDate)) return;
      setRoster(null);
      setRosterError(false);
      setSaveError(null);
      setSavedDate(null);

      // Only ACTIVE enrollments are markable — a struck-off/withdrawn student is
      // no longer in the class, so they must not appear on the marking roster
      // (db/009: enrollments.status). Their past attendance stays queryable in
      // the History tab.
      const rosterRes = await supabase
        .from('enrollments')
        .select('id, roll_number, student:students(id, student_code, full_name)')
        .eq('class_id', classId)
        .eq('year_id', year.id)
        .eq('status', 'active');
      if (rosterRes.error) {
        setRosterError(true);
        return;
      }
      const list = [...(rosterRes.data ?? [])].sort(compareRoster);

      const seeded = {};
      for (const e of list) seeded[e.id] = 'present';

      if (list.length > 0) {
        const attRes = await supabase
          .from('attendance')
          .select('enrollment_id, status')
          .eq('on_date', forDate)
          .in('enrollment_id', list.map((e) => e.id));
        if (attRes.error) {
          setRosterError(true);
          return;
        }
        for (const r of attRes.data ?? []) {
          if (r.enrollment_id in seeded) seeded[r.enrollment_id] = r.status;
        }
      }

      setRoster(list);
      setMarks(seeded);
    },
    [year]
  );

  // (Re)load the mark roster whenever the mark tab is showing a class with a valid
  // date. An invalid date just holds the last roster rather than clearing it.
  useEffect(() => {
    if (tab === 'mark' && markClassId && isValidDate(date)) {
      loadMark(markClassId, date);
    }
  }, [tab, markClassId, date, loadMark]);

  const onChangeDate = useCallback((value) => {
    setDate(value);
    setSaveError(null);
    setSavedDate(null);
    const trimmed = value.trim();
    if (!trimmed) setDateError('dateRequired');
    else if (!isValidDate(trimmed)) setDateError('dateInvalid');
    else if (trimmed > todayISO()) setDateError('dateFuture');
    else setDateError(null);
  }, []);

  const setMark = useCallback((enrollmentId, status) => {
    setMarks((prev) => ({ ...prev, [enrollmentId]: status }));
    setSaveError(null);
    setSavedDate(null);
  }, []);

  const markAllPresent = useCallback(() => {
    setMarks((prev) => {
      const next = {};
      for (const id of Object.keys(prev)) next[id] = 'present';
      return next;
    });
    setSaveError(null);
    setSavedDate(null);
  }, []);

  const save = useCallback(async () => {
    const forDate = date.trim();
    if (!forDate) return setDateError('dateRequired');
    if (!isValidDate(forDate)) return setDateError('dateInvalid');
    if (forDate > todayISO()) return setDateError('dateFuture');
    if (!roster || roster.length === 0) return setSaveError('noStudents');

    setSaveError(null);
    setSavedDate(null);
    setSaving(true);
    // One row per enrollment per day; the unique key makes this a correcting
    // upsert, so saving the same day twice edits rather than duplicates. Present
    // rows are written too — attendance being taken is itself a fact worth
    // recording, not the mere absence of a row.
    const rows = roster.map((e) => ({
      enrollment_id: e.id,
      on_date: forDate,
      status: marks[e.id] ?? 'present',
      marked_by: userId,
    }));
    const { error } = await supabase
      .from('attendance')
      .upsert(rows, { onConflict: 'enrollment_id,on_date' });
    setSaving(false);
    if (error) {
      setSaveError(classifyError(error));
      return;
    }
    setSavedDate(forDate);
  }, [date, roster, marks, userId]);

  // History: load the chosen class's roster for the student picker. Unlike the
  // marking roster, this deliberately includes CLOSED enrollments (struck-off,
  // withdrawn, …) so staff can still pull up a removed student's past attendance
  // — historical data stays fully queryable (CLAUDE.md rule 3).
  const loadHistRoster = useCallback(
    async (classId) => {
      if (!year || !classId) return;
      setHistRoster(null);
      setHistRosterError(false);
      const { data, error } = await supabase
        .from('enrollments')
        .select(
          'id, roll_number, status, student:students(id, student_code, full_name)'
        )
        .eq('class_id', classId)
        .eq('year_id', year.id);
      if (error) {
        setHistRosterError(true);
        return;
      }
      setHistRoster([...(data ?? [])].sort(compareRoster));
    },
    [year]
  );

  useEffect(() => {
    if (tab === 'history' && histClassId) loadHistRoster(histClassId);
  }, [tab, histClassId, loadHistRoster]);

  // History: load one student's attendance across the year, newest day first.
  const loadHistory = useCallback(async (enrollmentId) => {
    if (!enrollmentId) return;
    setHistory(null);
    setHistoryError(false);
    const { data, error } = await supabase
      .from('attendance')
      .select('id, on_date, status')
      .eq('enrollment_id', enrollmentId)
      .order('on_date', { ascending: false });
    if (error) {
      setHistoryError(true);
      return;
    }
    setHistory(data ?? []);
  }, []);

  useEffect(() => {
    if (histEnrollmentId) loadHistory(histEnrollmentId);
  }, [histEnrollmentId, loadHistory]);

  const selectMarkClass = useCallback((id) => {
    setMarkClassId(id);
    setRoster(null);
    setMarks({});
    setSaveError(null);
    setSavedDate(null);
  }, []);

  const selectHistClass = useCallback((id) => {
    setHistClassId(id);
    setHistEnrollmentId(null);
    setHistory(null);
  }, []);

  const markCounts = useMemo(() => tally(Object.values(marks)), [marks]);
  const histCounts = useMemo(
    () => tally((history ?? []).map((r) => r.status)),
    [history]
  );

  const loading = !loaded && !loadError;

  // --- Header (shared across every state) ---
  const header = (
    <>
      <View style={styles.header}>
        <Text variant="title">{t('console.attendance.title')}</Text>
        <Button
          variant="secondary"
          label={t('console.attendance.back')}
          onPress={onBack}
          style={styles.backBtn}
        />
      </View>
      <Text variant="body" color={colors.muted} style={styles.subtitle}>
        {year
          ? t(
              isStaff
                ? 'console.attendance.subtitleAdmin'
                : 'console.attendance.subtitleTeacher',
              { year: year.label }
            )
          : t('console.attendance.subtitleNoYear')}
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
            {t('console.attendance.loadError')}
          </Text>
          <Button
            variant="secondary"
            label={t('console.attendance.retry')}
            onPress={load}
            style={styles.retry}
          />
        </View>
      </ScreenContainer>
    );
  }

  // Prerequisites: an active year, then a class (staff) / assignment (teacher).
  if (!year) {
    return (
      <ScreenContainer scroll>
        {header}
        <Prerequisite
          message={t('console.attendance.needYear')}
          actionLabel={isStaff ? t('console.attendance.goToYears') : null}
          onAction={isStaff ? onManageYears : null}
        />
      </ScreenContainer>
    );
  }
  if (classes.length === 0) {
    return (
      <ScreenContainer scroll>
        {header}
        <Prerequisite
          message={
            isStaff
              ? t('console.attendance.needClass')
              : t('console.attendance.noAssignments')
          }
          actionLabel={isStaff ? t('console.attendance.goToClasses') : null}
          onAction={isStaff ? onManageClasses : null}
        />
      </ScreenContainer>
    );
  }

  const markClassName = classes.find((c) => c.id === markClassId)?.name ?? '';
  const histClassName = classes.find((c) => c.id === histClassId)?.name ?? '';
  const histStudentName =
    histRoster?.find((e) => e.id === histEnrollmentId)?.student?.full_name ?? '';

  return (
    <ScreenContainer scroll>
      {header}

      {/* Mode switch */}
      <View style={styles.tabRow}>
        <Chip
          label={t('console.attendance.tabs.mark')}
          selected={tab === 'mark'}
          onPress={() => setTab('mark')}
        />
        <Chip
          label={t('console.attendance.tabs.history')}
          selected={tab === 'history'}
          onPress={() => setTab('history')}
        />
      </View>

      {tab === 'mark' ? (
        <>
          {/* Class */}
          <Text variant="label" style={styles.pickLabel}>
            {t('console.attendance.pickClass')}
          </Text>
          <View style={styles.chipRow}>
            {classes.map((cls) => (
              <Chip
                key={cls.id}
                label={cls.name}
                selected={cls.id === markClassId}
                onPress={() => selectMarkClass(cls.id)}
              />
            ))}
          </View>

          {/* Date */}
          <View style={styles.dateRow}>
            <TextField
              label={t('console.attendance.mark.date')}
              placeholder={t('console.attendance.mark.datePlaceholder')}
              value={date}
              onChangeText={onChangeDate}
              keyboardType="numbers-and-punctuation"
              autoCapitalize="none"
              autoCorrect={false}
              error={dateError ? t(`console.attendance.errors.${dateError}`) : null}
              style={styles.dateField}
            />
            <Button
              variant="secondary"
              label={t('console.attendance.mark.today')}
              onPress={() => onChangeDate(todayISO())}
              style={styles.todayBtn}
            />
          </View>

          {/* Roster / states */}
          {dateError ? (
            <Text variant="caption" color={colors.muted} style={styles.hint}>
              {t('console.attendance.mark.fixDate')}
            </Text>
          ) : roster === null && !rosterError ? (
            <ActivityIndicator color={colors.primary} style={styles.loading} />
          ) : rosterError ? (
            <View style={styles.stateBox}>
              <Text variant="body" color={colors.danger} align="center">
                {t('console.attendance.mark.loadRosterError')}
              </Text>
              <Button
                variant="secondary"
                label={t('console.attendance.retry')}
                onPress={() => loadMark(markClassId, date)}
                style={styles.retry}
              />
            </View>
          ) : roster.length === 0 ? (
            <View style={styles.stateBox}>
              <Text variant="body" color={colors.muted} align="center">
                {t('console.attendance.mark.empty', {
                  class: markClassName,
                  year: year.label,
                })}
              </Text>
              {isStaff && onManageEnrollments ? (
                <Button
                  label={t('console.attendance.mark.goToEnrollments')}
                  onPress={onManageEnrollments}
                  style={styles.retry}
                />
              ) : null}
            </View>
          ) : (
            <>
              <View style={styles.actionsRow}>
                <Text variant="caption" color={colors.muted} style={styles.count}>
                  {t('console.attendance.mark.count', { count: roster.length })}
                </Text>
                <Button
                  variant="secondary"
                  label={t('console.attendance.mark.markAllPresent')}
                  onPress={markAllPresent}
                  style={styles.markAllBtn}
                />
              </View>

              {roster.map((entry) => (
                <MarkRow
                  key={entry.id}
                  entry={entry}
                  status={marks[entry.id] ?? 'present'}
                  onSet={setMark}
                />
              ))}

              <Text variant="caption" color={colors.muted} style={styles.summary}>
                {t('console.attendance.mark.summary', markCounts)}
              </Text>

              {saveError ? (
                <Text variant="caption" color={colors.danger} style={styles.formErr}>
                  {t(`console.attendance.errors.${saveError}`)}
                </Text>
              ) : null}
              {savedDate ? (
                <Text variant="caption" color={colors.primary} style={styles.formErr}>
                  {t('console.attendance.mark.success', { date: savedDate })}
                </Text>
              ) : null}

              <Button
                label={
                  saving
                    ? t('console.attendance.mark.saving')
                    : t('console.attendance.mark.save')
                }
                onPress={save}
                loading={saving}
                disabled={saving}
                style={styles.submit}
              />
            </>
          )}
        </>
      ) : (
        <>
          {/* History: class then student */}
          <Text variant="label" style={styles.pickLabel}>
            {t('console.attendance.pickClass')}
          </Text>
          <View style={styles.chipRow}>
            {classes.map((cls) => (
              <Chip
                key={cls.id}
                label={cls.name}
                selected={cls.id === histClassId}
                onPress={() => selectHistClass(cls.id)}
              />
            ))}
          </View>

          <Text variant="label" style={styles.pickLabel}>
            {t('console.attendance.history.pickStudent')}
          </Text>
          {histRoster === null && !histRosterError ? (
            <ActivityIndicator color={colors.primary} style={styles.pickLoading} />
          ) : histRosterError ? (
            <View style={styles.stateBox}>
              <Text variant="body" color={colors.danger} align="center">
                {t('console.attendance.history.loadRosterError')}
              </Text>
              <Button
                variant="secondary"
                label={t('console.attendance.retry')}
                onPress={() => loadHistRoster(histClassId)}
                style={styles.retry}
              />
            </View>
          ) : histRoster.length === 0 ? (
            <View style={styles.stateBox}>
              <Text variant="body" color={colors.muted} align="center">
                {t('console.attendance.history.rosterEmpty', {
                  class: histClassName,
                  year: year.label,
                })}
              </Text>
            </View>
          ) : (
            <View style={styles.pickList}>
              {histRoster.map((entry) => (
                <StudentPickRow
                  key={entry.id}
                  entry={entry}
                  selected={entry.id === histEnrollmentId}
                  onPress={() => setHistEnrollmentId(entry.id)}
                />
              ))}
            </View>
          )}

          {/* Selected student's history */}
          {histEnrollmentId ? (
            history === null && !historyError ? (
              <ActivityIndicator color={colors.primary} style={styles.loading} />
            ) : historyError ? (
              <View style={styles.stateBox}>
                <Text variant="body" color={colors.danger} align="center">
                  {t('console.attendance.history.loadError')}
                </Text>
                <Button
                  variant="secondary"
                  label={t('console.attendance.retry')}
                  onPress={() => loadHistory(histEnrollmentId)}
                  style={styles.retry}
                />
              </View>
            ) : history.length === 0 ? (
              <View style={styles.stateBox}>
                <Text variant="body" color={colors.muted} align="center">
                  {t('console.attendance.history.empty', { name: histStudentName })}
                </Text>
              </View>
            ) : (
              <>
                <Text variant="caption" color={colors.muted} style={styles.summary}>
                  {t('console.attendance.history.presentRate', {
                    rate: Math.round((histCounts.present / history.length) * 100),
                    total: history.length,
                  })}
                </Text>
                <Text variant="caption" color={colors.muted} style={styles.summarySub}>
                  {t('console.attendance.history.summary', histCounts)}
                </Text>
                {history.map((record) => (
                  <HistoryRow key={record.id} record={record} />
                ))}
              </>
            )
          ) : null}
        </>
      )}
    </ScreenContainer>
  );
}

// Shared prerequisite prompt: a message plus (for staff) a button that jumps to
// the screen where the missing thing gets created. Teachers get message-only,
// since only an admin can fix their missing year/assignment.
function Prerequisite({ message, actionLabel, onAction }) {
  return (
    <View style={styles.stateBox}>
      <Text variant="body" color={colors.muted} align="center">
        {message}
      </Text>
      {onAction && actionLabel ? (
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
  pickLabel: { marginTop: spacing.md, marginBottom: spacing.sm },
  hint: { marginTop: spacing.md },
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
  chipCompact: { minHeight: 34, paddingHorizontal: spacing.sm },
  chipSelected: { backgroundColor: colors.primary },
  chipPressed: { opacity: 0.85 },
  dateRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: spacing.md },
  dateField: { flex: 1, marginBottom: 0, marginEnd: spacing.sm },
  todayBtn: { minHeight: 48, marginTop: spacing.lg, paddingVertical: spacing.sm },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  count: { flex: 1, marginEnd: spacing.md },
  markAllBtn: { minHeight: 40, paddingVertical: spacing.xs },
  markRow: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.sm },
  summary: { marginTop: spacing.md, marginBottom: spacing.xs },
  summarySub: { marginBottom: spacing.sm },
  formErr: { marginTop: spacing.sm, marginBottom: spacing.sm },
  submit: { marginTop: spacing.sm },
  loading: { marginTop: spacing.xl },
  pickLoading: { alignSelf: 'flex-start', marginBottom: spacing.sm },
  stateBox: { marginTop: spacing.xl, alignItems: 'center' },
  retry: { marginTop: spacing.md },
  pickList: { marginBottom: spacing.xs },
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
  rowInfo: { flex: 1, marginEnd: spacing.md },
  rowMeta: { marginTop: spacing.xs },
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
});
