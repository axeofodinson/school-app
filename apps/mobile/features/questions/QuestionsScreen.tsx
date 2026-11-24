import {
  buildQuestion,
  draftFromQuestion,
  emptyDraft,
  isAuthorable,
  questionLabel,
  type QuestionDraft,
} from '@school/core';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useI18n } from '../../i18n';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ListItem,
  SegmentedControl,
  Text,
  TwoPane,
  useLayout,
  useToast,
} from '../../ui';
import { space } from '../../ui/tokens';
import type { Chapter, Subject } from '../scope/api';
import { ERROR_KEYS, LoadState } from '../scope/LoadState';
import { ScopeGate, type ReadyScope } from '../scope/ScopeGate';
import { ScopePicker, type ScopeValue } from '../scope/ScopePicker';
import { useResult } from '../scope/useResult';
import {
  createQuestion,
  listSubjectQuestions,
  lockedQuestionIds,
  updateQuestion,
  type BankQuestion,
} from './api';
import { QuestionForm } from './QuestionForm';
import { QuestionPreview, useQuestionMeta } from './QuestionPreview';

type Panel =
  | { kind: 'new'; draft: QuestionDraft }
  | { kind: 'edit'; q: BankQuestion; draft: QuestionDraft }
  | { kind: 'view'; q: BankQuestion };

type Who = 'all' | 'mine';

async function loadBank(subjectId: string, chapterId: string) {
  const qs = await listSubjectQuestions(subjectId, chapterId);
  if (!qs.ok) return qs;
  const locked = await lockedQuestionIds(subjectId);
  // Fail closed: if we can't tell which questions are in use, edit none of them.
  return {
    ok: true as const,
    data: {
      questions: qs.data,
      locked: locked.ok ? locked.data : new Set(qs.data.map((q) => q.id)),
    },
  };
}

function Bank({ scope }: { scope: ReadyScope }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const { twoPane } = useLayout();
  const meta = useQuestionMeta();
  const [sel, setSel] = useState<ScopeValue>({ classId: null, subjectId: null, chapterId: null });
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [who, setWho] = useState<Who>('all');
  const [panel, setPanel] = useState<Panel | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bank = useResult(
    sel.subjectId && sel.chapterId ? `q:${sel.subjectId}:${sel.chapterId}` : null,
    () => loadBank(sel.subjectId!, sel.chapterId!),
  );

  const onScope = useCallback((v: ScopeValue) => {
    setSel(v);
    setPanel((p) => (p?.kind === 'new' ? p : null));
    setError(null);
  }, []);

  const cls = scope.classes.find((c) => c.id === sel.classId);
  const subject = subjects.find((s) => s.id === sel.subjectId);
  const chapter = chapters.find((c) => c.id === sel.chapterId);
  const context = (chapterTitle?: string) =>
    t('teacher.questions.create.chapterContext', {
      chapter: chapterTitle ?? chapter?.title ?? '',
      subject: subject?.name ?? '',
      class: cls?.name ?? '',
    });

  const data = bank.state?.status === 'ready' ? bank.state.data : null;
  const visible = useMemo(
    () =>
      (data?.questions ?? []).filter(
        (q) => q.chapter_id === sel.chapterId && (who === 'all' || q.created_by === scope.userId),
      ),
    [data, sel.chapterId, who, scope.userId],
  );

  const canEdit = (q: BankQuestion) =>
    isAuthorable(q.type) &&
    !data?.locked.has(q.id) &&
    (scope.isStaff || q.created_by === scope.userId);

  const open = (q: BankQuestion) => {
    setError(null);
    const d = canEdit(q) ? draftFromQuestion(q) : null;
    setPanel(d ? { kind: 'edit', q, draft: d } : { kind: 'view', q });
  };

  const copy = (q: BankQuestion) => {
    const d = draftFromQuestion(q);
    if (d) setPanel({ kind: 'new', draft: d });
  };

  const save = async () => {
    if (!panel || panel.kind === 'view') return;
    const built = buildQuestion(panel.draft);
    if ('error' in built) return setError(t(`teacher.questions.errors.${built.error}`));
    if (panel.kind === 'new' && !sel.chapterId) {
      return setError(t('teacher.questions.errors.chapterRequired'));
    }
    setSaving(true);
    setError(null);
    const input = {
      type: panel.draft.type,
      cognitive_level: panel.draft.cognitive!,
      body: built.body,
      answer: built.answer,
      default_marks: built.marks,
    };
    const res =
      panel.kind === 'new'
        ? await createQuestion(sel.chapterId!, scope.userId, input)
        : await updateQuestion(panel.q.id, input);
    setSaving(false);
    if (!res.ok) return setError(t(ERROR_KEYS[res.error]));
    bank.reload();
    if (panel.kind === 'new') {
      toast(t('teacher.questions.create.success'), 'success');
      // Keep type + level so the next question in this chapter is quicker.
      setPanel({
        kind: 'new',
        draft: { ...emptyDraft(panel.draft.type), cognitive: panel.draft.cognitive },
      });
    } else {
      toast(t('staff.questions.updated'), 'success');
      setPanel(null);
    }
  };

  const list = (
    <View style={styles.pane}>
      <ScopePicker
        classes={scope.classes}
        value={sel}
        onChange={onScope}
        chapter="pick"
        isStaff={scope.isStaff}
        onSubjects={setSubjects}
        onChapters={setChapters}
      />
      {sel.chapterId ? (
        <>
          <View style={styles.toolbar}>
            <SegmentedControl<Who>
              accessibilityLabel={t('staff.questions.show')}
              segments={[
                { value: 'all', label: t('staff.questions.showAll') },
                { value: 'mine', label: t('teacher.questions.tabs.mine') },
              ]}
              value={who}
              onChange={setWho}
            />
            <Button
              title={t('teacher.questions.tabs.create')}
              icon="pencil"
              size="sm"
              onPress={() => {
                setError(null);
                setPanel({ kind: 'new', draft: emptyDraft() });
              }}
            />
          </View>
          <LoadState
            state={bank.state}
            title={t('teacher.questions.mine.loadError')}
            onRetry={bank.reload}
          />
          {data && visible.length === 0 ? (
            <EmptyState
              icon="pencil"
              title={t(
                who === 'mine' ? 'teacher.questions.mine.empty' : 'staff.questions.emptyChapter',
              )}
              body={t('staff.questions.emptyBody')}
            />
          ) : null}
          {data && visible.length > 0 ? (
            <Text variant="bodySm" tone="textMuted">
              {t('teacher.questions.mine.count', { count: visible.length })}
            </Text>
          ) : null}
          {visible.map((q) => {
            const m = meta(q);
            const locked = data?.locked.has(q.id);
            return (
              <ListItem
                key={q.id}
                title={questionLabel(q.body, locale) || '—'}
                subtitle={`${m.type} · ${m.level}`}
                trailing={
                  locked ? (
                    <Badge label={t('staff.questions.inUse')} icon="lock" />
                  ) : q.created_by === scope.userId ? (
                    <Badge label={t('staff.questions.yours')} tone="primary" />
                  ) : undefined
                }
                onPress={() => open(q)}
              />
            );
          })}
        </>
      ) : null}
    </View>
  );

  let detail: React.ReactNode = twoPane ? (
    <EmptyState
      icon="pencil"
      title={t('staff.questions.pickOne')}
      body={t('staff.questions.pickOneBody')}
    />
  ) : null;
  if (panel) {
    const back = twoPane ? null : (
      <Button
        title={t('staff.questions.backToList')}
        icon="back"
        variant="ghost"
        size="sm"
        onPress={() => setPanel(null)}
        style={styles.start}
      />
    );
    detail =
      panel.kind === 'view' ? (
        <View style={styles.pane}>
          {back}
          <Card>
            <QuestionPreview question={panel.q} />
          </Card>
          <Text tone="textMuted">
            {t(
              !isAuthorable(panel.q.type)
                ? 'staff.questions.readOnlyType'
                : data?.locked.has(panel.q.id)
                  ? 'staff.questions.readOnlyInUse'
                  : 'staff.questions.readOnlyOthers',
            )}
          </Text>
          {isAuthorable(panel.q.type) ? (
            <Button
              title={t('staff.questions.copy')}
              variant="secondary"
              onPress={() => copy(panel.q)}
              style={styles.start}
            />
          ) : null}
        </View>
      ) : (
        <View style={styles.pane}>
          {back}
          <Text variant="heading" accessibilityRole="header">
            {t(
              panel.kind === 'new'
                ? 'teacher.questions.create.heading'
                : 'teacher.questions.create.editHeading',
            )}
          </Text>
          <QuestionForm
            draft={panel.draft}
            onChange={(draft) => setPanel({ ...panel, draft })}
            onSave={save}
            onCancel={() => setPanel(null)}
            context={context(panel.kind === 'edit' ? panel.q.chapterTitle : undefined)}
            saving={saving}
            error={error}
            editing={panel.kind === 'edit'}
          />
        </View>
      );
  }

  return <TwoPane list={list} detail={detail} showDetail={panel !== null} style={styles.two} />;
}

/** Teacher/admin question bank: browse by chapter, write, edit own, copy others'. */
export function QuestionsScreen() {
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
        {t('teacher.questions.title')}
      </Text>
      <Text tone="textMuted">{t('teacher.questions.subtitle')}</Text>
      <ScopeGate>{(scope) => <Bank scope={scope} />}</ScopeGate>
    </>
  );
}

const styles = StyleSheet.create({
  pane: { gap: space.md, paddingHorizontal: space.xs, paddingBottom: space.lg },
  toolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  start: { alignSelf: 'flex-start' },
  two: { gap: space.lg },
});
