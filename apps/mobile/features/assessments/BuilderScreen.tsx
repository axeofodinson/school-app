import {
  buildAssessment,
  emptyAssessment,
  isAssessmentType,
  questionLabel,
  questionsLocked,
  statusActions,
  statusAfter,
  planUpload,
  togglePick,
  type AssessmentDraft,
  type AssessmentStatus,
  type StatusAction,
} from '@school/core';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useI18n, type TKey } from '../../i18n';
import { Badge, Button, Card, EmptyState, Text, useToast } from '../../ui';
import { space } from '../../ui/tokens';
import { uploadWorksheet } from '../files/api';
import type { PickedWorksheet } from '../files/pick';
import { WorksheetCard } from '../files/WorksheetCard';
import { listSubjectQuestions } from '../questions/api';
import { listChapters } from '../scope/api';
import { ChipPicker } from '../scope/ChipPicker';
import { ERROR_KEYS, LoadState } from '../scope/LoadState';
import { ScopeGate, type ReadyScope } from '../scope/ScopeGate';
import { ALL, ScopePicker, type ScopeValue } from '../scope/ScopePicker';
import { useResult } from '../scope/useResult';
import { useSaveShortcut } from '../scope/useSaveShortcut';
import {
  createAssessment,
  getAssessment,
  setStatus,
  updateAssessment,
  type AssessmentDetail,
} from './api';
import { DetailsForm } from './DetailsForm';
import { PickedList } from './PickedList';
import { QuestionPicker } from './QuestionPicker';
import { STATUS_TONE } from './StatusBadge';

const ACTION_KEYS: Record<StatusAction, TKey> = {
  publish: 'staff.assessments.publish',
  close: 'staff.assessments.close',
  reopen: 'staff.assessments.reopen',
};
const ACTION_HINTS: Record<StatusAction, TKey> = {
  publish: 'staff.assessments.publishHint',
  close: 'staff.assessments.closeHint',
  reopen: 'staff.assessments.reopenHint',
};

type FieldError = { field: 'title' | 'weightage' | 'scheduledOn'; message: string } | null;

function draftFrom(a: AssessmentDetail | null): AssessmentDraft {
  if (!a) return emptyAssessment();
  return {
    title: a.title,
    type: isAssessmentType(a.type) ? a.type : 'test',
    weightage: a.weightage ? String(a.weightage) : '',
    scheduledOn: a.scheduled_on ?? '',
    picks: a.items.map((i) => ({ questionId: i.question_id, marks: String(i.marks) })),
    fileMarks: a.type === 'file' && a.total_marks != null ? String(a.total_marks) : '',
  };
}

/** Chapter filter for an existing assessment (its class + subject are fixed). */
function ChapterFilter({
  subjectId,
  value,
  onChange,
}: {
  subjectId: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const { t } = useI18n();
  const chapters = useResult(`c:${subjectId}`, () => listChapters(subjectId));
  if (chapters.state?.status !== 'ready') {
    return (
      <LoadState
        state={chapters.state}
        title={t('staff.scope.chaptersError')}
        onRetry={chapters.reload}
        lines={1}
      />
    );
  }
  return (
    <ChipPicker
      label={t('staff.scope.chapter')}
      chips={[
        { value: ALL, label: t('staff.scope.allChapters') },
        ...chapters.state.data.map((c) => ({ value: c.id, label: c.title })),
      ]}
      value={value}
      onChange={onChange}
    />
  );
}

function Builder({
  scope,
  existing,
  onSaved,
}: {
  scope: ReadyScope;
  existing: AssessmentDetail | null;
  onSaved: () => void;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const [sel, setSel] = useState<ScopeValue>({
    classId: existing?.class_id ?? null,
    subjectId: existing?.subject_id ?? null,
    chapterId: ALL,
  });
  const [draft, setDraft] = useState<AssessmentDraft>(() => draftFrom(existing));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<FieldError>(null);
  const [badMarksId, setBadMarksId] = useState<string | null>(null);
  const [picked, setPicked] = useState<PickedWorksheet | null>(null);
  const [marksError, setMarksError] = useState<string | undefined>(undefined);

  // Any edit clears the last save's errors: they described the old draft.
  const edit = (fn: (d: AssessmentDraft) => AssessmentDraft) => {
    setDraft(fn);
    setError(null);
    setFieldError(null);
    setBadMarksId(null);
    setMarksError(undefined);
  };

  const status: AssessmentStatus = existing?.status ?? 'draft';
  const locked = questionsLocked(status);
  const isFile = draft.type === 'file';
  const subjectId = sel.subjectId;
  const bank = useResult(subjectId ? `q:${subjectId}` : null, () =>
    listSubjectQuestions(subjectId!),
  );
  const questions = useMemo(
    () => (bank.state?.status === 'ready' ? bank.state.data : []),
    [bank.state],
  );
  const labels = useMemo(
    () => new Map(questions.map((q) => [q.id, questionLabel(q.body, locale)])),
    [questions, locale],
  );
  const labelFor = (id: string) => labels.get(id) || t('staff.assessments.unknownQuestion');

  const onScope = useCallback(
    (v: ScopeValue) => {
      // A new subject has a different bank: the picked list no longer applies.
      if (sel.subjectId && v.subjectId !== sel.subjectId) setDraft((d) => ({ ...d, picks: [] }));
      setSel(v);
    },
    [sel.subjectId],
  );

  /** Upload the chosen worksheet file (file type only). False = it failed (error shown). */
  const uploadPicked = async (assessmentId: string): Promise<boolean> => {
    if (!isFile || !picked) return true;
    const plan = planUpload(picked);
    if ('error' in plan) return false;
    const up = await uploadWorksheet(assessmentId, picked, plan);
    if (!up.ok) {
      setError(
        t(
          up.error === 'forbidden'
            ? 'staff.errors.forbidden'
            : 'console.assessments.errors.uploadFailed',
        ),
      );
      return false;
    }
    setPicked(null);
    return true;
  };

  const save = async (target: AssessmentStatus) => {
    if (saving) return;
    setError(null);
    setFieldError(null);
    setBadMarksId(null);
    setMarksError(undefined);
    const built = buildAssessment(draft, target, Boolean(existing?.file_path || picked));
    if ('error' in built) {
      const message = t(`console.assessments.errors.${built.error}`);
      if (built.error === 'fileMarksInvalid') return setMarksError(message);
      if (built.error === 'titleRequired') return setFieldError({ field: 'title', message });
      if (built.error === 'weightageInvalid') return setFieldError({ field: 'weightage', message });
      if (built.error === 'dateInvalid') return setFieldError({ field: 'scheduledOn', message });
      if (built.error === 'marksInvalid') setBadMarksId(built.questionId ?? null);
      return setError(message);
    }
    if (!existing && (!sel.classId || !sel.subjectId)) {
      return setError(t('console.assessments.errors.subjectRequired'));
    }

    setSaving(true);
    if (!existing) {
      const res = await createAssessment({
        yearId: scope.year.id,
        classId: sel.classId!,
        subjectId: sel.subjectId!,
        userId: scope.userId,
        fields: built.fields,
        items: built.items,
        // A worksheet publishes only once its file is up (below).
        publish: target === 'published' && !isFile,
      });
      if (res.ok && isFile) {
        const uploaded = await uploadPicked(res.data);
        const pub = uploaded && target === 'published' ? await setStatus(res.data, target) : null;
        setSaving(false);
        if (!uploaded || (pub && !pub.ok)) {
          toast(t('staff.assessments.savedAsDraft'), 'warn');
          router.replace(`/assessments/${res.data}`);
          return;
        }
      } else {
        setSaving(false);
      }
      if (!res.ok) {
        if (res.draftId) {
          toast(t('staff.assessments.savedAsDraft'), 'warn');
          router.replace(`/assessments/${res.draftId}`);
          return;
        }
        return setError(t(ERROR_KEYS[res.error]));
      }
      toast(
        t(
          target === 'published'
            ? 'staff.assessments.published'
            : 'console.assessments.build.success',
          {
            title: built.fields.title,
          },
        ),
        'success',
      );
      router.replace(`/assessments/${res.data}`);
      return;
    }

    const { title, weightage, scheduled_on } = built.fields;
    // The file goes up first, so a publish below never shows students an empty worksheet.
    if (!(await uploadPicked(existing.id))) {
      setSaving(false);
      return;
    }
    const upd = await updateAssessment(
      existing.id,
      locked ? { title, weightage, scheduled_on } : built.fields,
      locked ? null : { existing: existing.items.map((i) => i.question_id), wanted: built.items },
    );
    if (upd.ok && target !== status) {
      const st = await setStatus(existing.id, target);
      if (!st.ok) {
        setSaving(false);
        return setError(t(ERROR_KEYS[st.error]));
      }
    }
    setSaving(false);
    if (!upd.ok) return setError(t(ERROR_KEYS[upd.error]));
    toast(t('console.assessments.build.success', { title }), 'success');
    onSaved();
  };

  useSaveShortcut(() => save(status));
  const scopeReady = Boolean(sel.subjectId);
  const cls = scope.classes.find((c) => c.id === sel.classId);

  return (
    <View style={styles.wrap}>
      {existing ? (
        <View style={styles.row}>
          <Badge label={t(`console.assessments.statuses.${status}`)} tone={STATUS_TONE[status]} />
          <Text tone="textMuted">
            {t('console.assessments.build.context', {
              subject: existing.subjectName,
              class: existing.className || cls?.name || '',
            })}
          </Text>
          {status !== 'draft' ? (
            <Button
              title={t('staff.grading.gradeThis')}
              icon="pencil"
              variant="secondary"
              size="sm"
              onPress={() => router.push(`/grading?assessment=${existing.id}`)}
            />
          ) : null}
        </View>
      ) : null}

      <Card>
        <View style={styles.section}>
          <Text variant="heading">{t('staff.assessments.step.details')}</Text>
          <DetailsForm
            value={draft}
            onChange={(d) => edit((prev) => ({ ...prev, ...d }))}
            onSubmit={() => save(status)}
            typeLocked={locked}
            fieldError={fieldError}
          />
        </View>
      </Card>

      {isFile ? (
        <Card>
          <View style={styles.section}>
            <Text variant="heading">{t('staff.files.step')}</Text>
            {existing ? null : (
              <ScopePicker
                classes={scope.classes}
                value={sel}
                onChange={onScope}
                chapter="none"
                isStaff={scope.isStaff}
              />
            )}
            <WorksheetCard
              current={
                existing
                  ? { path: existing.file_path, name: existing.file_name, mime: existing.file_mime }
                  : null
              }
              picked={picked}
              onPick={(p) => {
                setPicked(p);
                setError(null);
              }}
              fileMarks={draft.fileMarks ?? ''}
              onFileMarks={(fileMarks) => edit((d) => ({ ...d, fileMarks }))}
              marksLocked={locked}
              marksError={marksError}
              onSubmit={() => save(status)}
            />
          </View>
        </Card>
      ) : null}

      {isFile ? null : (
        <>
          <Card>
            <View style={styles.section}>
              <Text variant="heading">{t('staff.assessments.step.questions')}</Text>
              {locked ? (
                <Text tone="textMuted">{t('staff.assessments.lockedNote')}</Text>
              ) : existing ? (
                <ChapterFilter
                  subjectId={existing.subject_id}
                  value={sel.chapterId ?? ALL}
                  onChange={(chapterId) => setSel((s) => ({ ...s, chapterId }))}
                />
              ) : (
                <ScopePicker
                  classes={scope.classes}
                  value={sel}
                  onChange={onScope}
                  chapter="filter"
                  isStaff={scope.isStaff}
                />
              )}
              {scopeReady ? (
                <LoadState
                  state={bank.state}
                  title={t('console.assessments.build.loadQuestionsError')}
                  onRetry={bank.reload}
                />
              ) : null}
              {!locked && scopeReady && bank.state?.status === 'ready' ? (
                <QuestionPicker
                  questions={questions}
                  chapterId={sel.chapterId}
                  picks={draft.picks}
                  onToggle={(q) =>
                    edit((d) => ({ ...d, picks: togglePick(d.picks, q.id, q.default_marks) }))
                  }
                  isStaff={scope.isStaff}
                />
              ) : null}
            </View>
          </Card>

          <Card>
            <View style={styles.section}>
              <Text variant="heading">{t('staff.assessments.step.paper')}</Text>
              <PickedList
                picks={draft.picks}
                labelFor={labelFor}
                onChange={(picks) => edit((d) => ({ ...d, picks }))}
                onSubmit={() => save(status)}
                locked={locked}
                badMarksId={badMarksId}
              />
            </View>
          </Card>
        </>
      )}

      {error ? (
        <Text tone="onWrongSoft" accessibilityRole="alert" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <View style={styles.row}>
        <Button
          title={t(
            existing ? 'console.assessments.build.updateSubmit' : 'staff.assessments.saveDraft',
          )}
          variant={status === 'draft' ? 'secondary' : 'primary'}
          icon="check"
          loading={saving}
          disabled={saving}
          accessibilityHint={t('staff.saveShortcut')}
          onPress={() => save(status)}
        />
        {statusActions(status).map((a) => (
          <Button
            key={a}
            title={t(ACTION_KEYS[a])}
            variant={a === 'close' ? 'danger' : 'primary'}
            disabled={saving}
            accessibilityHint={t(
              isFile && a === 'publish' ? 'staff.files.publishHint' : ACTION_HINTS[a],
            )}
            onPress={() => save(statusAfter(a))}
          />
        ))}
      </View>
      <Text variant="caption" tone="textMuted">
        {t(
          status !== 'draft'
            ? 'staff.saveShortcut'
            : isFile
              ? 'staff.files.publishHint'
              : 'staff.assessments.publishHint',
        )}
      </Text>
    </View>
  );
}

function EditLoader({ id, scope }: { id: string; scope: ReadyScope }) {
  const { t } = useI18n();
  const res = useResult(`a:${id}`, () => getAssessment(id));
  if (res.state?.status !== 'ready') {
    return (
      <LoadState
        state={res.state}
        title={t('console.assessments.list.loadError')}
        onRetry={res.reload}
      />
    );
  }
  const a = res.state.data;
  if (!a) {
    return (
      <EmptyState
        icon="search"
        title={t('staff.assessments.notFound')}
        body={t('staff.assessments.notFoundBody')}
      />
    );
  }
  // Remount on reload so the form starts from the saved row.
  return (
    <Builder
      key={`${a.id}:${a.status}:${a.items.length}:${a.title}:${a.file_path ?? ''}`}
      scope={scope}
      existing={a}
      onSaved={res.reload}
    />
  );
}

/** Build a new assessment (`id` = 'new') or edit/publish/close one. */
export function BuilderScreen({ id }: { id: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const isNew = id === 'new';
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
        {t(isNew ? 'console.assessments.build.heading' : 'console.assessments.build.editHeading')}
      </Text>
      <ScopeGate>
        {(scope) =>
          isNew ? (
            <Builder scope={scope} existing={null} onSaved={() => undefined} />
          ) : (
            <EditLoader id={id} scope={scope} />
          )
        }
      </ScopeGate>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.lg },
  section: { gap: space.md },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
  start: { alignSelf: 'flex-start' },
});
