// "Run it live" on the builder (prompt 50): start the assessment as a live exam
// now (the server publishes it, sets the clock and issues a join code), show the
// code big enough to read out, who has started and handed in, and end it.
import type { AssessmentStatus } from '@school/core';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useI18n } from '../../i18n';
import { Badge, Button, Card, Text, TextField, useTheme, useToast } from '../../ui';
import { space } from '../../ui/tokens';
import { useResult } from '../scope/useResult';
import { endExam, launchExam, loadLiveState } from './api';

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
  const { t } = useI18n();
  const toast = useToast();
  const res = useResult(`live:${assessmentId}:${status}`, () => loadLiveState(assessmentId));
  const [minutes, setMinutes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const live =
    res.state?.status === 'ready' && res.state.data !== 'notReady' ? res.state.data : null;
  if (!live || status === 'closed') return null;
  const running = live.mode === 'live_exam' && status === 'published' && !!live.joinCode;

  const start = async () => {
    const m = minutes.trim() ? Number(minutes) : null;
    if (m !== null && (!Number.isInteger(m) || m < 1 || m > 600)) {
      return setErr(t('staff.quick.minutesInvalid'));
    }
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
        </View>
        {running ? (
          <>
            <JoinCode code={live.joinCode!} />
            <Text tone="textMuted">
              {t('staff.quick.progress', { started: live.started, submitted: live.submitted })}
            </Text>
            <View style={styles.row}>
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
