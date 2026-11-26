// Teacher's live exam (prompt 51): who has joined, who is writing or has gone
// quiet, how far each student is, integrity flags (monitoring only: there is no
// lockdown), and who has handed in. Then results: score spread, item analysis,
// void a paper with a reason, and confirm, which is the only way exam scores
// reach grades (record_grade, 'Exam result', audited) and opens exam follow-ups.
import {
  average,
  formatClock,
  liveCounts,
  liveStatus,
  remainingMs,
  type LiveStatus,
} from '@school/core';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useI18n, type TKey } from '../../i18n';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Meter,
  SegmentedControl,
  Sheet,
  SkeletonLines,
  Text,
  TextField,
  useTheme,
  useToast,
  type BadgeTone,
  type IconName,
} from '../../ui';
import { space } from '../../ui/tokens';
import { ERROR_KEYS } from '../scope/LoadState';
import { endExam } from '../exams/api';
import { JoinCode } from '../exams/LivePanel';
import { acceptOfflineUpload, confirmExam, voidSession, type LiveStudent } from './api';
import { ResultsView } from './ResultsView';
import { useLiveExam } from './useLiveExam';

const STATUS_LOOK: Record<LiveStatus, { tone: BadgeTone; icon: IconName }> = {
  notJoined: { tone: 'neutral', icon: 'user' },
  writing: { tone: 'primary', icon: 'pencil' },
  idle: { tone: 'weak', icon: 'clock' },
  handedIn: { tone: 'correct', icon: 'checkCircle' },
  void: { tone: 'wrong', icon: 'close' },
};
const STATUS_ORDER: LiveStatus[] = ['writing', 'idle', 'notJoined', 'handedIn', 'void'];

function TimeLeft({ closesAt, offset }: { closesAt: string; offset: number }) {
  const { t } = useI18n();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const left = remainingMs(closesAt, offset, now);
  return (
    <Badge
      label={
        left > 0
          ? t('staff.examLive.timeLeft', { time: formatClock(left) })
          : t('staff.examLive.timeUp')
      }
      tone={left > 0 ? 'accent' : 'neutral'}
      icon="timer"
    />
  );
}

function StudentRow({
  s,
  status,
  questions,
  canVoid,
  onVoid,
  onAccept,
}: {
  s: LiveStudent;
  status: LiveStatus;
  questions: number;
  canVoid: boolean;
  onVoid: (s: LiveStudent) => void;
  onAccept: (s: LiveStudent) => void;
}) {
  const { t } = useI18n();
  const { colours } = useTheme();
  const look = STATUS_LOOK[status];
  const detail: string[] = [];
  if (s.code) detail.push(s.code);
  if (status === 'handedIn' && s.score != null) {
    detail.push(t('staff.examLive.score', { score: s.score, total: s.total ?? 0 }));
  }
  if (s.late) detail.push(t('staff.examLive.late', { count: s.late }));
  const off = s.offline;
  if (off?.elapsedMs != null)
    detail.push(t('staff.examLive.offline.took', { count: Math.round(off.elapsedMs / 60000) }));
  if (off?.hidden) detail.push(t('staff.examLive.offline.hidden', { count: off.hidden }));
  if (off?.clockBack) detail.push(t('staff.examLive.offline.clockBack'));
  const flagged = !!off?.verdict && off.verdict !== 'accepted' && !off.acceptedAt;
  return (
    <View style={[styles.student, { borderTopColor: colours.border }]}>
      <View style={styles.flex}>
        <Text variant="label" numberOfLines={1}>
          {s.name}
        </Text>
        {detail.length ? (
          <Text variant="bodySm" tone="textMuted" numberOfLines={1}>
            {detail.join(' · ')}
          </Text>
        ) : null}
        {status === 'void' && s.voidReason ? (
          <Text variant="bodySm" tone="textMuted" numberOfLines={2}>
            {t('staff.examLive.voidedBecause', { reason: s.voidReason })}
          </Text>
        ) : null}
      </View>
      {s.sessionId && status !== 'void' ? (
        <View style={styles.progress}>
          <Meter
            value={questions ? s.answered / questions : 0}
            height={8}
            tone={status === 'idle' ? 'weak' : 'primary'}
          />
          <Text variant="caption" tone="textMuted">
            {t('staff.examLive.answered', { answered: s.answered, count: questions })}
          </Text>
        </View>
      ) : null}
      {off ? (
        <Badge label={t('staff.examLive.offline.badge')} tone="neutral" icon="cloudOff" />
      ) : null}
      {flagged ? (
        <Badge
          label={t(`staff.examLive.offline.verdict.${off!.verdict!}`)}
          tone="weak"
          icon="warning"
        />
      ) : off?.acceptedAt ? (
        <Badge label={t('staff.examLive.offline.acceptedLate')} tone="neutral" icon="check" />
      ) : null}
      {s.flags ? (
        <Badge label={t('staff.examLive.flags', { count: s.flags })} tone="learning" icon="flag" />
      ) : null}
      <Badge label={t(`staff.examLive.status.${status}`)} tone={look.tone} icon={look.icon} />
      {flagged && canVoid && off?.uploadId && status !== 'void' ? (
        <Button
          title={t('staff.examLive.offline.accept')}
          size="sm"
          variant="secondary"
          onPress={() => onAccept(s)}
        />
      ) : null}
      {canVoid && s.sessionId && status !== 'void' ? (
        <Button
          title={t('staff.examLive.void')}
          size="sm"
          variant="ghost"
          onPress={() => onVoid(s)}
        />
      ) : null}
    </View>
  );
}

type Tab = 'live' | 'results';

export function LiveExamScreen({ assessmentId }: { assessmentId: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const ex = useLiveExam(assessmentId);
  const { live, analysis, offset, running } = ex;
  const [tab, setTab] = useState<Tab | null>(null);
  const offlineOpen = live?.mode === 'offline_exam' && live.status === 'published';
  const shown: Tab = tab ?? (running || offlineOpen ? 'live' : 'results');

  const [voiding, setVoiding] = useState<LiveStudent | null>(null);
  const [accepting, setAccepting] = useState<LiveStudent | null>(null);
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [ending, setEnding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Statuses are read at the server time of the last fetch (a poll runs while live).
  const serverNow = live ? Date.parse(live.serverNow) : 0;
  const rows = useMemo(() => {
    const list = (live?.students ?? []).map((s) => ({ s, status: liveStatus(s, serverNow) }));
    return list.sort(
      (a, b) =>
        STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) ||
        a.s.name.localeCompare(b.s.name),
    );
  }, [live, serverNow]);
  const counts = useMemo(() => liveCounts(live?.students ?? [], serverNow), [live, serverNow]);

  const back = (
    <Button
      title={t('staff.back')}
      icon="back"
      variant="ghost"
      size="sm"
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/assessments'))}
      style={styles.start}
    />
  );

  if (!live) {
    return (
      <>
        {back}
        {ex.loading ? <SkeletonLines lines={4} /> : null}
        {ex.notReady ? (
          <EmptyState
            icon="clock"
            title={t('staff.examLive.notReady')}
            body={t('staff.examLive.notReadyBody')}
          />
        ) : null}
        {ex.error ? (
          <EmptyState
            icon="warning"
            title={t('staff.examLive.loadError')}
            body={t(ERROR_KEYS[ex.error])}
            action={<Button title={t('staff.retry')} onPress={() => void ex.reload()} />}
          />
        ) : null}
      </>
    );
  }

  const confirmed = !!live.confirmedAt;
  const handedIn = counts.handedIn;
  // Papers still open. One past its deadline counts as in: exam_confirm closes
  // it first (the sweep may not have run, e.g. without pg_cron).
  const stillOpen = rows.filter(
    ({ s, status }) =>
      (status === 'writing' || status === 'idle') &&
      !(s.deadlineAt && Date.parse(s.deadlineAt) <= serverNow),
  ).length;

  const doVoid = async () => {
    if (!voiding?.sessionId) return;
    if (!reason.trim()) return setErr(t('staff.examLive.errors.reasonRequired'));
    setBusy(true);
    const r = await voidSession(voiding.sessionId, reason.trim());
    setBusy(false);
    if (!r.ok) return setErr(t(`staff.examLive.errors.${r.error}`));
    toast(t('staff.examLive.voided', { name: voiding.name }), 'success');
    setVoiding(null);
    void ex.reload();
  };
  const doAccept = async () => {
    const id = accepting?.offline?.uploadId;
    if (!accepting || !id) return;
    if (!reason.trim()) return setErr(t('staff.examLive.errors.reasonRequired'));
    setBusy(true);
    const r = await acceptOfflineUpload(id, reason.trim());
    setBusy(false);
    if (!r.ok) return setErr(t(`staff.examLive.errors.${r.error}`));
    toast(t('staff.examLive.offline.accepted', { name: accepting.name }), 'success');
    setAccepting(null);
    void ex.reload();
  };
  const doConfirm = async () => {
    setBusy(true);
    const r = await confirmExam(assessmentId);
    setBusy(false);
    if (!r.ok) return setErr(t(`staff.examLive.errors.${r.error}`));
    toast(
      t('staff.examLive.confirmed', { count: r.data.graded, followUps: r.data.followUps }),
      'success',
    );
    setConfirming(false);
    void ex.reload();
  };
  const doEnd = async () => {
    setBusy(true);
    const r = await endExam(assessmentId);
    setBusy(false);
    if (!r.ok) return setErr(t(ERROR_KEYS[r.error]));
    toast(t('staff.quick.ended', { count: r.data }), 'success');
    setEnding(false);
    setTab('results');
    void ex.reload();
  };

  const scores = rows
    .filter((r) => r.status === 'handedIn' && r.s.score != null)
    .map((r) => r.s.score!);

  return (
    <>
      {back}
      <View style={styles.head}>
        <View style={styles.flex}>
          <Text variant="title" accessibilityRole="header">
            {live.title}
          </Text>
          <Text tone="textMuted">
            {t('staff.examLive.subtitle', { count: live.questions, marks: live.totalMarks })}
          </Text>
        </View>
        {running ? (
          <Badge label={t('staff.quick.liveNow')} tone="accent" icon="clock" />
        ) : offlineOpen ? (
          <Badge label={t('staff.examLive.offline.open')} tone="accent" icon="cloudOff" />
        ) : confirmed ? (
          <Badge label={t('staff.examLive.confirmedBadge')} tone="correct" icon="checkCircle" />
        ) : live.status === 'closed' ? (
          <Badge label={t('staff.examLive.ended')} tone="neutral" />
        ) : null}
      </View>

      {running ? (
        <Card>
          <View style={styles.runRow}>
            <JoinCode code={live.joinCode!} />
            <View style={styles.runSide}>
              {live.closesAt ? <TimeLeft closesAt={live.closesAt} offset={offset} /> : null}
              <Button
                title={t('staff.quick.end')}
                variant="danger"
                size="sm"
                onPress={() => {
                  setErr(null);
                  setEnding(true);
                }}
              />
            </View>
          </View>
        </Card>
      ) : null}

      <View style={styles.counts} accessibilityRole="summary">
        {STATUS_ORDER.map((k) =>
          counts[k] || k === 'handedIn' ? (
            <Badge
              key={k}
              label={t(`staff.examLive.counts.${k}` as TKey, { count: counts[k] })}
              tone={STATUS_LOOK[k].tone}
              icon={STATUS_LOOK[k].icon}
            />
          ) : null,
        )}
      </View>

      <SegmentedControl
        segments={[
          { value: 'live', label: t('staff.examLive.tabs.live') },
          { value: 'results', label: t('staff.examLive.tabs.results') },
        ]}
        value={shown}
        onChange={setTab}
        accessibilityLabel={t('staff.examLive.tabs.label')}
      />

      {shown === 'live' ? (
        <Card>
          {rows.length === 0 ? (
            <EmptyState
              icon="users"
              title={t('staff.examLive.noStudents')}
              body={t('staff.examLive.noStudentsBody')}
            />
          ) : (
            <>
              {!running && !confirmed ? (
                <Text variant="bodySm" tone="textMuted">
                  {t('staff.examLive.voidHint')}
                </Text>
              ) : null}
              {rows.map(({ s, status }) => (
                <StudentRow
                  key={s.enrollmentId}
                  s={s}
                  status={status}
                  questions={live.questions}
                  canVoid={!confirmed}
                  onVoid={(x) => {
                    setVoiding(x);
                    setReason('');
                    setErr(null);
                  }}
                  onAccept={(x) => {
                    setAccepting(x);
                    setReason('');
                    setErr(null);
                  }}
                />
              ))}
            </>
          )}
        </Card>
      ) : (
        <ResultsView
          analysis={analysis}
          scores={scores}
          totalMarks={live.totalMarks}
          average={average(scores)}
          confirmed={confirmed}
          confirmedAt={live.confirmedAt}
          canConfirm={!confirmed && handedIn > 0}
          stillOpen={stillOpen}
          onConfirm={() => {
            setErr(null);
            setConfirming(true);
          }}
        />
      )}

      <Sheet
        visible={!!accepting}
        onClose={() => setAccepting(null)}
        title={accepting ? t('staff.examLive.offline.acceptTitle', { name: accepting.name }) : ''}
        footer={
          <View style={styles.sheetActions}>
            <Button
              title={t('staff.stuck.cancel')}
              variant="ghost"
              onPress={() => setAccepting(null)}
            />
            <Button title={t('staff.examLive.offline.accept')} loading={busy} onPress={doAccept} />
          </View>
        }
      >
        <Text tone="textMuted">{t('staff.examLive.offline.acceptBody')}</Text>
        <TextField
          label={t('staff.examLive.reason')}
          value={reason}
          onChangeText={(v) => {
            setReason(v);
            setErr(null);
          }}
          error={err ?? undefined}
          multiline
          onSubmitEditing={doAccept}
        />
      </Sheet>

      <Sheet
        visible={!!voiding}
        onClose={() => setVoiding(null)}
        title={voiding ? t('staff.examLive.voidTitle', { name: voiding.name }) : ''}
        footer={
          <View style={styles.sheetActions}>
            <Button
              title={t('staff.stuck.cancel')}
              variant="ghost"
              onPress={() => setVoiding(null)}
            />
            <Button
              title={t('staff.examLive.void')}
              variant="danger"
              loading={busy}
              onPress={doVoid}
            />
          </View>
        }
      >
        <Text tone="textMuted">{t('staff.examLive.voidBody')}</Text>
        <TextField
          label={t('staff.examLive.reason')}
          value={reason}
          onChangeText={(v) => {
            setReason(v);
            setErr(null);
          }}
          error={err ?? undefined}
          multiline
          onSubmitEditing={doVoid}
        />
      </Sheet>

      <Sheet
        visible={confirming}
        onClose={() => setConfirming(false)}
        title={t('staff.examLive.confirmTitle')}
        footer={
          <View style={styles.sheetActions}>
            <Button
              title={t('staff.stuck.cancel')}
              variant="ghost"
              onPress={() => setConfirming(false)}
            />
            <Button
              title={t('staff.examLive.confirm')}
              icon="checkCircle"
              loading={busy}
              onPress={doConfirm}
            />
          </View>
        }
      >
        <Text>{t('staff.examLive.confirmBody', { count: handedIn })}</Text>
        <Text tone="textMuted">{t('staff.examLive.confirmFollowUps')}</Text>
        {counts.void ? (
          <Text tone="textMuted">{t('staff.examLive.confirmVoid', { count: counts.void })}</Text>
        ) : null}
        {err ? <Text tone="wrong">{err}</Text> : null}
      </Sheet>

      <Sheet
        visible={ending}
        onClose={() => setEnding(false)}
        title={t('staff.examLive.endTitle')}
        footer={
          <View style={styles.sheetActions}>
            <Button
              title={t('staff.stuck.cancel')}
              variant="ghost"
              onPress={() => setEnding(false)}
            />
            <Button title={t('staff.quick.end')} variant="danger" loading={busy} onPress={doEnd} />
          </View>
        }
      >
        <Text>{t('staff.examLive.endBody', { count: stillOpen })}</Text>
        {err ? <Text tone="wrong">{err}</Text> : null}
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 160 },
  start: { alignSelf: 'flex-start' },
  head: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.md },
  runRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.lg },
  runSide: { gap: space.sm, alignItems: 'flex-start' },
  counts: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  student: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
    borderTopWidth: 1,
  },
  progress: { width: 120, gap: 2 },
  sheetActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.sm },
});
