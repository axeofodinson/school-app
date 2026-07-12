// SpeakerButton — the big round "hear the question" button. For a child who
// can't read, this IS the question, so it can't look like chrome: it's large,
// gold, breathes gently (a slow scale pulse) to say "tap me", and gives a
// happy squash when pressed. Icon-only — no reading required; the label is
// for screen readers.
import { useEffect, useRef } from 'react';
import { Animated, Pressable, View, StyleSheet } from 'react-native';

import Sprite from '../quest/Sprite';
import { quest, px } from '../../theme/quest';

export default function SpeakerButton({ onPress, size = 76, accessibilityLabel, style }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.07] });
  const radius = size / 2 + px.edge;

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        {({ pressed }) => (
          <View style={{ backgroundColor: pressed ? 'transparent' : quest.goldEdge, borderRadius: radius }}>
            <View
              style={[
                styles.face,
                {
                  width: size,
                  height: size,
                  borderRadius: size / 2,
                  marginBottom: pressed ? 0 : px.edge,
                  marginTop: pressed ? px.edge : 0,
                },
              ]}
            >
              <Sprite name="speaker" size={Math.round(size * 0.62)} />
            </View>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  face: {
    backgroundColor: quest.gold,
    borderWidth: px.border,
    borderColor: quest.goldEdge,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
