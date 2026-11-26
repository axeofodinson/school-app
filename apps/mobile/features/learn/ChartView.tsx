// `chart` block (DESIGN_SYSTEM.md §7b.1, §7b.3): bar, line, pie, scatter or
// table drawn natively (react-native-svg) from the numbers in the lesson.
// Tap (or Tab + Enter) a bar, point or slice for its value. With
// `reveal: "series"` the first series shows and a sticker button reveals the
// next one, growing from the baseline (`chartReveal`: full = scaleY 0.6 → 1 +
// fade; lite = fade; off = instant). Axes stay left-to-right in Urdu, like the
// textbook; labels and the legend are in the reading language. Exam-safe:
// nothing moves in exam mode, and the chart is complete there (no reveal).
import {
  chartXs,
  chartYRange,
  fmtNum,
  parseChart,
  pickLang,
  pieSlices,
  type ChartSpec,
  type LessonBlock,
  type LessonLang,
} from '@school/core';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { useI18n } from '../../i18n';
import { Button, Text, useTheme } from '../../ui';
import { animateTo, useEnterStyle, useMoment, useMotion } from '../../ui/motion';
import { useFocusRing } from '../../ui/Sticker';
import { behaviourProps, colours as palette, diagram, radius, space } from '../../ui/tokens';
import { LaterVisual } from './visuals';

const ROLE: Record<string, string> = {
  focus: diagram.focus,
  highlight: diagram.highlight,
  result: diagram.result,
};
const ORDER = [diagram.focus, diagram.highlight, diagram.result, diagram.guide, diagram.wrongIdea];
/** Shapes as well as colours, so a series is never told apart by colour alone. */
const MARKS = ['circle', 'square', 'diamond', 'triangle', 'circle'] as const;
type Mark = (typeof MARKS)[number];

const seriesColour = (c: ChartSpec, i: number) =>
  ROLE[c.series[i]?.role ?? ''] ?? ORDER[i % ORDER.length]!;

const FONT = diagram.labelFont.latin.family;
const PAD = { start: 44, end: 14, top: 26, bottom: 40 };

interface Picked {
  s: number;
  i: number;
}

function markPath(mark: Mark, x: number, y: number, r: number): string {
  switch (mark) {
    case 'square':
      return `M${x - r} ${y - r}h${2 * r}v${2 * r}h${-2 * r}z`;
    case 'diamond':
      return `M${x} ${y - r * 1.3}L${x + r * 1.3} ${y}L${x} ${y + r * 1.3}L${x - r * 1.3} ${y}z`;
    case 'triangle':
      return `M${x} ${y - r * 1.3}L${x + r * 1.2} ${y + r}L${x - r * 1.2} ${y + r}z`;
    default:
      return `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
  }
}

/** One series on its own layer, so it can grow from the baseline as a whole. */
function SeriesLayer({
  shown,
  baseline,
  height,
  children,
}: {
  shown: boolean;
  baseline: number;
  height: number;
  children: React.ReactNode;
}) {
  // chartReveal: full = grow up from the baseline (scaleY 0.6 → 1) + fade; lite = fade; off = there.
  const b = useMoment('chartReveal');
  const props = behaviourProps(b);
  const grows = props.includes('scale');
  const fades = props.includes('opacity');
  const p = useSharedValue(b.kind === 'none' || shown ? (shown ? 1 : 0) : 0);
  useEffect(() => {
    p.set(animateTo(b, shown ? 1 : 0));
  }, [shown, b.kind]); // eslint-disable-line react-hooks/exhaustive-deps
  const style = useAnimatedStyle(() => ({
    opacity: fades ? p.get() : p.get() > 0.001 ? 1 : 0,
    transform: [{ scaleY: grows ? 0.6 + 0.4 * p.get() : 1 }],
  }));
  // scale about the baseline, not the centre: shift, scale, shift back.
  const d = baseline - height / 2;
  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { transform: [{ translateY: d }] }]}
    >
      <Animated.View style={[StyleSheet.absoluteFill, style]}>
        <View style={[StyleSheet.absoluteFill, { transform: [{ translateY: -d }] }]}>
          {children}
        </View>
      </Animated.View>
    </Animated.View>
  );
}

function HitTarget({
  x,
  y,
  w,
  h,
  label,
  onPress,
  active,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  onPress: () => void;
  active: boolean;
}) {
  const { p } = useTheme();
  const { focusProps, ring } = useFocusRing();
  const padX = Math.max(0, (p.minTarget - w) / 2);
  const padY = Math.max(0, (p.minTarget - h) / 2);
  return (
    <Pressable
      {...focusProps}
      onPress={onPress}
      hitSlop={{ left: padX, right: padX, top: padY, bottom: padY }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      style={[styles.abs, { left: x, top: y, width: w, height: h, borderRadius: 6 }, ring]}
    />
  );
}

function Tooltip({ x, y, text, below }: { x: number; y: number; text: string; below: boolean }) {
  const pop = useEnterStyle('hotspotReveal', true, { scaleFrom: 0.85, translateY: below ? -6 : 6 });
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.tip,
        { left: Math.max(4, x - 80), top: below ? y + 14 : Math.max(2, y - 44) },
        pop,
      ]}
    >
      <Text variant="label" script="latin" style={styles.tipText} numberOfLines={2}>
        {text}
      </Text>
    </Animated.View>
  );
}

export function ChartView({ block, lang }: { block: LessonBlock; lang: LessonLang }) {
  const { t } = useI18n();
  const { inExam } = useMotion();
  const spec = useMemo(() => parseChart(block), [block]);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const stepped = spec?.reveal === 'series' && !inExam && (spec?.series.length ?? 0) > 1;
  const [shownCount, setShown] = useState(stepped ? 1 : 99);
  const [picked, setPicked] = useState<Picked | null>(null);

  if (!spec) return <LaterVisual block={block} lang={lang} broken />;
  const onLayout = (e: LayoutChangeEvent) =>
    setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });

  const name = (i: number) =>
    pickLang(spec.series[i]?.name, lang)?.text ?? t('student.learn.series', { n: i + 1 });
  const xLabel = pickLang(spec.x?.label, lang)?.text ?? '';
  const yLabel = pickLang(spec.y?.label, lang)?.text ?? '';
  const xUnit = spec.x?.unit ? ` ${spec.x.unit}` : '';
  const yUnit = spec.y?.unit ? ` ${spec.y.unit}` : '';
  const xsRaw = spec.x?.values ?? spec.series[0]!.values.map((_, i) => i + 1);
  const valueText = (s: number, i: number) => {
    const v = spec.series[s]!.values[i]!;
    const xv = xsRaw[i];
    return `${name(s)} · ${xv !== undefined ? `${xv}${xUnit}` : ''}: ${fmtNum(v)}${yUnit}`;
  };
  const next = shownCount < spec.series.length ? shownCount : null;

  if (spec.kind === 'table') return <ChartTable spec={spec} lang={lang} name={name} />;

  return (
    <View style={styles.fill}>
      {/* Graphs read left to right in both languages. */}
      <View style={[styles.fill, styles.ltr]} onLayout={onLayout}>
        {box.w > 0 ? (
          spec.kind === 'pie' ? (
            <Pie spec={spec} w={box.w} h={box.h} lang={lang} picked={picked} onPick={setPicked} />
          ) : (
            <Plot
              spec={spec}
              w={box.w}
              h={box.h}
              shownCount={shownCount}
              picked={picked}
              onPick={(p) =>
                setPicked(picked && p && picked.s === p.s && picked.i === p.i ? null : p)
              }
              valueText={valueText}
              xLabel={`${xLabel}${xUnit ? ` (${xUnit.trim()})` : ''}`}
              yLabel={`${yLabel}${yUnit ? ` (${yUnit.trim()})` : ''}`}
            />
          )
        ) : null}
      </View>
      <View style={styles.legend}>
        {spec.kind !== 'pie'
          ? spec.series
              .slice(0, shownCount)
              .map((_, i) => (
                <LegendItem
                  key={i}
                  colour={seriesColour(spec, i)}
                  mark={MARKS[i % MARKS.length]!}
                  label={name(i)}
                />
              ))
          : null}
        {next !== null ? (
          <Button
            size="sm"
            variant="secondary"
            icon="plus"
            title={t('student.learn.showSeries', { name: name(next) })}
            onPress={() => setShown((n) => n + 1)}
          />
        ) : null}
      </View>
    </View>
  );
}

function LegendItem({ colour, mark, label }: { colour: string; mark: Mark; label: string }) {
  const enter = useEnterStyle('chartReveal', true, { scaleFrom: 0.9 });
  return (
    <Animated.View style={[styles.legendItem, enter]}>
      <Svg width={18} height={18}>
        <Path d={markPath(mark, 9, 9, 5)} fill={colour} stroke={diagram.ink} strokeWidth={1.5} />
      </Svg>
      <Text variant="label" style={{ color: diagram.ink }}>
        {label}
      </Text>
    </Animated.View>
  );
}

function Plot({
  spec,
  w,
  h,
  shownCount,
  picked,
  onPick,
  valueText,
  xLabel,
  yLabel,
}: {
  spec: ChartSpec;
  w: number;
  h: number;
  shownCount: number;
  picked: Picked | null;
  onPick: (p: Picked | null) => void;
  valueText: (s: number, i: number) => string;
  xLabel: string;
  yLabel: string;
}) {
  const yr = chartYRange(spec);
  const iw = Math.max(10, w - PAD.start - PAD.end);
  const ih = Math.max(10, h - PAD.top - PAD.bottom);
  const yPx = (v: number) => PAD.top + ih - ((v - yr.min) / (yr.max - yr.min)) * ih;
  const n = spec.series[0]!.values.length;
  const bar = spec.kind === 'bar';
  const xsNum = chartXs(spec);
  const x0 = Math.min(...xsNum);
  const x1 = Math.max(...xsNum);
  const band = iw / n;
  const xPx = (i: number) =>
    bar || x1 === x0
      ? PAD.start + band * (i + 0.5)
      : PAD.start + ((xsNum[i]! - x0) / (x1 - x0)) * iw;
  const base = yPx(Math.max(yr.min, Math.min(yr.max, 0)));
  const xsRaw = spec.x?.values ?? spec.series[0]!.values.map((_, i) => i + 1);
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 44))));
  const groups = spec.series.length;
  const bw = Math.min(36, (band * 0.72) / groups);

  return (
    <>
      <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
        {yr.ticks.map((v) => (
          <G key={v}>
            <Line
              x1={PAD.start}
              x2={PAD.start + iw}
              y1={yPx(v)}
              y2={yPx(v)}
              stroke={diagram.grid}
              strokeWidth={1}
            />
            <SvgText
              x={PAD.start - 6}
              y={yPx(v) + 4}
              fontSize={11}
              fontFamily={FONT}
              fontWeight="700"
              fill={diagram.guide}
              textAnchor="end"
            >
              {fmtNum(v)}
            </SvgText>
          </G>
        ))}
        <Line
          x1={PAD.start}
          x2={PAD.start + iw}
          y1={base}
          y2={base}
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
        {xsRaw.map((xv, i) =>
          i % every === 0 ? (
            <SvgText
              key={i}
              x={xPx(i)}
              y={PAD.top + ih + 16}
              fontSize={11}
              fontFamily={FONT}
              fontWeight="700"
              fill={diagram.guide}
              textAnchor="middle"
            >
              {String(xv)}
            </SvgText>
          ) : null,
        )}
      </Svg>
      <Text variant="caption" style={[styles.axisX, { color: diagram.guide }]} numberOfLines={1}>
        {xLabel}
      </Text>
      <Text variant="caption" style={[styles.axisY, { color: diagram.guide }]} numberOfLines={1}>
        {yLabel}
      </Text>
      {spec.series.map((s, si) => {
        const colour = seriesColour(spec, si);
        const mark = MARKS[si % MARKS.length]!;
        return (
          <SeriesLayer key={si} shown={si < shownCount} baseline={base} height={h}>
            <Svg width={w} height={h}>
              {bar
                ? s.values.map((v, i) => {
                    const x = PAD.start + band * i + (band - bw * groups) / 2 + bw * si;
                    const top = Math.min(yPx(v), base);
                    const hh = Math.max(1, Math.abs(yPx(v) - base));
                    const on = picked?.s === si && picked.i === i;
                    return (
                      <Rect
                        key={i}
                        x={x}
                        y={top}
                        width={bw - 3}
                        height={hh}
                        rx={4}
                        fill={colour}
                        stroke={diagram.ink}
                        strokeWidth={on ? 3 : 2}
                      />
                    );
                  })
                : null}
              {spec.kind === 'line' ? (
                <Path
                  d={s.values
                    .map((v, i) => `${i ? 'L' : 'M'}${xPx(i).toFixed(1)} ${yPx(v).toFixed(1)}`)
                    .join('')}
                  fill="none"
                  stroke={colour}
                  strokeWidth={4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : null}
              {!bar
                ? s.values.map((v, i) => (
                    <Path
                      key={i}
                      d={markPath(mark, xPx(i), yPx(v), picked?.s === si && picked.i === i ? 7 : 5)}
                      fill={colour}
                      stroke={diagram.ink}
                      strokeWidth={2}
                    />
                  ))
                : null}
            </Svg>
          </SeriesLayer>
        );
      })}
      {spec.series.slice(0, shownCount).map((s, si) =>
        s.values.map((v, i) => {
          const on = picked?.s === si && picked.i === i;
          const cx = bar ? PAD.start + band * i + (band - bw * groups) / 2 + bw * si : xPx(i) - 9;
          const cy = bar ? Math.min(yPx(v), base) : yPx(v) - 9;
          const ww = bar ? bw - 3 : 18;
          const hh = bar ? Math.max(18, Math.abs(yPx(v) - base)) : 18;
          return (
            <HitTarget
              key={`${si}-${i}`}
              x={cx}
              y={cy}
              w={ww}
              h={hh}
              label={valueText(si, i)}
              active={on}
              onPress={() => onPick({ s: si, i })}
            />
          );
        }),
      )}
      {picked && picked.s < shownCount ? (
        <Tooltip
          key={`${picked.s}-${picked.i}`}
          x={bar ? PAD.start + band * (picked.i + 0.5) : xPx(picked.i)}
          y={yPx(spec.series[picked.s]!.values[picked.i]!)}
          below={yPx(spec.series[picked.s]!.values[picked.i]!) < PAD.top + 50}
          text={valueText(picked.s, picked.i)}
        />
      ) : null}
    </>
  );
}

function Pie({
  spec,
  w,
  h,
  lang,
  picked,
  onPick,
}: {
  spec: ChartSpec;
  w: number;
  h: number;
  lang: LessonLang;
  picked: Picked | null;
  onPick: (p: Picked | null) => void;
}) {
  const values = spec.series[0]!.values;
  const slices = pieSlices(values);
  const r = Math.max(10, Math.min(w * 0.42, h) / 2 - 12);
  const cx = Math.min(w / 2, r + 16);
  const cy = h / 2;
  const unit = spec.y?.unit ? ` ${spec.y.unit}` : '';
  const labelOf = (i: number) => {
    const x = spec.x?.values?.[i];
    return x !== undefined ? String(x) : String(i + 1);
  };
  const grow = useEnterStyle('chartReveal', true, { scaleFrom: 0.9 });
  const arc = (a0: number, a1: number, rr: number) => {
    const p = (a: number) => [cx + rr * Math.sin(a), cy - rr * Math.cos(a)];
    const [sx, sy] = p(a0);
    const [ex, ey] = p(a1);
    const large = a1 - a0 > Math.PI ? 1 : 0;
    if (a1 - a0 >= Math.PI * 2 - 1e-6)
      return `M${cx - rr} ${cy}a${rr} ${rr} 0 1 0 ${2 * rr} 0a${rr} ${rr} 0 1 0 ${-2 * rr} 0`;
    return `M${cx} ${cy}L${sx} ${sy}A${rr} ${rr} 0 ${large} 1 ${ex} ${ey}Z`;
  };
  void lang;
  return (
    <View style={styles.pieRow}>
      <Animated.View style={[{ width: cx * 2, height: h }, grow]}>
        <Svg width={cx * 2} height={h}>
          {slices.map((s, i) => (
            <Path
              key={i}
              d={arc(s.start, s.end, picked?.i === i ? r + 6 : r)}
              fill={ORDER[i % ORDER.length]}
              stroke={diagram.ink}
              strokeWidth={2}
              strokeLinejoin="round"
            />
          ))}
          <Circle cx={cx} cy={cy} r={2} fill={diagram.ink} />
        </Svg>
      </Animated.View>
      <ScrollView style={styles.pieList} contentContainerStyle={styles.pieListIn}>
        {slices.map((s, i) => (
          <Pressable
            key={i}
            onPress={() => onPick(picked?.i === i ? null : { s: 0, i })}
            accessibilityRole="button"
            accessibilityState={{ selected: picked?.i === i }}
            style={[styles.pieItem, picked?.i === i ? styles.pieItemOn : null]}
          >
            <View style={[styles.swatch, { backgroundColor: ORDER[i % ORDER.length] }]} />
            <Text variant="label" style={styles.pieText} numberOfLines={2}>
              {`${labelOf(i)}: ${fmtNum(values[i]!)}${unit} (${Math.round(s.share * 100)}%)`}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function ChartTable({
  spec,
  lang,
  name,
}: {
  spec: ChartSpec;
  lang: LessonLang;
  name: (i: number) => string;
}) {
  const xs = spec.x?.values ?? spec.series[0]!.values.map((_, i) => i + 1);
  const head = pickLang(spec.x?.label, lang)?.text ?? '';
  const unit = (u?: string) => (u ? ` (${u})` : '');
  return (
    <ScrollView style={styles.fill} contentContainerStyle={styles.table} horizontal={false}>
      <View style={[styles.tr, styles.th]}>
        <Text variant="label" style={styles.td}>
          {`${head}${unit(spec.x?.unit)}`}
        </Text>
        {spec.series.map((_, i) => (
          <Text key={i} variant="label" style={styles.td}>
            {`${name(i)}${unit(spec.y?.unit)}`}
          </Text>
        ))}
      </View>
      {xs.map((x, r) => (
        <View key={r} style={[styles.tr, r % 2 ? styles.zebra : null]}>
          <Text variant="bodySm" script="latin" style={styles.td}>
            {String(x)}
          </Text>
          {spec.series.map((s, i) => (
            <Text key={i} variant="bodySm" script="latin" style={styles.td}>
              {fmtNum(s.values[r] ?? NaN)}
            </Text>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  ltr: { direction: 'ltr' },
  abs: { position: 'absolute' },
  axisX: { position: 'absolute', bottom: 2, left: PAD.start, right: PAD.end, textAlign: 'center' },
  axisY: { position: 'absolute', top: 4, left: PAD.start + 6 },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderTopWidth: 2,
    borderTopColor: diagram.ink,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tip: {
    position: 'absolute',
    width: 160,
    alignItems: 'center',
    paddingHorizontal: space.sm,
    paddingVertical: 4,
    borderRadius: radius.md,
    backgroundColor: diagram.ink,
  },
  tipText: { color: '#FFFFFF', textAlign: 'center' },
  pieRow: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  pieList: { flex: 1 },
  pieListIn: { gap: 4, padding: space.sm, justifyContent: 'center', flexGrow: 1 },
  pieItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: 6,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  pieItemOn: { borderColor: diagram.ink, backgroundColor: palette.light.accentSoft },
  pieText: { color: diagram.ink, flexShrink: 1 },
  swatch: { width: 16, height: 16, borderRadius: 4, borderWidth: 2, borderColor: diagram.ink },
  table: { padding: space.md },
  tr: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: diagram.grid },
  th: { borderBottomWidth: 2, borderBottomColor: diagram.ink },
  zebra: { backgroundColor: 'rgba(221,216,236,0.35)' },
  td: { flex: 1, paddingVertical: 6, paddingHorizontal: 4, color: diagram.ink },
});
