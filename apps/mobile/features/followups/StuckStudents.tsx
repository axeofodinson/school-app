// Teacher view "Who's stuck" (prompt 41): a class's open follow-ups grouped by
// concept, most rounds first, plus those closed in the last two weeks. A teacher
// can let a student move on (relax) or open a follow-up again (restore), always
// with a reason; both are logged (gate_overrides) and decided by the server
// (db/034: only that subject's teacher this year, or staff).
import { MASTERY_DEFAULTS } from '@school/core';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useI18n } from '../../i18n';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  MasteryChip,
  Reveal,
  Sheet,
  Text,
  TextField,
  useTheme,
  useToast,
} from '../../ui';
import { hueForSubject, space, subjectHues } from '../../ui/tokens';
import { ChipPicker } from '../scope/ChipPicker';
import { LoadState } from '../scope/LoadState';
import { ScopeGate, type ReadyScope } from '../scope/ScopeGate';
import { useResult } from '../scope/useResult';
import { loadClassFollowUps, overrideGate, type ClassFollowUp } from './api';

type Pending = { row: ClassFollowUp; action: 'relax' | 'restore' };

function StudentRow({ r, onAct }: { r: ClassFollowUp; onAct: (p: Pending) => void }) {
  const { t } = useI18n();
  const { colours } = useTheme();
  const open = r.status === 'open';
  const stuck = open && r.rounds >= MASTERY_DEFAULTS.reliefRounds - 1;
  return (
    <View style={[styles.student, { borderTopColor: colours.border }]}>
      <View style={styles.flex}>
        <Text variant="label" numberOfLines={1}>
          {r.student_name}
        </Text>
        <Text variant="bodySm" tone="textMuted" numberOfLines={1}>
          {[
            r.student_code,
            t(`staff.stuck.kind.${r.kind}`),
            open
              ? t('staff.stuck.rounds', { count: r.rounds })
              : r.status === 'cleared'
                ? t('staff.stuck.cleared')
                : (r.close_reason ?? '').startsWith('teacher')
                  ? t('staff.stuck.relaxedBy', { name: r.last_actor ?? '—' })
                  : t('staff.stuck.autoRelieved'),
          ].join(' · ')}
        </Text>
      </View>
      {stuck ? <Badge label={t('staff.stuck.stuck')} tone="wrong" icon="warning" /> : null}
      {r.band === 'weak' || r.band === 'learning' || r.band === 'mastered' ? (
        <MasteryChip band={r.band} />
      ) : null}
      {open ? (
        <Button
          title={t('staff.stuck.relax')}
          icon="lockOpen"
          size="sm"
          variant="secondary"
          onPress={() => onAct({ row: r, action: 'relax' })}
        />
      ) : r.status === 'relieved' ? (
        <Button
          title={t('staff.stuck.restore')}
          icon="restore"
          size="sm"
          variant="ghost"
          onPress={() => onAct({ row: r, action: 'restore' })}
        />
      ) : null}
    </View>
  );
}

function ClassView({ scope }: { scope: ReadyScope }) {
  const { t, locale } = useI18n();
  const { scheme, colours } = useTheme();
  const toast = useToast();
  const [classId, setClassId] = useState(scope.classes[0]!.id);
  const res = useResult(`stuck:${classId}`, () => loadClassFollowUps(classId));
  const rows =
    res.state?.status === 'ready' && res.state.data !== 'notReady' ? res.state.data : null;
  const notReady = res.state?.status === 'ready' && res.state.data === 'notReady';
  const [pending, setPending] = useState<Pending | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ur = locale === 'ur';

  const groups = useMemo(() => {
    const m = new Map<
      string,
      { key: string; first: ClassFollowUp; rows: ClassFollowUp[]; open: number }
    >();
    for (const r of rows ?? []) {
      const g = m.get(r.concept_id) ?? { key: r.concept_id, first: r, rows: [], open: 0 };
      g.rows.push(r);
      if (r.status === 'open') g.open += 1;
      m.set(r.concept_id, g);
    }
    return [...m.values()].sort((a, b) => b.open - a.open);
  }, [rows]);
  const openTotal = (rows ?? []).filter((r) => r.status === 'open').length;

  const submit = async () => {
    if (!pending) return;
    if (!reason.trim()) {
      setErr(t('staff.stuck.reasonRequired'));
      return;
    }
    setBusy(true);
    const r = await overrideGate(pending.action, pending.row.id, reason.trim());
    setBusy(false);
    if (r.ok) {
      toast(
        t(pending.action === 'relax' ? 'staff.stuck.relaxed' : 'staff.stuck.restored', {
          name: pending.row.student_name,
        }),
        'success',
      );
      setPending(null);
      setReason('');
      res.reload();
    } else {
      setErr(t(`staff.stuck.errors.${r.error}`));
    }
  };

  return (
    <View style={styles.wrap}>
      {scope.classes.length > 1 ? (
        <ChipPicker
          label={t('staff.stuck.class')}
          chips={scope.classes.map((c) => ({ value: c.id, label: c.name }))}
          value={classId}
          onChange={setClassId}
        />
      ) : null}
      <LoadState state={res.state} title={t('staff.stuck.loadError')} onRetry={res.reload} />
      {notReady ? (
        <EmptyState
          icon="clock"
          title={t('staff.stuck.notReady')}
          body={t('staff.stuck.notReadyBody')}
        />
      ) : null}
      {rows && !rows.length ? (
        <EmptyState
          icon="checkCircle"
          title={t('staff.stuck.empty')}
          body={t('staff.stuck.emptyBody')}
        />
      ) : null}
      {rows && rows.length ? (
        <Text variant="label">
          {t('staff.stuck.summary', { count: openTotal, concepts: groups.length })}
        </Text>
      ) : null}
      {groups.map((g, i) => {
        const hue = hueForSubject(g.first.subject_id);
        return (
          <Reveal key={g.key} index={Math.min(i, 8)}>
            <Card>
              <View style={styles.groupHead}>
                <View
                  style={[
                    styles.swatch,
                    { backgroundColor: subjectHues[hue][scheme], borderColor: colours.ink },
                  ]}
                />
                <View style={styles.flex}>
                  <Text variant="heading" numberOfLines={2}>
                    {(ur ? g.first.concept_ur : null) || g.first.concept_en}
                  </Text>
                  <Text variant="bodySm" tone="textMuted" numberOfLines={1}>
                    {[
                      g.first.subject_name,
                      (ur ? g.first.topic_ur : null) || g.first.topic_en,
                    ].join(' · ')}
                  </Text>
                </View>
                {g.open ? (
                  <Badge label={t('staff.stuck.openCount', { count: g.open })} tone="weak" />
                ) : null}
              </View>
              {g.rows.map((r) => (
                <StudentRow
                  key={r.id}
                  r={r}
                  onAct={(p) => {
                    setPending(p);
                    setReason('');
                    setErr(null);
                  }}
                />
              ))}
            </Card>
          </Reveal>
        );
      })}
      <Sheet
        visible={!!pending}
        onClose={() => setPending(null)}
        title={
          pending
            ? t(
                pending.action === 'relax' ? 'staff.stuck.relaxTitle' : 'staff.stuck.restoreTitle',
                {
                  name: pending.row.student_name,
                },
              )
            : ''
        }
        footer={
          <View style={styles.sheetActions}>
            <Button
              title={t('staff.stuck.cancel')}
              variant="ghost"
              onPress={() => setPending(null)}
            />
            <Button
              title={t(pending?.action === 'restore' ? 'staff.stuck.restore' : 'staff.stuck.relax')}
              icon={pending?.action === 'restore' ? 'restore' : 'lockOpen'}
              loading={busy}
              onPress={submit}
            />
          </View>
        }
      >
        <Text tone="textMuted">
          {t(pending?.action === 'restore' ? 'staff.stuck.restoreBody' : 'staff.stuck.relaxBody')}
        </Text>
        <TextField
          label={t('staff.stuck.reason')}
          value={reason}
          onChangeText={(v) => {
            setReason(v);
            setErr(null);
          }}
          error={err ?? undefined}
          multiline
          onSubmitEditing={submit}
        />
      </Sheet>
    </View>
  );
}

export function StuckStudentsScreen() {
  const { t } = useI18n();
  const router = useRouter();
  return (
    <>
      <Button
        title={t('staff.back')}
        icon="back"
        variant="ghost"
        size="sm"
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        style={styles.start}
      />
      <Text variant="title" accessibilityRole="header">
        {t('staff.stuck.title')}
      </Text>
      <Text tone="textMuted">{t('staff.stuck.subtitle')}</Text>
      <ScopeGate>{(scope) => <ClassView scope={scope} />}</ScopeGate>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  flex: { flex: 1 },
  start: { alignSelf: 'flex-start' },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.sm },
  swatch: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 2,
    transform: [{ rotate: '45deg' }],
  },
  student: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
    borderTopWidth: 1,
  },
  sheetActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.sm },
});
