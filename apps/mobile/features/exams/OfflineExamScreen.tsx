// An offline exam on the student's device (prompt 60, db/038, LMS_AUDIT §3.3):
//   download (online, inside the window) → the paper without answers is kept here
//   Start (no internet needed) → the device clock runs (it keeps running if the
//     app is closed) → answers are kept on this device after every tap
//   time up / Hand in → one upload, retried until the server answers → result
// The server accepts it if it arrives before the window closes and the time
// used fits the duration; otherwise it is kept and the teacher decides. Lower
// integrity, said plainly (monitoring, never lockdown). Exam mode: nothing moves
// but the timer and the save indicator.
import {
  EXAM_WARN_MS,
  formatClock,
  offlineRemainingMs,
  offlineStage,
  startClock,
  uuidv4,
  type AttemptQuestion,
  type ExamValue,
} from '@school/core';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, StyleSheet, View } from 'react-native';

import { useI18n } from '../../i18n';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ExamMode,
  Icon,
  Screen,
  SkeletonLines,
  Text,
  useTheme,
} from '../../ui';
import { space } from '../../ui/tokens';
import { StudentHeader } from '../attempts/Header';
import { QuestionCard } from '../attempts/QuestionCard';
import { useAuth } from '../auth/AuthProvider';
import { useHoldMessageToasts } from '../messages/MessagesProvider';
import {
  clockNow,
  downloadOffline,
  monoNow,
  readOffline,
  RUN_ID,
  uploadOffline,
  writeOffline,
  type DownloadError,
  type OfflineExamCopy,
} from './offline';

const SAVE_EVERY_MS = 5000;
const RETRY_MS = 5000;
const web = Platform.OS === 'web' && typeof window !== 'undefined';

function useDate() {
  const { locale } = useI18n();
  return (iso: string) =>
    new Date(iso).toLocaleString(locale === 'ur' ? 'ur-PK' : 'en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
      numberingSystem: 'latn',
    });
}

export function OfflineExamScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useI18n();
  const router = useRouter();
  const date = useDate();
  const { queueStorage } = useAuth();
  const [copy, setCopy] = useState<OfflineExamCopy | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<DownloadError | null>(null);
  const [openedAt] = useState(() => Date.now());

  useEffect(() => {
    let live = true;
    void readOffline(queueStorage, id).then((c) => live && setCopy(c));
    return () => {
      live = false;
    };
  }, [id, queueStorage]);

  const save = useCallback(
    (next: OfflineExamCopy) => {
      setCopy(next);
      void writeOffline(queueStorage, next);
    },
    [queueStorage],
  );

  const download = async () => {
    setBusy(true);
    setErr(null);
    const r = await downloadOffline(queueStorage, id);
    setBusy(false);
    if (r.ok) setCopy(r.copy);
    else setErr(r.error);
  };

  const stage = copy
    ? offlineStage({
        clock: copy.clock,
        durationMs: copy.durationMs,
        closesAt: Date.parse(copy.closesAt),
        now: openedAt,
        sent: !!copy.result,
      })
    : null;
  useHoldMessageToasts(stage === 'taking');

  const back = (
    <Button
      title={t('student.exam.backToTests')}
      icon="back"
      variant="secondary"
      onPress={() => router.replace('/tests')}
    />
  );
  const header = <StudentHeader title={copy?.title || t('student.offlineExam.title')} />;

  if (copy && stage === 'taking')
    return (
      <ExamMode>
        <Taking copy={copy} save={save} />
      </ExamMode>
    );

  let body: React.ReactNode;
  if (copy === undefined) body = <SkeletonLines lines={4} />;
  else if (!copy)
    body = (
      <Card>
        <View style={styles.intro}>
          <Icon name="cloud" size={32} />
          <Text variant="heading" accessibilityRole="header">
            {t('student.offlineExam.downloadTitle')}
          </Text>
          <Text tone="textMuted">{t('student.offlineExam.downloadBody')}</Text>
          {err ? (
            <Text tone="wrong" accessibilityLiveRegion="polite">
              {t(`student.offlineExam.errors.${err}`)}
            </Text>
          ) : null}
          <Button
            title={t('student.offlineExam.download')}
            icon="arrowDown"
            loading={busy}
            onPress={download}
          />
        </View>
      </Card>
    );
  else if (stage === 'ready')
    body = (
      <Card>
        <View style={styles.intro}>
          <Badge label={t('student.offlineExam.saved')} tone="correct" icon="checkCircle" />
          <Text variant="heading" accessibilityRole="header">
            {t('student.offlineExam.readyTitle', {
              count: Math.round(copy.durationMs / 60000),
            })}
          </Text>
          <Text tone="textMuted">
            {t('student.offlineExam.readyBody', { date: date(copy.closesAt) })}
          </Text>
          <Text variant="bodySm" tone="textMuted">
            {t('student.offlineExam.honest')}
          </Text>
          <Button
            title={t('student.offlineExam.start')}
            icon="pencil"
            onPress={() =>
              save({ ...copy, clock: startClock(Date.now(), monoNow(), RUN_ID), hidden: 0 })
            }
          />
        </View>
      </Card>
    );
  else if (stage === 'expired')
    body = (
      <EmptyState
        icon="clock"
        title={t('student.offlineExam.expiredTitle')}
        body={t('student.offlineExam.expiredBody')}
        action={back}
      />
    );
  else body = <Sending copy={copy} save={save} back={back} />;

  return (
    <ExamMode>
      <Screen header={header}>{body}</Screen>
    </ExamMode>
  );
}

/** Finished: send it (retrying while offline), then the result. */
function Sending({
  copy,
  save,
  back,
}: {
  copy: OfflineExamCopy;
  save: (c: OfflineExamCopy) => void;
  back: React.ReactNode;
}) {
  const { t } = useI18n();
  const { colours } = useTheme();
  const [waiting, setWaiting] = useState(false);
  const [refused, setRefused] = useState(false);
  const sending = useRef(false);
  const latest = useRef(copy);
  useEffect(() => {
    latest.current = copy;
  }, [copy]);

  const send = useCallback(async () => {
    const c = latest.current;
    if (sending.current || c.result) return;
    sending.current = true;
    // Finished on this device: stop the clock and fix the upload id first.
    let ready = c;
    if (!ready.clock?.stoppedAt || !ready.uploadId) {
      ready = { ...clockNow(ready, true), uploadId: ready.uploadId ?? uuidv4() };
      save(ready);
    }
    const r = await uploadOffline(ready);
    sending.current = false;
    if (r === 'retry') return setWaiting(true);
    if (r === 'refused') return setRefused(true);
    setWaiting(false);
    save({ ...ready, result: r });
  }, [save]);

  useEffect(() => {
    void send();
    const h = setInterval(() => void send(), RETRY_MS);
    const onOnline = () => void send();
    if (web) window.addEventListener('online', onOnline);
    return () => {
      clearInterval(h);
      if (web) window.removeEventListener('online', onOnline);
    };
  }, [send]);

  const r = copy.result;
  if (!r)
    return (
      <Card>
        <View style={styles.intro}>
          <Icon name={waiting ? 'cloudOff' : 'syncing'} size={32} />
          <Text variant="heading" accessibilityRole="header">
            {t(waiting ? 'student.offlineExam.waitingTitle' : 'student.offlineExam.sendingTitle')}
          </Text>
          <Text tone="textMuted" accessibilityLiveRegion="polite">
            {t(
              refused
                ? 'student.offlineExam.refused'
                : waiting
                  ? 'student.offlineExam.waitingBody'
                  : 'student.offlineExam.sendingBody',
            )}
          </Text>
          {waiting ? (
            <Button
              title={t('student.exam.retry')}
              variant="secondary"
              icon="replay"
              onPress={() => void send()}
            />
          ) : null}
          {back}
        </View>
      </Card>
    );

  const flagged = r.verdict !== 'accepted';
  return (
    <Card>
      <View style={styles.intro}>
        <Icon
          name={flagged ? 'info' : 'checkCircle'}
          tone={flagged ? 'textMuted' : 'correct'}
          size={36}
        />
        <Text variant="heading" accessibilityRole="header">
          {t(flagged ? `student.offlineExam.verdict.${r.verdict}` : 'student.exam.doneTitle')}
        </Text>
        {!flagged && r.score != null && r.total ? (
          <View
            style={[styles.score, { borderColor: colours.ink, backgroundColor: colours.surface }]}
            accessible
            accessibilityLabel={t('student.exam.scoreA11y', { score: r.score, total: r.total })}
          >
            <Text variant="title">
              {r.score} / {r.total}
            </Text>
          </View>
        ) : null}
        {flagged ? <Text tone="textMuted">{t('student.offlineExam.flaggedBody')}</Text> : null}
        {!flagged && r.toMark > 0 ? (
          <Text tone="textMuted">{t('student.exam.toMark', { count: r.toMark })}</Text>
        ) : null}
        {r.questions > 0 ? (
          <Text variant="bodySm" tone="textMuted">
            {t('student.exam.answeredOf', { answered: r.answered, count: r.questions })}
          </Text>
        ) : null}
        {back}
      </View>
    </Card>
  );
}

/** Stop the clock and fix the upload id: the paper is finished on this device. */
function finished(c: OfflineExamCopy): OfflineExamCopy {
  const s = clockNow(c, true);
  return { ...s, uploadId: s.uploadId ?? uuidv4() };
}

function Taking({ copy, save }: { copy: OfflineExamCopy; save: (c: OfflineExamCopy) => void }) {
  const { t } = useI18n();
  const { colours } = useTheme();
  // Resumes with the time away after a restart (clockNow counts the wall gap).
  const [cur, setCur] = useState(() => clockNow(copy));
  const [confirm, setConfirm] = useState(false);
  const lastSave = useRef(0);
  const force = useRef(true);
  const latest = useRef(cur);

  // Keep the device copy current: at once after a tap, a stop or leaving the
  // app; otherwise every few seconds (the clock).
  useEffect(() => {
    latest.current = cur;
    const now = Date.now();
    if (force.current || cur.clock?.stoppedAt || now - lastSave.current >= SAVE_EVERY_MS) {
      force.current = false;
      lastSave.current = now;
      save(cur);
    }
  }, [cur, save]);
  useEffect(() => () => save(clockNow(latest.current)), [save]);

  // The clock: a tick a second; time up (or the window closing) hands it in.
  useEffect(() => {
    const h = setInterval(
      () =>
        setCur((c) => {
          const n = clockNow(c);
          const over =
            (n.clock && offlineRemainingMs(n.clock, n.durationMs) <= 0) ||
            Date.now() > Date.parse(n.closesAt);
          return over ? finished(n) : n;
        }),
      1000,
    );
    return () => clearInterval(h);
  }, []);

  // Leaving the app is counted for the teacher (monitoring, never blocking).
  useEffect(() => {
    const left = () => {
      force.current = true;
      setCur((c) => ({ ...c, hidden: (c.hidden ?? 0) + 1 }));
    };
    if (web && typeof document !== 'undefined') {
      const onVis = () => document.visibilityState === 'hidden' && left();
      document.addEventListener('visibilitychange', onVis);
      return () => document.removeEventListener('visibilitychange', onVis);
    }
    const sub = AppState.addEventListener('change', (s) => s === 'background' && left());
    return () => sub.remove();
  }, []);

  const finish = () => setCur((c) => finished(c));
  const answer = (q: string, v: ExamValue) => {
    force.current = true;
    setCur((c) => ({ ...c, answers: { ...c.answers, [q]: v } }));
  };

  const left = cur.clock ? offlineRemainingMs(cur.clock, cur.durationMs) : 0;
  const questions: AttemptQuestion[] = cur.questions.map((q) => ({
    id: q.id,
    type: q.type,
    body: q.body,
    marks: q.marks,
  }));
  const done = questions.filter((q) => {
    const v = cur.answers[q.id];
    return v !== undefined && v !== null && v !== '';
  }).length;
  const blank = questions.length - done;
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
      <Badge label={t('student.offlineExam.onDevice')} tone="neutral" icon="checkCircle" />
      <Text variant="bodySm" tone="textMuted" style={styles.flex} numberOfLines={1}>
        {t('student.exam.answered', { answered: done, count: questions.length })}
      </Text>
      <Button
        title={t('student.exam.handIn')}
        icon="check"
        size="sm"
        onPress={() => (blank > 0 && !confirm ? setConfirm(true) : finish())}
      />
    </View>
  );

  return (
    <Screen header={<StudentHeader title={cur.title} />} footer={bar}>
      <View style={styles.list}>
        <Text variant="bodySm" tone="textMuted">
          {t('student.offlineExam.takingNote')}
        </Text>
        {confirm ? (
          <Card>
            <View style={styles.confirm}>
              <Text>{t('student.exam.blankWarn', { count: blank })}</Text>
              <View style={styles.row}>
                <Button
                  title={t('student.exam.keepGoing')}
                  variant="ghost"
                  onPress={() => setConfirm(false)}
                />
                <Button title={t('student.exam.handInAnyway')} onPress={finish} />
              </View>
            </View>
          </Card>
        ) : null}
        {questions.map((q, i) => (
          <View key={q.id}>
            <QuestionCard
              index={i}
              question={q}
              value={cur.answers[q.id] ?? undefined}
              onChange={(v) => answer(q.id, v === undefined ? null : v)}
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
