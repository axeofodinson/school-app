// Live exams on the student's Tests tab (prompt 50): the class's exams running
// now (join or continue), a join-code box for when the teacher reads one out,
// and finished exams with their score. Before db/020 this shows nothing.
import { normaliseJoinCode, JOIN_CODE_LENGTH } from '@school/core';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useI18n } from '../../i18n';
import { Badge, Button, Card, Icon, Text, TextField, useTheme } from '../../ui';
import { space } from '../../ui/tokens';
import { useResult } from '../scope/useResult';
import { joinExam, loadExamOverview, type ExamOverview } from './api';
import { OfflineExamList } from './OfflineExamList';

/** The overview for a class; `examIds` lets the Tests list leave exams to this section. */
export function useExamOverview(classId: string | null) {
  const res = useResult(classId ? `exams:${classId}` : null, () => loadExamOverview(classId!));
  // Back from an exam: refresh (a quiet reload, the last answer stays meanwhile).
  const seen = useRef(false);
  const { reload } = res;
  useFocusEffect(
    useCallback(() => {
      if (seen.current) reload();
      seen.current = true;
    }, [reload]),
  );
  const [kept, setKept] = useState<ExamOverview | null>(null);
  const fresh: ExamOverview | null =
    res.state?.status === 'ready' && res.state.data !== 'notReady' ? res.state.data : null;
  if (fresh && fresh !== kept) setKept(fresh);
  const data = fresh ?? (res.state?.status === 'loading' ? kept : null);
  return { data, reload };
}

export function LiveExams({ overview }: { overview: ExamOverview | null }) {
  const { t } = useI18n();
  const router = useRouter();
  const { colours } = useTheme();
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Offline (or before the first load): the papers saved on this device still open.
  if (!overview) return <OfflineExamList server={null} />;

  const join = async () => {
    const c = normaliseJoinCode(code);
    if (!c) return setErr(t('student.exam.codeShape', { count: JOIN_CODE_LENGTH }));
    setBusy(true);
    const r = await joinExam(c);
    setBusy(false);
    if (r.ok) {
      setCode('');
      router.push(`/exam/${r.assessmentId}`);
    } else {
      setErr(
        t(r.error === 'unknown_code' ? 'student.exam.codeUnknown' : 'student.exam.errors.network'),
      );
    }
  };

  return (
    <View style={styles.wrap}>
      <OfflineExamList server={overview.offline} />
      {overview.live.map((e) => {
        const going = e.sessionStatus === 'in_progress';
        return (
          <Card key={e.assessmentId}>
            <View style={styles.row}>
              <View style={[styles.mark, { backgroundColor: colours.accentSoft }]}>
                <Icon name="clipboard" tone="onAccentSoft" />
              </View>
              <View style={styles.flex}>
                <Text variant="heading" numberOfLines={2}>
                  {e.title}
                </Text>
                <Text variant="bodySm" tone="textMuted" numberOfLines={1}>
                  {[
                    e.subjectName,
                    e.durationSeconds
                      ? t('student.exam.minutes', { count: Math.round(e.durationSeconds / 60) })
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
              <Badge label={t('student.exam.liveNow')} tone="accent" icon="clock" />
              <Button
                title={t(going ? 'student.exam.continue' : 'student.exam.join')}
                icon="pencil"
                size="sm"
                onPress={() => router.push(`/exam/${e.assessmentId}`)}
              />
            </View>
          </Card>
        );
      })}
      <Card>
        <View style={styles.joinRow}>
          <View style={styles.flex}>
            <TextField
              label={t('student.exam.codeLabel')}
              value={code}
              onChangeText={(v) => {
                setCode(v.toUpperCase());
                setErr(null);
              }}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={JOIN_CODE_LENGTH + 2}
              error={err ?? undefined}
              onSubmitEditing={join}
            />
          </View>
          <Button
            title={t('student.exam.join')}
            variant="secondary"
            loading={busy}
            onPress={join}
            style={styles.joinBtn}
          />
        </View>
      </Card>
      {overview.finished.length ? (
        <View style={styles.finished}>
          <Text variant="heading" accessibilityRole="header">
            {t('student.exam.finishedHeading')}
          </Text>
          {overview.finished.map((f) => (
            <View
              key={f.assessmentId}
              style={[styles.doneRow, { borderColor: colours.border }]}
              accessible
            >
              <Icon name="checkCircle" tone="correct" />
              <Text style={styles.flex} numberOfLines={1}>
                {f.title}
              </Text>
              <Text variant="label">
                {f.score != null && f.total
                  ? `${f.score} / ${f.total}`
                  : t('student.exam.toMarkShort')}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md, marginBottom: space.md },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.md },
  joinRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
  joinBtn: { marginBottom: 2 },
  flex: { flex: 1, minWidth: 120 },
  mark: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  finished: { gap: space.sm },
  doneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: 12,
    borderWidth: 1,
  },
});
