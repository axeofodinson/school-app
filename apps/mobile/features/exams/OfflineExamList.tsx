// Offline exams on the Tests tab (prompt 60): the class's offline exams from the
// server (download while online) merged with the copies already on this device,
// so a downloaded paper opens with no internet at all. Finished papers waiting
// to send go up here too whenever the tab opens online.
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useI18n } from '../../i18n';
import { Badge, Button, Card, Icon, Text, useTheme, type BadgeTone } from '../../ui';
import { space } from '../../ui/tokens';
import { useAuth } from '../auth/AuthProvider';
import type { OfflineExamListed } from './api';
import { flushOffline, listOffline, type OfflineExamCopy } from './offline';

type Row = {
  id: string;
  title: string;
  subjectName: string | null;
  minutes: number | null;
  closesAt: string | null;
  local: OfflineExamCopy | null;
  score: number | null;
  total: number | null;
  serverStatus: string | null;
};

function useLocalCopies() {
  const { queueStorage } = useAuth();
  const [local, setLocal] = useState<OfflineExamCopy[]>([]);
  useFocusEffect(
    useCallback(() => {
      let live = true;
      // Send anything finished first (quietly; offline it just waits), then list.
      void flushOffline(queueStorage)
        .catch(() => 0)
        .then(() => listOffline(queueStorage))
        .then((l) => live && setLocal(l));
      return () => {
        live = false;
      };
    }, [queueStorage]),
  );
  return local;
}

export function OfflineExamList({ server }: { server: OfflineExamListed[] | null }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { colours } = useTheme();
  const local = useLocalCopies();
  const [now] = useState(() => Date.now());
  const date = (iso: string) =>
    new Date(iso).toLocaleString(locale === 'ur' ? 'ur-PK' : 'en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
      numberingSystem: 'latn',
    });

  const byId = new Map<string, Row>();
  for (const e of server ?? []) {
    byId.set(e.assessmentId, {
      id: e.assessmentId,
      title: e.title,
      subjectName: e.subjectName,
      minutes: e.durationSeconds ? Math.round(e.durationSeconds / 60) : null,
      closesAt: e.closesAt,
      local: null,
      score: e.score,
      total: e.total,
      serverStatus: e.sessionStatus,
    });
  }
  for (const c of local) {
    const row = byId.get(c.assessmentId);
    if (row) row.local = c;
    else if (!server || !c.result || Date.parse(c.closesAt) > now - 14 * 86_400_000)
      byId.set(c.assessmentId, {
        id: c.assessmentId,
        title: c.title,
        subjectName: null,
        minutes: Math.round(c.durationMs / 60000),
        closesAt: c.closesAt,
        local: c,
        score: c.result?.score ?? null,
        total: c.result?.total ?? null,
        serverStatus: null,
      });
  }
  const rows = [...byId.values()];
  if (!rows.length) return null;

  const look = (
    r: Row,
  ): {
    label: string;
    tone: BadgeTone;
    icon: 'cloud' | 'checkCircle' | 'syncing' | 'pencil' | 'clock';
  } => {
    const c = r.local;
    if (c?.result || (r.serverStatus === 'submitted' && r.score != null))
      return { label: t('student.offlineExam.badge.sent'), tone: 'correct', icon: 'checkCircle' };
    if (c?.clock?.stoppedAt)
      return { label: t('student.offlineExam.badge.toSend'), tone: 'learning', icon: 'syncing' };
    if (c?.clock)
      return { label: t('student.offlineExam.badge.started'), tone: 'accent', icon: 'pencil' };
    if (c)
      return { label: t('student.offlineExam.badge.saved'), tone: 'neutral', icon: 'checkCircle' };
    if (r.closesAt && Date.parse(r.closesAt) < now)
      return { label: t('student.offlineExam.badge.closed'), tone: 'neutral', icon: 'clock' };
    return { label: t('student.offlineExam.badge.notSaved'), tone: 'neutral', icon: 'cloud' };
  };

  return (
    <View style={styles.wrap}>
      <Text variant="heading" accessibilityRole="header">
        {t('student.offlineExam.listTitle')}
      </Text>
      {rows.map((r) => {
        const l = look(r);
        const score = r.local?.result?.score ?? r.score;
        const total = r.local?.result?.total ?? r.total;
        return (
          <Card key={r.id}>
            <View style={styles.row}>
              <View style={[styles.mark, { backgroundColor: colours.primarySoft }]}>
                <Icon name="cloudOff" tone="onPrimarySoft" />
              </View>
              <View style={styles.flex}>
                <Text variant="heading" numberOfLines={2}>
                  {r.title}
                </Text>
                <Text variant="bodySm" tone="textMuted" numberOfLines={2}>
                  {[
                    r.subjectName,
                    r.minutes ? t('student.exam.minutes', { count: r.minutes }) : null,
                    r.closesAt ? t('student.offlineExam.until', { date: date(r.closesAt) }) : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
              {score != null && total ? (
                <Text variant="label">
                  {score} / {total}
                </Text>
              ) : null}
              <Badge label={l.label} tone={l.tone} icon={l.icon} />
              <Button
                title={t('student.offlineExam.open')}
                icon="forward"
                size="sm"
                variant={r.local?.result ? 'ghost' : 'primary'}
                onPress={() => router.push(`/exam/offline/${r.id}` as Href)}
              />
            </View>
          </Card>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm, marginBottom: space.md },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.md },
  flex: { flex: 1, minWidth: 140 },
  mark: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
