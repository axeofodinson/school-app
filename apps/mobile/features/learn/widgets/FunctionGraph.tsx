// `function_graph` widget: y = f(x) with sliders for named parameters
// ("m*x + c"). The expression was parsed by core's safe parser (never eval) and
// compiled to a tiny program; the curve is rebuilt from it on the UI thread
// whenever a slider moves, so it follows the finger. Axes stay left-to-right.
import { fmtNum, niceScale, type WidgetSpec } from '@school/core';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedProps, useSharedValue } from 'react-native-reanimated';
import Svg, { G, Line, Path, Text as SvgText } from 'react-native-svg';

import { Text } from '../../../ui';
import { diagram, space } from '../../../ui/tokens';
import { fmtSlider, Slider } from './Slider';
import { plotProgramW } from './vm';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const FONT = diagram.labelFont.latin.family;
const PAD = 26;

type Spec = Extract<WidgetSpec, { widget: 'function_graph' }>;

/** "m*x + c" with today's values: "y = 2x + 1" style, for the readout and screen readers. */
function pretty(src: string): string {
  return src.replace(/\s*\*\s*/g, '').replace(/\s+/g, ' ');
}

export function FunctionGraph({ spec, source }: { spec: Spec; source: string }) {
  const values = useSharedValue(spec.sliders.map((s) => s.value));
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [now, setNow] = useState(() => spec.sliders.map((s) => s.value));
  const w = size.w;
  const h = size.h;
  const [x0, x1] = spec.x;
  const [y0, y1] = spec.y;
  const xs = useMemo(() => niceScale(x0, x1, 7), [x0, x1]);
  const ys = useMemo(() => niceScale(y0, y1, 7), [y0, y1]);
  const iw = Math.max(1, w - PAD * 2);
  const ih = Math.max(1, h - PAD * 2);
  const px = (x: number) => PAD + ((x - x0) / (x1 - x0)) * iw;
  const py = (y: number) => PAD + ih - ((y - y0) / (y1 - y0)) * ih;
  const program = spec.program;

  const curve = useAnimatedProps(() => ({
    d: plotProgramW(program, values.get(), x0, x1, y0, y1, iw, ih, 120),
  }));

  const formula = `y = ${pretty(source)}`;
  const live = spec.sliders.map((s, i) => `${s.name} = ${fmtSlider(now[i] ?? s.value)}`).join(', ');

  return (
    <View style={styles.root}>
      <View
        style={styles.plot}
        onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
        accessibilityLabel={`${formula}; ${live}`}
      >
        {w > 0 ? (
          <Svg width={w} height={h}>
            {xs.ticks
              .filter((v) => v >= x0 && v <= x1)
              .map((v) => (
                <Line
                  key={`x${v}`}
                  x1={px(v)}
                  x2={px(v)}
                  y1={PAD}
                  y2={PAD + ih}
                  stroke={diagram.grid}
                  strokeWidth={1}
                />
              ))}
            {ys.ticks
              .filter((v) => v >= y0 && v <= y1)
              .map((v) => (
                <Line
                  key={`y${v}`}
                  x1={PAD}
                  x2={PAD + iw}
                  y1={py(v)}
                  y2={py(v)}
                  stroke={diagram.grid}
                  strokeWidth={1}
                />
              ))}
            {y0 <= 0 && y1 >= 0 ? (
              <Line
                x1={PAD}
                x2={PAD + iw}
                y1={py(0)}
                y2={py(0)}
                stroke={diagram.guide}
                strokeWidth={2}
              />
            ) : null}
            {x0 <= 0 && x1 >= 0 ? (
              <Line
                x1={px(0)}
                x2={px(0)}
                y1={PAD}
                y2={PAD + ih}
                stroke={diagram.guide}
                strokeWidth={2}
              />
            ) : null}
            <G>
              {xs.ticks
                .filter((v) => v >= x0 && v <= x1 && v !== 0)
                .map((v) => (
                  <SvgText
                    key={`lx${v}`}
                    x={px(v)}
                    y={Math.min(PAD + ih, Math.max(PAD, py(0))) + 14}
                    fontSize={10}
                    fontFamily={FONT}
                    fontWeight="700"
                    fill={diagram.guide}
                    textAnchor="middle"
                  >
                    {fmtNum(v)}
                  </SvgText>
                ))}
              {ys.ticks
                .filter((v) => v >= y0 && v <= y1 && v !== 0)
                .map((v) => (
                  <SvgText
                    key={`ly${v}`}
                    x={Math.min(PAD + iw, Math.max(PAD, px(0))) - 4}
                    y={py(v) + 4}
                    fontSize={10}
                    fontFamily={FONT}
                    fontWeight="700"
                    fill={diagram.guide}
                    textAnchor="end"
                  >
                    {fmtNum(v)}
                  </SvgText>
                ))}
            </G>
            <G x={PAD} y={PAD}>
              <AnimatedPath
                animatedProps={curve}
                fill="none"
                stroke={diagram.focus}
                strokeWidth={4}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </G>
          </Svg>
        ) : null}
        <View style={styles.formula} pointerEvents="none">
          <Text variant="label" script="latin" style={{ color: diagram.ink }}>
            {formula}
          </Text>
        </View>
      </View>
      <View style={styles.sliders}>
        {spec.sliders.map((s, i) => (
          <View key={s.name} style={styles.slider}>
            <Slider
              spec={s}
              values={values}
              index={i}
              label={s.name}
              colour={i === 0 ? diagram.focus : diagram.highlight}
              onValue={(v) => setNow((cur) => cur.map((c, k) => (k === i ? v : c)))}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, direction: 'ltr' },
  plot: { flex: 1, minHeight: 120 },
  formula: {
    position: 'absolute',
    top: 6,
    left: PAD + 6,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: diagram.ink,
    backgroundColor: '#FFFFFF',
  },
  sliders: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.md,
    paddingHorizontal: space.md,
    paddingBottom: space.sm,
  },
  slider: { flexGrow: 1, flexBasis: 160 },
});
