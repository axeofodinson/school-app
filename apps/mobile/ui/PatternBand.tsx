import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { PatternFill, type PatternName } from './Pattern';
import { useMotion } from './motion';
import { useTheme } from './theme';
import { space, subjectHues, type SubjectHue } from './tokens';

/**
 * A header band in a subject hue with a tile pattern. Text on it is always ink
 * (AA-checked on every hue). Exam mode: plain quiet fill, no pattern. Staff
 * presentation: hue accent only, no pattern (DESIGN_SYSTEM.md §3). The pattern drifts
 * per the motion tier (`patternDrift`, DECISIONS #47).
 */
export function PatternBand({
  hue,
  pattern = 'star8',
  minHeight = 56,
  trigger,
  children,
  style,
}: {
  hue: SubjectHue;
  pattern?: PatternName;
  minHeight?: number;
  /** Replays the lite-tier pattern glide when it changes (see PatternFill). */
  trigger?: string | number;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { colours, scheme, presentation } = useTheme();
  const { inExam } = useMotion();
  const bg = inExam ? colours.surfaceAlt : subjectHues[hue][scheme];
  const decorate = !inExam && presentation !== 'staff';
  return (
    <View style={[styles.band, { minHeight, backgroundColor: bg }, style]}>
      {decorate ? <PatternFill name={pattern} animated trigger={trigger} /> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  band: {
    overflow: 'hidden',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
});
