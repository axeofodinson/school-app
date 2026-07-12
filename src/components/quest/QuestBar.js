// QuestBar — a chunky XP-style progress bar. Sunken track, bright fill,
// hard outline; the fill animates once whenever the value changes (a short
// one-shot width tween — negligible even on low-end devices).
//
// RTL: the fill is a start-aligned child inside the track, and Yoga inherits
// the screen's direction, so it grows from the correct edge automatically.
import { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';

import { quest, px } from '../../theme/quest';

export default function QuestBar({
  value = 0, // 0..100
  color = quest.green,
  height = 14,
  style,
}) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: pct,
      duration: 450,
      useNativeDriver: false, // width can't ride the native driver; one-shot only
    }).start();
  }, [pct, anim]);

  const width = anim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  return (
    <View
      style={[styles.track, { height, borderRadius: height / 2 > px.radius ? px.radius : height / 2 }, style]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: pct }}
    >
      <Animated.View style={[styles.fill, { width, backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    backgroundColor: quest.bgDeep,
    borderWidth: px.border,
    borderColor: quest.outline,
    overflow: 'hidden',
  },
  fill: {
    flex: 1,
  },
});
