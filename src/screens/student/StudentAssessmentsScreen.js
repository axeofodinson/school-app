// Student assessments — the list of published tests assigned to the student's
// class this year, and the entry point into the attempt flow.
//
// What it shows: for the signed-in student's current-year enrolment, every
// PUBLISHED assessment for their class (RLS db/005 scopes this — a student can't
// see another class's tests, or drafts). Each row badges whether it's still to
// do, already submitted, or saved-offline-and-waiting-to-sync.
//
// Offline tolerance: on open it flushes any queued submissions (from an earlier
// offline attempt) so they reach the server on reconnect, and a dropped list
// load falls back to a clear retry rather than a blank/frozen screen. Opening a
// test hands off to AssessmentAttemptScreen, which caches questions + drafts
// answers locally.
//
// Visuals: quest theme — each test is a quest card with a sprite for its type
// (test=sword, homework=scroll, exam=shield, quiz=bolt) and a status badge.
// Same queries, same i18n keys, logical start/end layout throughout.
//
// Build-order prerequisites (CLAUDE.md): a current academic year and an active
// enrolment. Each missing step gets a real, honest empty state — never a blank
// page.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet } from 'react-native';

import { Text } from '../../components';
import {
  QuestScreen,
  QuestHeader,
  QuestPanel,
  QuestButton,
  QuestBadge,
  QuestLoading,
  QuestEmpty,
  Sprite,
  Enter,
} from '../../components/quest';
import { useAuth } from '../../auth/AuthProvider';
import { supabase } from '../../lib/supabase';
import { getPendingKeys, syncPendingSubmissions } from '../../lib/attemptStore';
import { t } from '../../i18n';
import { quest, spacing } from '../../theme/quest';
import AssessmentAttemptScreen from './AssessmentAttemptScreen';
import FileAssessmentScreen from './FileAssessmentScreen';

// Map a Supabase error to an i18n key under student.assessments.errors.
function classifyError(error) {
  if (!error) return null;
  const msg = (error.message || '').toLowerCase();
  if (/network request failed|failed to fetch|network|timeout|econn/.test(msg)) {
    return 'network';
  }
  return 'unknown';
}

// Which sprite stands for each assessment type on its quest card.
const TYPE_SPRITES = {
  assignment: 'scroll',
  test: 'sword',
  exam: 'shield',
  quiz: 'bolt',
  file: 'scroll',
};

// How each status badge reads: still to do (gold), done (solid green),
// saved offline and waiting to sync (sky), a file worksheet to open (sky).
const STATUS_TONES = {
  todo: 'gold',
  submitted: 'greenSolid',
  pending: 'sky',
  file: 'sky',
};

// One assessment in the list: sprite + title, subject/type, question count, a
// status badge, and the Start/View action. Rendered as a quest card.
function AssessmentRow({ assessment, status, onOpen, delay }) {
  const isFile = assessment.type === 'file';
  const count = assessment.assessment_questions?.[0]?.count ?? 0;
  const done = status === 'submitted' || status === 'pending';
  // A file worksheet is opened to view (no question count, no start/submit).
  const actionLabel = isFile
    ? t('student.assessments.open')
    : done
    ? t('student.assessments.view')
    : t('student.assessments.start');
  return (
    <Enter delay={delay}>
      <QuestPanel style={styles.row} faceStyle={styles.rowFace}>
        <Sprite name={TYPE_SPRITES[assessment.type] ?? 'sword'} size={40} />
        <View style={styles.rowInfo}>
          <Text variant="label" color={quest.ink}>
            {assessment.title}
          </Text>
          <Text variant="caption" color={quest.faint} style={styles.rowMeta}>
            {t(`student.assessments.types.${assessment.type}`)}
            {assessment.subject?.name ? ` · ${assessment.subject.name}` : ''}
          </Text>
          {!isFile ? (
            <Text variant="caption" color={quest.faint} style={styles.rowMeta}>
              {t('student.assessments.questionCount', { count })}
            </Text>
          ) : null}
        </View>
        <View style={styles.rowActions}>
          <QuestBadge
            label={t(`student.assessments.status.${status}`)}
            tone={STATUS_TONES[status] ?? 'faint'}
            style={styles.badge}
          />
          <QuestButton
            variant={isFile || !done ? 'primary' : 'ghost'}
            size="sm"
            label={actionLabel}
            onPress={() => onOpen(assessment, done)}
            style={styles.rowAction}
          />
        </View>
      </QuestPanel>
    </Enter>
  );
}

export default function StudentAssessmentsScreen({ onBack }) {
  const { profile } = useAuth();

  const [year, setYear] = useState(null); // { id, label } or null
  const [enrollment, setEnrollment] = useState(null); // { id, class_id } or null
  const [list, setList] = useState(null); // null = loading
  const [submittedIds, setSubmittedIds] = useState(new Set()); // server-side done
  const [pendingKeys, setPendingKeysState] = useState(new Set()); // queued offline
  const [errorKey, setErrorKey] = useState(null);
  const [loaded, setLoaded] = useState(false);

  const [attempt, setAttempt] = useState(null); // { assessment, alreadySubmitted }
  const [fileView, setFileView] = useState(null); // a file assessment being viewed

  const load = useCallback(async () => {
    setErrorKey(null);
    setLoaded(false);

    // Push any attempts made offline earlier before reading fresh state.
    await syncPendingSubmissions();

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
    // active enrolment counts as "in a class" for taking tests.
    const enrRes = await supabase
      .from('enrollments')
      .select('id, class_id, status, class:classes(id, name)')
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

    // Published assessments for the student's class + year, with a question
    // count so a zero-question test is honest about it.
    const aRes = await supabase
      .from('assessments')
      .select(
        'id, title, type, total_marks, scheduled_on, ' +
          'file_path, file_name, file_mime, ' +
          'subject:subjects(id, name), assessment_questions(count)'
      )
      .eq('class_id', enr.class_id)
      .eq('year_id', currentYear.id)
      .eq('status', 'published')
      .order('scheduled_on', { ascending: true, nullsFirst: false })
      .order('title', { ascending: true });
    if (aRes.error) {
      setErrorKey(classifyError(aRes.error));
      setLoaded(true);
      return;
    }
    setList(aRes.data ?? []);

    // Which of those the student has already submitted (server-side).
    const subRes = await supabase
      .from('submissions')
      .select('assessment_id')
      .eq('enrollment_id', enr.id);
    if (!subRes.error && subRes.data) {
      setSubmittedIds(new Set(subRes.data.map((s) => s.assessment_id)));
    }

    // Which are saved locally but not yet synced (offline submissions).
    setPendingKeysState(await getPendingKeys());
    setLoaded(true);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openAttempt = useCallback((assessment, alreadySubmitted) => {
    // A file worksheet opens its viewer; structured assessments open the attempt.
    if (assessment.type === 'file') {
      setFileView(assessment);
    } else {
      setAttempt({ assessment, alreadySubmitted });
    }
  }, []);

  // Coming back from the attempt: refresh local + server "done" state and close.
  const closeAttempt = useCallback(() => {
    setAttempt(null);
    load();
  }, [load]);

  // Optimistically reflect a just-made attempt so the list badges update even if
  // the reload below is offline.
  const onSubmitted = useCallback((assessmentId, status) => {
    if (status === 'submitted') {
      setSubmittedIds((prev) => new Set(prev).add(assessmentId));
    } else if (status === 'queued') {
      setPendingKeysState((prev) => {
        const next = new Set(prev);
        if (enrollment) next.add(`${enrollment.id}:${assessmentId}`);
        return next;
      });
    }
  }, [enrollment]);

  const statusFor = useCallback(
    (assessment) => {
      // A file worksheet has no submit/attempt state — it's just there to open.
      if (assessment.type === 'file') return 'file';
      if (submittedIds.has(assessment.id)) return 'submitted';
      if (enrollment && pendingKeys.has(`${enrollment.id}:${assessment.id}`)) {
        return 'pending';
      }
      return 'todo';
    },
    [submittedIds, pendingKeys, enrollment]
  );

  const todoCount = useMemo(
    () => (list ? list.filter((a) => statusFor(a) === 'todo').length : 0),
    [list, statusFor]
  );

  // Drill into a file worksheet's viewer.
  if (fileView) {
    return <FileAssessmentScreen assessment={fileView} onBack={() => setFileView(null)} />;
  }

  // Drill into a single assessment's attempt flow.
  if (attempt) {
    return (
      <AssessmentAttemptScreen
        enrollment={enrollment}
        assessment={attempt.assessment}
        alreadySubmitted={attempt.alreadySubmitted}
        onBack={closeAttempt}
        onSubmitted={onSubmitted}
      />
    );
  }

  const header = (
    <QuestHeader
      title={t('student.assessments.title')}
      subtitle={t('student.assessments.subtitle')}
      backLabel={t('student.assessments.back')}
      onBack={onBack}
    />
  );

  if (!loaded) {
    return (
      <QuestScreen scroll>
        {header}
        <QuestLoading sprite="sword" />
      </QuestScreen>
    );
  }

  if (errorKey) {
    return (
      <QuestScreen scroll>
        {header}
        <QuestEmpty
          message={t(`student.assessments.errors.${errorKey}`)}
          tone="danger"
          actionLabel={t('student.assessments.retry')}
          onAction={load}
        />
      </QuestScreen>
    );
  }

  // Prerequisite empty states — honest, not a blank screen (CLAUDE.md).
  if (!year) {
    return (
      <QuestScreen scroll>
        {header}
        <QuestEmpty message={t('student.assessments.noYear')} />
      </QuestScreen>
    );
  }
  if (!enrollment) {
    return (
      <QuestScreen scroll>
        {header}
        <QuestEmpty message={t('student.assessments.noEnrollment')} />
      </QuestScreen>
    );
  }
  if (!list || list.length === 0) {
    return (
      <QuestScreen scroll>
        {header}
        <QuestEmpty message={t('student.assessments.empty')} />
      </QuestScreen>
    );
  }

  return (
    <QuestScreen scroll>
      {header}
      <QuestBadge
        label={t('student.assessments.todoCount', { count: todoCount })}
        tone={todoCount > 0 ? 'gold' : 'greenSolid'}
        style={styles.count}
      />
      {list.map((a, i) => (
        <AssessmentRow
          key={a.id}
          assessment={a}
          status={statusFor(a)}
          onOpen={openAttempt}
          delay={i < 8 ? i * 50 : 0}
        />
      ))}
    </QuestScreen>
  );
}

const styles = StyleSheet.create({
  count: { marginTop: spacing.md, marginBottom: spacing.sm },
  row: { marginBottom: spacing.md },
  rowFace: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowInfo: { flex: 1, marginStart: spacing.md, marginEnd: spacing.sm },
  rowMeta: { marginTop: spacing.xs },
  rowActions: { alignItems: 'flex-end' },
  badge: { marginBottom: spacing.sm, alignSelf: 'flex-end' },
  rowAction: { minWidth: 96 },
});
