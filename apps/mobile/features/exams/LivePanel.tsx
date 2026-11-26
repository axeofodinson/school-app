// "Run it live" on the builder (prompt 50): start the assessment as a live exam
// now (the server publishes it, sets the clock and issues a join code), show the
// code big enough to read out, who has started and handed in, and end it.
import type { AssessmentStatus } from '@school/core';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useI18n } from '../../i18n';
import {
  Badge,
  Button,
  Card,
  SegmentedControl,
  Text,
  TextField,
  useTheme,
  useToast,
} from '../../ui';
import { space } from '../../ui/tokens';
import { useResult } from '../scope/useResult';
import { endExam, launchExam, loadLiveState, scheduleOfflineExam } from './api';

const OFFLINE_DAYS = ['1', '3', '7'] as const;
type OfflineDays = (typeof OFFLINE_DAYS)[number];

export function JoinCode({ code }: { code: string }) {
  const { t } = useI18n();
  const { colours } = useTheme();
  return (
    <View
      style={[styles.code, { borderColor: colours.ink, backgroundColor: colours.surface }]}
      accessible
      accessibilityLabel={t('staff.quick.codeA11y', { code: code.split('').join(' ') })}
    >
      <Text variant="caption" tone="textMuted">
        {t('staff.quick.joinCode')}
      </Text>
      <Text variant="display" style={styles.codeText} selectable>
        {code}
      </Text>
    </View>
  );
}

export function LivePanel({
  assessmentId,
  status,
  onChanged,
}: {
  assessmentId: string;
  status: AssessmentStatus;
  onChanged: () => void;
}) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [days, setDays] = useState<OfflineDays>('3');
  const res = useResult(`live:${assessmentId}:${status}`, () => loadLiveState(assessmentId));
  const [minutes, setMinutes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const live =
    res.state?.status === 'ready' && res.state.data !== 'notReady' ? res.state.data : null;
  if (!live) return null;
  const openLive = () => router.push(`/exams/${assessmentId}`);
  if (status === 'closed') {
    // A finished exam: results, item analysis and confirm live on the exam screen.
    if (live.mode === 'standard' || !live.started) return null;
    return (
      <Card>
        <View style={styles.row}>
          <Text variant="heading" style={styles.flex}>
            {t('staff.quick.liveTitle')}
          </Text>
          <Button title={t('staff.examLive.openResults')} icon="chart" onPress={openLive} />
        </View>
      </Card>
    );
  }
  const running = live.mode === 'live_exam' && status === 'published' && !!live.joinCode;
  const offlineOpen = live.mode === 'offline_exam' && status === 'published';
  const until = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString(locale === 'ur' ? 'ur-PK' : 'en-GB', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          hour: 'numeric',
          minute: '2-digit',
          numberingSystem: 'latn',
        })
      : '';
  const minutesValue = (): number | null | false => {
    const m = minutes.trim() ? Number(minutes) : null;
    if (m !== null && (!Number.isInteger(m) || m < 1 || m > 600)) {
      setErr(t('staff.quick.minutesInvalid'));
      return false;
    }
    return m;
  };
  const offline = async () => {
    const m = minutesValue();
    if (m === false) return;
    setBusy(true);
    const r = await scheduleOfflineExam(assessmentId, Number(days), m);
    setBusy(false);
    if (!r.ok) return setErr(t(`staff.quick.offlineErrors.${r.error}`));
    toast(t('staff.quick.offlineScheduled', { date: until(r.closesAt) }), 'success');
    onChanged();
    res.reload();
  };

  const start = async () => {
    const m = minutesValue();
    if (m === false) return;
    setBusy(true);
    const r = await launchExam(assessmentId, m);
    setBusy(false);
    if (!r.ok) return setErr(t(`staff.quick.launchErrors.${r.error}`));
    toast(t('staff.quick.started'), 'success');
    onChanged();
    res.reload();
  };
  const end = async () => {
    setBusy(true);
    const r = await endExam(assessmentId);
    setBusy(false);
    if (!r.ok) return setErr(t('staff.quick.launchErrors.unknown'));
    toast(t('staff.quick.ended', { count: r.data }), 'success');
    onChanged();
  };

  return (
    <Card>
      <View style={styles.wrap}>
        <View style={styles.row}>
          <Text variant="heading" style={styles.flex}>
            {t('staff.quick.liveTitle')}
          </Text>
          {running ? <Badge label={t('staff.quick.liveNow')} tone="accent" icon="clock" /> : null}
          {offlineOpen ? (
            <Badge label={t('staff.examLive.offline.open')} tone="accent" icon="cloudOff" />
          ) : null}
        </View>
        {offlineOpen ? (
          <>
            <Text tone="textMuted">
              {t('staff.quick.offlineOpenBody', {
                date: until(live.closesAt),
                count: Math.round((live.durationSeconds ?? 1800) / 60),
              })}
            </Text>
            <Text tone="textMuted">
              {t('staff.quick.progress', { started: live.started, submitted: live.submitted })}
            </Text>
            <View style={styles.row}>
              <Button title={t('staff.examLive.open')} icon="users" size="sm" onPress={openLive} />
            </View>
          </>
        ) : running ? (
          <>
            <JoinCode code={live.joinCode!} />
            <Text tone="textMuted">
              {t('staff.quick.progress', { started: live.started, submitted: live.submitted })}
            </Text>
            <View style={styles.row}>
              <Button title={t('staff.examLive.open')} icon="users" size="sm" onPress={openLive} />
              <Button
                title={t('staff.quick.refresh')}
                variant="ghost"
                size="sm"
                icon="replay"
                onPress={res.reload}
              />
              <Button
                title={t('staff.quick.end')}
                variant="danger"
                size="sm"
                loading={busy}
                onPress={end}
              />
            </View>
          </>
        ) : (
          <>
            <Text tone="textMuted">{t('staff.quick.liveBody')}</Text>
            <View style={styles.row}>
              <TextField
                label={t('staff.quick.minutes')}
                value={minutes}
                onChangeText={(v) => {
                  setMinutes(v);
                  setErr(null);
                }}
                placeholder={String(Math.round((live.durationSeconds ?? 1800) / 60))}
                keyboardType="number-pad"
                script="latin"
                maxLength={3}
                style={styles.minutes}
                error={err ?? undefined}
              />
              <Button
                title={t('staff.quick.startLive')}
                icon="clock"
                loading={busy}
                onPress={start}
              />
            </View>
            <View style={styles.offline}>
              <Text variant="label">{t('staff.quick.offlineTitle')}</Text>
              <Text variant="bodySm" tone="textMuted">
                {t('staff.quick.offlineBody')}
              </Text>
              <View style={styles.chips}>
                <SegmentedControl
                  accessibilityLabel={t('staff.quick.offlineTitle')}
                  segments={OFFLINE_DAYS.map((d) => ({
                    value: d,
                    label: t('staff.quick.offlineDays', { count: Number(d) }),
                  }))}
                  value={days}
                  onChange={setDays}
                />
                <Button
                  title={t('staff.quick.offlineStart')}
                  icon="cloudOff"
                  variant="secondary"
                  size="sm"
                  loading={busy}
                  onPress={offline}
                />
              </View>
            </View>
          </>
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: space.sm },
  flex: { flex: 1 },
  minutes: { width: 140 },
  offline: { gap: space.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
  code: {
    alignSelf: 'flex-start',
    alignItems: 'center',
    paddingHorizontal: space.xl,
    paddingVertical: space.md,
    borderRadius: 18,
    borderWidth: 2,
  },
  codeText: { letterSpacing: 6, fontVariant: ['tabular-nums'] },
});
