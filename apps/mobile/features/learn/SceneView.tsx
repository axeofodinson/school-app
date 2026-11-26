// `scene` block (DESIGN_SYSTEM.md §7b.1, §7b.4): one SVG with named layers and
// up to 8 steps that move or fade them, a caption per step.
//
// The SVG is parsed once (core `parseScene`) into a stack of standalone SVGs:
// static drawing, then a layer, then more static drawing, in the authored paint
// order. Each layer is its own composited view, so a step only tweens transform
// and opacity on the UI thread; nothing re-renders or re-lays-out per frame.
// Full = layers glide (`sceneStep`, the author's ms ≤ 4 s, ease-in-out);
// lite = cross-fade to the new state; off = instant, and Play steps once per tap.
// Never autoplays on open or on scroll; any playback has Pause (WCAG 2.2.2).
import { fitBox, parseScene, pickLang, type LessonBlock, type LessonLang } from '@school/core';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { SvgXml } from 'react-native-svg';

import { useI18n } from '../../i18n';
import { Icon, IconButton, Text, useTheme } from '../../ui';
import {
  duration,
  easings,
  useEnterStyle,
  useExiting,
  useMoment,
  useMotion,
} from '../../ui/motion';
import { behaviourProps, colours as palette, diagram, radius, space } from '../../ui/tokens';
import { useVisualSession } from './visualState';
import { LaterVisual } from './visuals';

type LayerVals = {
  x: SharedValue<number>;
  y: SharedValue<number>;
  scale: SharedValue<number>;
  rotate: SharedValue<number>;
  opacity: SharedValue<number>;
};

/** Reading time after a step settles before Play moves on (captions are short). */
function holdMs(caption: string): number {
  return Math.min(4000, Math.max(1600, 1100 + caption.length * 35));
}

function SceneLayer({
  xml,
  state,
  k,
  width,
  height,
  pivot,
  ms,
  mode,
}: {
  xml: string;
  state: { x: number; y: number; scale: number; rotate: number; opacity: number };
  k: number;
  width: number;
  height: number;
  /** Turning point in px from the drawing's top-left. */
  pivot: [number, number];
  ms: number;
  mode: 'glide' | 'fade' | 'snap';
}) {
  const v: LayerVals = {
    x: useSharedValue(state.x),
    y: useSharedValue(state.y),
    scale: useSharedValue(state.scale),
    rotate: useSharedValue(state.rotate),
    opacity: useSharedValue(state.opacity),
  };
  useEffect(() => {
    if (mode === 'snap') {
      v.x.set(state.x);
      v.y.set(state.y);
      v.scale.set(state.scale);
      v.rotate.set(state.rotate);
      v.opacity.set(state.opacity);
      return;
    }
    if (mode === 'glide') {
      const cfg = { duration: ms, easing: easings.inOut };
      v.x.set(withTiming(state.x, cfg));
      v.y.set(withTiming(state.y, cfg));
      v.scale.set(withTiming(state.scale, cfg));
      v.rotate.set(withTiming(state.rotate, cfg));
      v.opacity.set(withTiming(state.opacity, cfg));
      return;
    }
    // Lite: a layer that moves dips out, jumps, and fades back; one that only
    // changes opacity just fades. Same total time either way.
    const half = ms / 2;
    const moves =
      v.x.get() !== state.x ||
      v.y.get() !== state.y ||
      v.scale.get() !== state.scale ||
      v.rotate.get() !== state.rotate;
    if (!moves) {
      v.opacity.set(withTiming(state.opacity, { duration: ms }));
      return;
    }
    v.opacity.set(
      withSequence(
        withTiming(0, { duration: half }),
        withTiming(state.opacity, { duration: half }),
      ),
    );
    for (const [sv, to] of [
      [v.x, state.x],
      [v.y, state.y],
      [v.scale, state.scale],
      [v.rotate, state.rotate],
    ] as const)
      sv.set(withDelay(half, withTiming(to, { duration: 0 })));
    // Shared values are stable; the step's target state is the trigger.
  }, [state, mode, ms]); // eslint-disable-line react-hooks/exhaustive-deps

  const dx = pivot[0] - width / 2;
  const dy = pivot[1] - height / 2;
  const style = useAnimatedStyle(() => ({
    opacity: v.opacity.get(),
    transform: [
      { translateX: v.x.get() * k + dx },
      { translateY: v.y.get() * k + dy },
      { rotate: `${v.rotate.get()}deg` },
      { scale: v.scale.get() },
      { translateX: -dx },
      { translateY: -dy },
    ],
  }));
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <SvgXml xml={xml} width={width} height={height} />
    </Animated.View>
  );
}

export function SceneView({
  block,
  lang,
  predictReady = false,
  showCaption = false,
}: {
  block: LessonBlock;
  lang: LessonLang;
  /** A predict question is waiting under the stage (its item is readable). */
  predictReady?: boolean;
  /** Draw the step caption inside the stage (standalone use; the reader shows it beside). */
  showCaption?: boolean;
}) {
  const { t } = useI18n();
  const { tier, inExam } = useMotion();
  const b = useMoment('sceneStep');
  const s = useVisualSession();
  const spec = useMemo(() => parseScene(block), [block]);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const count = spec?.steps.length ?? 0;
  const step = Math.min(s.step, Math.max(0, count - 1));
  const last = step >= count - 1;
  const waiting = predictReady && !s.predicted;
  const { setCount, setPlaying, setStep, playing, playToken } = s;

  useEffect(() => {
    setCount(count);
  }, [count, setCount]);

  const mode: 'glide' | 'fade' | 'snap' =
    b.kind === 'none' || inExam
      ? 'snap'
      : behaviourProps(b).includes('translateX')
        ? 'glide'
        : 'fade';
  const stepMs = (i: number) =>
    mode === 'glide'
      ? (spec?.steps[i]?.ms ?? duration[b.kind === 'timing' ? b.duration : 'slow'])
      : b.kind === 'timing'
        ? duration[b.duration]
        : 0;

  // Play: after a step settles and its caption has been read, move on; stop on the last.
  useEffect(() => {
    if (!playing || !spec) return;
    if (last) {
      setPlaying(false);
      return;
    }
    const caption = pickLang(spec.steps[step]?.caption, lang)?.text ?? '';
    const id = setTimeout(() => setStep(step + 1), stepMs(step) + holdMs(caption));
    return () => clearTimeout(id);
  }, [playing, step, last, spec, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const play = () => {
    if (!spec) return;
    if (waiting) s.setPredicted(true); // "Skip, just watch"
    if (tier === 'off' || mode === 'snap') {
      // No autoplay when motion is off: each tap shows the next step.
      setStep(last ? 0 : step + 1);
      return;
    }
    if (playing) setPlaying(false);
    else if (last) {
      // Replay: rewind to the start, then play through.
      setStep(0);
      setPlaying(true);
    } else {
      setStep(step + 1);
      setPlaying(step + 1 < count - 1);
    }
  };

  // The reader's Play button and Space arrive as a token.
  useEffect(() => {
    if (playToken > 0) play();
  }, [playToken]); // eslint-disable-line react-hooks/exhaustive-deps

  const veil = useEnterStyle('predictReveal', waiting);
  const veilOut = useExiting('predictReveal');

  if (!spec) return <LaterVisual block={block} lang={lang} broken />;

  const [vx, vy, vw, vh] = spec.viewBox;
  const fit = fitBox(box.w, box.h, vw / vh);
  const k = fit.width / vw;
  const caption = pickLang(spec.steps[step]?.caption, lang)?.text ?? '';
  const onLayout = (e: LayoutChangeEvent) =>
    setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });

  return (
    <View style={styles.fill}>
      <View style={styles.fill} onLayout={onLayout}>
        {fit.width > 0 ? (
          <View
            style={[
              styles.abs,
              { left: fit.left, top: fit.top, width: fit.width, height: fit.height },
            ]}
          >
            {spec.slices.map((sl, i) =>
              sl.layer ? (
                <SceneLayer
                  key={i}
                  xml={sl.svg}
                  state={spec.states[step]![sl.layer]!}
                  k={k}
                  width={fit.width}
                  height={fit.height}
                  pivot={[
                    ((spec.pivots[sl.layer]?.[0] ?? 0) - vx) * k,
                    ((spec.pivots[sl.layer]?.[1] ?? 0) - vy) * k,
                  ]}
                  ms={stepMs(step)}
                  mode={mode}
                />
              ) : (
                <View key={i} pointerEvents="none" style={StyleSheet.absoluteFill}>
                  <SvgXml xml={sl.svg} width={fit.width} height={fit.height} />
                </View>
              ),
            )}
          </View>
        ) : null}
        {waiting ? (
          <Animated.View exiting={veilOut} style={[styles.veil, veil]}>
            <View style={styles.veilChip}>
              <Icon name="sparkles" size={18} colour={diagram.ink} />
              <Text variant="label" style={{ color: diagram.ink }}>
                {t('student.learn.predictFirst')}
              </Text>
            </View>
          </Animated.View>
        ) : null}
      </View>
      <SceneBar
        step={step}
        count={count}
        playing={playing}
        canPlay={tier !== 'off' && mode !== 'snap'}
        onStep={(i) => {
          setPlaying(false);
          if (waiting) s.setPredicted(true);
          setStep(i);
        }}
        onPlay={play}
        waiting={waiting}
      />
      {showCaption ? (
        <View style={styles.caption}>
          <Text variant="bodySm" style={{ color: diagram.ink }} accessibilityLiveRegion="polite">
            {caption}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/** Scene steps under the drawing: ◀ ● ● ○ ○ ▶ and Play / Pause / Replay. */
function SceneBar({
  step,
  count,
  playing,
  canPlay,
  onStep,
  onPlay,
  waiting,
}: {
  step: number;
  count: number;
  playing: boolean;
  canPlay: boolean;
  onStep: (i: number) => void;
  onPlay: () => void;
  waiting: boolean;
}) {
  const { t } = useI18n();
  const { colours } = useTheme();
  const last = step >= count - 1;
  const icon = playing ? 'pause' : last && count > 1 ? 'replay' : 'play';
  const label = playing
    ? t('student.learn.pause')
    : last && count > 1
      ? t('student.learn.replay')
      : canPlay
        ? t(waiting ? 'student.learn.justWatch' : 'student.learn.play')
        : t('student.learn.nextStep');
  return (
    <View style={styles.bar}>
      <IconButton
        icon="chevronStart"
        label={t('student.learn.prevStep')}
        variant="ghost"
        disabled={step <= 0}
        onPress={() => onStep(step - 1)}
      />
      <View
        style={styles.pills}
        accessibilityLabel={t('student.learn.sceneStep', { n: step + 1, total: count })}
      >
        {Array.from({ length: count }, (_, i) => (
          <StepPill key={i} on={i === step} seen={i < step} colour={colours.primary} />
        ))}
      </View>
      <IconButton
        icon="chevronEnd"
        label={t('student.learn.nextStep')}
        variant="ghost"
        disabled={last}
        onPress={() => onStep(step + 1)}
      />
      <View style={styles.flex} />
      <Text variant="label" script="latin" style={{ color: palette.light.textMuted }}>
        {`${step + 1}/${count}`}
      </Text>
      <IconButton icon={icon} label={label} variant="primary" onPress={onPlay} />
    </View>
  );
}

function StepPill({ on, seen, colour }: { on: boolean; seen: boolean; colour: string }) {
  const grow = useEnterStyle('selectionChange', on, { scaleFrom: 0.6 });
  return (
    <View style={styles.pillHit}>
      <View
        style={[
          styles.pill,
          {
            borderColor: diagram.ink,
            backgroundColor: seen ? palette.light.accent : 'transparent',
          },
        ]}
      />
      <Animated.View style={[styles.pillNow, { backgroundColor: colour }, grow]} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex: { flexGrow: 1 },
  abs: { position: 'absolute' },
  veil: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: space.md,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  veilChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: diagram.ink,
    backgroundColor: palette.light.accent,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderTopWidth: 2,
    borderTopColor: diagram.ink,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  pills: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pillHit: { width: 22, height: 14, alignItems: 'center', justifyContent: 'center' },
  pill: { width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
  pillNow: { position: 'absolute', width: 20, height: 10, borderRadius: 5 },
  caption: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    backgroundColor: palette.light.surface,
  },
});
