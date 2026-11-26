// Quick create (prompt 50, DECISIONS #67): class + subject → blueprint (last
// one pre-filled) → Publish. The paper is one seeded draw from the subject's
// approved exam-scope items (core drawPaper): the difficulty mix, the chosen
// chapters, items this class hasn't had lately first, and a plain shortfall
// note instead of silently fewer questions. "Review first" saves a draft and
// opens the builder (swap / hand-pick); "Live in class" starts it at once with
// a join code.
import {
  ASSESSMENT_TYPES,
  BLUEPRINT_LIMITS,
  DEFAULT_BLUEPRINT,
  drawPaper,
  normaliseBlueprint,
  type AssessmentType,
  type Blueprint,
} from '@school/core';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useI18n, type TKey } from '../../i18n';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  IconButton,
  SegmentedControl,
  Text,
  useToast,
} from '../../ui';
import { space } from '../../ui/tokens';
import { createAssessment, setStatus } from '../assessments/api';
import { listChapters, listSubjects } from '../scope/api';
import { ChipPicker, MultiChipPicker } from '../scope/ChipPicker';
import { LoadState } from '../scope/LoadState';
import { ScopeGate, type ReadyScope } from '../scope/ScopeGate';
import { useResult } from '../scope/useResult';
import { lastBlueprint, launchExam, loadDrawPool, pinVersions, saveBlueprint } from './api';
import { JoinCode } from './LivePanel';

type Mix = 'easier' | 'balanced' | 'harder';
const MIXES: Record<Mix, Blueprint['mix']> = {
  easier: { easy: 50, medium: 40, hard: 10 },
  balanced: { easy: 30, medium: 50, hard: 20 },
  harder: { easy: 15, medium: 45, hard: 40 },
};
const mixName = (m: Blueprint['mix']): Mix =>
  (Object.keys(MIXES) as Mix[]).find(
    (k) => MIXES[k].easy === m.easy && MIXES[k].medium === m.medium && MIXES[k].hard === m.hard,
  ) ?? 'balanced';
type Delivery = 'tests' | 'live';
const TYPES = ASSESSMENT_TYPES.filter((x) => x !== 'file');

export function Stepper({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  suffix,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (n: number) => void;
  suffix?: string;
}) {
  const { t } = useI18n();
  return (
    <View style={styles.stepper}>
      <Text variant="label">{label}</Text>
      <View style={styles.stepRow}>
        <IconButton
          icon="minus"
          label={t('staff.quick.less', { what: label })}
          disabled={value <= min}
          onPress={() => onChange(Math.max(min, value - step))}
        />
        <Text variant="heading" style={styles.stepValue} accessibilityLiveRegion="polite">
          {value}
          {suffix ? ` ${suffix}` : ''}
        </Text>
        <IconButton
          icon="plus"
          label={t('staff.quick.more', { what: label })}
          disabled={value >= max}
          onPress={() => onChange(Math.min(max, value + step))}
        />
      </View>
    </View>
  );
}

function Quick({ scope }: { scope: ReadyScope }) {
  const { t } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const [classId, setClassId] = useState(scope.classes[0]!.id);
  const cls = scope.classes.find((c) => c.id === classId) ?? scope.classes[0]!;
  const subjects = useResult(`subj:${cls.id}`, () => listSubjects(cls));
  const subjectList = useMemo(
    () => (subjects.state?.status === 'ready' ? subjects.state.data : []),
    [subjects.state],
  );
  const [pickedSubject, setSubjectId] = useState<string | null>(null);
  const subjectId =
    pickedSubject && subjectList.some((s) => s.id === pickedSubject)
      ? pickedSubject
      : (subjectList[0]?.id ?? null);
  const subjectName = subjectList.find((s) => s.id === subjectId)?.name ?? '';
  const key = subjectId ? `${cls.id}:${subjectId}` : null;

  const chapters = useResult(key && `ch:${key}`, () => listChapters(subjectId!));
  const pool = useResult(key && `pool:${key}`, () => loadDrawPool(cls.id, subjectId!));
  const last = useResult(key && `bp:${key}`, async () => ({
    ok: true as const,
    data: await lastBlueprint(cls.id, subjectId!),
  }));

  // The blueprint: last used for this class + subject, else the default; edits stick.
  const [edited, setEdited] = useState<{ key: string; bp: Blueprint } | null>(null);
  const saved = last.state?.status === 'ready' ? last.state.data : null;
  const bp: Blueprint =
    edited && edited.key === key ? edited.bp : (saved ?? normaliseBlueprint(DEFAULT_BLUEPRINT));
  const tweak = (patch: Partial<Blueprint>) =>
    key && setEdited({ key, bp: normaliseBlueprint({ ...bp, ...patch }) });

  const [type, setType] = useState<AssessmentType>('quiz');
  const [delivery, setDelivery] = useState<Delivery>('tests');
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 2 ** 31));
  const [busy, setBusy] = useState<null | 'publish' | 'review'>(null);
  const [err, setErr] = useState<string | null>(null);
  const [launched, setLaunched] = useState<{ id: string; code: string } | null>(null);

  const items =
    pool.state?.status === 'ready' && pool.state.data !== 'notReady' ? pool.state.data : null;
  const notReady = pool.state?.status === 'ready' && pool.state.data === 'notReady';
  const draw = useMemo(() => (items ? drawPaper(items, bp, seed) : null), [items, bp, seed]);
  const count = draw?.picks.length ?? 0;
  const byLevel = (d: number) => draw?.picks.filter((p) => p.difficulty === d).length ?? 0;
  const date = new Date().toISOString().slice(0, 10);
  const title = t('staff.quick.autoTitle', {
    subject: subjectName,
    type: t(`console.assessments.types.${type}` as TKey),
    date,
  });

  const make = async (mode: 'publish' | 'review') => {
    if (!draw || !count || !subjectId) return;
    setBusy(mode);
    setErr(null);
    const created = await createAssessment({
      yearId: scope.year.id,
      classId: cls.id,
      subjectId,
      userId: scope.userId,
      fields: {
        title,
        type,
        weightage: 0,
        scheduled_on: delivery === 'tests' ? date : null,
        total_marks: count * bp.marksEach,
      },
      items: draw.picks.map((p, i) => ({
        question_id: p.questionId,
        marks: bp.marksEach,
        sort_order: i + 1,
      })),
      publish: false,
    });
    if (!created.ok) {
      setBusy(null);
      return setErr(t(`staff.quick.errors.${created.error}` as TKey));
    }
    const id = created.data;
    // Blueprint + pinned versions before anything is published (best effort: a
    // failure leaves a draft the builder can fix, never a half-published paper).
    const okBp = await saveBlueprint(id, bp);
    const okPin = await pinVersions(id, draw.picks);
    if (!okBp.ok || !okPin.ok || mode === 'review') {
      setBusy(null);
      if (!okBp.ok || !okPin.ok) toast(t('staff.quick.savedAsDraft'), 'warn');
      return router.push(`/assessments/${id}`);
    }
    if (delivery === 'live') {
      const r = await launchExam(id, bp.minutes);
      setBusy(null);
      if (!r.ok) {
        toast(t(`staff.quick.launchErrors.${r.error}` as TKey), 'warn');
        return router.push(`/assessments/${id}`);
      }
      setLaunched({ id, code: r.data.joinCode });
      return;
    }
    const pub = await setStatus(id, 'published');
    setBusy(null);
    if (!pub.ok) {
      toast(t('staff.quick.savedAsDraft'), 'warn');
      return router.push(`/assessments/${id}`);
    }
    toast(t('staff.quick.published', { title }), 'success');
    router.push(`/assessments/${id}`);
  };

  if (launched) {
    return (
      <Card>
        <View style={styles.section}>
          <Badge label={t('staff.quick.liveNow')} tone="accent" icon="clock" style={styles.start} />
          <Text variant="heading">{t('staff.quick.readOut')}</Text>
          <JoinCode code={launched.code} />
          <Text tone="textMuted">{t('staff.quick.readOutBody')}</Text>
          <Button
            title={t('staff.quick.openExam')}
            variant="secondary"
            onPress={() => router.push(`/assessments/${launched.id}`)}
          />
        </View>
      </Card>
    );
  }

  const chapterList = chapters.state?.status === 'ready' ? chapters.state.data : [];
  return (
    <View style={styles.wrap}>
      <Card>
        <View style={styles.section}>
          <Text variant="heading">{t('staff.quick.step1')}</Text>
          {scope.classes.length > 1 ? (
            <ChipPicker
              label={t('staff.scope.class')}
              chips={scope.classes.map((c) => ({ value: c.id, label: c.name }))}
              value={cls.id}
              onChange={(v) => {
                setClassId(v);
                setSubjectId(null);
                setErr(null);
              }}
            />
          ) : null}
          <LoadState
            state={subjects.state}
            title={t('staff.scope.loadError')}
            onRetry={subjects.reload}
          />
          {subjects.state?.status === 'ready' && !subjectList.length ? (
            <EmptyState icon="book" title={t('staff.quick.noSubjects')} />
          ) : null}
          {subjectList.length ? (
            <ChipPicker
              label={t('staff.scope.subject')}
              chips={subjectList.map((s) => ({ value: s.id, label: s.name }))}
              value={subjectId}
              onChange={(v) => {
                setSubjectId(v);
                setErr(null);
              }}
            />
          ) : null}
        </View>
      </Card>

      {subjectId ? (
        <Card>
          <View style={styles.section}>
            <Text variant="heading">{t('staff.quick.step2')}</Text>
            <ChipPicker
              label={t('staff.quick.type')}
              chips={TYPES.map((x) => ({
                value: x,
                label: t(`console.assessments.types.${x}` as TKey),
              }))}
              value={type}
              onChange={setType}
            />
            <ChipPicker
              label={t('staff.quick.delivery')}
              chips={[
                { value: 'tests' as Delivery, label: t('staff.quick.deliveryTests') },
                { value: 'live' as Delivery, label: t('staff.quick.deliveryLive') },
              ]}
              value={delivery}
              onChange={setDelivery}
            />
            {chapterList.length > 1 ? (
              <MultiChipPicker
                label={t('staff.quick.chapters')}
                chips={chapterList.map((c) => ({ value: c.id, label: c.title }))}
                value={bp.chapterIds}
                onChange={(ids) => tweak({ chapterIds: ids, topicIds: [] })}
              />
            ) : null}
            <View style={styles.steppers}>
              <Stepper
                label={t('staff.quick.count')}
                value={bp.count}
                min={BLUEPRINT_LIMITS.count.min}
                max={BLUEPRINT_LIMITS.count.max}
                onChange={(n) => tweak({ count: n })}
              />
              <Stepper
                label={t('staff.quick.minutes')}
                value={bp.minutes}
                min={BLUEPRINT_LIMITS.minutes.min}
                max={BLUEPRINT_LIMITS.minutes.max}
                step={5}
                onChange={(n) => tweak({ minutes: n })}
              />
              <Stepper
                label={t('staff.quick.marksEach')}
                value={bp.marksEach}
                min={BLUEPRINT_LIMITS.marksEach.min}
                max={BLUEPRINT_LIMITS.marksEach.max}
                onChange={(n) => tweak({ marksEach: n })}
              />
            </View>
            <View style={styles.stepper}>
              <Text variant="label">{t('staff.quick.mix')}</Text>
              <SegmentedControl
                accessibilityLabel={t('staff.quick.mix')}
                segments={(Object.keys(MIXES) as Mix[]).map((m) => ({
                  value: m,
                  label: t(`staff.quick.mixes.${m}` as TKey),
                }))}
                value={mixName(bp.mix)}
                onChange={(m) => tweak({ mix: MIXES[m] })}
              />
            </View>
          </View>
        </Card>
      ) : null}

      {subjectId ? (
        <Card>
          <View style={styles.section}>
            <Text variant="heading">{t('staff.quick.step3')}</Text>
            <LoadState
              state={pool.state}
              title={t('staff.quick.poolError')}
              onRetry={pool.reload}
            />
            {notReady ? (
              <EmptyState
                icon="clock"
                title={t('staff.quick.notReady')}
                body={t('staff.quick.notReadyBody')}
              />
            ) : null}
            {draw && draw.available === 0 ? (
              <EmptyState
                icon="search"
                title={t('staff.quick.noneApproved')}
                body={t('staff.quick.noneApprovedBody')}
                action={
                  <Button
                    title={t('staff.quick.toReview')}
                    variant="secondary"
                    onPress={() => router.push('/review')}
                  />
                }
              />
            ) : null}
            {draw && draw.available > 0 ? (
              <>
                <Text accessibilityLiveRegion="polite">
                  {t('staff.quick.summary', {
                    count,
                    available: draw.available,
                    marks: count * bp.marksEach,
                    minutes: bp.minutes,
                  })}
                </Text>
                <View style={styles.badges}>
                  <Badge
                    label={t('staff.quick.levels.easy', { count: byLevel(1) })}
                    tone="correct"
                  />
                  <Badge
                    label={t('staff.quick.levels.medium', { count: byLevel(2) })}
                    tone="learning"
                  />
                  <Badge label={t('staff.quick.levels.hard', { count: byLevel(3) })} tone="weak" />
                </View>
                {draw.borrowed > 0 ? (
                  <Text variant="bodySm" tone="textMuted">
                    {t('staff.quick.borrowed', { count: draw.borrowed })}
                  </Text>
                ) : null}
                {draw.missing > 0 ? (
                  <Text variant="bodySm" tone="onAccentSoft" accessibilityRole="alert">
                    {t('staff.quick.short', { count: draw.missing, got: count })}
                  </Text>
                ) : null}
                {err ? (
                  <Text tone="onWrongSoft" accessibilityRole="alert">
                    {err}
                  </Text>
                ) : null}
                <View style={styles.actions}>
                  <Button
                    title={t('staff.quick.drawAgain')}
                    icon="replay"
                    variant="ghost"
                    disabled={!!busy}
                    onPress={() => setSeed(Math.floor(Math.random() * 2 ** 31))}
                  />
                  <Button
                    title={t('staff.quick.reviewFirst')}
                    variant="secondary"
                    loading={busy === 'review'}
                    disabled={!!busy || !count}
                    onPress={() => make('review')}
                  />
                  <Button
                    title={t(
                      delivery === 'live'
                        ? 'staff.quick.publishLive'
                        : draw.missing
                          ? 'staff.quick.publishFewer'
                          : 'staff.quick.publish',
                      { count },
                    )}
                    icon={delivery === 'live' ? 'clock' : 'check'}
                    loading={busy === 'publish'}
                    disabled={!!busy || !count}
                    onPress={() => make('publish')}
                  />
                </View>
              </>
            ) : null}
          </View>
        </Card>
      ) : null}
    </View>
  );
}

export function QuickCreateScreen() {
  const { t } = useI18n();
  const router = useRouter();
  return (
    <>
      <Button
        title={t('staff.back')}
        icon="back"
        variant="ghost"
        size="sm"
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/assessments'))}
        style={styles.start}
      />
      <Text variant="title" accessibilityRole="header">
        {t('staff.quick.title')}
      </Text>
      <Text tone="textMuted">{t('staff.quick.subtitle')}</Text>
      <ScopeGate>{(scope) => <Quick scope={scope} />}</ScopeGate>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.lg },
  section: { gap: space.md },
  start: { alignSelf: 'flex-start' },
  steppers: { flexDirection: 'row', flexWrap: 'wrap', gap: space.lg },
  stepper: { gap: space.xs },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  stepValue: { minWidth: 56, textAlign: 'center', fontVariant: ['tabular-nums'] },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, justifyContent: 'flex-end' },
});
