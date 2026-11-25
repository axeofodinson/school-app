// `motion_graph` widget: a car moves along a track while its distance–time (or
// speed–time) graph draws alongside. Sliders set the starting speed u and the
// acceleration a; Play runs the clock in real time (s = ut + ½at², the car
// stops rather than reverses when braking). Drag across the graph to scrub
// time. Everything moving is a shared value: the car is a transform, the line
// is rebuilt on the UI thread. Motion off: Play jumps to the end (no autoplay);
// scrubbing always works, because direct manipulation is never removed.
import { fmtNum, motionAt, motionRange, niceScale, type WidgetSpec } from '@school/core';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedProps,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';

import { useI18n } from '../../../i18n';
import { IconButton, Text } from '../../../ui';
import { useMotion } from '../../../ui/motion';
import { diagram, space } from '../../../ui/tokens';
import { Slider } from './Slider';
import { distanceAtW, speedAtW } from './vm';

type Spec = Extract<WidgetSpec, { widget: 'motion_graph' }>;
const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const FONT = diagram.labelFont.latin.family;
const PAD = { start: 40, end: 12, top: 10, bottom: 26 };
const CAR_W = 46;

function Car() {
  return (
    <Svg width={CAR_W} height={28} viewBox="12 80 60 48">
      <Path
        d="M14 114 L14 100 Q16 94 24 94 L32 94 L40 82 L58 82 L66 94 Q70 96 70 102 L70 114 Z"
        fill={diagram.focus}
        stroke={diagram.ink}
        strokeWidth={3}
        strokeLinejoin="round"
      />
      <Path d="M43 86 L56 86 L61 94 L38 94 Z" fill="#E6E2FF" stroke={diagram.ink} strokeWidth={2} />
      <Circle cx={26} cy={118} r={9} fill={diagram.ink} />
      <Circle cx={58} cy={118} r={9} fill={diagram.ink} />
    </Svg>
  );
}

export function MotionGraph({ spec, playToken = 0 }: { spec: Spec; playToken?: number }) {
  const { t } = useI18n();
  const { tier } = useMotion();
  const T = spec.t;
  const uIdx = spec.sliders.findIndex((s) => s.name === 'u');
  const aIdx = spec.sliders.findIndex((s) => s.name === 'a');
  const params = useSharedValue(spec.sliders.map((s) => s.value));
  const time = useSharedValue(0);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [trackW, setTrackW] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [readT, setReadT] = useState(0);
  const [ua, setUa] = useState({ u: spec.u, a: spec.a });
  const speedGraph = spec.graph === 'speed';
  const range = useMemo(
    () => motionRange(spec.sliders, spec.u, spec.a, T),
    [spec.sliders, spec.u, spec.a, T],
  );
  const yTop = speedGraph ? range.vMax : range.sMax;
  const ys = useMemo(() => niceScale(0, yTop, 5), [yTop]);
  const xs = useMemo(() => niceScale(0, T, 6), [T]);
  const iw = Math.max(1, size.w - PAD.start - PAD.end);
  const ih = Math.max(1, size.h - PAD.top - PAD.bottom);
  const yMax = ys.max;
  const sMaxTrack = range.sMax;
  const fixedU = spec.u;
  const fixedA = spec.a;

  const read = () => {
    'worklet';
    const p = params.get();
    return [uIdx >= 0 ? p[uIdx]! : fixedU, aIdx >= 0 ? p[aIdx]! : fixedA] as const;
  };

  const line = useAnimatedProps(() => {
    const [u, a] = read();
    const tNow = time.get();
    let d = '';
    const n = 60;
    for (let i = 0; i <= n; i++) {
      const tt = (tNow * i) / n;
      const y = speedGraph ? speedAtW(u, a, tt) : distanceAtW(u, a, tt);
      const x = (tt / T) * iw;
      const yy = ih - (Math.min(y, yMax) / yMax) * ih;
      d += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + yy.toFixed(1);
    }
    return { d };
  });
  const dot = useAnimatedProps(() => {
    const [u, a] = read();
    const tNow = time.get();
    const y = speedGraph ? speedAtW(u, a, tNow) : distanceAtW(u, a, tNow);
    return { cx: (tNow / T) * iw, cy: ih - (Math.min(y, yMax) / yMax) * ih };
  });
  const car = useAnimatedStyle(() => {
    const [u, a] = read();
    const s = distanceAtW(u, a, time.get());
    return {
      transform: [
        { translateX: (Math.min(s, sMaxTrack) / sMaxTrack) * Math.max(0, trackW - CAR_W) },
      ],
    };
  });

  // Readouts tick twice a second, not every frame.
  useAnimatedReaction(
    () => Math.round(time.get() * 2) / 2,
    (v, prev) => {
      if (v !== prev) scheduleOnRN(setReadT, v);
    },
  );

  const stop = () => {
    cancelAnimation(time);
    setPlaying(false);
  };
  const play = () => {
    if (playing) return stop();
    const from = time.get() >= T - 1e-3 ? 0 : time.get();
    if (tier === 'off') {
      time.set(T);
      return;
    }
    time.set(from);
    setPlaying(true);
    // The clock runs in real time: constant motion, so linear (content, not UI).
    time.set(
      withTiming(T, { duration: (T - from) * 1000, easing: Easing.linear }, (done) => {
        if (done) scheduleOnRN(setPlaying, false);
      }),
    );
  };
  useEffect(() => {
    // The reader's Space key / Play arrives as a token: an event, not derived state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (playToken > 0) play();
  }, [playToken]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => cancelAnimation(time), [time]);

  const scrub = Gesture.Pan()
    .minDistance(0)
    .onBegin((e) => {
      cancelAnimation(time);
      time.set(Math.min(T, Math.max(0, ((e.x - PAD.start) / iw) * T)));
      scheduleOnRN(setPlaying, false);
    })
    .onUpdate((e) => {
      time.set(Math.min(T, Math.max(0, ((e.x - PAD.start) / iw) * T)));
    });

  const now = motionAt(ua.u, ua.a, readT);
  const unitY = speedGraph ? 'm/s' : 'm';
  const readout = t('student.learn.widget.motionNow', {
    t: fmtNum(readT),
    s: fmtNum(now.s),
    v: fmtNum(now.v),
  });
  const atEnd = readT >= T;

  return (
    <View style={styles.root}>
      <View style={styles.track} onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}>
        <View style={styles.road} />
        <Animated.View style={[styles.car, car]}>
          <Car />
        </Animated.View>
      </View>
      <GestureDetector gesture={scrub}>
        <View
          style={styles.plot}
          onLayout={(e) =>
            setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })
          }
          accessibilityLabel={readout}
        >
          {size.w > 0 ? (
            <Svg width={size.w} height={size.h}>
              {ys.ticks.map((v) => (
                <G key={`y${v}`}>
                  <Line
                    x1={PAD.start}
                    x2={PAD.start + iw}
                    y1={PAD.top + ih - (v / yMax) * ih}
                    y2={PAD.top + ih - (v / yMax) * ih}
                    stroke={diagram.grid}
                    strokeWidth={1}
                  />
                  <SvgText
                    x={PAD.start - 5}
                    y={PAD.top + ih - (v / yMax) * ih + 4}
                    fontSize={10}
                    fontFamily={FONT}
                    fontWeight="700"
                    fill={diagram.guide}
                    textAnchor="end"
                  >
                    {fmtNum(v)}
                  </SvgText>
                </G>
              ))}
              {xs.ticks
                .filter((v) => v <= T)
                .map((v) => (
                  <SvgText
                    key={`x${v}`}
                    x={PAD.start + (v / T) * iw}
                    y={PAD.top + ih + 14}
                    fontSize={10}
                    fontFamily={FONT}
                    fontWeight="700"
                    fill={diagram.guide}
                    textAnchor="middle"
                  >
                    {fmtNum(v)}
                  </SvgText>
                ))}
              <Line
                x1={PAD.start}
                x2={PAD.start + iw}
                y1={PAD.top + ih}
                y2={PAD.top + ih}
                stroke={diagram.guide}
                strokeWidth={2}
              />
              <Line
                x1={PAD.start}
                x2={PAD.start}
                y1={PAD.top}
                y2={PAD.top + ih}
                stroke={diagram.guide}
                strokeWidth={2}
              />
              <SvgText
                x={PAD.start + iw}
                y={PAD.top + ih + 24}
                fontSize={10}
                fontFamily={FONT}
                fontWeight="700"
                fill={diagram.guide}
                textAnchor="end"
              >
                {t('student.learn.widget.timeAxis')}
              </SvgText>
              <SvgText
                x={PAD.start + 4}
                y={PAD.top + 10}
                fontSize={10}
                fontFamily={FONT}
                fontWeight="700"
                fill={diagram.guide}
              >
                {speedGraph
                  ? t('student.learn.widget.speedAxis', { unit: unitY })
                  : t('student.learn.widget.distanceAxis', { unit: unitY })}
              </SvgText>
              <G x={PAD.start} y={PAD.top}>
                <AnimatedPath
                  animatedProps={line}
                  fill="none"
                  stroke={diagram.focus}
                  strokeWidth={4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <AnimatedCircle
                  animatedProps={dot}
                  r={6}
                  fill={diagram.highlight}
                  stroke={diagram.ink}
                  strokeWidth={2}
                />
              </G>
            </Svg>
          ) : null}
        </View>
      </GestureDetector>
      <View style={styles.controls}>
        <IconButton
          icon={playing ? 'pause' : atEnd ? 'replay' : 'play'}
          label={t(
            playing ? 'student.learn.pause' : atEnd ? 'student.learn.replay' : 'student.learn.play',
          )}
          variant="primary"
          onPress={play}
        />
        <Text variant="label" script="latin" style={styles.readout} accessibilityLabel={readout}>
          {/* Symbols + units read the same in both languages; kept left-to-right. */}
          {`t = ${fmtNum(readT)} s   s = ${fmtNum(now.s)} m   v = ${fmtNum(now.v)} m/s`}
        </Text>
      </View>
      <View style={styles.sliders}>
        {spec.sliders.map((s, i) => (
          <View key={s.name} style={styles.slider}>
            <Slider
              spec={s}
              values={params}
              index={i}
              label={s.name}
              unit={s.name === 'u' ? 'm/s' : 'm/s²'}
              colour={s.name === 'u' ? diagram.focus : diagram.highlight}
              onValue={(v) => setUa((cur) => ({ ...cur, [s.name]: v }))}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, direction: 'ltr', paddingBottom: space.xs },
  track: {
    height: 44,
    marginHorizontal: space.md,
    marginTop: space.sm,
    justifyContent: 'flex-end',
  },
  road: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 2,
    height: 6,
    borderRadius: 3,
    backgroundColor: diagram.grid,
    borderWidth: 1.5,
    borderColor: diagram.ink,
  },
  car: { position: 'absolute', left: 0, bottom: 6 },
  plot: { flex: 1, minHeight: 100 },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
  },
  readout: { flex: 1, color: diagram.ink, fontVariant: ['tabular-nums'] },
  sliders: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, paddingHorizontal: space.md },
  slider: { flexGrow: 1, flexBasis: 150 },
});
