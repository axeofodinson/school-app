// Pop — a celebratory spring-in (scale 0 -> overshoot -> 1) for reward
// moments like "test submitted". Native driver, transform-only.
import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';

export default function Pop({ children, delay = 0, style }) {
  const scale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(scale, {
      toValue: 1,
      delay,
      friction: 4,
      tension: 80,
      useNativeDriver: true,
    }).start();
  }, [scale, delay]);

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>{children}</Animated.View>
  );
}
