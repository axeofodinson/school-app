// Grading — where staff (admin) and teachers enter and CORRECT student grades for
// an assessment. Corrections are versioned, never a silent overwrite: every change
// goes through the record_grade() RPC (db/013), which keeps submissions.score as
// the current value and appends the prior value to submission_grade_edits with a
// required reason (CLAUDE.md rule 3 — an audit trail for anything involving marks).
//
// Role scoping mirrors RLS (the real boundary — rule 4):
//   * staff (developer/admin): every class.
//   * teacher: only classes they're assigned to for the current year.
// We only OFFER those classes, and record_grade() re-checks the caller server-side,
// so a wrong UI can never grade a class the user doesn't own.
//
// Flow (build order): current academic year → a class → an assessment → the class
// roster, each student showing Not submitted / Submitted-not-marked / Graded. Tap a
// student to enter or edit their score; a reason is required only when changing an
// existing grade. Edit history is visible to staff/teachers here, never to students
// (their results view shows only the clean current number).
//
// All the parse/merge/reason rules live in src/reporting/grading.js (pinned by
// `npm run verify:grading`); this screen fetches rows, calls those helpers, and
// renders. Every missing prerequisite gets a real empty state, not a blank screen.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Pressable, ActivityIndicator, StyleSheet } from 'react-native';

import { ScreenContainer, Text, TextField, Button } from '../../components';
import { useAuth } from '../../auth/AuthProvider';
import { supabase } from '../../lib/supabase';
import { parseScore, reasonRequired, gradeState, buildRoster } from '../../reporting/grading';
import { t } from '../../i18n';
import { colors, spacing } from '../../theme/colors';

// Show a numeric score without trailing-zero noise ("15" not "15.00", "12.5" kept).
function fmtScore(score) {
  if (score == null) return '';
  const n = Number(score);
  return Number.isFinite(n) ? String(n) : String(score);
}

// A compact local date for the "last edited" / history lines. Falls back to the
// raw string if it can't be parsed rather than throwing.
function fmtDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString();
  } catch (e) {
    return iso;
  }
}

// Map a Supabase/RPC error to an i18n key under console.grading.errors. record_grade
// raises stable messages (reason_required, not_authorized, …); network failures are
// classified the same way as the rest of the app.
function classifyError(error) {
  if (!error) return null;
  const msg = (error.message || '').toLowerCase();
  if (/network request failed|failed to fetch|network|timeout|econn/.test(msg)) {
    return 'network';
  }
  for (const key of [
    'reason_required',
    'not_authorized',
    'assessment_not_found',
    'enrollment_class_mismatch',
    'score_out_of_range',
  ]) {
    if (msg.includes(key)) return key;
  }
  return 'unknown';
}

// A pressable pill for the class / assessment pickers. Selected fills with the
// primary colour; logical margins keep it correct under RTL.
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

// One student in the roster: identity, current state, and an inline grade editor.
// Owns its own editor/history state so a save re-renders just this row.
function GradeRow({ row, assessment, onSaved }) {
  const { enrollmentId, rollNumber, student, submission } = row;
  const total = assessment.total_marks;
  const state = gradeState(submission);
  const currentScore = submission?.score ?? null;

  const [editing, setEditing] = useState(false);
  const [scoreInput, setScoreInput] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState(null); // null = not loaded
  const [historyError, setHistoryError] = useState(false);

  const openEditor = useCallback(() => {
    setScoreInput(fmtScore(currentScore));
    setReason('');
    setError(null);
    setEditing(true);
  }, [currentScore]);

  const save = useCallback(async () => {
    const parsed = parseScore(scoreInput, total);
    if (parsed.error) return setError(parsed.error);
    // A reason is required only when changing an already-set grade.
    if (reasonRequired(currentScore, parsed.value) && !reason.trim()) {
      return setError('reasonRequired');
    }
    setError(null);
    setSaving(true);
    const { data, error: rpcErr } = await supabase.rpc('record_grade', {
      p_enrollment_id: enrollmentId,
      p_assessment_id: assessment.id,
      p_score: parsed.value,
      p_reason: reason.trim(),
    });
    setSaving(false);
    if (rpcErr) {
      setError(classifyError(rpcErr));
      return;
    }
    setEditing(false);
    setHistory(null); // stale after a new edit; reloads on next open
    onSaved(enrollmentId, data);
  }, [scoreInput, total, currentScore, reason, enrollmentId, assessment.id, onSaved]);

  const loadHistory = useCallback(async () => {
    if (!submission?.id) return;
    setHistoryError(false);
    const { data, error: hErr } = await supabase
      .from('submission_grade_edits')
      .select('id, prev_score, new_score, reason, edited_at')
      .eq('submission_id', submission.id)
      .order('edited_at', { ascending: false });
    if (hErr) {
      setHistoryError(true);
      return;
    }
    setHistory(data ?? []);
  }, [submission?.id]);

  const toggleHistory = useCallback(() => setHistoryOpen((open) => !open), []);

  // Load (or reload) history whenever the panel is open and we don't have it —
  // covers both first open and a re-open after a save reset it to null.
  useEffect(() => {
    if (historyOpen && history === null && !historyError) loadHistory();
  }, [historyOpen, history, historyError, loadHistory]);

  const name = student?.full_name ?? student?.student_code ?? '—';
  const stateTone =
    state === 'graded' ? colors.primary : state === 'ungraded' ? colors.text : colors.muted;

  return (
    <View style={styles.rowWrap}>
      <View style={styles.row}>
        <View style={styles.rowInfo}>
          <Text variant="label">
            {rollNumber != null ? `${rollNumber}. ${name}` : name}
          </Text>
          <Text variant="caption" color={stateTone} style={styles.rowMeta}>
            {t(`console.grading.states.${state}`)}
            {state === 'graded'
              ? ` · ${
                  total != null
                    ? t('console.grading.score', { score: fmtScore(currentScore), total })
                    : t('console.grading.scoreNoTotal', { score: fmtScore(currentScore) })
                }`
              : ''}
          </Text>
          {submission?.edit_count > 0 ? (
            <Text variant="caption" color={colors.muted} style={styles.rowMeta}>
              {t('console.grading.lastEdited', {
                count: submission.edit_count,
                date: fmtDate(submission.last_edited_at),
              })}
            </Text>
          ) : null}
        </View>
        {!editing ? (
          <Button
            variant="secondary"
            label={
              state === 'graded'
                ? t('console.grading.editGrade')
                : t('console.grading.enterGrade')
            }
            onPress={openEditor}
            style={styles.rowAction}
          />
        ) : null}
      </View>

      {editing ? (
        <View style={styles.editor}>
          <TextField
            label={t('console.grading.scoreLabel')}
            placeholder={t('console.grading.scorePlaceholder')}
            value={scoreInput}
            onChangeText={setScoreInput}
            keyboardType="numbers-and-punctuation"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {total != null ? (
            <Text variant="caption" color={colors.muted} style={styles.hint}>
              {t('console.grading.outOf', { total })}
            </Text>
          ) : null}
          {/* Reason is only meaningful (and only required) when correcting. */}
          {currentScore != null ? (
            <>
              <TextField
                label={t('console.grading.reasonLabel')}
                placeholder={t('console.grading.reasonPlaceholder')}
                value={reason}
                onChangeText={setReason}
                autoCapitalize="sentences"
                style={styles.field}
              />
              <Text variant="caption" color={colors.muted} style={styles.hint}>
                {t('console.grading.reasonHint')}
              </Text>
            </>
          ) : null}
          {error ? (
            <Text variant="caption" color={colors.danger} style={styles.formErr}>
              {t(`console.grading.errors.${error}`)}
            </Text>
          ) : null}
          <View style={styles.editorActions}>
            <Button
              variant="secondary"
              label={t('console.grading.cancel')}
              onPress={() => setEditing(false)}
              disabled={saving}
              style={styles.editBtn}
            />
            <Button
              label={saving ? t('console.grading.saving') : t('console.grading.save')}
              onPress={save}
              loading={saving}
              disabled={saving}
              style={styles.editBtn}
            />
          </View>
        </View>
      ) : null}

      {/* Edit history — staff/teacher only (RLS). Shown once a grade exists. */}
      {state === 'graded' && submission?.edit_count > 0 ? (
        <View style={styles.historyWrap}>
          <Pressable onPress={toggleHistory} accessibilityRole="button">
            <Text variant="caption" color={colors.primary}>
              {historyOpen
                ? t('console.grading.hideHistory')
                : t('console.grading.showHistory')}
            </Text>
          </Pressable>
          {historyOpen ? (
            history === null && !historyError ? (
              <ActivityIndicator color={colors.primary} style={styles.historyLoading} />
            ) : historyError ? (
              <Text variant="caption" color={colors.danger} style={styles.historyMeta}>
                {t('console.grading.historyLoadError')}
              </Text>
            ) : history.length === 0 ? (
              <Text variant="caption" color={colors.muted} style={styles.historyMeta}>
                {t('console.grading.historyEmpty')}
              </Text>
            ) : (
              history.map((h) => (
                <View key={h.id} style={styles.historyEntry}>
                  <Text variant="caption" color={colors.text}>
                    {h.prev_score == null
                      ? t('console.grading.historyFirst', { new: fmtScore(h.new_score) })
                      : t('console.grading.historyChange', {
                          prev: fmtScore(h.prev_score),
                          new: fmtScore(h.new_score),
                        })}
                  </Text>
                  <Text variant="caption" color={colors.muted} style={styles.historyMeta}>
                    {t('console.grading.historyMeta', {
                      reason: h.reason,
                      date: fmtDate(h.edited_at),
                    })}
                  </Text>
                </View>
              ))
            )
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export default function GradingScreen({
  onBack,
  onManageYears,
  onManageClasses,
  onManageAssessments,
}) {
  const { role, session } = useAuth();
  const isStaff = role === 'developer' || role === 'admin';
  const userId = session?.user?.id;

  const [year, setYear] = useState(null); // { id, label } or null
  const [classes, setClasses] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const [selectedClassId, setSelectedClassId] = useState(null);

  const [assessments, setAssessments] = useState(null); // null = not loaded for class
  const [assessmentsError, setAssessmentsError] = useState(false);
  const [selectedAssessmentId, setSelectedAssessmentId] = useState(null);

  const [roster, setRoster] = useState(null); // null = not loaded for assessment
  const [rosterError, setRosterError] = useState(false);

  // Bootstrap: current year + the classes this user may grade for (mirrors
  // AssessmentBuilderScreen's loader so the class list matches the RLS boundary).
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
    setSelectedClassId((prev) =>
      prev && classList.some((c) => c.id === prev) ? prev : classList[0]?.id ?? null
    );
    setLoaded(true);
  }, [isStaff, userId]);

  useEffect(() => {
    load();
  }, [load]);

  // Assessments for the selected class + year (any status/type — you might grade a
  // paper worksheet published as a file assessment, or a closed exam).
  const loadAssessments = useCallback(
    async (classId) => {
      if (!year) return;
      setAssessments(null);
      setAssessmentsError(false);
      const { data, error } = await supabase
        .from('assessments')
        .select('id, title, type, status, total_marks')
        .eq('year_id', year.id)
        .eq('class_id', classId)
        .order('created_at', { ascending: false });
      if (error) {
        setAssessmentsError(true);
        return;
      }
      const listData = data ?? [];
      setAssessments(listData);
      setSelectedAssessmentId((prev) =>
        prev && listData.some((a) => a.id === prev) ? prev : listData[0]?.id ?? null
      );
    },
    [year]
  );

  // The class roster merged with this assessment's submissions.
  const loadRoster = useCallback(async (classId, assessmentId) => {
    if (!year || !classId || !assessmentId) return;
    setRoster(null);
    setRosterError(false);
    const enrRes = await supabase
      .from('enrollments')
      .select('id, roll_number, student:students(id, full_name, student_code)')
      .eq('class_id', classId)
      .eq('year_id', year.id)
      .eq('status', 'active');
    if (enrRes.error) {
      setRosterError(true);
      return;
    }
    const enrollments = (enrRes.data ?? []).sort((a, b) => {
      // Roll number ascending, unnumbered last, then by name.
      if (a.roll_number == null && b.roll_number == null) {
        return (a.student?.full_name ?? '').localeCompare(b.student?.full_name ?? '');
      }
      if (a.roll_number == null) return 1;
      if (b.roll_number == null) return -1;
      return a.roll_number - b.roll_number;
    });

    const subRes = await supabase
      .from('submissions')
      .select('id, enrollment_id, score, submitted_at, graded_at, edit_count, last_edited_at')
      .eq('assessment_id', assessmentId);
    if (subRes.error) {
      setRosterError(true);
      return;
    }
    setRoster(buildRoster(enrollments, subRes.data ?? []));
  }, [year]);

  // Load assessments when the class changes.
  useEffect(() => {
    if (selectedClassId) loadAssessments(selectedClassId);
    else setAssessments(null);
  }, [selectedClassId, loadAssessments]);

  // Load the roster when the assessment changes.
  useEffect(() => {
    if (selectedClassId && selectedAssessmentId) {
      loadRoster(selectedClassId, selectedAssessmentId);
    } else {
      setRoster(null);
    }
  }, [selectedClassId, selectedAssessmentId, loadRoster]);

  const selectClass = useCallback((id) => {
    setSelectedClassId(id);
    setSelectedAssessmentId(null);
    setRoster(null);
  }, []);

  const selectAssessment = useCallback((id) => {
    setSelectedAssessmentId(id);
    setRoster(null);
  }, []);

  // Replace one roster row's submission after a save, in place.
  const onRowSaved = useCallback((enrollmentId, newSubmission) => {
    setRoster((prev) =>
      (prev ?? []).map((r) =>
        r.enrollmentId === enrollmentId ? { ...r, submission: newSubmission } : r
      )
    );
  }, []);

  const selectedAssessment = useMemo(
    () => (assessments ?? []).find((a) => a.id === selectedAssessmentId) ?? null,
    [assessments, selectedAssessmentId]
  );

  const loading = !loaded && !loadError;

  const header = (
    <>
      <View style={styles.header}>
        <Text variant="title">{t('console.grading.title')}</Text>
        <Button
          variant="secondary"
          label={t('console.grading.back')}
          onPress={onBack}
          style={styles.backBtn}
        />
      </View>
      <Text variant="body" color={colors.muted} style={styles.subtitle}>
        {year
          ? t(
              isStaff
                ? 'console.grading.subtitleAdmin'
                : 'console.grading.subtitleTeacher',
              { year: year.label }
            )
          : t('console.grading.subtitleNoYear')}
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
            {t('console.grading.loadError')}
          </Text>
          <Button
            variant="secondary"
            label={t('console.grading.retry')}
            onPress={load}
            style={styles.retry}
          />
        </View>
      </ScreenContainer>
    );
  }

  if (!year) {
    return (
      <ScreenContainer scroll>
        {header}
        <Prerequisite
          message={t('console.grading.needYear')}
          actionLabel={isStaff ? t('console.grading.goToYears') : null}
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
            isStaff ? t('console.grading.needClass') : t('console.grading.noAssignments')
          }
          actionLabel={isStaff ? t('console.grading.goToClasses') : null}
          onAction={isStaff ? onManageClasses : null}
        />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scroll>
      {header}

      {/* Class picker */}
      <Text variant="label" style={styles.pickLabel}>
        {t('console.grading.pickClass')}
      </Text>
      <View style={styles.chipRow}>
        {classes.map((cls) => (
          <Chip
            key={cls.id}
            label={cls.name}
            selected={cls.id === selectedClassId}
            onPress={() => selectClass(cls.id)}
          />
        ))}
      </View>

      {/* Assessment picker */}
      <Text variant="label" style={styles.pickLabel}>
        {t('console.grading.pickAssessment')}
      </Text>
      {assessments === null && !assessmentsError ? (
        <ActivityIndicator color={colors.primary} style={styles.pickLoading} />
      ) : assessmentsError ? (
        <InlineRetry
          message={t('console.grading.loadAssessmentsError')}
          onRetry={() => loadAssessments(selectedClassId)}
        />
      ) : assessments.length === 0 ? (
        <Prerequisite
          message={t('console.grading.noAssessments')}
          actionLabel={onManageAssessments ? t('console.grading.goToAssessments') : null}
          onAction={onManageAssessments}
        />
      ) : (
        <View style={styles.chipRow}>
          {assessments.map((a) => (
            <Chip
              key={a.id}
              label={a.title}
              selected={a.id === selectedAssessmentId}
              onPress={() => selectAssessment(a.id)}
            />
          ))}
        </View>
      )}

      {/* Roster */}
      {selectedAssessment ? (
        roster === null && !rosterError ? (
          <ActivityIndicator color={colors.primary} style={styles.loading} />
        ) : rosterError ? (
          <View style={styles.stateBox}>
            <Text variant="body" color={colors.danger} align="center">
              {t('console.grading.rosterLoadError')}
            </Text>
            <Button
              variant="secondary"
              label={t('console.grading.retry')}
              onPress={() => loadRoster(selectedClassId, selectedAssessmentId)}
              style={styles.retry}
            />
          </View>
        ) : roster.length === 0 ? (
          <View style={styles.stateBox}>
            <Text variant="body" color={colors.muted} align="center">
              {t('console.grading.rosterEmpty')}
            </Text>
          </View>
        ) : (
          <>
            <Text variant="caption" color={colors.muted} style={styles.count}>
              {t('console.grading.rosterCount', { count: roster.length })}
            </Text>
            {roster.map((r) => (
              <GradeRow
                key={r.enrollmentId}
                row={r}
                assessment={selectedAssessment}
                onSaved={onRowSaved}
              />
            ))}
          </>
        )
      ) : null}
    </ScreenContainer>
  );
}

// Shared prerequisite prompt: a message plus (for staff) a jump to where the
// missing thing gets created. Teachers get message-only.
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

// A compact inline error + retry for the assessment sub-load.
function InlineRetry({ message, onRetry }) {
  return (
    <View style={styles.inlineRetry}>
      <Text variant="caption" color={colors.danger}>
        {message}
      </Text>
      <Button
        variant="secondary"
        label={t('console.grading.retry')}
        onPress={onRetry}
        style={styles.inlineRetryBtn}
      />
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
  pickLoading: { alignSelf: 'flex-start', marginBottom: spacing.sm },
  count: { marginTop: spacing.md, marginBottom: spacing.sm },
  rowWrap: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowInfo: { flex: 1, marginEnd: spacing.md },
  rowMeta: { marginTop: spacing.xs },
  rowAction: { minHeight: 40, paddingVertical: spacing.xs },
  editor: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.surface,
  },
  field: { marginTop: spacing.md },
  hint: { marginTop: spacing.xs },
  formErr: { marginTop: spacing.sm },
  editorActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: spacing.md },
  editBtn: { minHeight: 40, paddingVertical: spacing.xs, marginStart: spacing.sm },
  historyWrap: { marginTop: spacing.sm },
  historyLoading: { alignSelf: 'flex-start', marginTop: spacing.sm },
  historyEntry: { marginTop: spacing.sm },
  historyMeta: { marginTop: 2 },
  loading: { marginTop: spacing.xl },
  stateBox: { marginTop: spacing.xl, alignItems: 'center' },
  retry: { marginTop: spacing.md },
  inlineRetry: { marginBottom: spacing.sm },
  inlineRetryBtn: {
    alignSelf: 'flex-start',
    minHeight: 40,
    paddingVertical: spacing.xs,
    marginTop: spacing.xs,
  },
});
