// Students — registration for the school office. This is the day-one screen: the
// office admits students here (admission number, name, guardian) and then finds
// them again through a search box over the registered list.
//
// Admin-only in practice: RootNavigator only routes developer/admin into the
// console, and RLS (db/setup.sql: p_students_staff) is the real boundary — a
// teacher can read only the students they teach, a student none, and only staff
// can write.
//
// Deliberately NO class here (CLAUDE.md rule 2). A student's class lives in
// enrollments, scoped to an academic year — registration just creates the
// identity/admission record; enrollment comes later on its own screen. Students
// have no prerequisite setup, so unlike classes/subjects this screen never gates
// on a year or class existing.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';

import { ScreenContainer, Text, TextField, Button } from '../../components';
import { supabase } from '../../lib/supabase';
import { t } from '../../i18n';
import { colors, spacing } from '../../theme/colors';

// student_code and full_name are required; date_of_birth is optional but, when
// given, must be a real YYYY-MM-DD. admission_date defaults to today and is
// validated the same way. Guardian fields are free-form and optional.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Today as YYYY-MM-DD in local time — the sensible default for admission_date so
// the office almost never types it. Built from local parts (not toISOString,
// which is UTC and can roll a day at the edges).
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

// Map a Supabase error to an i18n key under console.students.errors.
function classifyError(error) {
  if (!error) return null;
  if (error.code === '23505') return 'codeExists'; // unique (student_code)
  const msg = (error.message || '').toLowerCase();
  if (/network request failed|failed to fetch|network|timeout|econn/.test(msg)) {
    return 'network';
  }
  return 'unknown';
}

// Map a provision_student_login error to a key under console.students.provision.errors.
function classifyProvisionError(error) {
  if (!error) return null;
  const msg = (error.message || '').toLowerCase();
  if (/network request failed|failed to fetch|network|timeout|econn/.test(msg)) {
    return 'network';
  }
  if (/only staff/.test(msg)) return 'notStaff';
  // The RPC raises this if the enrollment vanished between our lookup and the
  // call (e.g. withdrawn concurrently) — same remedy as no enrollment at all.
  if (/enrollment .* not found/.test(msg)) return 'noEnrollment';
  return 'unknown';
}

// A student's PIN is 4–8 digits — long enough to not be guessable at a glance,
// short enough for a young child to remember and type.
const PIN_RE = /^\d{4,8}$/;

// Inline "give login / set PIN" control for one student. Staff-only in practice
// (this whole screen is), and the RPC re-checks is_staff() as the real boundary.
// Setting a PIN provisions (or re-PINs) the student's login account; the student
// then signs in to the student app with their admission number + this PIN.
//
// The provision_student_login RPC is keyed on the student's ENROLLMENT (login is
// granted to the student behind an enrollment), so the PIN can only be set once
// the student is enrolled for the current academic year. This screen only holds
// the student identity, so we look up that active enrollment here before calling
// the RPC (CLAUDE.md rule 2: a student's class/year lives in enrollments, not on
// the student). No current-year enrollment → we guide staff to enroll first.
function StudentLoginControl({ student }) {
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorKey, setErrorKey] = useState(null);
  const [done, setDone] = useState(false);

  const save = async () => {
    setErrorKey(null);
    const value = pin.trim();
    if (!PIN_RE.test(value)) return setErrorKey('pinInvalid');

    setSaving(true);

    // Find the student's active enrollment in the current academic year. The
    // unique (student_id, year_id) constraint means this is at most one row.
    const { data: enrollment, error: lookupError } = await supabase
      .from('enrollments')
      .select('id, year:academic_years!inner(is_current)')
      .eq('student_id', student.id)
      .eq('status', 'active')
      .eq('year.is_current', true)
      .maybeSingle();

    if (lookupError) {
      setSaving(false);
      setErrorKey(classifyProvisionError(lookupError));
      return;
    }
    if (!enrollment) {
      setSaving(false);
      setErrorKey('noEnrollment');
      return;
    }

    // PIN goes over as plain text; the RPC hashes it server-side (bcrypt via
    // crypt()/gen_salt). PIN_RE guarantees digits only, so there is no casing
    // or encoding to normalise here.
    const { error } = await supabase.rpc('provision_student_login', {
      p_enrollment_id: enrollment.id,
      p_pin: value,
    });
    setSaving(false);

    if (error) {
      setErrorKey(classifyProvisionError(error));
      return;
    }
    setDone(true);
    setOpen(false);
    setPin('');
  };

  if (!open) {
    return (
      <View style={styles.loginArea}>
        <Button
          variant="secondary"
          label={t('console.students.provision.action')}
          onPress={() => {
            setDone(false);
            setErrorKey(null);
            setOpen(true);
          }}
          style={styles.loginBtn}
        />
        {done ? (
          <Text variant="caption" color={colors.muted} style={styles.loginNote}>
            {t('console.students.provision.success', { code: student.student_code })}
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.loginArea}>
      <Text variant="caption" color={colors.muted} style={styles.loginNote}>
        {t('console.students.provision.hint')}
      </Text>
      <TextField
        label={t('console.students.provision.pinLabel')}
        placeholder={t('console.students.provision.pinPlaceholder')}
        value={pin}
        onChangeText={setPin}
        keyboardType="number-pad"
        maxLength={8}
        editable={!saving}
      />
      {errorKey ? (
        <Text variant="caption" color={colors.danger} style={styles.loginNote}>
          {t(`console.students.provision.errors.${errorKey}`)}
        </Text>
      ) : null}
      <View style={styles.loginActions}>
        <Button
          label={
            saving
              ? t('console.students.provision.saving')
              : t('console.students.provision.save')
          }
          onPress={save}
          loading={saving}
          disabled={saving}
          style={styles.loginActionBtn}
        />
        <Button
          variant="secondary"
          label={t('console.students.provision.cancel')}
          onPress={() => {
            setOpen(false);
            setErrorKey(null);
            setPin('');
          }}
          disabled={saving}
          style={styles.loginActionBtn}
        />
      </View>
    </View>
  );
}

function StudentRow({ student }) {
  // Guardian line is only shown when we have something to show — an unknown
  // guardian shouldn't render an empty, confusing row.
  const guardian =
    student.guardian_name && student.guardian_phone
      ? t('console.students.guardianBoth', {
          name: student.guardian_name,
          phone: student.guardian_phone,
        })
      : student.guardian_name || student.guardian_phone || null;

  return (
    <View style={styles.row}>
      <View style={styles.rowInfo}>
        <Text variant="label">{student.full_name}</Text>
        <Text variant="caption" color={colors.muted} style={styles.rowMeta}>
          {t('console.students.code', { code: student.student_code })}
        </Text>
        {guardian ? (
          <Text variant="caption" color={colors.muted} style={styles.rowMeta}>
            {guardian}
          </Text>
        ) : null}
        <StudentLoginControl student={student} />
      </View>
    </View>
  );
}

export default function StudentsScreen({ onBack }) {
  const [students, setStudents] = useState(null); // null = not loaded yet
  const [loadError, setLoadError] = useState(false);

  const [studentCode, setStudentCode] = useState('');
  const [fullName, setFullName] = useState('');
  const [dob, setDob] = useState('');
  const [admissionDate, setAdmissionDate] = useState(todayISO());
  const [guardianName, setGuardianName] = useState('');
  const [guardianPhone, setGuardianPhone] = useState('');

  const [formError, setFormError] = useState(null); // i18n key under errors
  const [saving, setSaving] = useState(false);

  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setLoadError(false);
    const { data, error } = await supabase
      .from('students')
      .select(
        'id, student_code, full_name, date_of_birth, admission_date, guardian_name, guardian_phone'
      )
      // Newest first so a just-registered student is visible at the top as
      // immediate confirmation the record saved.
      .order('created_at', { ascending: false });
    if (error) {
      setLoadError(true);
      return;
    }
    setStudents(data ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const registerStudent = useCallback(async () => {
    const code = studentCode.trim();
    const name = fullName.trim();
    const birth = dob.trim();
    const admitted = admissionDate.trim();

    if (!code) return setFormError('codeRequired');
    if (!name) return setFormError('nameRequired');
    if (birth && !isValidDate(birth)) return setFormError('dobInvalid');
    if (!admitted) return setFormError('admissionRequired');
    if (!isValidDate(admitted)) return setFormError('admissionInvalid');

    setFormError(null);
    setSaving(true);
    const { error } = await supabase.from('students').insert({
      student_code: code,
      full_name: name,
      date_of_birth: birth || null,
      admission_date: admitted,
      guardian_name: guardianName.trim() || null,
      guardian_phone: guardianPhone.trim() || null,
    });
    setSaving(false);

    if (error) {
      setFormError(classifyError(error));
      return;
    }
    // Reset the form (admission_date back to today) and re-read so the list is
    // DB truth, with the new student surfacing at the top.
    setStudentCode('');
    setFullName('');
    setDob('');
    setAdmissionDate(todayISO());
    setGuardianName('');
    setGuardianPhone('');
    load();
  }, [studentCode, fullName, dob, admissionDate, guardianName, guardianPhone, load]);

  // Client-side search over the loaded list — instant, forgiving, works offline.
  // Matches admission number, name, or guardian name, case-insensitively.
  const filtered = useMemo(() => {
    if (!students) return [];
    const q = query.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) =>
      [s.student_code, s.full_name, s.guardian_name]
        .filter(Boolean)
        .some((field) => field.toLowerCase().includes(q))
    );
  }, [students, query]);

  const loading = students === null && !loadError;

  return (
    <ScreenContainer scroll>
      <View style={styles.header}>
        <Text variant="title">{t('console.students.title')}</Text>
        <Button
          variant="secondary"
          label={t('console.students.back')}
          onPress={onBack}
          style={styles.backBtn}
        />
      </View>
      <Text variant="body" color={colors.muted} style={styles.subtitle}>
        {t('console.students.subtitle')}
      </Text>

      {/* Registration form */}
      <View style={styles.card}>
        <Text variant="label" style={styles.formHeading}>
          {t('console.students.form.heading')}
        </Text>
        <TextField
          label={t('console.students.form.studentCode')}
          placeholder={t('console.students.form.studentCodePlaceholder')}
          value={studentCode}
          onChangeText={setStudentCode}
          autoCapitalize="characters"
          autoCorrect={false}
        />
        <TextField
          label={t('console.students.form.fullName')}
          placeholder={t('console.students.form.fullNamePlaceholder')}
          value={fullName}
          onChangeText={setFullName}
          autoCapitalize="words"
          autoCorrect={false}
        />
        <TextField
          label={t('console.students.form.dob')}
          placeholder={t('console.students.form.datePlaceholder')}
          value={dob}
          onChangeText={setDob}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="numbers-and-punctuation"
        />
        <TextField
          label={t('console.students.form.admissionDate')}
          placeholder={t('console.students.form.datePlaceholder')}
          value={admissionDate}
          onChangeText={setAdmissionDate}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="numbers-and-punctuation"
        />
        <TextField
          label={t('console.students.form.guardianName')}
          placeholder={t('console.students.form.guardianNamePlaceholder')}
          value={guardianName}
          onChangeText={setGuardianName}
          autoCapitalize="words"
          autoCorrect={false}
        />
        <TextField
          label={t('console.students.form.guardianPhone')}
          placeholder={t('console.students.form.guardianPhonePlaceholder')}
          value={guardianPhone}
          onChangeText={setGuardianPhone}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="phone-pad"
        />
        {formError ? (
          <Text variant="caption" color={colors.danger} style={styles.formErr}>
            {t(`console.students.errors.${formError}`)}
          </Text>
        ) : null}
        <Button
          label={
            saving
              ? t('console.students.form.submitting')
              : t('console.students.form.submit')
          }
          onPress={registerStudent}
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
            {t('console.students.loadError')}
          </Text>
          <Button
            variant="secondary"
            label={t('console.students.retry')}
            onPress={load}
            style={styles.retry}
          />
        </View>
      ) : students.length === 0 ? (
        <View style={styles.stateBox}>
          <Text variant="body" color={colors.muted} align="center">
            {t('console.students.empty')}
          </Text>
        </View>
      ) : (
        <>
          {/* Search over the registered list */}
          <TextField
            label={t('console.students.search.label')}
            placeholder={t('console.students.search.placeholder')}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.search}
          />
          {filtered.length === 0 ? (
            <View style={styles.stateBox}>
              <Text variant="body" color={colors.muted} align="center">
                {t('console.students.noMatches', { query: query.trim() })}
              </Text>
            </View>
          ) : (
            <>
              <Text variant="caption" color={colors.muted} style={styles.count}>
                {t('console.students.count', { count: filtered.length })}
              </Text>
              {filtered.map((student) => (
                <StudentRow key={student.id} student={student} />
              ))}
            </>
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
  formErr: { marginBottom: spacing.sm },
  submit: { marginTop: spacing.xs },
  loading: { marginTop: spacing.xl },
  stateBox: { marginTop: spacing.xl, alignItems: 'center' },
  retry: { marginTop: spacing.md },
  search: { marginTop: spacing.lg, marginBottom: spacing.xs },
  count: { marginBottom: spacing.sm },
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
  loginArea: { marginTop: spacing.sm },
  loginBtn: { minHeight: 40, paddingVertical: spacing.xs, alignSelf: 'flex-start' },
  loginNote: { marginTop: spacing.xs, marginBottom: spacing.xs },
  loginActions: { flexDirection: 'row', marginTop: spacing.xs },
  loginActionBtn: { flex: 1, marginEnd: spacing.sm },
});
