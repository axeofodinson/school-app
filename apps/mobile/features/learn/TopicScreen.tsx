// A topic's page (prompt 30): what you'll learn, the parts of the lesson (jump
// to any), and "Explain it another way" (alternative explanations, kind =
// 'alternative', one per concept). Then the reader. Every state has its own
// screen: loading, not switched on yet, offline with no copy, no lesson yet.
import { buildLesson, pickLang, type LessonLang } from '@school/core';
import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useI18n } from '../../i18n';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  HeroBand,
  Icon,
  Reveal,
  Screen,
  SkeletonLines,
  Text,
  useTheme,
  type IconName,
} from '../../ui';
import { PressableSticker } from '../../ui/Sticker';
import {
  hueForSubject,
  radius,
  radiusFor,
  space,
  subjectHues,
  type SubjectHue,
} from '../../ui/tokens';
import { useAuth } from '../auth/AuthProvider';
import { ERROR_KEYS } from '../scope/LoadState';
import { readProgress, type LearnMode, type LessonData } from './api';
import { HeaderBack } from './HeaderBack';
import { LessonReader, sectionTitle } from './LessonReader';
import { LessonText, MathContext } from './LessonText';
import { useLesson, type LessonState } from './useLesson';

const ICONS: Record<string, IconName> = {
  figure: 'image',
  compare: 'columns',
  video: 'video',
  scene: 'play',
  chart: 'chart',
  widget: 'sliders',
  lottie: 'sparkles',
};

function useLang(): LessonLang {
  const { locale } = useI18n();
  return locale === 'ur' ? 'ur' : 'en';
}

/** Loading / not switched on / error / gone, with the hero so the page never jumps. */
function States({
  state,
  onRetry,
  onBack,
  ready,
}: {
  state: LessonState;
  onRetry: () => void;
  onBack: () => void;
  ready: (data: LessonData) => ReactNode;
}) {
  const { t } = useI18n();
  let body: ReactNode = null;
  if (state.status === 'loading') body = <SkeletonLines lines={6} />;
  else if (state.status === 'error')
    body = state.notFound ? (
      <EmptyState icon="book" title={t('student.learn.gone')} body={t('student.learn.goneBody')} />
    ) : (
      <EmptyState
        icon="cloudOff"
        title={t(
          state.error === 'network' ? 'student.learn.offlineNoCopy' : 'student.learn.loadError',
        )}
        body={t(
          state.error === 'network' ? 'student.learn.offlineNoCopyBody' : ERROR_KEYS[state.error],
        )}
        action={<Button title={t('student.learn.retry')} variant="secondary" onPress={onRetry} />}
      />
    );
  else if (state.data === 'notReady')
    body = (
      <EmptyState
        icon="clock"
        title={t('student.learn.notReady')}
        body={t('student.learn.notReadyBody')}
      />
    );
  else return <>{ready(state.data)}</>;
  return (
    <Screen
      header={
        <HeroBand compact>
          <HeaderBack onPress={onBack} />
        </HeroBand>
      }
    >
      {body}
    </Screen>
  );
}

function useBack(fallback: Href) {
  const router = useRouter();
  return () => (router.canGoBack() ? router.back() : router.replace(fallback));
}

function PartRow({
  n,
  label,
  icon,
  seen,
  hue,
  onPress,
}: {
  n: number;
  label: string;
  icon: IconName;
  seen: boolean;
  hue: SubjectHue;
  onPress: () => void;
}) {
  const { colours, scheme, presentation } = useTheme();
  const { t } = useI18n();
  const outline = scheme === 'dark' ? colours.borderStrong : colours.ink;
  return (
    <PressableSticker
      onPress={onPress}
      radius={radiusFor('md', presentation)}
      depth="stickerSm"
      accessibilityRole="button"
      accessibilityLabel={`${t('student.learn.part')} ${n}: ${label}${seen ? `, ${t('student.learn.seen')}` : ''}`}
      faceStyle={(pressed) => [
        styles.part,
        { backgroundColor: pressed ? colours.surfaceAlt : colours.surface },
      ]}
    >
      <View
        style={[
          styles.partTile,
          {
            borderColor: outline,
            backgroundColor: seen ? subjectHues[hue][scheme] : colours.surface,
          },
        ]}
      >
        <Text variant="label" script="latin" tone={seen ? 'ink' : 'text'}>
          {String(n)}
        </Text>
      </View>
      <Text style={styles.flex} numberOfLines={2}>
        {label}
      </Text>
      <Icon name={icon} size={20} tone="textMuted" />
    </PressableSticker>
  );
}

function TopicBody({ data, mode, base }: { data: LessonData; mode: LearnMode; base: string }) {
  const { t } = useI18n();
  const lang = useLang();
  const router = useRouter();
  const { colours } = useTheme();
  const { userStorage } = useAuth();
  const back = useBack(mode === 'student' ? '/' : '/lessons');
  const hue = hueForSubject(data.topic.subjectId ?? data.topic.id);
  const lesson = data.lesson;
  const model = useMemo(() => buildLesson(lesson?.blocks ?? []), [lesson]);
  const [seen, setSeen] = useState<number[]>([]);
  // Re-read on every focus: coming back from the reader shows "Carry on" / "Read it again".
  useFocusEffect(
    useCallback(() => {
      if (!lesson || mode !== 'student') return;
      let live = true;
      readProgress(userStorage, lesson.contentId, lesson.version).then((s) => live && setSeen(s));
      return () => {
        live = false;
      };
    }, [lesson, mode, userStorage]),
  );

  const read = (params: { s?: number; content?: string }) => {
    const q = new URLSearchParams();
    if (params.s !== undefined) q.set('s', String(params.s));
    if (params.content) q.set('content', params.content);
    const qs = q.toString();
    router.push(`${base}/read${qs ? `?${qs}` : ''}` as Href);
  };
  const count = model.sections.length;
  const firstUnseen = model.sections.findIndex((s) => !seen.includes(s.index));
  const started = seen.length > 0 && firstUnseen > 0;
  const allSeen = count > 0 && firstUnseen === -1;
  const title = (lang === 'ur' ? data.topic.titleUr : null) || data.topic.titleEn;
  const chapter = (lang === 'ur' ? data.topic.chapterTitleUr : null) || data.topic.chapterTitle;
  const alternatives = data.contents.filter(
    (c) => c.kind === 'alternative' && c.status !== 'retired',
  );
  const objectives = model.objectives
    .map((b) => pickLang({ en: b.en, ur: b.ur }, lang)?.text)
    .filter((x): x is string => Boolean(x));

  return (
    <MathContext.Provider value={data.math}>
      <Screen
        header={
          <HeroBand hue={hue} pattern="star8">
            <View style={styles.headRow}>
              <HeaderBack onPress={back} />
              <View style={styles.flex} />
              {data.fromCache ? (
                <Badge label={t('student.learn.savedCopy')} tone="neutral" icon="cloudOff" />
              ) : null}
            </View>
            <Reveal index={0} rise={8}>
              <Text variant="label" numberOfLines={1}>
                {[data.topic.subjectName, chapter].filter(Boolean).join(' · ')}
              </Text>
              <Text variant="display" accessibilityRole="header">
                {title}
              </Text>
            </Reveal>
            {lesson && count ? (
              <Reveal index={1} rise={8} style={styles.heroActions}>
                <Button
                  title={
                    allSeen
                      ? t('student.learn.readAgain')
                      : started
                        ? t('student.learn.carryOn', { n: firstUnseen + 1 })
                        : t('student.learn.start')
                  }
                  icon={allSeen ? 'replay' : 'play'}
                  size="lg"
                  onPress={() => read({ s: started ? firstUnseen : 0 })}
                />
                <Text variant="label">{t('student.learn.parts', { n: count })}</Text>
              </Reveal>
            ) : null}
          </HeroBand>
        }
      >
        {!lesson ? (
          <EmptyState
            icon="book"
            title={t('student.learn.noLesson')}
            body={t('student.learn.noLessonBody')}
          />
        ) : null}

        {objectives.length || (lesson && data.concepts.length) ? (
          <Reveal index={2}>
            <Card>
              <View style={styles.cardHead}>
                <View style={[styles.cardIcon, { backgroundColor: colours.accent }]}>
                  <Icon name="flag" size={18} colour={colours.onAccent} />
                </View>
                <Text variant="heading">{t('student.learn.objectives')}</Text>
              </View>
              {objectives.length ? (
                objectives.map((o, i) => <LessonText key={i} source={o} />)
              ) : (
                <View style={styles.list}>
                  {data.concepts.map((c) => (
                    <View key={c.id} style={styles.hint}>
                      <Icon name="check" size={18} tone="correct" />
                      <Text style={styles.flex}>
                        {(lang === 'ur' ? c.titleUr : null) || c.titleEn}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </Card>
          </Reveal>
        ) : null}

        {lesson && count ? (
          <Reveal index={3}>
            <View style={styles.section}>
              <Text variant="heading" accessibilityRole="header">
                {t('student.learn.partsTitle')}
              </Text>
              {model.sections.map((s) => (
                <PartRow
                  key={s.index}
                  n={s.index + 1}
                  label={
                    s.kind === 'summary'
                      ? t('student.learn.summary')
                      : sectionTitle(s, lang, s.index + 1, t('student.learn.part'))
                  }
                  icon={
                    s.visual
                      ? (ICONS[s.visual.block.type] ?? 'book')
                      : s.kind === 'summary'
                        ? 'star'
                        : 'book'
                  }
                  seen={seen.includes(s.index)}
                  hue={hue}
                  onPress={() => read({ s: s.index })}
                />
              ))}
            </View>
          </Reveal>
        ) : null}

        {alternatives.length ? (
          <Reveal index={4}>
            <View style={styles.section}>
              <Text variant="heading" accessibilityRole="header">
                {t('student.learn.anotherWay')}
              </Text>
              <Text variant="bodySm" tone="textMuted">
                {t('student.learn.anotherWayBody')}
              </Text>
              {alternatives.map((a) => {
                const c = data.concepts.find((x) => x.id === a.conceptId);
                return (
                  <Card
                    key={a.contentId}
                    onPress={() => read({ content: a.contentId })}
                    accessibilityLabel={t('student.learn.anotherWayTitle', {
                      concept: (lang === 'ur' ? c?.titleUr : null) || c?.titleEn || title,
                    })}
                  >
                    <View style={styles.hint}>
                      <Icon name="lightbulb" size={22} tone="primary" />
                      <Text variant="label" style={styles.flex}>
                        {(lang === 'ur' ? c?.titleUr : null) || c?.titleEn || title}
                      </Text>
                      {mode === 'preview' && a.status !== 'approved' ? (
                        <Badge label={t(`staff.lessons.status.${a.status}`)} tone="weak" />
                      ) : null}
                      <Icon name="chevronEnd" size={20} tone="textMuted" />
                    </View>
                  </Card>
                );
              })}
            </View>
          </Reveal>
        ) : null}
      </Screen>
    </MathContext.Provider>
  );
}

/** `/lesson/[topicId]` for students, `/topic/[topicId]` for prep learners. */
export function TopicScreen({ root = '/lesson' }: { root?: string }) {
  const { topicId } = useLocalSearchParams<{ topicId: string }>();
  const { state, reload } = useLesson({ topicId }, 'student');
  const back = useBack('/');
  return (
    <States
      state={state}
      onRetry={reload}
      onBack={back}
      ready={(data) => <TopicBody data={data} mode="student" base={`${root}/${topicId}`} />}
    />
  );
}

/** `/lesson/[topicId]/read?s=2&content=…` */
export function ReaderScreen({ root = '/lesson' }: { root?: string }) {
  const { topicId, s, content } = useLocalSearchParams<{
    topicId: string;
    s?: string;
    content?: string;
  }>();
  const router = useRouter();
  const where = content ? { topicId, contentId: content } : { topicId };
  const { state, reload } = useLesson(where, 'student', true);
  const exit = () =>
    router.canGoBack() ? router.back() : router.replace(`${root}/${topicId}` as Href);
  return (
    <States
      state={state}
      onRetry={reload}
      onBack={exit}
      ready={(data) =>
        data.lesson ? (
          <LessonReader
            data={data}
            mode="student"
            hue={hueForSubject(data.topic.subjectId ?? data.topic.id)}
            initialStep={Number(s ?? 0)}
            onExit={exit}
          />
        ) : (
          <TopicBody data={data} mode="student" base={`${root}/${topicId}`} />
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  heroActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    flexWrap: 'wrap',
    marginTop: space.md,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.sm },
  cardIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: { gap: space.sm },
  hint: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  section: { gap: space.sm },
  part: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    minHeight: 56,
  },
  partTile: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export { States as LessonStates, TopicBody };
