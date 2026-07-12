// QuestLoading — the loading state as a tiny moment of charm: the heart
// sprite bobbing gently over the localized "Loading…" line. The bob is a
// native-driver translateY loop (one animated node), so it stays smooth on
// low-end Android where a spinner would too — but this one has character.
import { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';

import Text from '../Text';
import Sprite from './Sprite';
import { quest, spacing } from '../../theme/quest';
import { t } from '../../i18n';

export default function QuestLoading({ sprite = 'heart', style }) {
  const bob = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 420, useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 420, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [bob]);

  const translateY = bob.interpolate({ inputRange: [0, 1], outputRange: [0, -8] });

  return (
    <View style={[styles.box, style]} accessibilityRole="progressbar">
      <Animated.View style={{ transform: [{ translateY }] }}>
        <Sprite name={sprite} size={48} />
      </Animated.View>
      <Text variant="caption" color={quest.faint} align="center" style={styles.caption}>
        {t('common.loading')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { marginTop: spacing.xl, alignItems: 'center' },
  caption: { marginTop: spacing.sm },
});
