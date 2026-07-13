// Developer console — dev-only tools that deliberately live OUTSIDE the admin
// console. The one tool here today is hard-delete-student: a permanent, cascading
// erase that the whole rest of the platform is built to avoid (CLAUDE.md rule 3:
// never hard-delete anything with consequences).
//
// Why it's here and not in StudentsScreen: the admin UI must NEVER render a
// hard-delete, regardless of who's looking at it. This screen is reachable only
// from a dev-only entry point (ConsoleHomeScreen shows it only when
// role === 'developer'), and the RPC it calls (dev_hard_delete_student,
// db/011) re-checks is_dev() server-side and rejects anyone else — the real
// boundary, per CLAUDE.md rule 4. The guard below is defense-in-depth: if a
// non-developer ever reached this screen, it shows nothing to delete with.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';

import { ScreenContainer, Text, TextField, Button } from '../../components';
import { useAuth } from '../../auth/AuthProvider';
import { supabase } from '../../lib/supabase';
import { t } from '../../i18n';
import { colors, spacing } from '../../theme/colors';

// Map an RPC error to a key under console.dev.hardDelete.errors.
function classifyDeleteError(error) {
  if (!error) return null;
  const msg = (error.message || '').toLowerCase();
  if (/network request failed|failed to fetch|network|timeout|econn/.test(msg)) {
    return 'network';
  }
  // Raised by the RPC's own guards (db/011).
  if (/only the dev role/.test(msg) || error.code === '42501') return 'notDev';
  if (/not found/.test(msg)) return 'notFound';
  return 'unknown';
}

// The confirm/delete control for one student. A hard delete is irreversible, so
// it can't be a single tap: the developer must type the student's admission
// number back before the delete button enables. onDeleted lets the parent drop
// the row from the list without a full reload.
function HardDeleteControl({ student, onDeleted }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [errorKey, setErrorKey] = useState(null);

  const matches = typed.trim() === student.student_code;

  const reset = () => {
    setOpen(false);
    setTyped('');
    setErrorKey(null);
  };

  const remove = async () => {
    setErrorKey(null);
    // Client-side confirmation only — the real erase is authorized by the RPC.
    if (!matches) return setErrorKey('mismatch');

    setDeleting(true);
    const { data, error } = await supabase.rpc('dev_hard_delete_student', {
      p_student_id: student.id,
    });
    setDeleting(false);

    if (error) {
      setErrorKey(classifyDeleteError(error));
      return;
    }
    // data is the jsonb summary the RPC returns (row counts). Hand it up so the
    // parent can confirm exactly what was removed.
    onDeleted(student, data ?? {});
  };

  if (!open) {
    return (
      <Button
        variant="secondary"
        label={t('console.dev.hardDelete.select')}
        onPress={() => setOpen(true)}
        style={styles.rowAction}
      />
    );
  }

  return (
    <View style={styles.confirm}>
      <Text variant="label" color={colors.danger}>
        {t('console.dev.hardDelete.confirmHeading', { name: student.full_name })}
      </Text>
      <Text variant="caption" color={colors.muted} style={styles.confirmBody}>
        {t('console.dev.hardDelete.confirmBody', { code: student.student_code })}
      </Text>
      <TextField
        label={t('console.dev.hardDelete.confirmLabel', { code: student.student_code })}
        placeholder={t('console.dev.hardDelete.confirmPlaceholder')}
        value={typed}
        onChangeText={setTyped}
        autoCapitalize="characters"
        autoCorrect={false}
        editable={!deleting}
      />
      {errorKey ? (
        <Text variant="caption" color={colors.danger} style={styles.confirmBody}>
          {t(`console.dev.hardDelete.errors.${errorKey}`)}
        </Text>
      ) : null}
      <View style={styles.confirmActions}>
        <Button
          label={
            deleting
              ? t('console.dev.hardDelete.deleting')
              : t('console.dev.hardDelete.confirmDelete')
          }
          onPress={remove}
          loading={deleting}
          disabled={deleting || !matches}
          style={styles.confirmBtn}
        />
        <Button
          variant="secondary"
          label={t('console.dev.hardDelete.cancel')}
          onPress={reset}
          disabled={deleting}
          style={styles.confirmBtn}
        />
      </View>
    </View>
  );
}

export default function DevConsoleScreen({ onBack }) {
  const { role } = useAuth();
  const [students, setStudents] = useState(null); // null = not loaded yet
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState(null); // last successful-delete summary

  const load = useCallback(async () => {
    setLoadError(false);
    const { data, error } = await supabase
      .from('students')
      .select('id, student_code, full_name')
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

  const onDeleted = useCallback((student, summary) => {
    // Drop the row locally (it's gone from the DB) and show what was removed.
    setStudents((prev) => (prev ? prev.filter((s) => s.id !== student.id) : prev));
    setNotice({
      name: student.full_name,
      attempts: summary.attempts ?? 0,
      attendance: summary.attendance ?? 0,
      tokens: summary.push_tokens ?? 0,
      enrollments: summary.enrollments ?? 0,
    });
  }, []);

  const filtered = useMemo(() => {
    if (!students) return [];
    const q = query.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) =>
      [s.student_code, s.full_name]
        .filter(Boolean)
        .some((field) => field.toLowerCase().includes(q))
    );
  }, [students, query]);

  const loading = students === null && !loadError;

  // Defense-in-depth: this screen is only reachable from a dev-only entry, and
  // the RPC is the real boundary, but never render the delete tool for a
  // non-developer session even if routing ever slips.
  if (role !== 'developer') {
    return (
      <ScreenContainer>
        <View style={styles.header}>
          <Text variant="title">{t('console.dev.title')}</Text>
          <Button
            variant="secondary"
            label={t('console.dev.back')}
            onPress={onBack}
            style={styles.backBtn}
          />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scroll>
      <View style={styles.header}>
        <Text variant="title">{t('console.dev.title')}</Text>
        <Button
          variant="secondary"
          label={t('console.dev.back')}
          onPress={onBack}
          style={styles.backBtn}
        />
      </View>
      <Text variant="body" color={colors.muted} style={styles.subtitle}>
        {t('console.dev.subtitle')}
      </Text>

      <View style={styles.card}>
        <Text variant="label" style={styles.heading}>
          {t('console.dev.hardDelete.heading')}
        </Text>
        <Text variant="caption" color={colors.danger} style={styles.warning}>
          {t('console.dev.hardDelete.warning')}
        </Text>

        {notice ? (
          <Text variant="caption" color={colors.muted} style={styles.notice}>
            {t('console.dev.hardDelete.success', {
              name: notice.name,
              attempts: notice.attempts,
              attendance: notice.attendance,
              tokens: notice.tokens,
              enrollments: notice.enrollments,
            })}
          </Text>
        ) : null}

        {loading ? (
          <ActivityIndicator color={colors.primary} style={styles.loading} />
        ) : loadError ? (
          <View style={styles.stateBox}>
            <Text variant="body" color={colors.danger} align="center">
              {t('console.dev.hardDelete.loadError')}
            </Text>
            <Button
              variant="secondary"
              label={t('console.dev.hardDelete.retry')}
              onPress={load}
              style={styles.retry}
            />
          </View>
        ) : students.length === 0 ? (
          <View style={styles.stateBox}>
            <Text variant="body" color={colors.muted} align="center">
              {t('console.dev.hardDelete.empty')}
            </Text>
          </View>
        ) : (
          <>
            <TextField
              label={t('console.dev.hardDelete.searchLabel')}
              placeholder={t('console.dev.hardDelete.searchPlaceholder')}
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.search}
            />
            {filtered.length === 0 ? (
              <View style={styles.stateBox}>
                <Text variant="body" color={colors.muted} align="center">
                  {t('console.dev.hardDelete.noMatches', { query: query.trim() })}
                </Text>
              </View>
            ) : (
              <>
                <Text variant="caption" color={colors.muted} style={styles.count}>
                  {t('console.dev.hardDelete.count', { count: filtered.length })}
                </Text>
                {filtered.map((student) => (
                  <View key={student.id} style={styles.row}>
                    <Text variant="label">{student.full_name}</Text>
                    <Text variant="caption" color={colors.muted} style={styles.rowMeta}>
                      {t('console.students.code', { code: student.student_code })}
                    </Text>
                    <HardDeleteControl student={student} onDeleted={onDeleted} />
                  </View>
                ))}
              </>
            )}
          </>
        )}
      </View>
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
    borderColor: colors.danger,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  heading: { marginBottom: spacing.sm },
  warning: { marginBottom: spacing.md },
  notice: { marginBottom: spacing.md },
  loading: { marginTop: spacing.lg },
  stateBox: { marginTop: spacing.lg, alignItems: 'center' },
  retry: { marginTop: spacing.md },
  search: { marginTop: spacing.xs, marginBottom: spacing.xs },
  count: { marginBottom: spacing.sm },
  row: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowMeta: { marginTop: spacing.xs },
  rowAction: {
    minHeight: 40,
    paddingVertical: spacing.xs,
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
  },
  confirm: { marginTop: spacing.sm },
  confirmBody: { marginTop: spacing.xs, marginBottom: spacing.xs },
  confirmActions: { flexDirection: 'row', marginTop: spacing.xs },
  confirmBtn: { flex: 1, marginEnd: spacing.sm },
});
