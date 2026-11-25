// The lesson reader (wireframe DESIGN_SYSTEM.md §7.3, visual-first §7b): one
// section at a time, its visual on the stage with the controls under it, the
// caption, "Explain more", "Watch out" and quick checks. Phone: one column with
// Back / Next pinned at the bottom. ≥ 900 (Chromebook, desktop): two panes, the
// stage sticky on the start side (60 %), the words on the end side.
// Keys (web): ← → step (mirrored in Urdu), Space play/pause, F fullscreen,
// Home/End, Esc leaves fullscreen. "Text version" shows everything as text.
// On a scene, ← → walk its steps first, then move to the next part (like
// builds on a slide); Space plays the scene or a widget's clock.
//
// Motion: a new section enters with `listEnter` from the direction of travel
// (mirrored in RTL; lite fades; off is instant), a newly seen part sets its
// progress tile (`mosaicTileSet`), the finish card bursts once (full tier).
import {
  buildLesson,
  clampStep,
  lessonKeyAction,
  pickLang,
  plainLabel,
  stageAspect,
  visualText,
  BUILT_WIDGETS,
  assignQuickChecks,
  parseChart,
  parseScene,
  parseWidget,
  type LessonBlock,
  type LessonLang,
  type LessonSection,
} from '@school/core';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
  type ReactNode,
} from 'react';
import { Modal, Platform, ScrollView, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useI18n } from '../../i18n';
import {
  Badge,
  Button,
  EmptyState,
  HeroBand,
  Icon,
  Text,
  TileBurst,
  useCues,
  useHeroTone,
  useLayout,
  useTheme,
} from '../../ui';
import { useEnterStyle } from '../../ui/motion';
import { radius, radiusFor, space, subjectHues, type SubjectHue } from '../../ui/tokens';
import { useAuth } from '../auth/AuthProvider';
import { readProgress, saveProgress, type LearnMode, type LessonData } from './api';
import { LessonText, MathContext } from './LessonText';
import { QuickCheck } from './QuickCheck';
import { Stage, StageControls } from './Stage';
import { useOnline } from './useOnline';
import { openVideo, VideoView } from './Video';
import { StageVisual } from './StageVisual';
import { TextStage } from './visuals';
import { useVisualSessionState, VisualSessionProvider, type VisualSession } from './visualState';
import { HeaderBack } from './HeaderBack';

// ───────────────────────────── small parts ─────────────────────────────

function textOf(b: LessonBlock, lang: LessonLang) {
  return pickLang({ en: b.en, ur: b.ur }, lang);
}

export function sectionTitle(s: LessonSection, lang: LessonLang, n: number, fallback: string) {
  const lead = s.lead[0] ? textOf(s.lead[0], lang)?.text : null;
  if (lead) return plainLabel(lead, 56);
  const alt = s.visual ? pickLang(s.visual.block.alt, lang)?.text : null;
  return alt ? plainLabel(alt, 56) : `${fallback} ${n}`;
}

/** One tile per part: seen ones set in the subject hue (`mosaicTileSet` when they first set). */
function PartTile({ seen, current }: { seen: boolean; current: boolean }) {
  const { colours, scheme } = useTheme();
  const set = useEnterStyle('mosaicTileSet', seen, { scaleFrom: 0.6 });
  const outline = scheme === 'dark' ? colours.borderStrong : colours.ink;
  return (
    <View
      style={[
        styles.tile,
        { borderColor: current ? colours.primary : outline, borderWidth: current ? 3 : 2 },
      ]}
    >
      {/* On the hero (already the subject hue) a set tile is paper-white. */}
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colours.surface }, set]} />
    </View>
  );
}

function PartTiles({
  count,
  seen,
  step,
}: {
  count: number;
  seen: ReadonlySet<number>;
  step: number;
}) {
  const { t } = useI18n();
  const tone = useHeroTone();
  return (
    <View style={styles.tilesRow}>
      <View
        style={styles.tiles}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={t('student.learn.partsSeen', { n: seen.size, total: count })}
      >
        {Array.from({ length: Math.min(count, 16) }, (_, i) => (
          <PartTile key={i} seen={seen.has(i)} current={i === step} />
        ))}
      </View>
      <Text variant="label" tone={tone} script="latin">
        {`${step + 1}/${count}`}
      </Text>
    </View>
  );
}

/** A section's contents enter from the side it was reached from. */
function Enter({ dir, children, style }: { dir: number; children: ReactNode; style?: object }) {
  const enter = useEnterStyle('listEnter', true, { translateX: dir * 24 });
  return <Animated.View style={[enter, style]}>{children}</Animated.View>;
}

function Collapsible({
  title,
  icon,
  children,
}: {
  title: string;
  icon: 'chevronEnd' | 'fileText';
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const shown = useEnterStyle('whyWrongReveal', open, { translateY: 12 });
  return (
    <View style={styles.collapsible}>
      <Button
        title={title}
        variant="ghost"
        size="sm"
        icon={open ? 'arrowUp' : icon === 'fileText' ? 'fileText' : 'arrowDown'}
        onPress={() => setOpen(!open)}
        style={styles.startAlign}
      />
      {open ? <Animated.View style={[styles.moreBody, shown]}>{children}</Animated.View> : null}
    </View>
  );
}

// ───────────────────────────── the visual on the stage ─────────────────────────────

function StageContent({
  section,
  blocks,
  lang,
  online,
  playing,
  onPlay,
  n,
  title,
  predictReady,
}: {
  section: LessonSection;
  blocks: unknown[];
  lang: LessonLang;
  online: boolean;
  playing: boolean;
  onPlay: () => void;
  n: number;
  title: string;
  predictReady: boolean;
}) {
  const v = section.visual?.block;
  if (!v) return <TextStage n={n} title={title} summary={section.kind === 'summary'} />;
  if (v.type === 'video')
    return (
      <VideoView
        block={v}
        blocks={blocks}
        lang={lang}
        online={online}
        playing={playing}
        onPlay={onPlay}
      />
    );
  return <StageVisual block={v} lang={lang} predictReady={predictReady} />;
}

/** The predict question of a scene/widget, when the reader may read its item. */
function predictId(v: LessonBlock | null | undefined, data: LessonData): string | null {
  const id = v && (v.type === 'scene' || v.type === 'widget') ? v.predict_question_id : null;
  return typeof id === 'string' && data.items[id] ? id : null;
}

/** A visual this build can't draw: its text lines go under the stage. */
function drawnAsText(v: LessonBlock | null): boolean {
  if (!v) return false;
  if (v.type === 'lottie') return true;
  if (v.type === 'scene') return !parseScene(v);
  if (v.type === 'chart') return !parseChart(v);
  if (v.type === 'widget') {
    const w = parseWidget(v);
    return !w?.spec || !(BUILT_WIDGETS as readonly string[]).includes(w.widget);
  }
  return false;
}

// ───────────────────────────── the words of a section ─────────────────────────────

function SectionWords({
  section,
  data,
  lang,
  checks,
  count,
  visual: vs,
}: {
  section: LessonSection;
  data: LessonData;
  lang: LessonLang;
  checks: Map<number, string | null>;
  count: number;
  visual: VisualSession;
}) {
  const { t } = useI18n();
  const { colours } = useTheme();
  const leads = section.lead.map((b) => textOf(b, lang)).filter((x) => x !== null);
  const fellBack = leads.some((l) => l.fallback);
  const v = section.visual?.block ?? null;
  const visualLines = v ? visualText(v, lang) : [];
  const hasHotspots = v?.type === 'figure' && Array.isArray(v.hotspots) && v.hotspots.length > 0;
  const later = drawnAsText(v);
  const pid = predictId(v, data);
  const sceneCaptions = v?.type === 'scene' ? visualLines.filter((l) => l.kind === 'caption') : [];
  const sceneLine = sceneCaptions[Math.min(vs.step, Math.max(0, sceneCaptions.length - 1))];
  const task = v?.type === 'widget' && !later ? visualLines.find((l) => l.kind === 'text') : null;
  const transcript = v?.type === 'video' ? visualLines.find((l) => l.kind === 'transcript') : null;
  // No lead text: the visual's alt is the caption (every visual has one).
  const caption =
    leads.length === 0 ? (visualLines.find((l) => l.kind === 'alt')?.text ?? null) : null;

  return (
    <View style={styles.words}>
      <View style={styles.stepRow}>
        <Text variant="label" tone="textMuted">
          {section.kind === 'summary'
            ? t('student.learn.summary')
            : t('student.learn.partOf', { n: section.index + 1, total: count })}
        </Text>
        {fellBack ? (
          <Badge
            label={t(lang === 'ur' ? 'student.learn.onlyEnglish' : 'student.learn.onlyUrdu')}
            tone="neutral"
            icon="language"
          />
        ) : null}
      </View>
      {leads.map((l, i) => (
        <LessonText key={i} source={l.text} variant={i === 0 ? 'heading' : 'body'} />
      ))}
      {caption ? <LessonText source={caption} variant="heading" /> : null}
      {sceneLine ? (
        <View
          style={[
            styles.stepCaption,
            { backgroundColor: colours.surface, borderColor: colours.borderStrong },
          ]}
          accessibilityLiveRegion="polite"
        >
          <Text variant="label" tone="textMuted">
            {t('student.learn.sceneStep', {
              n: Math.min(vs.step, sceneCaptions.length - 1) + 1,
              total: sceneCaptions.length,
            })}
          </Text>
          <Enter key={`cap-${vs.step}`} dir={0}>
            <LessonText source={sceneLine.text} />
          </Enter>
        </View>
      ) : null}
      {pid ? (
        <QuickCheck
          block={{ type: 'quick_check' }}
          item={data.items[pid] ?? null}
          lang={lang}
          predict
          onResult={() => vs.setPredicted(true)}
        />
      ) : null}
      {task ? (
        <View
          style={[
            styles.task,
            { backgroundColor: colours.primarySoft, borderColor: colours.primary },
          ]}
        >
          <View style={styles.hint}>
            <Icon name="sliders" size={18} tone="onPrimarySoft" />
            <Text variant="label" tone="onPrimarySoft">
              {t('student.learn.yourTurn')}
            </Text>
          </View>
          <LessonText source={task.text} tone="onPrimarySoft" />
        </View>
      ) : null}
      {hasHotspots ? (
        <View style={styles.hint}>
          <Icon name="info" size={18} tone="textMuted" />
          <Text variant="bodySm" tone="textMuted" style={styles.flex}>
            {t('student.learn.tapNumbers')}
          </Text>
        </View>
      ) : null}
      {later
        ? visualLines
            .filter((l) => l.kind !== 'alt')
            .map((l, i) => (
              <View key={i} style={styles.lineRow}>
                <Text variant="label" tone="textMuted" script="latin">
                  {l.n ? `${l.n}.` : '•'}
                </Text>
                <LessonText source={l.text} />
              </View>
            ))
        : null}
      {transcript ? (
        <Collapsible title={t('student.learn.transcript')} icon="fileText">
          <LessonText source={transcript.text} />
        </Collapsible>
      ) : null}
      {section.more.length ? (
        <Collapsible title={t('student.learn.explainMore')} icon="chevronEnd">
          {section.more.map((b, i) => {
            const x = textOf(b, lang);
            if (!x) return null;
            return (
              <View key={i} style={styles.moreItem}>
                {b.type === 'worked_example' ? (
                  <Badge label={t('student.learn.workedExample')} tone="learning" icon="pencil" />
                ) : b.type === 'application' ? (
                  <Badge label={t('student.learn.inRealLife')} tone="correct" icon="sparkles" />
                ) : null}
                <LessonText source={x.text} />
              </View>
            );
          })}
        </Collapsible>
      ) : null}
      {section.watchOut.map((b, i) => {
        const x = textOf(b, lang);
        if (!x) return null;
        return (
          <View
            key={i}
            style={[
              styles.watch,
              { backgroundColor: colours.wrongSoft, borderColor: colours.wrong },
            ]}
          >
            <View style={styles.hint}>
              <Icon name="warning" size={20} tone="onWrongSoft" />
              <Text variant="label" tone="onWrongSoft">
                {t('student.learn.watchOut')}
              </Text>
            </View>
            <LessonText source={x.text} tone="onWrongSoft" />
          </View>
        );
      })}
      {section.checks.map((c) => {
        const qid = checks.get(c.blockIndex) ?? null;
        return (
          <QuickCheck
            key={c.blockIndex}
            block={c.block}
            item={qid ? (data.items[qid] ?? null) : null}
            lang={lang}
          />
        );
      })}
    </View>
  );
}

// ───────────────────────────── text version ─────────────────────────────

function TextVersion({
  sections,
  objectives,
  lang,
}: {
  sections: LessonSection[];
  objectives: LessonBlock[];
  lang: LessonLang;
}) {
  const { t } = useI18n();
  const { colours } = useTheme();
  return (
    <View style={styles.words}>
      {objectives.map((b, i) => {
        const x = textOf(b, lang);
        return x ? (
          <View key={`o${i}`} style={styles.textPart}>
            <Text variant="heading" accessibilityRole="header">
              {t('student.learn.objectives')}
            </Text>
            <LessonText source={x.text} />
          </View>
        ) : null;
      })}
      {sections.map((s) => (
        <View key={s.index} style={[styles.textPart, { borderColor: colours.border }]}>
          <Text variant="heading" accessibilityRole="header">
            {s.kind === 'summary'
              ? t('student.learn.summary')
              : `${t('student.learn.part')} ${s.index + 1}`}
          </Text>
          {s.visual
            ? visualText(s.visual.block, lang).map((l, i) => (
                <Text key={`v${i}`} tone={l.kind === 'alt' ? 'textMuted' : 'text'}>
                  {l.kind === 'alt'
                    ? `${t('student.learn.picture')}: ${l.text}`
                    : l.n
                      ? `${l.n}. ${l.text}`
                      : l.text}
                </Text>
              ))
            : null}
          {[...s.lead, ...s.more, ...s.watchOut, ...s.checks.map((c) => c.block)].map((b, i) => {
            const x = textOf(b, lang);
            return x ? <LessonText key={i} source={x.text} /> : null;
          })}
        </View>
      ))}
    </View>
  );
}

// ───────────────────────────── the reader ─────────────────────────────

export function LessonReader({
  data,
  mode,
  hue,
  initialStep = 0,
  topBar,
  onExit,
}: {
  data: LessonData;
  mode: LearnMode;
  hue: SubjectHue;
  initialStep?: number;
  /** Preview: the review bar. */
  topBar?: ReactNode;
  onExit: () => void;
}) {
  const { t, locale, isRTL } = useI18n();
  const lang: LessonLang = locale === 'ur' ? 'ur' : 'en';
  const { colours, presentation } = useTheme();
  const { twoPane, gutter } = useLayout();
  const { userStorage } = useAuth();
  const { cue } = useCues();
  const online = useOnline(data.fromCache);
  const lesson = data.lesson!;
  const blocks = lesson.blocks;
  const model = useMemo(() => buildLesson(blocks), [blocks]);
  const checks = useMemo(() => assignQuickChecks(model, data.pool), [model, data.pool]);
  const count = model.sections.length;

  const [step, setStep] = useState(() => clampStep(initialStep, count));
  const [dir, setDir] = useState(0);
  const [seen, setSeen] = useState<Set<number>>(() => new Set([clampStep(initialStep, count)]));
  const [textMode, setTextMode] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [done, setDone] = useState(false);
  const vs = useVisualSessionState();
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);

  // Parts seen on this device (students only; a preview leaves no trace).
  useEffect(() => {
    if (mode !== 'student') return;
    let live = true;
    readProgress(userStorage, lesson.contentId, lesson.version).then((list) => {
      if (live && list.length) setSeen((s) => new Set([...s, ...list.filter((i) => i < count)]));
    });
    return () => {
      live = false;
    };
  }, [mode, userStorage, lesson.contentId, lesson.version, count]);

  const go = useCallback(
    (i: number) => {
      const next = clampStep(i, count);
      if (next === step) return;
      setDir(next > step ? 1 : -1);
      setStep(next);
      setPlaying(false);
      setDone(false);
      setSeen((s) => {
        if (s.has(next)) return s;
        const n = new Set(s).add(next);
        if (mode === 'student')
          void saveProgress(userStorage, lesson.contentId, lesson.version, [...n]);
        return n;
      });
      scroll.current?.scrollTo({ y: 0, animated: false });
    },
    [count, step, mode, userStorage, lesson.contentId, lesson.version],
  );

  const section = model.sections[step];
  const visual = section?.visual?.block ?? null;
  const playable = Boolean(visual && visual.type === 'video' && online && !done);
  // Scenes and the motion widget have their own Play; Space reaches them through the session.
  const visualPlays =
    visual?.type === 'scene' || (visual?.type === 'widget' && visual.widget === 'motion_graph');

  // Each part starts its visual fresh: first step, paused, predict not yet answered.
  const { setStep: setVisualStep, setPlaying: setVisualPlaying, setPredicted } = vs;
  useEffect(() => {
    setVisualStep(0);
    setVisualPlaying(false);
    setPredicted(false);
  }, [step, setVisualStep, setVisualPlaying, setPredicted]);
  const play = useCallback(() => {
    if (!visual || visual.type !== 'video') return;
    if (Platform.OS === 'web') setPlaying((p) => !p);
    else void openVideo(visual);
  }, [visual]);

  const finish = () => {
    setDone(true);
    cue('tada');
    if (mode === 'student') {
      const all = new Set(Array.from({ length: count }, (_, i) => i));
      setSeen(all);
      void saveProgress(userStorage, lesson.contentId, lesson.version, [...all]);
    }
  };

  // Keyboard on web (Chromebooks, Windows): never while typing in a field.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || el?.isContentEditable) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'Escape' && fullscreen) {
        setFullscreen(false);
        e.preventDefault();
        return;
      }
      const a = lessonKeyAction(e.key, isRTL);
      if (!a || textMode) return;
      if (a === 'play' && !playable && !visualPlays) return;
      e.preventDefault();
      const scene = visual?.type === 'scene' && vs.count > 1;
      if (a === 'next' && scene && vs.step < vs.count - 1) {
        vs.setPlaying(false);
        vs.setStep(vs.step + 1);
      } else if (a === 'prev' && scene && vs.step > 0) {
        vs.setPlaying(false);
        vs.setStep(vs.step - 1);
      } else if (a === 'play' && visualPlays) vs.requestPlay();
      else if (a === 'next') go(step + 1);
      else if (a === 'prev') go(step - 1);
      else if (a === 'first') go(0);
      else if (a === 'last') go(count - 1);
      else if (a === 'play') play();
      else if (a === 'fullscreen') setFullscreen((f) => !f);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [go, step, count, isRTL, fullscreen, textMode, playable, play, visual, visualPlays, vs]);

  // Opening full screen on a playing video: the modal's focus trap lands on the
  // YouTube frame, which would swallow Esc and the arrows. Hand focus back.
  useEffect(() => {
    if (!fullscreen || Platform.OS !== 'web' || typeof document === 'undefined') return;
    const id = setTimeout(() => {
      const el = document.activeElement as HTMLElement | null;
      if (el?.tagName === 'IFRAME') el.blur();
    }, 60);
    return () => clearTimeout(id);
  }, [fullscreen]);

  const kicker = [
    data.topic.subjectName,
    lang === 'ur' && data.topic.chapterTitleUr
      ? data.topic.chapterTitleUr
      : data.topic.chapterTitle,
  ]
    .filter(Boolean)
    .join(' · ');
  const topicTitle = (lang === 'ur' ? data.topic.titleUr : null) || data.topic.titleEn;
  const concept = lesson.conceptId ? data.concepts.find((c) => c.id === lesson.conceptId) : null;
  const title =
    lesson.kind === 'alternative'
      ? t('student.learn.anotherWayTitle', {
          concept: (lang === 'ur' ? concept?.titleUr : null) || concept?.titleEn || topicTitle,
        })
      : topicTitle;

  const header = (
    <HeroBand compact hue={hue} trigger={step}>
      <View style={styles.headRow}>
        <HeaderBack onPress={onExit} />
        <View style={styles.flex} />
        {data.fromCache ? (
          <Badge label={t('student.learn.savedCopy')} tone="neutral" icon="cloudOff" />
        ) : null}
      </View>
      <Text variant="label" numberOfLines={1}>
        {kicker}
      </Text>
      <Text variant="title" accessibilityRole="header" numberOfLines={2}>
        {title}
      </Text>
      {count > 0 ? <PartTiles count={count} seen={seen} step={step} /> : null}
    </HeroBand>
  );

  if (!count || !section) {
    return (
      <View style={[styles.root, { backgroundColor: colours.bg }]}>
        {header}
        {topBar}
        <View style={{ padding: gutter }}>
          <EmptyState
            icon="book"
            title={t('student.learn.emptyLesson')}
            body={t('student.learn.emptyLessonBody')}
          />
        </View>
      </View>
    );
  }

  const n = section.index + 1;
  const secTitle = sectionTitle(section, lang, n, t('student.learn.part'));
  const aspect =
    !visual || visual.type === 'compare'
      ? null
      : visual.type === 'video'
        ? 16 / 9
        : stageAspect(visual.type, visual.widget);
  const stage = (full: boolean) => (
    <Stage hue={hue} aspect={aspect} paper={Boolean(visual)} fullscreen={full} label={secTitle}>
      <Enter key={`${step}-${full}`} dir={dir} style={styles.fill}>
        <StageContent
          section={section}
          blocks={blocks}
          lang={lang}
          online={online}
          playing={playing}
          onPlay={play}
          n={n}
          title={secTitle}
          predictReady={Boolean(predictId(visual, data))}
        />
      </Enter>
    </Stage>
  );
  const controls = (
    <StageControls
      step={step}
      count={count}
      seen={seen}
      hue={hue}
      onStep={go}
      playable={playable}
      playing={playing && Platform.OS === 'web'}
      onPlay={play}
      textMode={textMode}
      onTextMode={() => setTextMode((v) => !v)}
      fullscreen={fullscreen}
      onFullscreen={() => setFullscreen((f) => !f)}
    />
  );
  const last = step >= count - 1;
  const nav = (
    <View style={[styles.nav, { borderTopColor: colours.border, paddingHorizontal: gutter }]}>
      <Button
        title={t('student.learn.back')}
        variant="secondary"
        icon="chevronStart"
        disabled={step === 0}
        onPress={() => go(step - 1)}
      />
      <View style={styles.flex} />
      {last ? (
        <Button title={t('student.learn.finish')} icon="check" onPress={finish} />
      ) : (
        <Button title={t('student.learn.next')} icon="chevronEnd" onPress={() => go(step + 1)} />
      )}
    </View>
  );
  const finishCard = done ? (
    <View
      style={[
        styles.finish,
        {
          backgroundColor: colours.surface,
          borderColor: colours.borderStrong,
          borderRadius: radiusFor('xl', presentation),
        },
      ]}
    >
      <TileBurst
        moment={presentation === 'kid' ? 'celebrationKid' : 'scoreReveal'}
        trigger={`${lesson.contentId}-done`}
        count={22}
      />
      <View
        style={[
          styles.finishTile,
          { backgroundColor: subjectHues[hue].light, borderColor: colours.ink },
        ]}
      >
        <Icon name="award" size={32} colour={colours.ink} />
      </View>
      <Text variant="title" style={styles.centre}>
        {t('student.learn.doneTitle')}
      </Text>
      <Text tone="textMuted" style={styles.centre}>
        {t('student.learn.doneBody')}
      </Text>
      <View style={styles.finishRow}>
        <Button
          title={t('student.learn.readAgain')}
          variant="secondary"
          icon="replay"
          onPress={() => go(0)}
        />
        <Button title={t('student.learn.backToTopic')} onPress={onExit} />
      </View>
    </View>
  ) : null;

  const words = textMode ? (
    <TextVersion sections={model.sections} objectives={model.objectives} lang={lang} />
  ) : (
    <Enter key={step} dir={dir}>
      <SectionWords
        section={section}
        data={data}
        lang={lang}
        checks={checks}
        count={count}
        visual={vs}
      />
    </Enter>
  );

  return (
    <VisualSessionProvider value={vs}>
      <MathContext.Provider value={data.math}>
        <SafeAreaView
          style={[styles.root, { backgroundColor: colours.bg, direction: isRTL ? 'rtl' : 'ltr' }]}
        >
          {twoPane ? (
            <>
              {header}
              {topBar}
              <View style={[styles.panes, { paddingHorizontal: gutter, gap: gutter }]}>
                <View style={styles.stagePane}>
                  {textMode ? null : stage(false)}
                  {controls}
                </View>
                <View style={styles.wordPane}>
                  <ScrollView ref={scroll} contentContainerStyle={styles.wordScroll}>
                    {finishCard ?? words}
                  </ScrollView>
                  {nav}
                </View>
              </View>
            </>
          ) : (
            <>
              <ScrollView ref={scroll} style={styles.fill} contentContainerStyle={styles.grow}>
                {header}
                {topBar}
                <View style={[styles.phoneBody, { paddingHorizontal: gutter }]}>
                  {textMode ? null : stage(false)}
                  {controls}
                  {finishCard ?? words}
                </View>
              </ScrollView>
              {nav}
            </>
          )}
          <Modal
            visible={fullscreen}
            animationType="none"
            onRequestClose={() => setFullscreen(false)}
            supportedOrientations={['portrait', 'landscape']}
          >
            <MathContext.Provider value={data.math}>
              <SafeAreaView
                style={[
                  styles.root,
                  styles.fullRoot,
                  { backgroundColor: colours.bg, direction: isRTL ? 'rtl' : 'ltr' },
                ]}
              >
                <View style={styles.fill}>{stage(true)}</View>
                {controls}
                {section.lead[0] ? (
                  <View style={styles.fullCaption}>
                    <LessonText
                      source={textOf(section.lead[0], lang)?.text ?? ''}
                      numberOfLines={3}
                    />
                  </View>
                ) : null}
              </SafeAreaView>
            </MathContext.Provider>
          </Modal>
        </SafeAreaView>
      </MathContext.Provider>
    </VisualSessionProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  fill: { flex: 1 },
  flex: { flex: 1 },
  grow: { flexGrow: 1 },
  centre: { textAlign: 'center' },
  startAlign: { alignSelf: 'flex-start' },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  tilesRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.xs },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, flexShrink: 1 },
  tile: { width: 18, height: 18, borderRadius: radius.sm / 2, overflow: 'hidden' },
  panes: { flex: 1, flexDirection: 'row', paddingTop: space.lg },
  stagePane: { flex: 3, gap: space.md },
  wordPane: { flex: 2, minWidth: 320 },
  wordScroll: { paddingBottom: space.xl, gap: space.lg },
  phoneBody: { gap: space.md, paddingTop: space.lg, paddingBottom: space.xl },
  words: { gap: space.md },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  hint: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  lineRow: { flexDirection: 'row', gap: space.sm },
  stepCaption: { gap: space.xs, padding: space.md, borderRadius: radius.lg, borderWidth: 2 },
  task: { gap: space.xs, padding: space.md, borderRadius: radius.lg, borderWidth: 2 },
  collapsible: { gap: space.sm },
  moreBody: { gap: space.md },
  moreItem: { gap: space.sm },
  watch: { gap: space.sm, padding: space.md, borderRadius: radius.lg, borderWidth: 2 },
  textPart: { gap: space.sm, paddingBottom: space.md, borderBottomWidth: 1 },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    borderTopWidth: 1,
  },
  finish: {
    alignItems: 'center',
    gap: space.md,
    padding: space.xl,
    borderWidth: 2,
    overflow: 'visible',
  },
  finishTile: {
    width: 72,
    height: 72,
    borderRadius: radius.lg,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-4deg' }],
  },
  finishRow: { flexDirection: 'row', gap: space.md, flexWrap: 'wrap', justifyContent: 'center' },
  fullRoot: { padding: space.md, gap: space.md },
  fullCaption: { paddingHorizontal: space.sm },
});
