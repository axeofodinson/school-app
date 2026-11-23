import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import Svg from 'react-native-svg';

import { PatternTile } from './Pattern';
import { useEnterStyle } from './motion';
import { useTheme } from './theme';
import { radius, space, strokeWidth, subjectHues, type SubjectHue } from './tokens';

const tileSize = { kid: 28, student: 22, staff: 16 } as const;

/**
 * Mastery as a mosaic (DESIGN_SYSTEM.md §1, DECISIONS #33): one tile per concept,
 * set = mastered (subject hue + star), dashed = not yet. Tiles never fall out.
 * `justSet` is the index of a tile mastered just now: it drops in with the
 * `mosaicTileSet` moment (scale 0.6→1 + fade, transform/opacity only).
 * The whole mosaic is one accessible element: pass `label` (e.g. ui.mosaic.label).
 */
export function MosaicTiles({
  total,
  mastered,
  hue,
  label,
  justSet,
  style,
}: {
  total: number;
  /** Count of mastered concepts (the first N tiles are set). */
  mastered: number;
  hue: SubjectHue;
  label: string;
  justSet?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { colours, scheme, presentation } = useTheme();
  const size = tileSize[presentation];
  const outline = scheme === 'dark' ? colours.borderStrong : colours.ink;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={[styles.grid, style]}
    >
      {Array.from({ length: total }, (_, i) => {
        const set = i < mastered;
        const box = { width: size, height: size, borderRadius: radius.sm / 2 };
        if (!set) {
          return (
            <View key={i} style={[box, styles.empty, { borderColor: colours.borderStrong }]} />
          );
        }
        const tile = (
          <View
            style={[
              box,
              styles.set,
              { backgroundColor: subjectHues[hue][scheme], borderColor: outline },
            ]}
          >
            <Svg width={size - 4} height={size - 4} viewBox="0 0 48 48" opacity={0.35}>
              <PatternTile name="star8" colour={colours.ink} />
            </Svg>
          </View>
        );
        return i === justSet ? <NewTile key={i}>{tile}</NewTile> : <View key={i}>{tile}</View>;
      })}
    </View>
  );
}

function NewTile({ children }: { children: ReactNode }) {
  const enter = useEnterStyle('mosaicTileSet', true, { scaleFrom: 0.6 });
  return <Animated.View style={enter}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  empty: { borderWidth: strokeWidth.control, borderStyle: 'dashed' },
  set: {
    borderWidth: strokeWidth.control,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
