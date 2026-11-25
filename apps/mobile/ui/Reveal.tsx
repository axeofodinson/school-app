import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { useReveal } from './motion';

/**
 * Wrap the i-th block of a screen so the screen reads top to bottom as it opens
 * (`listEnter`, DECISIONS #94): full = rise + fade in a short cascade, lite = the
 * cascade as fades, off and exams = already there. Transform + opacity only.
 */
export function Reveal({
  index = 0,
  rise,
  style,
  children,
}: {
  index?: number;
  rise?: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const enter = useReveal(index, rise);
  return <Animated.View style={[enter, style]}>{children}</Animated.View>;
}
