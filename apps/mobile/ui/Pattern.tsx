import { useFocusEffect } from 'expo-router';
import { useCallback, useId, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, G, Path, Pattern as SvgPattern, Rect } from 'react-native-svg';

import { useI18n } from '../i18n';
import { animateTo, useMoment } from './motion';
import { useTheme } from './theme';
import { mirrorX, patterns } from './tokens';

export type PatternName = keyof typeof patterns;

/** 8-point khatam star: 16 points alternating outer and inner radius. */
function starPath(cx: number, cy: number, outer: number): string {
  const inner = outer * 0.7654; // two overlapping squares
  const pts = Array.from({ length: 16 }, (_, i) => {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / 8) * i - Math.PI / 2;
    return `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
  });
  return `M${pts.join('L')}Z`;
}

const STAR = [
  starPath(24, 24, 14),
  starPath(0, 0, 9),
  starPath(48, 0, 9),
  starPath(0, 48, 9),
  starPath(48, 48, 9),
].join('');
const PETALS = Array.from({ length: 6 }, (_, i) => {
  const a = (Math.PI / 3) * i;
  return { cx: 24 + 8 * Math.cos(a), cy: 24 + 8 * Math.sin(a) };
});

/** The tile content of each pattern, drawn in `colour`. */
export function PatternTile({ name, colour }: { name: PatternName; colour: string }) {
  if (name === 'star8') return <Path d={STAR} fill={colour} />;
  if (name === 'hexFlower')
    return (
      <G stroke={colour} strokeWidth={2} fill="none">
        {PETALS.map((p, i) => (
          <Circle key={i} cx={p.cx} cy={p.cy} r={8} />
        ))}
      </G>
    );
  return (
    <Path
      d="M0 12 8 4l8 8 8-8 8 8M0 28l8-8 8 8 8-8 8 8"
      stroke={colour}
      strokeWidth={2}
      fill="none"
      strokeLinejoin="round"
    />
  );
}

/**
 * A repeating Lahore-tile pattern filling its parent (absolute). Decoration only:
 * low opacity, ink on a subject hue, hidden from screen readers. Never behind running
 * text, never on exam screens (callers decide; PatternBand does it for you).
 *
 * Motion (`patternDrift`, DECISIONS #47): the SVG is one tile larger than the band and
 * moves diagonally by exactly one tile, so the repeat is seamless. Full tier loops;
 * lite glides once per `trigger` change and when the screen gains focus; off is still.
 * Sizes are measured (numbers, not "100%") so Android fills the whole band.
 */
export function PatternFill({
  name,
  colour,
  animated = false,
  trigger,
}: {
  name: PatternName;
  colour?: string;
  animated?: boolean;
  /** Change this value to replay the lite-tier glide (press, tile set). */
  trigger?: string | number;
}) {
  const { colours, scheme } = useTheme();
  const { isRTL } = useI18n();
  const id = `pat-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const p = patterns[name];
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const b = useMoment('patternDrift');
  const moves = animated && b.kind === 'timing';
  const behaviourKey = b.kind === 'timing' ? `${b.duration}:${b.repeat ?? 'once'}` : b.kind;
  const progress = useSharedValue(0);

  useFocusEffect(
    useCallback(() => {
      if (!moves) {
        cancelAnimation(progress);
        progress.set(0);
        return;
      }
      progress.set(0);
      progress.set(animateTo(b, 1));
      // Stop the loop while the screen is not visible (stacked screens stay mounted).
      return () => cancelAnimation(progress);
      // b is identified by behaviourKey (exam/off resolve to a fresh object each render).
    }, [moves, behaviourKey, trigger, progress]), // eslint-disable-line react-hooks/exhaustive-deps
  );

  const dx = mirrorX(p.tile, isRTL);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.get() * dx }, { translateY: progress.get() * p.tile }],
  }));

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (!size || size.w !== width || size.h !== height) setSize({ w: width, h: height });
      }}
    >
      {size ? (
        <Animated.View style={[styles.drift, { top: -p.tile, start: -p.tile }, style]}>
          <Svg width={size.w + p.tile} height={size.h + p.tile}>
            <Defs>
              <SvgPattern id={id} patternUnits="userSpaceOnUse" width={p.tile} height={p.tile}>
                <PatternTile name={name} colour={colour ?? colours.ink} />
              </SvgPattern>
            </Defs>
            <Rect
              x={0}
              y={0}
              width={size.w + p.tile}
              height={size.h + p.tile}
              fill={`url(#${id})`}
              opacity={p.opacity[scheme]}
            />
          </Svg>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({ drift: { position: 'absolute' } });
