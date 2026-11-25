// Import content (prompt 21). One topic file in → a report → drafts for review.
// Nothing is approved here: everything lands as `draft` and goes to the review
// queue (prompt 22). The teacher chooses class → subject → chapter first, so
// the import can only touch a chapter RLS already lets them write.
import {
  addBankMatches,
  parseImportText,
  renderMath,
  validateImportFile,
  type ImportPlan,
  type ImportReport,
  type ValidateResult,
} from '@school/core';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useI18n, type TKey } from '../../i18n';
import {
  Button,
  Card,
  EmptyState,
  Reveal,
  SegmentedControl,
  Text,
  TextField,
  useToast,
} from '../../ui';
import { space } from '../../ui/tokens';
import { CheckRow } from '../curriculum/CheckRow';
import { LoadState } from '../scope/LoadState';
import { ScopeGate, type ReadyScope } from '../scope/ScopeGate';
import { ScopePicker, type ScopeValue } from '../scope/ScopePicker';
import { useResult } from '../scope/useResult';

import {
  buildImportPlan,
  findBankMatches,
  importerReady,
  loadChapterContents,
  newId,
  runImport,
  type ChapterContents,
  type ImportErrorKind,
} from './api';
import { BatchesPanel } from './BatchesPanel';
import { DropZone } from './DropZone';
import { MATH_AVAILABLE, loadMathRender } from './mathRender';
import type { PickedFile } from './pickFile';
import { ReportView } from './ReportView';

type Section = 'import' | 'batches';

export function errorKey(e: ImportErrorKind): TKey {
  switch (e) {
    case 'forbidden':
      return 'staff.importer.errors.forbidden';
    case 'network':
      return 'staff.importer.errors.network';
    case 'notConfigured':
      return 'staff.importer.errors.notConfigured';
    case 'retired':
      return 'staff.importer.errors.retired';
    case 'mismatch':
      return 'staff.importer.errors.mismatch';
    case 'reason':
      return 'staff.importer.errors.reason';
    default:
      return 'staff.importer.errors.unknown';
  }
}

export function ImporterScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const [section, setSection] = useState<Section>('import');
  const ready = useResult('importer-ready', importerReady);
  const live = ready.state?.status === 'ready' ? ready.state.data : null;
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
      <Reveal index={0} style={styles.head}>
        <Text variant="caption" tone="primary" style={styles.kicker}>
          {t('staff.importer.kicker')}
        </Text>
        <Text variant="title" accessibilityRole="header">
          {t('staff.importer.title')}
        </Text>
        <Text tone="textMuted">{t('staff.importer.subtitle')}</Text>
      </Reveal>
      <LoadState
        state={ready.state}
        title={t('staff.importer.errors.loadError')}
        onRetry={ready.reload}
      />
      {live === false ? (
        <EmptyState
          icon="upload"
          title={t('staff.importer.notReady')}
          body={t('staff.importer.notReadyBody')}
        />
      ) : null}
      {live ? (
        <>
          <Reveal index={1}>
            <SegmentedControl<Section>
              accessibilityLabel={t('staff.importer.tabs.label')}
              segments={[
                { value: 'import', label: t('staff.importer.tabs.import') },
                { value: 'batches', label: t('staff.importer.tabs.batches') },
              ]}
              value={section}
              onChange={setSection}
            />
          </Reveal>
          {section === 'batches' ? (
            <BatchesPanel />
          ) : (
            <ScopeGate>{(scope) => <ImportPane scope={scope} />}</ScopeGate>
          )}
        </>
      ) : null}
    </>
  );
}

type Stage =
  | { k: 'empty' }
  | { k: 'checking' }
  | {
      k: 'checked';
      file: PickedFile;
      result: ValidateResult;
      math: Map<string, string>;
      existing: ChapterContents;
    }
  | { k: 'importing'; done: number; total: number }
  | { k: 'done'; batchId: string; imported: number; report: ImportReport };

function ImportPane({ scope }: { scope: ReadyScope }) {
  const { t } = useI18n();
  const toast = useToast();
  const [sel, setSel] = useState<ScopeValue>({ classId: null, subjectId: null, chapterId: null });
  const [stage, setStage] = useState<Stage>({ k: 'empty' });
  const [skipSimilar, setSkipSimilar] = useState(true);
  // Files normally come from the AI drafting prompt (C1); a teacher who typed
  // the file says so, because the review queue sorts by where an item came from.
  const [byPerson, setByPerson] = useState(false);
  const [note, setNote] = useState('');

  // The exact write, worked out while the report is on screen: the counts the
  // teacher confirms are the rows that will land, and the ids stay the same if
  // a failed import is tried again.
  const plan: ImportPlan | null = useMemo(() => {
    if (stage.k !== 'checked' || !stage.result.file || !sel.chapterId) return null;
    return buildImportPlan({
      file: stage.result.file,
      report: stage.result.report,
      chapterId: sel.chapterId,
      origin: byPerson ? 'human' : 'ai',
      sourceNote: note,
      fileName: stage.file.name,
      skipSimilar,
      existing: stage.existing,
      math: stage.math,
      newId,
    });
  }, [stage, sel.chapterId, byPerson, note, skipSimilar]);

  const reset = useCallback(() => {
    setStage({ k: 'empty' });
    setNote('');
  }, []);

  const onScope = useCallback(
    (v: ScopeValue) => {
      setSel(v);
      reset();
    },
    [reset],
  );

  // ---- the dry run -------------------------------------------------------------
  const check = async (file: PickedFile) => {
    if (!sel.subjectId || !sel.chapterId) return;
    setStage({ k: 'checking' });
    const parsed = parseImportText(file.text);
    if (!parsed.ok) {
      setStage({ k: 'empty' });
      toast(t('staff.importer.errors.notJson'), 'warn');
      return;
    }
    const result = validateImportFile(parsed.value, { bytes: file.bytes });

    // Maths: rendered once per expression, in this browser, before anything is
    // written. Without a renderer a file with maths can't be imported.
    let math = new Map<string, string>();
    if (result.file) {
      const render = await loadMathRender();
      if (render) {
        math = renderMath(result, render).svgs;
      } else if (result.report.counts.mathExpressions > 0 || MATH_AVAILABLE) {
        toast(t('staff.importer.errors.noMath'), 'warn');
      }
    }

    // Duplicates already in this subject's bank.
    if (result.file && result.keys.length) {
      const res = await findBankMatches(sel.subjectId, result.keys);
      if (res.ok) addBankMatches(result, res.data);
      else toast(t(errorKey(res.error)), 'warn');
    }
    // What the chapter already holds, so the confirm step can say "adds to the
    // topic that is already there" instead of promising a second copy of it.
    const contents = await loadChapterContents(sel.chapterId);
    if (!contents.ok) {
      setStage({ k: 'empty' });
      toast(t(errorKey(contents.error)), 'warn');
      return;
    }
    setStage({ k: 'checked', file, result, math, existing: contents.data });
  };

  // ---- the write ---------------------------------------------------------------
  const doImport = async () => {
    if (stage.k !== 'checked' || !plan) return;
    if (!plan.questions.length && !plan.lessons.length) {
      toast(t('staff.importer.nothingToImport'), 'warn');
      return;
    }
    setStage({ k: 'importing', done: 0, total: plan.questions.length });
    const res = await runImport(plan, stage.result.report, (done, total) =>
      setStage({ k: 'importing', done, total }),
    );
    if (!res.ok) {
      toast(t(errorKey(res.error)), 'warn');
      setStage({
        k: 'checked',
        file: stage.file,
        result: stage.result,
        math: stage.math,
        existing: stage.existing,
      });
      return;
    }
    setStage({
      k: 'done',
      batchId: res.data.batchId,
      imported: res.data.imported,
      report: stage.result.report,
    });
    toast(t('staff.importer.imported', { count: res.data.imported }), 'success');
  };

  const chapterReady = Boolean(sel.subjectId && sel.chapterId);

  return (
    <View style={styles.pane}>
      <ScopePicker
        classes={scope.classes}
        value={sel}
        onChange={onScope}
        chapter="pick"
        isStaff={scope.isStaff}
      />
      {!MATH_AVAILABLE ? (
        <Card>
          <Text variant="label">{t('staff.importer.useComputer')}</Text>
          <Text tone="textMuted" variant="bodySm">
            {t('staff.importer.useComputerBody')}
          </Text>
        </Card>
      ) : null}
      {!chapterReady ? (
        <EmptyState
          icon="layers"
          title={t('staff.importer.pickChapter')}
          body={t('staff.importer.pickChapterBody')}
        />
      ) : stage.k === 'done' ? (
        <Card>
          <Text variant="label">{t('staff.importer.doneTitle')}</Text>
          <Text>
            {t('staff.importer.doneBody', {
              count: stage.imported,
              batch: stage.batchId.slice(0, 8),
            })}
          </Text>
          <Text tone="textMuted" variant="bodySm">
            {t('staff.importer.doneNext')}
          </Text>
          <View style={styles.row}>
            <Button title={t('staff.importer.importAnother')} onPress={reset} />
          </View>
        </Card>
      ) : (
        <>
          <DropZone
            busy={stage.k === 'checking' || stage.k === 'importing'}
            fileName={stage.k === 'checked' ? stage.file.name : null}
            onFile={check}
            onError={() => toast(t('staff.importer.errors.readFile'), 'warn')}
          />
          {stage.k === 'checking' ? (
            <Text tone="textMuted">{t('staff.importer.checking')}</Text>
          ) : null}
          {stage.k === 'importing' ? (
            <Text tone="textMuted">
              {t('staff.importer.importing', { done: stage.done, total: stage.total })}
            </Text>
          ) : null}
          {stage.k === 'checked' ? (
            <>
              <ReportView report={stage.result.report} fileName={stage.file.name} />
              <Card>
                <Text variant="label">{t('staff.importer.confirmTitle')}</Text>
                {stage.result.report.counts.similar > 0 ? (
                  <CheckRow
                    label={t('staff.importer.skipSimilar')}
                    detail={t('staff.importer.skipSimilarDetail', {
                      count: stage.result.report.counts.similar,
                    })}
                    checked={skipSimilar}
                    onToggle={() => setSkipSimilar((v) => !v)}
                  />
                ) : null}
                <CheckRow
                  label={t('staff.importer.byPerson')}
                  detail={t('staff.importer.byPersonDetail')}
                  checked={byPerson}
                  onToggle={() => setByPerson((v) => !v)}
                />
                <TextField
                  label={t('staff.importer.note')}
                  value={note}
                  onChangeText={setNote}
                  placeholder={t('staff.importer.notePlaceholder')}
                  maxLength={200}
                />
                <Text tone="textMuted" variant="bodySm">
                  {t('staff.importer.willImport', {
                    questions: plan?.questions.length ?? 0,
                    lessons: plan?.lessons.length ?? 0,
                  })}
                </Text>
                {plan?.reuse.topic ? (
                  <Text tone="textMuted" variant="bodySm">
                    {t('staff.importer.addsToTopic', {
                      concepts: plan.reuse.concepts,
                      lessons: plan.reuse.lessonsSkipped,
                    })}
                  </Text>
                ) : null}
                <View style={styles.row}>
                  <Button title={t('staff.importer.confirm')} onPress={doImport} disabled={!plan} />
                  <Button title={t('staff.importer.cancel')} variant="ghost" onPress={reset} />
                </View>
              </Card>
            </>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  start: { alignSelf: 'flex-start' },
  head: { gap: space.xs },
  kicker: { textTransform: 'uppercase' },
  pane: { gap: space.lg },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
