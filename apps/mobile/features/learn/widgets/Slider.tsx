// A widget slider (DESIGN_SYSTEM.md §7b.6): the knob follows the finger every
// frame on the UI thread (Gesture Handler + shared values, never setState per
// frame); the value snaps to the author's step and is written straight into
// the widget's shared values, so geometry redraws without React. The readout
// ("m = 2") updates only when the snapped value changes. Keyboard: ←/→ (or
// ↓/↑) by one step, Home/End; screen readers get role "adjustable" with the
// spoken value. Always left-to-right, like a number line.
import { snap, type SliderSpec } from '@school/core';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { Text, useTheme } from '../../../ui';
import { animateTo, useMoment } from '../../../ui/motion';
import { diagram, radius, space } from '../../../ui/tokens';

const KNOB = 28;

function snapW(v: number, min: number, max: number, step: number) {
  'worklet';
  const c = Math.min(max, Math.max(min, v));
  const k = Math.round((c - min) / step);
  return Number(Math.min(max, min + k * step).toFixed(6));
}

export function fmtSlider(v: number): string {
  return String(Math.round(v * 1000) / 1000);
}

export function Slider({
  spec,
  values,
  index,
  label,
  unit,
  colour = diagram.focus,
  onValue,
}: {
  spec: SliderSpec;
  /** The widget's parameters, one slot per slider. */
  values: SharedValue<number[]>;
  index: number;
  /** Spoken + shown name, e.g. "m" or "starting speed u". */
  label: string;
  unit?: string;
  colour?: string;
  onValue?: (v: number) => void;
}) {
  const { colours, p } = useTheme();
  const settle = useMoment('selectionChange');
  const { min, max, step } = spec;
  const frac = (v: number) => (v - min) / (max - min);
  const [w, setW] = useState(0);
  const [shown, setShown] = useState(spec.value);
  const [focused, setFocused] = useState(false);
  const width = useSharedValue(0);
  const pos = useSharedValue(frac(spec.value));

  const write = (v: number) => {
    'worklet';
    const cur = values.get();
    if (cur[index] === v) return;
    const next = cur.slice();
    next[index] = v;
    values.set(next);
  };

  useAnimatedReaction(
    () => values.get()[index] ?? spec.value,
    (v, prev) => {
      if (v !== prev && onValue) scheduleOnRN(onValue, v);
      if (v !== prev) scheduleOnRN(setShown, v);
    },
  );

  const fromX = (x: number) => {
    'worklet';
    const W = width.get();
    if (W <= 0) return;
    const f = Math.min(1, Math.max(0, (x - KNOB / 2) / (W - KNOB)));
    pos.set(f);
    write(snapW(min + f * (max - min), min, max, step));
  };
  const pan = Gesture.Pan()
    .minDistance(0)
    .onBegin((e) => fromX(e.x))
    .onUpdate((e) => fromX(e.x))
    .onFinalize(() => {
      const v = values.get()[index] ?? spec.value;
      pos.set(animateTo(settle, (v - min) / (max - min)));
    });

  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pos.get() * Math.max(0, width.get() - KNOB) }],
  }));
  const fillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (pos.get() - 1) * Math.max(0, width.get() - KNOB) }],
  }));

  const nudge = (d: number) => {
    const cur = values.get()[index] ?? spec.value;
    const v = snap(cur + d * step, min, max, step);
    write(v);
    pos.set(animateTo(settle, frac(v)));
  };
  const jump = (v: number) => {
    write(v);
    pos.set(animateTo(settle, frac(v)));
  };

  // Arrow keys while focused (Chromebook / Windows).
  useEffect(() => {
    if (!focused || Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      const k = e.key;
      if (k === 'ArrowRight' || k === 'ArrowUp') nudge(1);
      else if (k === 'ArrowLeft' || k === 'ArrowDown') nudge(-1);
      else if (k === 'Home') jump(min);
      else if (k === 'End') jump(max);
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }); // re-bound each render: nudge reads the latest closure

  const text = `${label} = ${fmtSlider(shown)}${unit ? ` ${unit}` : ''}`;
  const hit = Math.max(p.minTarget, KNOB + 12);

  return (
    <View style={styles.row}>
      <Text variant="label" script="latin" style={styles.readout}>
        {text}
      </Text>
      <GestureDetector gesture={pan}>
        <Pressable
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          accessibilityRole="adjustable"
          accessibilityLabel={label}
          accessibilityValue={{ min, max, now: shown, text }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(e) => nudge(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
          onLayout={(e) => {
            const W = e.nativeEvent.layout.width;
            setW(W);
            width.set(W);
          }}
          style={[
            styles.hit,
            { height: hit },
            focused
              ? { outlineColor: colours.focus, outlineWidth: 3, outlineStyle: 'solid' }
              : null,
          ]}
        >
          <View style={[styles.track, { marginHorizontal: KNOB / 2 }]}>
            {w > 0 ? (
              <Animated.View style={[styles.fill, { backgroundColor: colour }, fillStyle]} />
            ) : null}
          </View>
          <Animated.View
            pointerEvents="none"
            style={[styles.knob, { borderColor: diagram.ink, backgroundColor: colour }, knobStyle]}
          />
        </Pressable>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: 2, direction: 'ltr' },
  // The stage is paper-white in both themes: diagram ink, never the theme's text colour.
  readout: { color: diagram.ink, fontVariant: ['tabular-nums'] },
  hit: { justifyContent: 'center', borderRadius: radius.md },
  track: {
    height: 8,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: diagram.ink,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  fill: { ...StyleSheet.absoluteFill },
  knob: {
    position: 'absolute',
    left: 0,
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
    borderWidth: 3,
  },
});

export const sliderGap = space.sm;
