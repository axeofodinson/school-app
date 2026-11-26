// The student exam screen (prompt 50, ARCHITECTURE §4). The server owns the
// paper (order and options shuffled for this student), the clock and the mark:
//   start_exam_session → paper + deadline + server time (resumes on any device)
//   every tap → a copy on this device first, then save_exam_answer (one in
//     flight per question; a newer tap is sent after; never lost on a drop)
//   timer = deadline − (device time + offset); at zero it hands in by itself
//   hand in → submit_exam_session → the score at once
// Leaving the screen is logged for the teacher (monitoring, never "lockdown").
// Exam mode: nothing moves but the timer and the save indicator.
import {
  answeredIn,
  clockOffset,
  EXAM_WARN_MS,
  formatClock,
  markSaved,
  mergeServerAnswers,
  remainingMs,
  setAnswer,
  unsaved,
  type AttemptQuestion,
  type ExamSaveState,
  type ExamValue,
} from '@school/core';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, StyleSheet, View } from 'react-native';

import { useI18n } from '../../i18n';
import { readCache, writeCache } from '../../lib/cache';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ExamMode,
  Icon,
  Screen,
  SkeletonLines,
  SyncStatusPill,
  Text,
  useTheme,
  type SyncStatus,
} from '../../ui';
import { space } from '../../ui/tokens';
import { StudentHeader } from '../attempts/Header';
import { QuestionCard } from '../attempts/QuestionCard';
import { useAuth } from '../auth/AuthProvider';
import { useHoldMessageToasts } from '../messages/MessagesProvider';
import {
  logExamEvent,
  saveExamAnswer,
  startExam,
  submitExam,
  type ExamEventKind,
  type ExamPaper,
  type ExamResult,
  type StartError,
} from './api';

const RETRY_MS = 3000;
const storeKey = (sessionId: string) => `exam/${sessionId}`;

type Phase =
  | { at: 'intro' }
  | { at: 'loading' }
  | { at: 'error'; error: StartError }
  | { at: 'taking'; paper: ExamPaper }
  | { at: 'done'; result: ExamResult | null; title: string };

const web = Platform.OS === 'web' && typeof document !== 'undefined';

function requestFullscreen() {
  if (!web) return;
  const el = document.documentElement as HTMLElement & { requestFullscreen?: () => Promise<void> };
  el.requestFullscreen?.().catch(() => undefined);
}
function exitFullscreen() {
  if (!web || !document.fullscreenElement) return;
  document.exitFullscreen?.().catch(() => undefined);
}

export function ExamScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useI18n();
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ at: 'intro' });
  useHoldMessageToasts(phase.at === 'taking');

  const begin = useCallback(async () => {
    requestFullscreen(); // needs this tap; refused quietly where not allowed
    setPhase({ at: 'loading' });
    const r = await startExam(id);
    if (!r.ok) return setPhase({ at: 'error', error: r.error });
    if (r.data.status !== 'in_progress') {
      exitFullscreen();
      return setPhase({
        at: 'done',
        title: r.data.title,
        result:
          r.data.score == null
            ? null
            : {
                status: r.data.status,
                score: r.data.score,
                total: r.data.total,
                questions: 0,
                answered: 0,
                toMark: 0,
              },
      });
    }
    setPhase({ at: 'taking', paper: r.data });
  }, [id]);

  const title = phase.at === 'taking' ? phase.paper.title : phase.at === 'done' ? phase.title : '';
  const header = <StudentHeader title={title || t('student.exam.title')} />;
  const back = (
    <Button
      title={t('student.exam.backToTests')}
      icon="back"
      variant="secondary"
      onPress={() => router.replace('/tests')}
    />
  );

  return (
    <ExamMode>
      {phase.at === 'taking' ? (
        <Taking
          paper={phase.paper}
          onDone={(result) => {
            exitFullscreen();
            setPhase({ at: 'done', result, title: phase.paper.title });
          }}
        />
      ) : (
        <Screen header={header}>
          {phase.at === 'intro' ? (
            <Card>
              <View style={styles.intro}>
                <Icon name="clipboard" size={32} />
                <Text variant="heading" accessibilityRole="header">
                  {t('student.exam.introTitle')}
                </Text>
                <Text tone="textMuted">{t('student.exam.introBody')}</Text>
                <Text variant="bodySm" tone="textMuted">
                  {t('student.exam.honest')}
                </Text>
                <Button title={t('student.exam.start')} icon="pencil" onPress={begin} />
              </View>
            </Card>
          ) : phase.at === 'loading' ? (
            <SkeletonLines lines={5} />
          ) : phase.at === 'error' ? (
            <EmptyState
              icon={phase.error === 'network' ? 'cloudOff' : 'info'}
              title={t(`student.exam.errors.${phase.error}`)}
              action={
                phase.error === 'network' || phase.error === 'notOpen' ? (
                  <Button title={t('student.exam.retry')} variant="secondary" onPress={begin} />
                ) : (
                  back
                )
              }
            />
          ) : (
            <Done result={phase.result} back={back} />
          )}
        </Screen>
      )}
    </ExamMode>
  );
}

function Done({ result, back }: { result: ExamResult | null; back: React.ReactNode }) {
  const { t } = useI18n();
  const { colours } = useTheme();
  return (
    <Card>
      <View style={styles.intro}>
        <Icon name="checkCircle" tone="correct" size={36} />
        <Text variant="heading" accessibilityRole="header">
          {t('student.exam.doneTitle')}
        </Text>
        {result && result.score != null && result.total ? (
          <View
            style={[styles.score, { borderColor: colours.ink, backgroundColor: colours.surface }]}
            accessible
            accessibilityLabel={t('student.exam.scoreA11y', {
              score: result.score,
              total: result.total,
            })}
          >
            <Text variant="title">
              {result.score} / {result.total}
            </Text>
          </View>
        ) : null}
        {result && result.toMark > 0 ? (
          <Text tone="textMuted">{t('student.exam.toMark', { count: result.toMark })}</Text>
        ) : null}
        {result && result.questions > 0 ? (
          <Text variant="bodySm" tone="textMuted">
            {t('student.exam.answeredOf', { answered: result.answered, count: result.questions })}
          </Text>
        ) : null}
        {back}
      </View>
    </Card>
  );
}

function Taking({ paper, onDone }: { paper: ExamPaper; onDone: (r: ExamResult | null) => void }) {
  const { t } = useI18n();
  const { colours } = useTheme();
  const { userStorage } = useAuth();
  const sid = paper.sessionId;
  const [answers, setAnswers] = useState<ExamSaveState>(() =>
    mergeServerAnswers(null, paper.answers),
  );
  const state = useRef(answers);
  const inflight = useRef(new Set<string>());
  const [net, setNet] = useState<SyncStatus>('idle');
  const [late, setLate] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [handing, setHanding] = useState(false);
  const handed = useRef(false);
  // Server minus device time, measured on start (the timer never trusts the device clock alone).
  const [offset] = useState(() => {
    const now = Date.now();
    return clockOffset(paper.serverNow, now, now);
  });
  const [now, setNow] = useState(() => Date.now());
  const left = remainingMs(paper.deadlineAt, offset, now);

  const commit = useCallback(
    (next: ExamSaveState) => {
      state.current = next;
      setAnswers(next);
      void writeCache(userStorage, storeKey(sid), next);
    },
    [sid, userStorage],
  );

  // Answers from this device that never reached the server win over the server copy.
  useEffect(() => {
    let live = true;
    void readCache<ExamSaveState>(userStorage, storeKey(sid)).then((local) => {
      if (!live || !local) return;
      commit(mergeServerAnswers(local, paper.answers));
      flushRef.current();
    });
    return () => {
      live = false;
    };
  }, [sid, userStorage, paper.answers, commit]);

  const flushRef = useRef<() => void>(() => undefined);
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flush = useCallback(() => {
    const todo = unsaved(state.current).filter((q) => !inflight.current.has(q));
    if (!todo.length) {
      if (!inflight.current.size) setNet((s) => (s === 'syncing' || s === 'offline' ? 'saved' : s));
      return;
    }
    setNet('syncing');
    for (const q of todo) {
      const slot = state.current[q]!;
      inflight.current.add(q);
      void saveExamAnswer(sid, q, slot.value, slot.at).then((r) => {
        inflight.current.delete(q);
        if (r === 'saved') commit(markSaved(state.current, q, slot.value, slot.at));
        if (r === 'late') {
          setLate(true);
          commit(markSaved(state.current, q, slot.value, slot.at));
        }
        if (r === 'retry') {
          setNet('offline');
          if (!retry.current)
            retry.current = setTimeout(() => {
              retry.current = null;
              flushRef.current();
            }, RETRY_MS);
          return;
        }
        flushRef.current(); // a newer tap may be waiting for this question
      });
    }
  }, [sid, commit]);
  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);
  useEffect(
    () => () => {
      if (retry.current) clearTimeout(retry.current);
    },
    [],
  );

  const answer = (q: string, v: ExamValue) => {
    if (handed.current) return;
    commit(setAnswer(state.current, q, v, Date.now()));
    flush();
  };

  const handIn = useCallback(async () => {
    if (handed.current) return;
    handed.current = true;
    setHanding(true);
    // Send what's left first; offline, keep trying (answers stay on this device).
    for (let i = 0; i < 40 && unsaved(state.current).length; i++) {
      flushRef.current();
      await new Promise((r) => setTimeout(r, 750));
    }
    for (;;) {
      const r = await submitExam(sid);
      if (r.ok) {
        void userStorage?.removeItem(storeKey(sid)).catch(() => undefined);
        return onDone(r.data);
      }
      if (r.error !== 'network') return onDone(null);
      setNet('offline');
      await new Promise((res) => setTimeout(res, RETRY_MS));
    }
  }, [sid, userStorage, onDone]);

  // The clock: a tick a second; at zero the paper hands itself in.
  useEffect(() => {
    const h = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(h);
  }, []);
  useEffect(() => {
    if (left <= 0 && !handed.current) void handIn();
  }, [left, handIn]);

  // Integrity signals (logged for the teacher, never blocking) + reconnect.
  useEffect(() => {
    const log = (k: ExamEventKind) => !handed.current && void logExamEvent(sid, k);
    if (web) {
      const onVis = () => document.visibilityState === 'hidden' && log('hidden');
      const onBlur = () => log('blur');
      const onFs = () => !document.fullscreenElement && log('fullscreen_exit');
      const onOnline = () => {
        log('reconnect');
        flushRef.current();
      };
      document.addEventListener('visibilitychange', onVis);
      window.addEventListener('blur', onBlur);
      document.addEventListener('fullscreenchange', onFs);
      window.addEventListener('online', onOnline);
      return () => {
        document.removeEventListener('visibilitychange', onVis);
        window.removeEventListener('blur', onBlur);
        document.removeEventListener('fullscreenchange', onFs);
        window.removeEventListener('online', onOnline);
      };
    }
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background') log('hidden');
      if (s === 'active') flushRef.current();
    });
    return () => sub.remove();
  }, [sid]);

  const questions: AttemptQuestion[] = paper.questions.map((q) => ({
    id: q.id,
    type: q.type,
    body: q.body,
    marks: q.marks,
  }));
  const done = answeredIn(answers);
  const blank = questions.length - done;
  const pending = unsaved(answers).length;
  const warn = left <= EXAM_WARN_MS;

  const bar = (
    <View
      style={[styles.bar, { backgroundColor: colours.surface, borderTopColor: colours.border }]}
    >
      <View
        style={[styles.clock, { backgroundColor: warn ? colours.accentSoft : colours.surfaceAlt }]}
        accessible
        accessibilityRole="timer"
        accessibilityLabel={t('student.exam.timeLeftA11y', { time: formatClock(left) })}
      >
        <Icon name="clock" size={18} tone={warn ? 'onAccentSoft' : 'textMuted'} />
        <Text variant="label" tone={warn ? 'onAccentSoft' : undefined} style={styles.mono}>
          {formatClock(left)}
        </Text>
      </View>
      <SyncStatusPill status={net} pending={pending} onRetry={flush} />
      <Text variant="bodySm" tone="textMuted" style={styles.flex} numberOfLines={1}>
        {t('student.exam.answered', { answered: done, count: questions.length })}
      </Text>
      <Button
        title={t('student.exam.handIn')}
        icon="check"
        size="sm"
        loading={handing}
        disabled={handing}
        onPress={() => (blank > 0 && !confirm ? setConfirm(true) : void handIn())}
      />
    </View>
  );

  return (
    <Screen header={<StudentHeader title={paper.title} />} footer={bar}>
      <View style={styles.list}>
        {late ? (
          <Badge label={t('student.exam.late')} tone="wrong" icon="warning" style={styles.start} />
        ) : null}
        {confirm && !handing ? (
          <Card>
            <View style={styles.confirm}>
              <Text>{t('student.exam.blankWarn', { count: blank })}</Text>
              <View style={styles.row}>
                <Button
                  title={t('student.exam.keepGoing')}
                  variant="ghost"
                  onPress={() => setConfirm(false)}
                />
                <Button title={t('student.exam.handInAnyway')} onPress={() => void handIn()} />
              </View>
            </View>
          </Card>
        ) : null}
        {handing ? (
          <Text tone="textMuted">
            {pending
              ? t('student.exam.sendingLeft', { count: pending })
              : t('student.exam.handing')}
          </Text>
        ) : null}
        {questions.map((q, i) => (
          <View key={q.id}>
            <QuestionCard
              index={i}
              question={q}
              value={answers[q.id]?.value ?? undefined}
              onChange={(v) => answer(q.id, v === undefined ? null : v)}
              disabled={handing}
              relabel
            />
          </View>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { gap: space.md, alignItems: 'flex-start' },
  list: { gap: space.md },
  start: { alignSelf: 'flex-start' },
  flex: { flex: 1 },
  row: { flexDirection: 'row', gap: space.sm, justifyContent: 'flex-end', flexWrap: 'wrap' },
  confirm: { gap: space.md },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderTopWidth: 1,
  },
  clock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: 12,
  },
  mono: { fontVariant: ['tabular-nums'] },
  score: {
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: 16,
    borderWidth: 2,
  },
});
