// StarTrail — pre-reader progress as a path of stars, not a number. Each
// question is a slot: answered ones hold a gold star, the current one is a
// gently pulsing ring ("you are here"), the rest are dim pebbles. Answered
// slots (and the current one) are tappable, so going back to fix an answer is
// the same playful gesture as everything else — no reading, no toolbar.
//
// RTL: it's a flex row of slots, so the path runs in the reading direction
// automatically.
import { useEffect, useRef } from 'react';
import { Animated, Pressable, View, StyleSheet } from 'react-native';

import Sprite from '../quest/Sprite';
import { quest, px } from '../../theme/quest';

const SLOT = 30;

function CurrentRing() {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 600, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
  return <Animated.View style={[styles.ring, { transform: [{ scale }] }]} />;
}

export default function StarTrail({
  total,
  isDone, // (index) => bool — has this question been answered
  current, // index of the question on screen
  onJump, // (index) => void — go to that question
  slotLabel, // (index) => localized a11y label
  style,
}) {
  return (
    <View style={[styles.row, style]}>
      {Array.from({ length: total }).map((_, i) => {
        const done = isDone(i);
        const reachable = done || i === current;
        return (
          <Pressable
            key={i}
            onPress={reachable && onJump ? () => onJump(i) : undefined}
            disabled={!reachable}
            accessibilityRole="button"
            accessibilityLabel={slotLabel ? slotLabel(i) : undefined}
            accessibilityState={{ selected: i === current, disabled: !reachable }}
            style={styles.slot}
          >
            {i === current ? <CurrentRing /> : null}
            {done ? (
              <Sprite name="star" size={22} />
            ) : (
              <View style={[styles.pebble, i === current && styles.pebbleCurrent]} />
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
  },
  slot: {
    width: SLOT,
    height: SLOT,
    margin: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: SLOT,
    height: SLOT,
    borderRadius: SLOT / 2,
    borderWidth: px.border,
    borderColor: quest.gold,
  },
  pebble: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: quest.bgDeep,
    borderWidth: px.border,
    borderColor: quest.faint,
  },
  pebbleCurrent: {
    borderColor: quest.goldEdge,
    backgroundColor: quest.goldTint,
  },
});
