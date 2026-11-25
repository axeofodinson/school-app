// Mosaic tiles that turn calmly between square, star, diamond and rosette
// (`shapeMorph`, DECISIONS #126). Each tile is three rounded squares ("petals")
// rotated and scaled about its centre: transform only, computed on the UI thread from
// one shared clock per group, so nothing re-renders while it moves and a busy JS
// thread can't stutter it. Outlines sit behind fills, so overlaps read as one shape.
import { morphHold, morphKeyframes, morphPose, morphSequence } from '@school/core/design';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { useI18n } from '../i18n';
import { useMoment } from './motion';
import { duration } from './tokens';

const { angles: KEY_ANGLES, scales: KEY_SCALES } = morphKeyframes();
const STEPS = morphSequence.length;
/** Loops per withRepeat cycle: long enough that the restart is rare, and it is seamless anyway. */
const LOOPS_PER_CYCLE = 50;

export type MorphClock = { clock: SharedValue<number>; moving: boolean };

/**
 * One clock (in morph steps) for a group of tiles. Full: runs forward while the screen is
 * focused, resuming where it stopped. Lite: one pass through the shapes each time the
 * screen opens. Off, reduce motion and exams: still.
 */
export function useMorphClock(): MorphClock {
  const b = useMoment('shapeMorph');
  const moving = b.kind === 'timing';
  const key = b.kind === 'timing' ? `${b.duration}:${b.repeat ?? 'once'}` : b.kind;
  const clock = useSharedValue(0);

  useFocusEffect(
    useCallback(() => {
      if (b.kind !== 'timing') {
        cancelAnimation(clock);
        clock.set(0);
        return;
      }
      const step = duration[b.duration];
      const from = clock.get();
      const loops = b.repeat === 'loop' ? LOOPS_PER_CYCLE : 1;
      // Linear clock; the easing lives in morphPose (hold, then a smootherstep turn).
      const run = withTiming(from + STEPS * loops, {
        duration: step * STEPS * loops,
        easing: Easing.linear,
      });
      clock.set(b.repeat === 'loop' ? withRepeat(run, -1, false) : run);
      return () => cancelAnimation(clock);
      // b is identified by key (exam/off resolve to a fresh object each render).
    }, [key, clock]), // eslint-disable-line react-hooks/exhaustive-deps
  );
  return { clock, moving };
}

function usePetalStyle(
  pose: SharedValue<{ a0: number; a1: number; a2: number; scale: number }>,
  k: 0 | 1 | 2,
  dir: number,
) {
  return useAnimatedStyle(() => {
    const p = pose.get();
    const a = k === 0 ? p.a0 : k === 1 ? p.a1 : p.a2;
    return { transform: [{ rotate: `${a * dir}deg` }, { scale: p.scale }] };
  });
}

/**
 * One morphing tile. `phase` is its place in the loop (in steps): give neighbours
 * different phases for a rolling wave. Decoration only: hidden from screen readers.
 */
export function MorphTile({
  morph,
  phase = 0,
  size,
  fill,
  outline,
  stroke = 2,
  style,
}: {
  morph: MorphClock;
  phase?: number;
  size: number;
  fill: string;
  outline: string;
  stroke?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { isRTL } = useI18n();
  const dir = isRTL ? -1 : 1;
  const { clock, moving } = morph;
  // Still tiles rest exactly on a shape, never part-way through a turn.
  const offset = moving ? phase : Math.floor(phase);
  const pose = useDerivedValue(() =>
    morphPose(clock.get() + offset, KEY_ANGLES, KEY_SCALES, morphHold),
  );
  const s0 = usePetalStyle(pose, 0, dir);
  const s1 = usePetalStyle(pose, 1, dir);
  const s2 = usePetalStyle(pose, 2, dir);
  const petals = [s0, s1, s2];

  const box = { width: size, height: size };
  const r = size * 0.2;
  return (
    <View
      style={[box, style]}
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      {petals.map((s, i) => (
        <Animated.View
          key={`o${i}`}
          style={[styles.layer, box, { borderRadius: r, backgroundColor: outline }, s]}
        />
      ))}
      {petals.map((s, i) => (
        <Animated.View key={`f${i}`} style={[styles.layer, box, s]}>
          <View
            style={[
              styles.fill,
              {
                top: stroke,
                bottom: stroke,
                start: stroke,
                end: stroke,
                borderRadius: Math.max(0, r - stroke),
                backgroundColor: fill,
              },
            ]}
          />
        </Animated.View>
      ))}
    </View>
  );
}

/**
 * The school's mosaic mark (the `mosaic` icon) as four morphing tiles in a 2×2 grid.
 * `fill` is the surface it sits on (the outline is `colour`), so it reads as a line mark.
 */
export function MosaicMark({
  size,
  colour,
  fill,
  style,
}: {
  size: number;
  colour: string;
  fill: string;
  style?: StyleProp<ViewStyle>;
}) {
  const morph = useMorphClock();
  const gap = Math.round(size * 0.16);
  const tile = (size - gap) / 2;
  const stroke = Math.max(1.5, size / 16);
  return (
    <View
      style={[styles.mark, { width: size, height: size, gap }, style]}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      {[0, 1, 3, 2].map((slot) => (
        <MorphTile
          key={slot}
          morph={morph}
          phase={slot * 1.25}
          size={tile}
          fill={fill}
          outline={colour}
          stroke={stroke}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', top: 0, start: 0 },
  fill: { position: 'absolute' },
  mark: { flexDirection: 'row', flexWrap: 'wrap' },
});
