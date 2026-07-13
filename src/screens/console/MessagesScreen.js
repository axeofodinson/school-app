// Messages — compose and send a notification to students.
//
// An admin picks the audience: the whole SCHOOL, one CLASS, or one STUDENT. A
// teacher can only reach a class they teach or a student in one of their classes
// (no school-wide broadcast) — the audience pickers here load only what they own,
// and RLS (db/010) is the real boundary that rejects anything else.
//
// Sending is a single INSERT into public.messages: that row is the durable
// record the student's in-app inbox reads. A Database Webhook then fans the push
// out via the send-message-push Edge Function — best-effort delivery on top of
// the always-visible message.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Pressable, ActivityIndicator, StyleSheet } from 'react-native';

import { ScreenContainer, Text, TextField, Button } from '../../components';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../auth/AuthProvider';
import { t } from '../../i18n';
import { colors, spacing } from '../../theme/colors';

// Selectable pill, matching the console's other pickers.
function Chip({ label, selected, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipSelected,
        pressed && styles.chipPressed,
      ]}
    >
      <Text
        variant="label"
        color={selected ? colors.primaryText : colors.text}
        align="center"
      >
        {label}
      </Text>
    </Pressable>
  );
}

// Map a Supabase insert error to a key under console.messages.errors.
function classifyError(error) {
  if (!error) return null;
  const msg = (error.message || '').toLowerCase();
  if (/network request failed|failed to fetch|network|timeout|econn/.test(msg)) {
    return 'network';
  }
  // RLS rejection (teacher targeting a class/student they don't own).
  if (error.code === '42501' || /row-level security|violates/.test(msg)) {
    return 'notAllowed';
  }
  return 'unknown';
}

export default function MessagesScreen({ onBack }) {
  const { session, role } = useAuth();
  const isStaff = role === 'developer' || role === 'admin';

  // Reference data for the target pickers.
  const [classes, setClasses] = useState(null); // null = loading
  const [students, setStudents] = useState(null);
  const [loadError, setLoadError] = useState(false);

  // Compose state.
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  // Staff default to the school-wide broadcast; teachers can't, so they start
  // on 'class' (the narrowest audience they always have).
  const [scope, setScope] = useState(isStaff ? 'school' : 'class');
  const [classId, setClassId] = useState(null);
  const [studentId, setStudentId] = useState(null);
  const [studentQuery, setStudentQuery] = useState('');

  const [formError, setFormError] = useState(null);
  const [sending, setSending] = useState(false);
  const [sentNote, setSentNote] = useState(null);

  const load = useCallback(async () => {
    setLoadError(false);
    setClasses(null);
    setStudents(null);

    // Classes the sender may target. Staff: all classes. Teacher: only the
    // classes assigned to them in the current year.
    let classRows = [];
    if (isStaff) {
      const { data, error } = await supabase
        .from('classes')
        .select('id, name, sort_order')
        .order('sort_order', { ascending: true });
      if (error) return setLoadError(true);
      classRows = data ?? [];
    } else {
      const { data: year } = await supabase
        .from('academic_years')
        .select('id')
        .eq('is_current', true)
        .maybeSingle();
      if (year) {
        const { data, error } = await supabase
          .from('teacher_assignments')
          .select('class_id, classes(id, name, sort_order)')
          .eq('teacher_id', session?.user?.id)
          .eq('year_id', year.id);
        if (error) return setLoadError(true);
        // Dedupe classes (a teacher may teach several subjects in one class).
        const seen = new Map();
        (data ?? []).forEach((r) => {
          if (r.classes && !seen.has(r.classes.id)) seen.set(r.classes.id, r.classes);
        });
        classRows = [...seen.values()].sort((a, b) => a.sort_order - b.sort_order);
      }
    }
    setClasses(classRows);

    // Students the sender may target. RLS scopes this: staff see all, a teacher
    // sees only students they teach.
    const { data: studentData, error: studentErr } = await supabase
      .from('students')
      .select('id, full_name, student_code')
      .order('full_name', { ascending: true });
    if (studentErr) return setLoadError(true);
    setStudents(studentData ?? []);
  }, [isStaff, session?.user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredStudents = useMemo(() => {
    if (!students) return [];
    const q = studentQuery.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) =>
      [s.full_name, s.student_code]
        .filter(Boolean)
        .some((f) => f.toLowerCase().includes(q))
    );
  }, [students, studentQuery]);

  const selectedStudent = useMemo(
    () => (students ?? []).find((s) => s.id === studentId) ?? null,
    [students, studentId]
  );

  const send = useCallback(async () => {
    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();

    setSentNote(null);
    if (!trimmedTitle) return setFormError('titleRequired');
    if (!trimmedBody) return setFormError('bodyRequired');
    if (scope === 'class' && !classId) return setFormError('classRequired');
    if (scope === 'student' && !studentId) return setFormError('studentRequired');

    setFormError(null);
    setSending(true);
    const targetId = scope === 'school' ? null : scope === 'class' ? classId : studentId;
    const { error } = await supabase.from('messages').insert({
      sender_id: session?.user?.id,
      scope,
      target_id: targetId,
      title: trimmedTitle,
      body: trimmedBody,
    });
    setSending(false);

    if (error) return setFormError(classifyError(error));

    // Confirm with the audience just sent to, then clear the compose fields.
    const audience =
      scope === 'school'
        ? t('console.messages.audience.school')
        : scope === 'class'
        ? t('console.messages.audience.class', {
            name: (classes ?? []).find((c) => c.id === classId)?.name ?? '',
          })
        : t('console.messages.audience.student', {
            name: selectedStudent?.full_name ?? '',
          });
    setSentNote(t('console.messages.sent', { audience }));
    setTitle('');
    setBody('');
    setStudentId(null);
    setStudentQuery('');
  }, [title, body, scope, classId, studentId, session?.user?.id, classes, selectedStudent]);

  const loading = classes === null || students === null;

  // Scope options depend on role: teachers get no school-wide broadcast.
  const scopeOptions = isStaff ? ['school', 'class', 'student'] : ['class', 'student'];

  return (
    <ScreenContainer scroll>
      <View style={styles.header}>
        <Text variant="title">{t('console.messages.title')}</Text>
        <Button
          variant="secondary"
          label={t('console.messages.back')}
          onPress={onBack}
          style={styles.backBtn}
        />
      </View>
      <Text variant="body" color={colors.muted} style={styles.subtitle}>
        {t(isStaff ? 'console.messages.subtitleAdmin' : 'console.messages.subtitleTeacher')}
      </Text>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={styles.loading} />
      ) : loadError ? (
        <View style={styles.stateBox}>
          <Text variant="body" color={colors.danger} align="center">
            {t('console.messages.loadError')}
          </Text>
          <Button
            variant="secondary"
            label={t('console.messages.retry')}
            onPress={load}
            style={styles.retry}
          />
        </View>
      ) : (
        <View style={styles.card}>
          <TextField
            label={t('console.messages.form.title')}
            placeholder={t('console.messages.form.titlePlaceholder')}
            value={title}
            onChangeText={setTitle}
          />
          <TextField
            label={t('console.messages.form.body')}
            placeholder={t('console.messages.form.bodyPlaceholder')}
            value={body}
            onChangeText={setBody}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />

          {/* Scope picker */}
          <Text variant="label" style={styles.pickLabel}>
            {t('console.messages.form.scope')}
          </Text>
          <View style={styles.chipRow}>
            {scopeOptions.map((s) => (
              <Chip
                key={s}
                label={t(`console.messages.scopes.${s}`)}
                selected={scope === s}
                onPress={() => {
                  setScope(s);
                  setFormError(null);
                  setSentNote(null);
                }}
              />
            ))}
          </View>

          {/* Target picker — class */}
          {scope === 'class' ? (
            <View style={styles.targetBlock}>
              <Text variant="label" style={styles.pickLabel}>
                {t('console.messages.form.pickClass')}
              </Text>
              {classes.length === 0 ? (
                <Text variant="caption" color={colors.muted}>
                  {t('console.messages.noClasses')}
                </Text>
              ) : (
                <View style={styles.chipRow}>
                  {classes.map((c) => (
                    <Chip
                      key={c.id}
                      label={c.name}
                      selected={classId === c.id}
                      onPress={() => {
                        setClassId(c.id);
                        setFormError(null);
                      }}
                    />
                  ))}
                </View>
              )}
            </View>
          ) : null}

          {/* Target picker — student */}
          {scope === 'student' ? (
            <View style={styles.targetBlock}>
              <Text variant="label" style={styles.pickLabel}>
                {t('console.messages.form.pickStudent')}
              </Text>
              {selectedStudent ? (
                <View style={styles.selectedStudent}>
                  <Text variant="body">{selectedStudent.full_name}</Text>
                  <Text variant="caption" color={colors.muted}>
                    {t('console.messages.code', { code: selectedStudent.student_code })}
                  </Text>
                  <Button
                    variant="secondary"
                    label={t('console.messages.form.changeStudent')}
                    onPress={() => setStudentId(null)}
                    style={styles.changeBtn}
                  />
                </View>
              ) : students.length === 0 ? (
                <Text variant="caption" color={colors.muted}>
                  {t('console.messages.noStudents')}
                </Text>
              ) : (
                <>
                  <TextField
                    placeholder={t('console.messages.form.searchStudents')}
                    value={studentQuery}
                    onChangeText={setStudentQuery}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  {filteredStudents.length === 0 ? (
                    <Text variant="caption" color={colors.muted}>
                      {t('console.messages.noStudentMatches', { query: studentQuery.trim() })}
                    </Text>
                  ) : (
                    filteredStudents.slice(0, 20).map((s) => (
                      <Pressable
                        key={s.id}
                        onPress={() => {
                          setStudentId(s.id);
                          setFormError(null);
                        }}
                        style={({ pressed }) => [
                          styles.studentRow,
                          pressed && styles.chipPressed,
                        ]}
                      >
                        <Text variant="body">{s.full_name}</Text>
                        <Text variant="caption" color={colors.muted}>
                          {t('console.messages.code', { code: s.student_code })}
                        </Text>
                      </Pressable>
                    ))
                  )}
                </>
              )}
            </View>
          ) : null}

          {formError ? (
            <Text variant="caption" color={colors.danger} style={styles.formErr}>
              {t(`console.messages.errors.${formError}`)}
            </Text>
          ) : null}
          {sentNote ? (
            <Text variant="caption" color={colors.primary} style={styles.sentNote}>
              {sentNote}
            </Text>
          ) : null}

          <Button
            label={sending ? t('console.messages.form.sending') : t('console.messages.form.send')}
            onPress={send}
            loading={sending}
            disabled={sending}
            style={styles.send}
          />
          <Text variant="caption" color={colors.muted} style={styles.deliveryNote}>
            {t('console.messages.deliveryNote')}
          </Text>
        </View>
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
  loading: { marginTop: spacing.xl },
  stateBox: { marginTop: spacing.xl, alignItems: 'center' },
  retry: { marginTop: spacing.md },
  card: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  pickLabel: { marginBottom: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: {
    minHeight: 40,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    marginEnd: spacing.sm,
    marginBottom: spacing.sm,
    justifyContent: 'center',
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipPressed: { opacity: 0.85 },
  targetBlock: { marginTop: spacing.sm },
  selectedStudent: {
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.bg,
  },
  changeBtn: { minHeight: 36, paddingVertical: spacing.xs, marginTop: spacing.sm, alignSelf: 'flex-start' },
  studentRow: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  formErr: { marginTop: spacing.sm },
  sentNote: { marginTop: spacing.sm },
  send: { marginTop: spacing.md },
  deliveryNote: { marginTop: spacing.sm },
});
