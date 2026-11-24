import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { useI18n } from '../../i18n';
import { EmptyState } from '../../ui';
import { space } from '../../ui/tokens';
import { listChapters, listSubjects, type Chapter, type ScopeClass, type Subject } from './api';
import { ChipPicker } from './ChipPicker';
import { LoadState } from './LoadState';
import { useResult } from './useResult';

export const ALL = '__all';

export interface ScopeValue {
  classId: string | null;
  subjectId: string | null;
  /** A chapter id, ALL (filter mode), or null. */
  chapterId: string | null;
}

/**
 * Class → subject (→ chapter) chips. Picks the first option when the current one
 * isn't in the list, and shows the empty state that names the missing setup
 * step (no subjects, no chapters). `chapter`: 'pick' = one chapter required,
 * 'filter' = an "All chapters" chip first, 'none' = no chapter row.
 */
export function ScopePicker({
  classes,
  value,
  onChange,
  chapter,
  isStaff,
  onSubjects,
  onChapters,
}: {
  classes: readonly ScopeClass[];
  value: ScopeValue;
  onChange: (v: ScopeValue) => void;
  chapter: 'pick' | 'filter' | 'none';
  isStaff: boolean;
  onSubjects?: (s: Subject[]) => void;
  onChapters?: (c: Chapter[]) => void;
}) {
  const { t } = useI18n();
  const cls = classes.find((c) => c.id === value.classId) ?? null;
  const subjects = useResult(cls ? `s:${cls.id}:${cls.subjectIds?.join() ?? '*'}` : null, () =>
    listSubjects(cls!),
  );
  const chapters = useResult(
    chapter !== 'none' && value.subjectId ? `c:${value.subjectId}` : null,
    () => listChapters(value.subjectId!),
  );

  // Keep the selection valid as lists load.
  useEffect(() => {
    if (!value.classId || !classes.some((c) => c.id === value.classId)) {
      const first = classes[0]?.id ?? null;
      if (first !== value.classId) onChange({ classId: first, subjectId: null, chapterId: null });
    }
  }, [classes, value.classId, onChange]);

  const subjectList = subjects.state?.status === 'ready' ? subjects.state.data : null;
  useEffect(() => {
    if (!subjectList) return;
    onSubjects?.(subjectList);
    if (!subjectList.some((s) => s.id === value.subjectId)) {
      onChange({ ...value, subjectId: subjectList[0]?.id ?? null, chapterId: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- react to a new list only
  }, [subjectList]);

  const chapterList = chapters.state?.status === 'ready' ? chapters.state.data : null;
  useEffect(() => {
    if (!chapterList) return;
    onChapters?.(chapterList);
    const valid =
      (chapter === 'filter' && value.chapterId === ALL) ||
      chapterList.some((c) => c.id === value.chapterId);
    if (!valid) {
      onChange({
        ...value,
        chapterId: chapter === 'filter' ? ALL : (chapterList[0]?.id ?? null),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- react to a new list only
  }, [chapterList]);

  return (
    <View style={styles.wrap}>
      <ChipPicker
        label={t('staff.scope.class')}
        chips={classes.map((c) => ({ value: c.id, label: c.name }))}
        value={value.classId}
        onChange={(classId) => onChange({ classId, subjectId: null, chapterId: null })}
      />
      <LoadState
        state={subjects.state}
        title={t('staff.scope.subjectsError')}
        onRetry={subjects.reload}
        lines={1}
      />
      {subjectList && subjectList.length === 0 ? (
        <EmptyState
          icon="book"
          title={t('staff.scope.noSubjects')}
          body={t(isStaff ? 'staff.scope.noSubjectsStaff' : 'staff.scope.noSubjectsTeacher')}
        />
      ) : null}
      {subjectList && subjectList.length > 0 ? (
        <ChipPicker
          label={t('staff.scope.subject')}
          chips={subjectList.map((s) => ({ value: s.id, label: s.name }))}
          value={value.subjectId}
          onChange={(subjectId) => onChange({ ...value, subjectId, chapterId: null })}
        />
      ) : null}
      {chapter !== 'none' && value.subjectId ? (
        <>
          <LoadState
            state={chapters.state}
            title={t('staff.scope.chaptersError')}
            onRetry={chapters.reload}
            lines={1}
          />
          {chapterList && chapterList.length === 0 ? (
            <EmptyState
              icon="book"
              title={t('staff.scope.noChapters')}
              body={t(isStaff ? 'staff.scope.noChaptersStaff' : 'staff.scope.noChaptersTeacher')}
            />
          ) : null}
          {chapterList && chapterList.length > 0 ? (
            <ChipPicker
              label={t('staff.scope.chapter')}
              chips={[
                ...(chapter === 'filter'
                  ? [{ value: ALL, label: t('staff.scope.allChapters') }]
                  : []),
                ...chapterList.map((c) => ({ value: c.id, label: c.title })),
              ]}
              value={value.chapterId}
              onChange={(chapterId) => onChange({ ...value, chapterId })}
            />
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { gap: space.md } });
