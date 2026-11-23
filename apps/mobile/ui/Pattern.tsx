import { useId } from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Circle, Defs, G, Path, Pattern as SvgPattern, Rect } from 'react-native-svg';

import { useTheme } from './theme';
import { patterns } from './tokens';

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
 */
export function PatternFill({ name, colour }: { name: PatternName; colour?: string }) {
  const { colours, scheme } = useTheme();
  const id = `pat-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const p = patterns[name];
  return (
    <Svg
      width="100%"
      height="100%"
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Defs>
        <SvgPattern id={id} patternUnits="userSpaceOnUse" width={p.tile} height={p.tile}>
          <PatternTile name={name} colour={colour ?? colours.ink} />
        </SvgPattern>
      </Defs>
      <Rect
        x={0}
        y={0}
        width="100%"
        height="100%"
        fill={`url(#${id})`}
        opacity={p.opacity[scheme]}
      />
    </Svg>
  );
}
