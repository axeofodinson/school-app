// Enter — a mount transition: children fade in and rise a few pixels, with an
// optional delay so lists can stagger. Opacity + translateY only, on the
// native driver, so it costs nothing on low-end Android and never touches
// layout (RTL-safe by construction).
import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';

export default function Enter({ children, delay = 0, distance = 14, style }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: 260,
      delay,
      useNativeDriver: true,
    }).start();
  }, [progress, delay]);

  return (
    <Animated.View
      style={[
        {
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [distance, 0],
              }),
            },
          ],
        },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
}
