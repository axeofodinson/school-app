// Worksheets (prompt 70, LMS_AUDIT §3.7): a teacher picks class + subject,
// topics, item kinds and a count; the sheet is one seeded draw from items
// approved for worksheet use (core pickWorksheet). Print set A, set B (same
// questions, another order, options re-lettered) and the answer key, on A4,
// in English or Urdu. The sheet's code is printed on it; the same code and
// choices make the same sheet again. Doing worksheets in the app is the next
// slice (MODULE_STATUS).
import {
  makeSet,
  pickWorksheet,
  plainLabel,
  pickLang,
  WORKSHEET_KINDS,
  WORKSHEET_MAX,
  worksheetHtml,
  type SheetSet,
  type WorksheetKind,
  type WorksheetLabels,
  type WorksheetSet,
} from '@school/core';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { translate, useI18n, type Locale, type TKey } from '../../i18n';
import { urduPrintFontCss } from '../../lib/printFont';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  SegmentedControl,
  Text,
  TextField,
  useToast,
} from '../../ui';
import { space } from '../../ui/tokens';
import { printHtml } from '../auth/print-html';
import { Stepper } from '../exams/QuickCreateScreen';
import { listSubjects } from '../scope/api';
import { ChipPicker, MultiChipPicker } from '../scope/ChipPicker';
import { LoadState } from '../scope/LoadState';
import { ScopeGate, type ReadyScope } from '../scope/ScopeGate';
import { useResult } from '../scope/useResult';
import { loadWorksheetPool } from './api';

type Print = 'A' | 'B' | 'key' | 'all';
const newSeed = () => Math.floor(Math.random() * 2 ** 31);
/** The sheet's code: the seed in a short, readable form. */
export const sheetCode = (seed: number) => `WS-${seed.toString(36).toUpperCase().padStart(6, '0')}`;

function Maker({ scope }: { scope: ReadyScope }) {
  const { t, locale } = useI18n();
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
  const pool = useResult(subjectId && `ws:${subjectId}`, () => loadWorksheetPool(subjectId!));
  const data =
    pool.state?.status === 'ready' && pool.state.data !== 'notReady' ? pool.state.data : null;
  const notReady = pool.state?.status === 'ready' && pool.state.data === 'notReady';

  const [chosen, setChosen] = useState<{ subject: string; ids: string[] } | null>(null);
  const topicIds = useMemo(
    () =>
      chosen && chosen.subject === subjectId ? chosen.ids : (data?.topics.map((x) => x.id) ?? []),
    [chosen, subjectId, data],
  );
  const [kinds, setKinds] = useState<WorksheetKind[]>([...WORKSHEET_KINDS]);
  const [count, setCount] = useState(10);
  const [paperLang, setPaperLang] = useState<Locale>(locale);
  const [title, setTitle] = useState('');
  const [seed, setSeed] = useState(newSeed);
  const [busy, setBusy] = useState<Print | null>(null);

  const pick = useMemo(
    () => (data ? pickWorksheet(data.items, { topicIds, kinds, count }, seed) : null),
    [data, topicIds, kinds, count, seed],
  );
  const sets = useMemo(
    () =>
      pick?.items.length
        ? { A: makeSet(pick.items, seed, 'A'), B: makeSet(pick.items, seed, 'B') }
        : null,
    [pick, seed],
  );
  const sheetTitle = title.trim() || t('staff.worksheets.autoTitle', { subject: subjectName });

  const print = async (what: Print) => {
    if (!sets || !data) return;
    setBusy(what);
    const tr = (k: TKey, p?: Record<string, string | number>) => translate(paperLang, k, p);
    const labels: WorksheetLabels = {
      school: tr('auth.cards.school'),
      title: sheetTitle,
      subtitle: `${cls.name} · ${subjectName}`,
      set: (s: WorksheetSet) => tr('staff.worksheets.print.set', { set: s }),
      name: tr('staff.worksheets.print.name'),
      roll: tr('staff.worksheets.print.roll'),
      date: tr('staff.worksheets.print.date'),
      sections: {
        mcq: tr('staff.worksheets.print.sections.mcq'),
        true_false: tr('staff.worksheets.print.sections.true_false'),
        fill_blank: tr('staff.worksheets.print.sections.fill_blank'),
        short_answer: tr('staff.worksheets.print.sections.short_answer'),
      },
      true: tr('staff.worksheets.print.true'),
      false: tr('staff.worksheets.print.false'),
      key: (s: WorksheetSet) => tr('staff.worksheets.print.key', { set: s }),
      also: tr('staff.worksheets.print.also'),
      code: sheetCode(seed),
    };
    const chosenSets: SheetSet[] =
      what === 'A' ? [sets.A] : what === 'B' ? [sets.B] : [sets.A, sets.B];
    try {
      const html = worksheetHtml(
        {
          sets: chosenSets,
          withKey: what === 'key' || what === 'all',
          lang: paperLang,
          math: data.math,
          fontCss: paperLang === 'ur' ? await urduPrintFontCss() : '',
        },
        labels,
      );
      // "Answer key" alone: only the key pages.
      await printHtml(what === 'key' ? keyOnly(html) : html);
    } catch {
      toast(t('staff.worksheets.printError'), 'warn');
    } finally {
      setBusy(null);
    }
  };

  const byKind = (k: WorksheetKind) => pick?.items.filter((i) => i.kind === k).length ?? 0;
  const topicLabel = (id: string) => {
    const x = data?.topics.find((tp) => tp.id === id);
    if (!x) return '';
    return locale === 'ur' && x.titleUr ? x.titleUr : x.title;
  };

  return (
    <View style={styles.wrap}>
      <Card>
        <View style={styles.section}>
          <Text variant="heading">{t('staff.worksheets.step1')}</Text>
          {scope.classes.length > 1 ? (
            <ChipPicker
              label={t('staff.scope.class')}
              chips={scope.classes.map((c) => ({ value: c.id, label: c.name }))}
              value={cls.id}
              onChange={(v) => {
                setClassId(v);
                setSubjectId(null);
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
              onChange={setSubjectId}
            />
          ) : null}
        </View>
      </Card>

      {subjectId ? (
        <Card>
          <View style={styles.section}>
            <Text variant="heading">{t('staff.worksheets.step2')}</Text>
            <LoadState
              state={pool.state}
              title={t('staff.worksheets.poolError')}
              onRetry={pool.reload}
            />
            {notReady ? (
              <EmptyState
                icon="clock"
                title={t('staff.worksheets.notReady')}
                body={t('staff.worksheets.notReadyBody')}
              />
            ) : null}
            {data && !data.topics.length ? (
              <EmptyState
                icon="book"
                title={t('staff.worksheets.noTopics')}
                body={t('staff.worksheets.noTopicsBody')}
                action={
                  <Button
                    title={t('staff.worksheets.toCurriculum')}
                    variant="secondary"
                    onPress={() => router.push('/curriculum')}
                  />
                }
              />
            ) : null}
            {data && data.topics.length ? (
              <>
                <MultiChipPicker
                  label={t('staff.worksheets.topics')}
                  chips={data.topics.map((x) => ({ value: x.id, label: topicLabel(x.id) }))}
                  value={topicIds}
                  onChange={(ids) => subjectId && setChosen({ subject: subjectId, ids })}
                />
                <MultiChipPicker
                  label={t('staff.worksheets.kinds')}
                  chips={WORKSHEET_KINDS.map((k) => ({
                    value: k,
                    label: t(`staff.worksheets.kind.${k}` as TKey),
                  }))}
                  value={kinds}
                  onChange={(v) => setKinds(v as WorksheetKind[])}
                />
                <View style={styles.row}>
                  <Stepper
                    label={t('staff.worksheets.count')}
                    value={count}
                    min={1}
                    max={WORKSHEET_MAX}
                    onChange={setCount}
                  />
                  <View style={styles.lang}>
                    <Text variant="label">{t('staff.worksheets.paperLang')}</Text>
                    <SegmentedControl
                      accessibilityLabel={t('staff.worksheets.paperLang')}
                      segments={[
                        { value: 'en' as Locale, label: 'English' },
                        { value: 'ur' as Locale, label: 'اردو' },
                      ]}
                      value={paperLang}
                      onChange={setPaperLang}
                    />
                  </View>
                </View>
                <TextField
                  label={t('staff.worksheets.titleLabel')}
                  value={title}
                  onChangeText={setTitle}
                  placeholder={t('staff.worksheets.autoTitle', { subject: subjectName })}
                  maxLength={120}
                />
              </>
            ) : null}
          </View>
        </Card>
      ) : null}

      {pick && data?.topics.length ? (
        <Card>
          <View style={styles.section}>
            <Text variant="heading">{t('staff.worksheets.step3')}</Text>
            {pick.available === 0 ? (
              <EmptyState
                icon="search"
                title={t('staff.worksheets.noneApproved')}
                body={t('staff.worksheets.noneApprovedBody')}
                action={
                  <Button
                    title={t('staff.quick.toReview')}
                    variant="secondary"
                    onPress={() => router.push('/review')}
                  />
                }
              />
            ) : (
              <>
                <Text accessibilityLiveRegion="polite">
                  {t('staff.worksheets.summary', {
                    count: pick.items.length,
                    available: pick.available,
                  })}
                </Text>
                <View style={styles.badges}>
                  {WORKSHEET_KINDS.filter((k) => byKind(k)).map((k) => (
                    <Badge
                      key={k}
                      label={`${t(`staff.worksheets.kind.${k}` as TKey)} · ${byKind(k)}`}
                      tone="neutral"
                    />
                  ))}
                  <Badge label={sheetCode(seed)} tone="accent" icon="clipboard" />
                </View>
                {pick.short > 0 ? (
                  <Text variant="bodySm" tone="onAccentSoft" accessibilityRole="alert">
                    {t('staff.worksheets.short', { count: pick.short, got: pick.items.length })}
                  </Text>
                ) : null}
                {sets ? (
                  <View style={styles.preview} accessibilityLabel={t('staff.worksheets.previewA')}>
                    <Text variant="label">{t('staff.worksheets.previewA')}</Text>
                    {sets.A.questions.map((q) => (
                      <Text key={q.questionId} variant="bodySm" numberOfLines={1}>
                        {q.n}.{' '}
                        {plainLabel(
                          pickLang((q.body as { stem?: unknown } | null)?.stem, paperLang)?.text,
                          90,
                        )}
                      </Text>
                    ))}
                  </View>
                ) : null}
                <View style={styles.actions}>
                  <Button
                    title={t('staff.worksheets.newMix')}
                    icon="replay"
                    variant="ghost"
                    disabled={!!busy}
                    onPress={() => setSeed(newSeed())}
                  />
                  <Button
                    title={t('staff.worksheets.printA')}
                    icon="fileText"
                    variant="secondary"
                    loading={busy === 'A'}
                    disabled={!!busy || !sets}
                    onPress={() => print('A')}
                  />
                  <Button
                    title={t('staff.worksheets.printB')}
                    icon="fileText"
                    variant="secondary"
                    loading={busy === 'B'}
                    disabled={!!busy || !sets}
                    onPress={() => print('B')}
                  />
                  <Button
                    title={t('staff.worksheets.printKey')}
                    icon="checkCircle"
                    variant="secondary"
                    loading={busy === 'key'}
                    disabled={!!busy || !sets}
                    onPress={() => print('key')}
                  />
                  <Button
                    title={t('staff.worksheets.printAll')}
                    icon="fileText"
                    loading={busy === 'all'}
                    disabled={!!busy || !sets}
                    onPress={() => print('all')}
                  />
                </View>
              </>
            )}
          </View>
        </Card>
      ) : null}
    </View>
  );
}

/** Keep only the answer-key pages of a printed document. */
function keyOnly(html: string): string {
  return html.replace(/<section class="page">[\s\S]*?<\/section>/g, '');
}

export function WorksheetScreen() {
  const { t } = useI18n();
  return (
    <>
      <Text variant="title" accessibilityRole="header">
        {t('staff.worksheets.title')}
      </Text>
      <Text tone="textMuted">{t('staff.worksheets.subtitle')}</Text>
      <ScopeGate>{(scope) => <Maker scope={scope} />}</ScopeGate>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.lg },
  section: { gap: space.md },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.lg, alignItems: 'flex-end' },
  lang: { gap: space.xs },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  preview: { gap: 2 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, justifyContent: 'flex-end' },
});
