// "Lessons" on the Prepare tab (and the prep learner's home): topics with an
// approved lesson, by subject → chapter. One subject at a time (chips) so a
// class with many lessons stays short. Opens offline from the device copy.
import { useRouter, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useI18n } from '../../i18n';
import { Badge, Button, EmptyState, Icon, Reveal, SkeletonLines, Text, useTheme } from '../../ui';
import { PressableSticker } from '../../ui/Sticker';
import { hueForSubject, radius, radiusFor, space, subjectHues } from '../../ui/tokens';
import { useAuth } from '../auth/AuthProvider';
import { ChipPicker } from '../scope/ChipPicker';
import { useResult } from '../scope/useResult';
import { loadLessonList, type LessonListItem } from './api';

export function LessonList({
  classId,
  root = '/lesson',
}: {
  classId: string | null | undefined;
  /** `/lesson` (school students) or `/topic` (prep learners). */
  root?: string;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { colours, scheme, presentation } = useTheme();
  const { session, userStorage } = useAuth();
  const uid = session?.user.id ?? null;
  const ready = classId !== undefined && uid;
  const { state, reload } = useResult(ready ? `${uid}:${classId ?? '*'}` : null, () =>
    loadLessonList(classId ?? null, userStorage),
  );
  const items = state?.status === 'ready' && state.data !== 'notReady' ? state.data : null;
  const groups = useMemo(() => {
    const m = new Map<
      string,
      { key: string; label: string; subjectId: string; items: LessonListItem[] }
    >();
    for (const it of items ?? []) {
      const key = classId ? it.subjectId : `${it.classId}:${it.subjectName}`;
      const label = classId ? it.subjectName : `${it.className} · ${it.subjectName}`;
      const g = m.get(key) ?? { key, label, subjectId: it.subjectId, items: [] };
      g.items.push(it);
      m.set(key, g);
    }
    return [...m.values()];
  }, [items, classId]);
  const [pick, setPick] = useState<string | null>(null);
  const group = groups.find((g) => g.key === pick) ?? groups[0] ?? null;
  const ur = locale === 'ur';

  const head = (
    <View style={styles.head}>
      <Text variant="heading" accessibilityRole="header" style={styles.flex}>
        {t('student.learn.lessonsTitle')}
      </Text>
      {items && items.length ? (
        <Badge label={String(items.length)} tone="primary" icon="book" />
      ) : null}
    </View>
  );

  if (!state || state.status === 'loading') {
    return (
      <View style={styles.wrap}>
        {head}
        <SkeletonLines lines={3} />
      </View>
    );
  }
  if (state.status === 'error') {
    return (
      <View style={styles.wrap}>
        {head}
        <EmptyState
          icon="cloudOff"
          title={t('student.learn.listError')}
          action={<Button title={t('student.learn.retry')} variant="secondary" onPress={reload} />}
        />
      </View>
    );
  }
  if (!items || !items.length || !group) {
    return (
      <View style={styles.wrap}>
        {head}
        <EmptyState
          icon="book"
          title={t('student.learn.noLessons')}
          body={t('student.learn.noLessonsBody')}
        />
      </View>
    );
  }

  const hue = hueForSubject(group.subjectId);
  const outline = scheme === 'dark' ? colours.borderStrong : colours.ink;
  return (
    <View style={styles.wrap}>
      {head}
      {groups.length > 1 ? (
        <ChipPicker
          label={t('student.learn.subject')}
          chips={groups.map((g) => ({ value: g.key, label: g.label }))}
          value={group.key}
          onChange={setPick}
        />
      ) : null}
      {group.items.map((it, i) => {
        const chapter = (ur ? it.chapterTitleUr : null) || it.chapterTitle;
        const showChapter = i === 0 || group.items[i - 1]!.chapterId !== it.chapterId;
        return (
          <Reveal key={it.topicId} index={Math.min(i + 1, 8)}>
            {showChapter ? (
              <Text variant="label" tone="textMuted" style={styles.chapter}>
                {chapter}
              </Text>
            ) : null}
            <PressableSticker
              onPress={() => router.push(`${root}/${it.topicId}` as Href)}
              radius={radiusFor('md', presentation)}
              depth="stickerSm"
              accessibilityRole="button"
              accessibilityLabel={(ur ? it.titleUr : null) || it.titleEn}
              faceStyle={(pressed) => [
                styles.row,
                { backgroundColor: pressed ? colours.surfaceAlt : colours.surface },
              ]}
            >
              <View
                style={[
                  styles.swatch,
                  { backgroundColor: subjectHues[hue][scheme], borderColor: outline },
                ]}
              >
                <Icon name="book" size={18} colour={colours.ink} />
              </View>
              <Text style={styles.flex} numberOfLines={2}>
                {(ur ? it.titleUr : null) || it.titleEn}
              </Text>
              <Icon name="chevronEnd" size={20} tone="textMuted" />
            </PressableSticker>
          </Reveal>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  flex: { flex: 1 },
  chapter: { marginTop: space.sm, marginBottom: space.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    minHeight: 56,
  },
  swatch: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-4deg' }],
  },
});
