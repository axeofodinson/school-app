// `number_line` widget: drag the marker along the line (it snaps to the
// author's step and follows the finger on the UI thread), or hop by `jump`
// with the ± buttons; each hop leaves an arc so "start at 3, jump 4 three
// times" is visible. A `target` turns it into a find-it task. Always
// left-to-right (negative on the left), like the textbook, in Urdu too.
import { fmtNum, snap, type WidgetSpec } from '@school/core';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import Svg, { Line, Path, Text as SvgText } from 'react-native-svg';

import { useI18n } from '../../../i18n';
import { Button, Icon, Text, useCues, useTheme } from '../../../ui';
import { animateTo, useEnterStyle, useMoment } from '../../../ui/motion';
import { colours as palette, diagram, radius, space } from '../../../ui/tokens';

type Spec = Extract<WidgetSpec, { widget: 'number_line' }>;
const FONT = diagram.labelFont.latin.family;
const PAD = 24;
const LINE_Y = 70;

export function NumberLine({ spec }: { spec: Spec }) {
  const { t } = useI18n();
  const { colours } = useTheme();
  const { cue } = useCues();
  const settle = useMoment('hotspotReveal');
  const { min, max, step } = spec;
  const [w, setW] = useState(0);
  const [value, setValue] = useState(spec.start);
  const [hops, setHops] = useState<[number, number][]>([]);
  const [focused, setFocused] = useState(false);
  const width = useSharedValue(0);
  const pos = useSharedValue((spec.start - min) / (max - min));
  // Last snapped value seen on the UI thread: React hears only real changes.
  const lastV = useSharedValue(spec.start);
  const iw = Math.max(1, w - PAD * 2);
  const px = (v: number) => PAD + ((v - min) / (max - min)) * iw;

  const n = Math.round((max - min) / step);
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 34))));
  const found = spec.target !== null && Math.abs(value - spec.target) < step / 2;
  const pop = useEnterStyle('answerCorrect', found, { scaleFrom: 0.9 });

  useEffect(() => {
    if (found) cue('ding');
  }, [found, cue]);

  const moveTo = (v: number, hop: boolean) => {
    const to = snap(v, min, max, step);
    if (hop && to !== value) setHops((h) => [...h.slice(-7), [value, to]]);
    setValue(to);
    lastV.set(to);
    pos.set(animateTo(settle, (to - min) / (max - min)));
  };

  const fromX = (x: number) => {
    'worklet';
    const W = width.get() - PAD * 2;
    if (W <= 0) return;
    const f = Math.min(1, Math.max(0, (x - PAD) / W));
    pos.set(f);
    const k = Math.round((f * (max - min)) / step);
    const v = Number(Math.min(max, min + k * step).toFixed(6));
    if (v !== lastV.get()) {
      lastV.set(v);
      scheduleOnRN(setValue, v);
    }
  };
  // Declared before the gesture: its worklets capture this when they are built.
  const settleTo = () => {
    setHops([]);
    setValue((v) => {
      pos.set(animateTo(settle, (v - min) / (max - min)));
      return v;
    });
  };
  const pan = Gesture.Pan()
    .minDistance(0)
    .onBegin((e) => fromX(e.x))
    .onUpdate((e) => fromX(e.x))
    .onFinalize(() => scheduleOnRN(settleTo));

  useEffect(() => {
    if (!focused || Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') moveTo(value + step, false);
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') moveTo(value - step, false);
      else if (e.key === 'Home') moveTo(min, false);
      else if (e.key === 'End') moveTo(max, false);
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  });

  const marker = useAnimatedStyle(() => ({
    transform: [{ translateX: PAD + pos.get() * Math.max(0, width.get() - PAD * 2) - 18 }],
  }));

  return (
    <View style={styles.root}>
      <GestureDetector gesture={pan}>
        <Pressable
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          accessibilityRole="adjustable"
          accessibilityLabel={t('student.learn.widget.numberLine')}
          accessibilityValue={{ min, max, now: value, text: fmtNum(value) }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(e) =>
            moveTo(value + (e.nativeEvent.actionName === 'increment' ? step : -step), false)
          }
          onLayout={(e) => {
            setW(e.nativeEvent.layout.width);
            width.set(e.nativeEvent.layout.width);
          }}
          style={[
            styles.lineBox,
            focused
              ? { outlineColor: colours.focus, outlineWidth: 3, outlineStyle: 'solid' }
              : null,
          ]}
        >
          {w > 0 ? (
            <Svg width={w} height={110}>
              {hops.map(([a, b], i) => {
                const x0 = px(a);
                const x1 = px(b);
                const hgt = Math.min(44, Math.abs(x1 - x0) / 2 + 10);
                return (
                  <Path
                    key={i}
                    d={`M${x0} ${LINE_Y - 4} Q${(x0 + x1) / 2} ${LINE_Y - 4 - hgt * 2} ${x1} ${LINE_Y - 4}`}
                    fill="none"
                    stroke={diagram.highlight}
                    strokeWidth={3}
                    strokeLinecap="round"
                  />
                );
              })}
              <Line
                x1={PAD - 10}
                x2={PAD + iw + 10}
                y1={LINE_Y}
                y2={LINE_Y}
                stroke={diagram.ink}
                strokeWidth={2}
                strokeLinecap="round"
              />
              {Array.from({ length: n + 1 }, (_, i) => {
                const v = min + i * step;
                const major = i % labelEvery === 0;
                return (
                  <Line
                    key={i}
                    x1={px(v)}
                    x2={px(v)}
                    y1={LINE_Y - (major ? 8 : 5)}
                    y2={LINE_Y + (major ? 8 : 5)}
                    stroke={major ? diagram.ink : diagram.guide}
                    strokeWidth={2}
                  />
                );
              })}
              {Array.from({ length: n + 1 }, (_, i) =>
                i % labelEvery === 0 ? (
                  <SvgText
                    key={i}
                    x={px(min + i * step)}
                    y={LINE_Y + 26}
                    fontSize={12}
                    fontFamily={FONT}
                    fontWeight="700"
                    fill={diagram.ink}
                    textAnchor="middle"
                  >
                    {fmtNum(min + i * step)}
                  </SvgText>
                ) : null,
              )}
              {spec.target !== null ? (
                <Path
                  d={`M${px(spec.target)} ${LINE_Y + 34}l-6 9h12z`}
                  fill={diagram.result}
                  stroke={diagram.ink}
                  strokeWidth={1.5}
                />
              ) : null}
            </Svg>
          ) : null}
          <Animated.View pointerEvents="none" style={[styles.marker, marker]}>
            <View style={styles.markerChip}>
              <Text variant="label" script="latin" style={styles.markerText}>
                {fmtNum(value)}
              </Text>
            </View>
            <View style={styles.markerStem} />
          </Animated.View>
        </Pressable>
      </GestureDetector>
      <View style={styles.row}>
        {spec.jump !== null ? (
          <>
            <Button
              size="sm"
              variant="secondary"
              title={`− ${fmtNum(spec.jump)}`}
              onPress={() => moveTo(value - spec.jump!, true)}
            />
            <Button
              size="sm"
              title={`+ ${fmtNum(spec.jump)}`}
              onPress={() => moveTo(value + spec.jump!, true)}
            />
          </>
        ) : null}
        <View style={styles.flex} />
        {spec.target !== null ? (
          found ? (
            <Animated.View style={[styles.found, pop]}>
              <Icon name="check" size={18} colour={diagram.result} />
              <Text variant="label" style={{ color: palette.light.onCorrectSoft }}>
                {t('student.learn.widget.found', { n: fmtNum(spec.target) })}
              </Text>
            </Animated.View>
          ) : (
            <Text variant="bodySm" style={{ color: diagram.guide }}>
              {t('student.learn.widget.findIt', { n: fmtNum(spec.target) })}
            </Text>
          )
        ) : (
          <Text variant="bodySm" style={{ color: diagram.guide }}>
            {t('student.learn.widget.dragMarker')}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', gap: space.sm, padding: space.md, direction: 'ltr' },
  flex: { flexGrow: 1 },
  lineBox: { height: 110, borderRadius: radius.md },
  marker: { position: 'absolute', top: 8, left: 0, width: 36, alignItems: 'center' },
  markerChip: {
    minWidth: 36,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: diagram.ink,
    backgroundColor: diagram.focus,
    alignItems: 'center',
  },
  markerText: { color: '#FFFFFF' },
  markerStem: { width: 3, height: 28, backgroundColor: diagram.focus },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  found: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: 4,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: diagram.result,
    backgroundColor: palette.light.correctSoft,
  },
});
