import { useEffect, useMemo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { useI18n } from '../i18n';
import { useMoment, useMotion, type MomentName } from './motion';
import { useTheme } from './theme';
import { choreography, mirrorX, subjectHues, type SubjectHue } from './tokens';

const HUES = Object.keys(subjectHues) as SubjectHue[];

type Piece = {
  angle: number;
  dist: number;
  size: number;
  spin: number;
  hue: SubjectHue;
  diamond: boolean;
  lift: number;
};

/** Deterministic pieces (no Math.random in render): golden-angle spread, varied sizes. */
function makePieces(count: number, radius: number, seed: number): Piece[] {
  return Array.from({ length: count }, (_, i) => {
    const k = i + seed;
    return {
      angle: (k * 137.508 * Math.PI) / 180,
      dist: radius * (0.55 + ((k * 7) % 10) / 22),
      size: 8 + ((k * 5) % 4) * 4,
      spin: (((k * 53) % 360) - 180) * 1.5,
      hue: HUES[k % HUES.length]!,
      diamond: k % 3 === 0,
      lift: 0.35 + ((k * 3) % 5) / 10,
    };
  });
}

function Chip({ piece, p, isRTL }: { piece: Piece; p: SharedValue<number>; isRTL: boolean }) {
  const { colours, scheme } = useTheme();
  const dx = mirrorX(Math.cos(piece.angle) * piece.dist, isRTL);
  const dy = Math.sin(piece.angle) * piece.dist * piece.lift - piece.dist * 0.35;
  const style = useAnimatedStyle(() => {
    const t = p.get();
    // Out fast, then a little gravity; fade in the last 40 %.
    const fall = t * t * 70;
    return {
      opacity: t < 0.6 ? 1 : Math.max(0, 1 - (t - 0.6) / 0.4),
      transform: [
        { translateX: dx * t },
        { translateY: dy * t + fall },
        { rotate: `${(piece.diamond ? 45 : 0) + piece.spin * t}deg` },
        { scale: 0.4 + 0.6 * Math.min(1, t * 3) },
      ],
    };
  });
  return (
    <Animated.View
      style={[
        styles.chip,
        {
          width: piece.size,
          height: piece.size,
          marginStart: -piece.size / 2,
          marginTop: -piece.size / 2,
          backgroundColor: subjectHues[piece.hue][scheme],
          borderColor: scheme === 'dark' ? colours.borderStrong : colours.ink,
        },
        style,
      ]}
    />
  );
}

/**
 * A burst of mosaic chips (squares and diamonds in the subject hues) flying out from
 * the centre of its parent, once per `trigger` change. Stands in for the bundled
 * Lottie burst (DECISIONS #37) and costs no download: transform + opacity only, at
 * most `choreography.burstMs`. Runs only in the full tier and never in an exam (the
 * moment you pass decides; lite and off draw nothing, so pair it with words/icons).
 */
export function TileBurst({
  moment = 'celebrationKid',
  trigger = 0,
  count = 18,
  radius = 150,
  style,
}: {
  moment?: MomentName;
  trigger?: string | number;
  count?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const b = useMoment(moment);
  const { tier } = useMotion();
  const { isRTL } = useI18n();
  const runs = tier === 'full' && b.kind !== 'none';
  const seed = typeof trigger === 'number' ? trigger : trigger.length;
  const pieces = useMemo(() => makePieces(count, radius, seed), [count, radius, seed]);
  const p = useSharedValue(0);

  useEffect(() => {
    if (!runs) return;
    p.set(0);
    p.set(withTiming(1, { duration: choreography.burstMs, easing: Easing.out(Easing.cubic) }));
    return () => cancelAnimation(p);
  }, [runs, trigger, p]);

  if (!runs) return null;
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, styles.centre, style]}
    >
      <View style={styles.origin}>
        {pieces.map((piece, i) => (
          <Chip key={`${seed}-${i}`} piece={piece} p={p} isRTL={isRTL} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centre: { alignItems: 'center', justifyContent: 'center', overflow: 'visible' },
  origin: { width: 0, height: 0 },
  chip: { position: 'absolute', top: 0, start: 0, borderRadius: 3, borderWidth: 1.5 },
});
