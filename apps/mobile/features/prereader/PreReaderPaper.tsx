// The pre-reader paper (prompt 16): for children who can't read yet. One question
// per screen, a big speaker button that plays the question (clip → device speech,
// DESIGN_SYSTEM §3.1), huge picture tiles, and gentle feedback on every tap (the
// tile fills, a tick and the word "Picked" fade in). No right/wrong here: answer
// keys never reach students (rule 9); marking is the server's job.
// Touch, mouse and keyboard all work: tiles are focusable radios (Tab + Enter/Space).
import {
  tapChoices,
  type AnswerValue,
  type Answers,
  type AttemptQuestion,
  type TapChoice,
  promptText,
} from '@school/core';
import { useEffect, useRef, useState } from 'react';
import { Image, Platform, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useI18n } from '../../i18n';
import { Button, Icon, Text, TileBurst, useCues, useTheme } from '../../ui';
import { useEnterStyle } from '../../ui/motion';
import { PressableSticker } from '../../ui/Sticker';
import { radiusFor, space } from '../../ui/tokens';
import { canReadAloud, readAloud, stopAll } from './readAloud';

/** Tiles: well above the 56 dp kid minimum; two per row on a phone. */
const TILE_MIN_HEIGHT = 160;
const TILE_BASIS = 150;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

function TileFace({ c, index }: { c: TapChoice; index: number }) {
  const { t } = useI18n();
  if (c.kind === 'emoji') {
    return (
      <Text variant="display" style={styles.emoji} accessible={false}>
        {Array.from({ length: c.count }, () => c.emoji).join('')}
      </Text>
    );
  }
  if (c.kind === 'image' && /^https:\/\//.test(c.image)) {
    return (
      <Image
        source={{ uri: c.image }}
        style={styles.image}
        resizeMode="contain"
        accessible={false}
      />
    );
  }
  return (
    <Text variant="title">
      {c.label ?? t('student.prereader.choiceFallback', { number: index + 1 })}
    </Text>
  );
}

function PickedMark({ visible }: { visible: boolean }) {
  const { t } = useI18n();
  const style = useEnterStyle('selectionChange', visible);
  return (
    <Animated.View style={[styles.picked, style]} pointerEvents="none">
      <Icon name="checkCircle" tone="onPrimarySoft" size={28} />
      <Text variant="label" tone="onPrimarySoft">
        {t('student.prereader.picked')}
      </Text>
    </Animated.View>
  );
}

/** The picture gives a little bounce each time it is tapped (`kidPick`; lite/off: still). */
function PickBounce({ trigger, children }: { trigger: number; children: React.ReactNode }) {
  return trigger > 0 ? (
    <Bounce key={trigger}>{children}</Bounce>
  ) : (
    <View style={styles.centreBox}>{children}</View>
  );
}

function Bounce({ children }: { children: React.ReactNode }) {
  const pop = useEnterStyle('kidPick', true, { scaleFrom: 0.82 });
  return <Animated.View style={[styles.centreBox, pop]}>{children}</Animated.View>;
}

/** Progress as mosaic chips (wireframe "Practice: kid"): squares and diamonds, set when answered. */
function ProgressChips({
  total,
  page,
  answered,
}: {
  total: number;
  page: number;
  answered: boolean[];
}) {
  const { colours, scheme } = useTheme();
  const outline = scheme === 'dark' ? colours.borderStrong : colours.ink;
  return (
    <View style={styles.dots} accessible={false}>
      {Array.from({ length: total }, (_, i) => {
        const here = i === page;
        const size = here ? 30 : 24;
        return (
          <View
            key={i}
            style={{
              width: size,
              height: size,
              borderRadius: 7,
              borderWidth: here ? 3 : 2.5,
              borderColor: outline,
              backgroundColor: answered[i] ? colours.ink : here ? colours.accent : 'transparent',
              transform: i % 2 === 0 ? [{ rotate: '45deg' }, { scale: 0.82 }] : undefined,
            }}
          />
        );
      })}
    </View>
  );
}

function Tile({
  c,
  index,
  selected,
  disabled,
  onPick,
}: {
  c: TapChoice;
  index: number;
  selected: boolean;
  disabled?: boolean;
  onPick: () => void;
}) {
  const { t } = useI18n();
  const { colours, presentation } = useTheme();
  const { cue } = useCues();
  const [picks, setPicks] = useState(0);
  const label = c.label ?? t('student.prereader.choiceFallback', { number: index + 1 });
  return (
    <PressableSticker
      onPress={() => {
        cue('pop');
        setPicks((n) => n + 1);
        onPick();
      }}
      disabled={disabled}
      radius={radiusFor('lg', presentation)}
      depth="sticker"
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      aria-checked={selected}
      style={styles.tileCell}
      faceStyle={() => [
        styles.tile,
        { backgroundColor: selected ? colours.primarySoft : colours.surface },
        selected ? { borderColor: colours.primary, borderWidth: 3 } : null,
      ]}
    >
      <PickBounce trigger={picks}>
        <TileFace c={c} index={index} />
      </PickBounce>
      <PickedMark visible={selected} />
      {picks > 0 && selected ? (
        <TileBurst moment="kidPick" trigger={picks} count={9} radius={80} />
      ) : null}
    </PressableSticker>
  );
}

export function PreReaderPaper({
  questions,
  answers,
  onAnswer,
  onFinish,
  busy,
  footer,
  finishLabel,
}: {
  questions: AttemptQuestion[];
  answers: Answers;
  onAnswer: (questionId: string, v: AnswerValue) => void;
  onFinish: () => void;
  busy: boolean;
  /** Status lines (draft saved, blank warning, errors) shown above the buttons. */
  footer?: React.ReactNode;
  /** Overrides "Finish my test" (e.g. "Send anyway" after the blank warning). */
  finishLabel?: string;
}) {
  const { t, locale } = useI18n();
  const { colours } = useTheme();
  const [page, setPage] = useState(0);
  const q = questions[Math.min(page, questions.length - 1)]!;
  const body = isObj(q.body) ? q.body : {};
  const choices = tapChoices(body, locale);
  const stem = promptText(body, locale) ?? t('student.prereader.tapFallback');
  const last = page >= questions.length - 1;
  const speakable = canReadAloud(body, locale);
  // Play each new question by itself once the child has moved on (a tap gives the
  // browser the gesture it needs); on Android the first one plays at once too.
  const moved = useRef(Platform.OS !== 'web');

  useEffect(() => {
    if (moved.current && speakable) readAloud(body, locale).catch(() => undefined);
    // body is derived from q; q.id + locale identify it.
  }, [q.id, locale]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => stopAll(), []);

  const go = (to: number) => {
    stopAll();
    moved.current = true;
    setPage(Math.max(0, Math.min(questions.length - 1, to)));
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.top}>
        <Text variant="label" tone="textMuted" accessibilityLiveRegion="polite">
          {t('student.prereader.progress', { number: page + 1, total: questions.length })}
        </Text>
        <ProgressChips
          total={questions.length}
          page={page}
          answered={questions.map((qq) => answers[qq.id] !== undefined && answers[qq.id] !== null)}
        />
      </View>

      <View style={styles.ask}>
        {speakable ? (
          <PressableSticker
            radius={radiusFor('lg', 'kid')}
            onPress={() => {
              moved.current = true;
              readAloud(body, locale).catch(() => undefined);
            }}
            accessibilityRole="button"
            accessibilityLabel={t('student.prereader.listen')}
            faceStyle={(pressed) => [
              styles.speaker,
              { backgroundColor: pressed ? colours.surfaceAlt : colours.surface },
            ]}
          >
            <Icon name="speaker" size={34} />
            <Text variant="caption" style={styles.speakerLabel}>
              {t('student.prereader.listenShort')}
            </Text>
          </PressableSticker>
        ) : null}
        <Text variant="title" style={[styles.stem, speakable ? styles.stemSide : null]}>
          {stem}
        </Text>
      </View>

      <View accessibilityRole="radiogroup" accessibilityLabel={stem} style={styles.grid}>
        {choices.map((c, i) => (
          <Tile
            key={c.id}
            c={c}
            index={i}
            selected={answers[q.id] === c.id}
            disabled={busy}
            onPick={() => onAnswer(q.id, c.id)}
          />
        ))}
      </View>

      {last ? footer : null}
      <View style={styles.nav}>
        {page > 0 ? (
          <Button
            title={t('student.prereader.back')}
            icon="chevronStart"
            variant="secondary"
            size="lg"
            onPress={() => go(page - 1)}
            disabled={busy}
            style={styles.flex}
          />
        ) : null}
        {last ? (
          <Button
            title={
              busy
                ? t('student.attempt.submitting')
                : (finishLabel ?? t('student.prereader.finish'))
            }
            icon="check"
            size="lg"
            loading={busy}
            onPress={() => {
              stopAll();
              onFinish();
            }}
            style={styles.flex}
          />
        ) : (
          <Button
            title={t('student.prereader.next')}
            icon="chevronEnd"
            size="lg"
            onPress={() => go(page + 1)}
            style={styles.flex}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.lg },
  top: { gap: space.xs },
  dots: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    minHeight: 36,
  },
  ask: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  speaker: {
    width: 76,
    minHeight: 76,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: space.xs,
  },
  speakerLabel: { fontWeight: '800' },
  stem: { textAlign: 'center', flex: 1 },
  stemSide: { textAlign: 'auto' },
  centreBox: { alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.lg },
  tileCell: { flexGrow: 1, flexBasis: TILE_BASIS },
  tile: {
    minHeight: TILE_MIN_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.md,
    gap: space.sm,
  },
  emoji: { textAlign: 'center' },
  image: { width: 140, height: 112 },
  picked: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  nav: { flexDirection: 'row', gap: space.md },
  flex: { flex: 1 },
});
