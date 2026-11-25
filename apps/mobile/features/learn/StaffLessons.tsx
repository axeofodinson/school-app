// Teacher / admin: every lesson of a subject (drafts included) and the preview
// of one, exactly as a student will see it, with the decision bar: Approve,
// Send back (reason required) or Retire (reason required). Decisions go through
// review_lesson() (db/033); RLS + the RPC decide who may (a teacher: subjects
// they teach this year). Online only, like the review queue.
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useI18n, type TKey } from '../../i18n';
import {
  Badge,
  Button,
  EmptyState,
  Icon,
  Screen,
  Sheet,
  Text,
  TextField,
  useTheme,
  useToast,
  type BadgeTone,
} from '../../ui';
import { PressableSticker } from '../../ui/Sticker';
import { hueForSubject, radiusFor, space } from '../../ui/tokens';
import { ChipPicker } from '../scope/ChipPicker';
import { LoadState } from '../scope/LoadState';
import { ScopeGate } from '../scope/ScopeGate';
import { ALL, ScopePicker, type ScopeValue } from '../scope/ScopePicker';
import { useResult } from '../scope/useResult';
import {
  loadSubjectLessons,
  reviewLesson,
  type ContentStatus,
  type LessonData,
  type ReviewDecision,
  type ReviewError,
  type StaffLessonRow,
} from './api';
import { LessonReader } from './LessonReader';
import { LessonStates } from './TopicScreen';
import { useLesson } from './useLesson';

const STATUS_TONE: Record<ContentStatus, BadgeTone> = {
  draft: 'weak',
  reviewed: 'learning',
  approved: 'correct',
  retired: 'neutral',
};

export function StatusBadge({ status }: { status: ContentStatus }) {
  const { t } = useI18n();
  return (
    <Badge
      label={t(`staff.lessons.status.${status}`)}
      tone={STATUS_TONE[status]}
      icon={status === 'approved' ? 'checkCircle' : status === 'retired' ? 'archive' : 'pencil'}
    />
  );
}

// ───────────────────────────── the list ─────────────────────────────

function LessonRow({ row, onPress }: { row: StaffLessonRow; onPress: () => void }) {
  const { t, locale } = useI18n();
  const { colours, presentation } = useTheme();
  const title = (locale === 'ur' ? row.topicTitleUr : null) || row.topicTitle;
  return (
    <PressableSticker
      onPress={onPress}
      radius={radiusFor('md', presentation)}
      depth="flat"
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${t(`staff.lessons.status.${row.status}`)}`}
      faceStyle={(pressed) => [
        styles.row,
        {
          backgroundColor: pressed ? colours.surfaceAlt : colours.surface,
          borderColor: colours.border,
        },
      ]}
    >
      <Icon name={row.kind === 'alternative' ? 'lightbulb' : 'book'} size={20} tone="textMuted" />
      <View style={styles.flex}>
        <Text variant="label" numberOfLines={2}>
          {title}
        </Text>
        <Text variant="caption" tone="textMuted">
          {[
            t(row.kind === 'alternative' ? 'staff.lessons.alternative' : 'staff.lessons.lesson'),
            t('staff.lessons.version', { v: row.currentVersion }),
            row.origin !== 'human' ? t('staff.lessons.aiDraft') : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </View>
      <StatusBadge status={row.status} />
      <Icon name="chevronEnd" size={18} tone="textMuted" />
    </PressableSticker>
  );
}

const FILTERS = ['all', 'draft', 'approved', 'retired'] as const;
type Filter = (typeof FILTERS)[number];

export function StaffLessonsScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const [scope, setScope] = useState<ScopeValue>({
    classId: null,
    subjectId: null,
    chapterId: ALL,
  });
  const [filter, setFilter] = useState<Filter>('draft');
  const lessons = useResult(scope.subjectId ? `l:${scope.subjectId}` : null, () =>
    loadSubjectLessons(scope.subjectId!),
  );
  const data = lessons.state?.status === 'ready' ? lessons.state.data : null;
  const rows =
    data && data !== 'notReady'
      ? data.filter(
          (r) =>
            (scope.chapterId === ALL || !scope.chapterId || r.chapterId === scope.chapterId) &&
            (filter === 'all' ||
              (filter === 'draft'
                ? r.status === 'draft' || r.status === 'reviewed'
                : r.status === filter)),
        )
      : [];
  return (
    <View style={styles.page}>
      <View style={styles.titleBlock}>
        <Text variant="caption" tone="textMuted">
          {t('staff.lessons.kicker')}
        </Text>
        <Text variant="title" accessibilityRole="header">
          {t('staff.lessons.title')}
        </Text>
        <Text tone="textMuted">{t('staff.lessons.subtitle')}</Text>
      </View>
      <ScopeGate>
        {(s) => (
          <View style={styles.page}>
            <ScopePicker
              classes={s.classes}
              value={scope}
              onChange={setScope}
              chapter="filter"
              isStaff={s.isStaff}
            />
            <ChipPicker
              label={t('staff.lessons.show')}
              chips={FILTERS.map((f) => ({ value: f, label: t(`staff.lessons.filter.${f}`) }))}
              value={filter}
              onChange={setFilter}
            />
            <LoadState
              state={lessons.state}
              title={t('staff.lessons.loadError')}
              onRetry={lessons.reload}
            />
            {data === 'notReady' ? (
              <EmptyState
                icon="clock"
                title={t('staff.lessons.notReady')}
                body={t('staff.lessons.notReadyBody')}
              />
            ) : null}
            {data && data !== 'notReady' && rows.length === 0 ? (
              <EmptyState
                icon="book"
                title={t(data.length ? 'staff.lessons.noneInFilter' : 'staff.lessons.none')}
                body={t(data.length ? 'staff.lessons.noneInFilterBody' : 'staff.lessons.noneBody')}
                action={
                  data.length ? null : (
                    <Button
                      title={t('staff.lessons.openImporter')}
                      variant="secondary"
                      icon="upload"
                      onPress={() => router.push('/importer')}
                    />
                  )
                }
              />
            ) : null}
            <View style={styles.list}>
              {rows.map((r, i) => {
                const head = i === 0 || rows[i - 1]!.chapterId !== r.chapterId;
                return (
                  <View key={r.contentId} style={styles.list}>
                    {head ? (
                      <Text variant="label" tone="textMuted" style={styles.chapter}>
                        {r.chapterTitle}
                      </Text>
                    ) : null}
                    <LessonRow
                      row={r}
                      onPress={() => router.push(`/lessons/${r.contentId}` as Href)}
                    />
                  </View>
                );
              })}
            </View>
          </View>
        )}
      </ScopeGate>
    </View>
  );
}

// ───────────────────────────── preview + decisions ─────────────────────────────

const ERRORS: Record<ReviewError, TKey> = {
  stale: 'staff.lessons.errors.stale',
  reasonRequired: 'staff.lessons.errors.reason',
  retired: 'staff.lessons.errors.retired',
  notReady: 'staff.lessons.errors.notReady',
  forbidden: 'staff.lessons.errors.forbidden',
  network: 'staff.errors.network',
  notConfigured: 'auth.errors.notConfigured',
  unknown: 'staff.errors.unknown',
};

function ReviewBar({ data, onDone }: { data: LessonData; onDone: () => void }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const { colours } = useTheme();
  const lesson = data.lesson!;
  const [busy, setBusy] = useState<ReviewDecision | null>(null);
  const [ask, setAsk] = useState<'request_changes' | 'reject' | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<ReviewError | null>(null);

  const decide = async (d: ReviewDecision, notes = '') => {
    setBusy(d);
    setError(null);
    const r = await reviewLesson(lesson.contentId, lesson.currentVersion, d, notes, null);
    setBusy(null);
    if (!r.ok) {
      setError(r.error);
      if (r.error === 'stale') onDone();
      return;
    }
    setAsk(null);
    setNote('');
    toast(t(`staff.lessons.done.${d}`), d === 'approve' ? 'success' : 'info');
    onDone();
  };
  const approvedNow = lesson.status === 'approved';
  const concept = (id: string | null) => data.concepts.find((c) => c.id === id);
  return (
    <View style={[styles.bar, { backgroundColor: colours.surface, borderColor: colours.border }]}>
      <View style={styles.barRow}>
        <Badge label={t('staff.lessons.preview')} tone="primary" icon="eye" />
        <StatusBadge status={lesson.status} />
        <Text variant="caption" tone="textMuted">
          {[
            t('staff.lessons.version', { v: lesson.currentVersion }),
            lesson.origin !== 'human' ? t('staff.lessons.aiDraft') : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
        <View style={styles.flex} />
        {lesson.status !== 'retired' ? (
          <>
            <Button
              title={t('staff.lessons.sendBack')}
              variant="secondary"
              size="sm"
              icon="pencil"
              onPress={() => setAsk('request_changes')}
            />
            <Button
              title={t('staff.lessons.retire')}
              variant="ghost"
              size="sm"
              icon="archive"
              onPress={() => setAsk('reject')}
            />
            <Button
              title={t(approvedNow ? 'staff.lessons.approved' : 'staff.lessons.approve')}
              size="sm"
              icon="check"
              disabled={approvedNow}
              loading={busy === 'approve'}
              onPress={() => decide('approve')}
            />
          </>
        ) : null}
      </View>
      {data.contents.length > 1 ? (
        <ChipPicker
          label={t('staff.lessons.versionsOfTopic')}
          chips={data.contents.map((c) => {
            const k = concept(c.conceptId);
            return {
              value: c.contentId,
              label:
                c.kind === 'lesson'
                  ? t('staff.lessons.lesson')
                  : `${t('staff.lessons.alternative')}: ${(locale === 'ur' ? k?.titleUr : null) || k?.titleEn || '—'}`,
            };
          })}
          value={lesson.contentId}
          onChange={(id) => router.replace(`/lessons/${id}` as Href)}
        />
      ) : null}
      {error && !ask ? (
        <View style={styles.barRow} accessibilityLiveRegion="polite">
          <Icon name="warning" size={18} tone="wrong" />
          <Text tone="wrong">{t(ERRORS[error])}</Text>
        </View>
      ) : null}
      <Sheet
        visible={ask !== null}
        onClose={() => setAsk(null)}
        title={t(ask === 'reject' ? 'staff.lessons.retireTitle' : 'staff.lessons.sendBackTitle')}
        footer={
          <Button
            title={t(ask === 'reject' ? 'staff.lessons.retire' : 'staff.lessons.sendBack')}
            variant={ask === 'reject' ? 'danger' : 'primary'}
            loading={busy !== null}
            disabled={!note.trim()}
            onPress={() => ask && decide(ask, note)}
          />
        }
      >
        <Text tone="textMuted">
          {t(ask === 'reject' ? 'staff.lessons.retireBody' : 'staff.lessons.sendBackBody')}
        </Text>
        <TextField
          label={t('staff.lessons.reason')}
          value={note}
          onChangeText={setNote}
          multiline
          maxLength={1000}
          error={error ? t(ERRORS[error]) : undefined}
        />
      </Sheet>
    </View>
  );
}

export function LessonPreviewScreen() {
  const { contentId } = useLocalSearchParams<{ contentId: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const { state, reload } = useLesson({ contentId }, 'preview');
  const exit = () => (router.canGoBack() ? router.back() : router.replace('/lessons' as Href));
  return (
    <LessonStates
      state={state}
      onRetry={reload}
      onBack={exit}
      ready={(data) =>
        data.lesson ? (
          <LessonReader
            data={data}
            mode="preview"
            hue={hueForSubject(data.topic.subjectId ?? data.topic.id)}
            topBar={<ReviewBar data={data} onDone={reload} />}
            onExit={exit}
          />
        ) : (
          <Screen>
            <EmptyState
              icon="book"
              title={t('staff.lessons.gone')}
              body={t('staff.lessons.goneBody')}
            />
          </Screen>
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  page: { gap: space.lg },
  titleBlock: { gap: space.xs },
  list: { gap: space.sm },
  chapter: { marginTop: space.sm },
  flex: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderWidth: 1,
    minHeight: 52,
  },
  bar: { gap: space.sm, padding: space.md, borderBottomWidth: 1 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
});
