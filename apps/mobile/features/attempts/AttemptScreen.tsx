// Take one published test. Answers save to this device on every change (draft
// in the user's queue namespace), so a dropped connection or a killed app never
// loses work. Submit puts the attempt in the durable queue with a client UUID and
// tries to send it at once; offline, it waits and sends itself later, exactly once.
// Never fetches or computes a mark (grading is a teacher pass; rule 3).
import {
  answeredCount,
  attemptKey,
  buildResponses,
  clipRefs,
  isPreReaderSet,
  pruneAnswers,
  type AnswerValue,
  type Answers,
  type AttemptQuestion,
} from '@school/core';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useI18n, type TKey } from '../../i18n';
import {
  Badge,
  Button,
  EmptyState,
  ExamMode,
  Screen,
  SkeletonLines,
  Text,
  TileBurst,
  useCues,
  useTheme,
} from '../../ui';
import { useGradePresentation } from '../student/StudentPresentation';
import { space } from '../../ui/tokens';
import { useAuth } from '../auth/AuthProvider';
import { FileViewer } from '../files/FileViewer';
import { useHoldMessageToasts } from '../messages/MessagesProvider';
import { PreReaderDone } from '../prereader/Celebration';
import { PreReaderPaper } from '../prereader/PreReaderPaper';
import { prefetchClips } from '../prereader/readAloud';
import { useResult } from '../scope/useResult';
import { loadPaper, type StudentAssessment } from './api';
import { useAttemptSync, useQueuedAttempt, type SubmitResult } from './AttemptSync';
import { StudentHeader } from './Header';
import { QuestionCard } from './QuestionCard';
import { useHome } from './useHome';

const DRAFT_SAVE_MS = 250;
const TYPE_KEYS: Record<string, TKey> = {
  assignment: 'student.assessments.types.assignment',
  test: 'student.assessments.types.test',
  exam: 'student.assessments.types.exam',
  quiz: 'student.assessments.types.quiz',
  file: 'student.assessments.types.file',
};

export function AttemptScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useI18n();
  const home = useHome(false);
  const st = home.state;
  const data = st?.status === 'ready' ? st.data : null;
  const enrollment = data && typeof data.enrollment !== 'string' ? data.enrollment : null;
  const assessment = data?.assessments.find((a) => a.id === id) ?? null;
  const onServer = !!data?.submissions.some((s) => s.assessmentId === id);
  useGradePresentation(enrollment ? (enrollment.gradeLevel ?? null) : undefined);

  const title = assessment?.title ?? t('student.assessments.title');
  const subtitle = assessment
    ? t('student.attempt.context', {
        type: TYPE_KEYS[assessment.type] ? t(TYPE_KEYS[assessment.type]!) : assessment.type,
        subject: assessment.subjectName,
      })
    : undefined;
  const header = <StudentHeader title={title} subtitle={subtitle} />;

  if (!st || st.status === 'loading') {
    return (
      <Screen header={header}>
        <SkeletonLines lines={5} />
      </Screen>
    );
  }
  if (st.status === 'error') {
    return (
      <Screen header={header}>
        <EmptyState
          icon="cloudOff"
          title={t('student.attempt.loadError')}
          action={
            <Button title={t('student.attempt.retry')} variant="secondary" onPress={home.reload} />
          }
        />
      </Screen>
    );
  }
  if (!enrollment || !assessment) {
    return (
      <Screen header={header}>
        <EmptyState
          icon="info"
          title={t('student.attempt.notAvailable')}
          action={<BackToTests />}
        />
      </Screen>
    );
  }
  if (assessment.type === 'file') {
    // A worksheet: read (or open) the teacher's file; the work is done on paper.
    return (
      <Screen header={header}>
        <View style={styles.worksheet}>
          <Text tone="textMuted">{t('student.worksheet.howTo')}</Text>
          <FileViewer file={assessment.file ?? { path: null, name: null, mime: null }} />
          <BackToTests />
        </View>
      </Screen>
    );
  }
  return (
    // Formal tests and exams: nothing moves except the save indicator (CLAUDE.md motion rules).
    <ExamMode active={assessment.type === 'exam' || assessment.type === 'test'}>
      <Screen header={header}>
        {/* A message arriving mid-test waits in the inbox instead of popping up. */}
        <HoldMessageToasts active={assessment.type === 'exam' || assessment.type === 'test'} />
        <Attempt enrollmentId={enrollment.id} assessment={assessment} onServer={onServer} />
      </Screen>
    </ExamMode>
  );
}

/** Which questions have an answer, as a row of tiles (set = answered). Never moves. */
function AnsweredTiles({ questions, answers }: { questions: AttemptQuestion[]; answers: Answers }) {
  const { colours } = useTheme();
  if (questions.length < 2) return null;
  return (
    <View style={styles.tiles} accessible={false} importantForAccessibility="no-hide-descendants">
      {questions.map((q) => {
        const on = answeredCount([q], answers) > 0;
        return (
          <View
            key={q.id}
            style={[
              styles.tile,
              on
                ? { backgroundColor: colours.primarySoft, borderColor: colours.primary }
                : { borderColor: colours.borderStrong, borderStyle: 'dashed' },
            ]}
          />
        );
      })}
    </View>
  );
}

function HoldMessageToasts({ active }: { active: boolean }) {
  useHoldMessageToasts(active);
  return null;
}

function BackToTests() {
  const { t } = useI18n();
  const router = useRouter();
  return (
    <Button
      title={t('student.attempt.doneBack')}
      variant="secondary"
      onPress={() => router.replace('/tests')}
    />
  );
}

function Attempt({
  enrollmentId,
  assessment,
  onServer,
}: {
  enrollmentId: string;
  assessment: StudentAssessment;
  onServer: boolean;
}) {
  const { t } = useI18n();
  const { userStorage } = useAuth();
  const { drafts, submit, flushNow } = useAttemptSync();
  const queued = useQueuedAttempt(enrollmentId, assessment.id);
  const key = attemptKey(enrollmentId, assessment.id);

  const paper = useResult(`p:${assessment.id}`, () => loadPaper(assessment.id, userStorage));
  const questions = paper.state?.status === 'ready' ? paper.state.data.questions : null;
  const fromCache = paper.state?.status === 'ready' && paper.state.data.fromCache;
  const preReader = !!questions && isPreReaderSet(questions);

  // While online, keep this paper's read-aloud clips on the device so they play offline.
  useEffect(() => {
    if (!questions || fromCache) return;
    const refs = clipRefs(questions.map((q) => q.body));
    if (refs.length) prefetchClips(refs).catch(() => undefined);
  }, [questions, fromCache]);

  const [answers, setAnswers] = useState<Answers | null>(null); // null = draft not read yet
  const [saved, setSaved] = useState(false);
  const [confirmBlank, setConfirmBlank] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const { cue, say } = useCues();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Latest answers for the change handler (quick taps never lose an earlier answer).
  const answersRef = useRef<Answers | null>(null);
  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  // Apply the saved draft once the paper is here (only answers to this paper's questions).
  useEffect(() => {
    if (!questions || !drafts || answers !== null) return;
    let live = true;
    drafts
      .load<Answers>(key)
      .then((d) => live && setAnswers(pruneAnswers(questions, d?.value)))
      .catch(() => live && setAnswers({}));
    return () => {
      live = false;
    };
  }, [questions, drafts, key, answers]);

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    [],
  );

  const setAnswer = useCallback(
    (qid: string, v: AnswerValue) => {
      setConfirmBlank(false);
      setSaved(false);
      const next = { ...(answersRef.current ?? {}), [qid]: v };
      answersRef.current = next;
      setAnswers(next);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        drafts
          ?.save(key, next)
          .then(() => setSaved(true))
          .catch(() => undefined);
      }, DRAFT_SAVE_MS);
    },
    [drafts, key],
  );

  const doSubmit = useCallback(async () => {
    if (!questions || !answers) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setBusy(true);
    // Keep the draft on disk until the submission itself is safely queued.
    await drafts?.save(key, answers).catch(() => undefined);
    const r = await submit(enrollmentId, assessment.id, buildResponses(questions, answers));
    setBusy(false);
    setResult(r);
    // A quiz just went off (never sounds in tests/exams: useCues is silent in ExamMode).
    if (r === 'submitted' && questions && !isPreReaderSet(questions)) cue('ding');
  }, [questions, answers, drafts, key, submit, enrollmentId, assessment.id, cue]);

  // A pre-reader paper just finished: celebrate (full tier) and say where the work is.
  if (
    preReader &&
    (result === 'submitted' || (result === 'queued' && queued?.state !== 'rejected'))
  ) {
    return <PreReaderDone queued={result === 'queued' && !!queued} action={<BackToTests />} />;
  }
  // Already on the server (before this visit, or after a queued send went through).
  if (onServer || result === 'submitted' || (result && !queued && result !== 'error')) {
    return (
      <View>
        {/* Just sent (not on a revisit): a short tile burst in the full tier, never in a test/exam. */}
        {result === 'submitted' ? <TileBurst moment="scoreReveal" count={20} radius={170} /> : null}
        <EmptyState
          icon="checkCircle"
          title={result ? t('student.attempt.submitted') : t('student.attempt.alreadyDone')}
          action={<BackToTests />}
        />
      </View>
    );
  }
  // While the first send is in flight, keep the form (with its spinner): the item is
  // already queued, but saying "no internet" before the server answers would be wrong.
  if (queued && !busy) {
    const rejected = queued.state === 'rejected';
    return (
      <EmptyState
        icon={rejected ? 'warning' : 'cloudOff'}
        title={t(rejected ? 'student.attempt.rejected' : 'student.attempt.queued')}
        action={
          <View style={styles.actions}>
            <Button
              title={t('student.attempt.sendNow')}
              icon="syncing"
              onPress={() => flushNow()}
            />
            <BackToTests />
          </View>
        }
      />
    );
  }
  if (assessment.status === 'closed') {
    return <EmptyState icon="lock" title={t('student.attempt.closed')} action={<BackToTests />} />;
  }
  if (!paper.state || paper.state.status === 'loading' || (questions && answers === null)) {
    return <SkeletonLines lines={5} />;
  }
  if (paper.state.status === 'error') {
    return (
      <EmptyState
        icon="cloudOff"
        title={t('student.attempt.loadError')}
        action={
          <Button title={t('student.attempt.retry')} variant="secondary" onPress={paper.reload} />
        }
      />
    );
  }
  const qs = paper.state.data.questions;
  if (qs.length === 0) {
    return (
      <EmptyState icon="info" title={t('student.attempt.noQuestions')} action={<BackToTests />} />
    );
  }

  const a = answers ?? {};
  const done = answeredCount(qs, a);
  const blank = qs.length - done;

  const status = (
    <>
      <AnsweredTiles questions={qs} answers={a} />
      <Text tone="textMuted" accessibilityLiveRegion="polite">
        {t('student.attempt.answeredSummary', { answered: done, total: qs.length })}
        {saved ? ` · ${t('student.attempt.draftSaved')}` : ''}
      </Text>
      {confirmBlank ? (
        <Text tone="wrong" accessibilityLiveRegion="assertive">
          {t('student.attempt.blankWarning', { count: blank })}
        </Text>
      ) : null}
      {result === 'error' ? <Text tone="wrong">{t('student.attempt.errors.unknown')}</Text> : null}
    </>
  );
  const finish = () => {
    if (blank > 0 && !confirmBlank) {
      setConfirmBlank(true);
      // A pre-reader can't read the warning: say it (recorded clip, if there is one).
      if (preReader) say('missedOne');
    } else doSubmit();
  };
  const offlineBadge = paper.state.data.fromCache ? (
    <Badge
      icon="cloudOff"
      label={t('student.attempt.offlineBanner')}
      tone="accent"
      style={styles.start}
    />
  ) : null;

  if (preReader) {
    return (
      <View style={styles.wrap}>
        {offlineBadge}
        <PreReaderPaper
          questions={qs}
          answers={a}
          onAnswer={setAnswer}
          onFinish={finish}
          busy={busy}
          footer={<View style={styles.footer}>{status}</View>}
          finishLabel={confirmBlank ? t('student.attempt.submitAnyway') : undefined}
        />
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {offlineBadge}
      {qs.map((q, i) => (
        <QuestionCard
          key={q.id}
          index={i}
          question={q}
          value={a[q.id]}
          onChange={(v) => setAnswer(q.id, v)}
          disabled={busy}
        />
      ))}
      <View style={styles.footer}>
        {status}
        <Button
          title={
            busy
              ? t('student.attempt.submitting')
              : confirmBlank
                ? t('student.attempt.submitAnyway')
                : t('student.attempt.submit')
          }
          size="lg"
          loading={busy}
          onPress={finish}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  worksheet: { gap: space.lg },
  wrap: { gap: space.md },
  start: { alignSelf: 'flex-start' },
  footer: { gap: space.sm, marginTop: space.sm },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  tile: { width: 22, height: 22, borderRadius: 6, borderWidth: 2 },
  actions: { gap: space.sm, alignItems: 'center' },
});
