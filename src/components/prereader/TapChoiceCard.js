// TapChoiceCard — one huge, tappable answer card for pre-readers (PG–2).
// Everything about it is sized for small fingers and zero reading: the content
// is a picture (emoji drawn huge, an emoji repeated so the child can count it,
// a remote image, or — last resort — big text like the numeral "5"), and
// picking it answers with the body, not the eyes: the card springs/bounces,
// flips to a sunny gold face, and a star pops into its corner.
//
// Physicality: the same raised-face-on-hard-edge construction as the quest
// kit (press pushes the face down), plus a native-driver scale spring on
// select — transform-only, cheap on low-end Android.
import { useEffect, useRef } from 'react';
import { Animated, Image, View, StyleSheet } from 'react-native';

import Text from '../Text';
import Sprite from '../quest/Sprite';
import Pop from '../quest/Pop';
import QuestPressable from '../quest/QuestPressable';
import { quest, spacing, displayText } from '../../theme/quest';

// How the picture inside renders per card size. `big` is the paged pre-reader
// flow; `compact` is a tap_image question inline in a mixed (reading) test.
const SIZES = {
  big: { minHeight: 132, emoji: 64, emojiMulti: 36, label: 44, image: 96 },
  compact: { minHeight: 88, emoji: 44, emojiMulti: 26, label: 28, image: 64 },
};

// Emoji get an explicit lineHeight — Android clips color-font glyphs at big
// sizes when the line box is left to the font metrics.
const emojiStyle = (size) => ({
  fontSize: size,
  lineHeight: Math.round(size * 1.25),
  textAlign: 'center',
});

function ChoiceContent({ choice, dims }) {
  if (choice.kind === 'emoji' && choice.count > 1) {
    // Repeated emoji, one per item, wrapped — the child counts them.
    return (
      <View style={styles.emojiWrap}>
        {Array.from({ length: choice.count }).map((_, i) => (
          <Text key={i} style={emojiStyle(dims.emojiMulti)} accessible={false}>
            {choice.emoji}
          </Text>
        ))}
      </View>
    );
  }
  if (choice.kind === 'emoji') {
    return (
      <Text style={emojiStyle(dims.emoji)} accessible={false}>
        {choice.emoji}
      </Text>
    );
  }
  if (choice.kind === 'image') {
    return (
      <Image
        source={{ uri: choice.image }}
        style={{ width: dims.image * 1.6, height: dims.image }}
        resizeMode="contain"
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
    );
  }
  // label
  return (
    <Text color={quest.ink} align="center" style={displayText(dims.label)}>
      {choice.label}
    </Text>
  );
}

export default function TapChoiceCard({
  choice, // normalised choice from prereader/tapImage.tapChoices
  selected,
  onPress,
  disabled,
  size = 'big',
  accessibilityLabel,
  style,
}) {
  const dims = SIZES[size] ?? SIZES.big;
  const scale = useRef(new Animated.Value(1)).current;

  // The pick bounce: a quick squash-and-recover spring every time this card
  // becomes the chosen one.
  useEffect(() => {
    if (!selected) return;
    scale.setValue(0.92);
    Animated.spring(scale, {
      toValue: 1,
      friction: 3.5,
      tension: 120,
      useNativeDriver: true,
    }).start();
  }, [selected, scale]);

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <QuestPressable
        onPress={onPress}
        disabled={disabled}
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ selected: !!selected, disabled: !!disabled }}
        face={selected ? quest.goldTint : quest.surface}
        edge={selected ? quest.goldEdge : quest.outline}
        outline={selected ? quest.goldEdge : quest.outline}
        padded={false}
        faceStyle={[styles.face, { minHeight: dims.minHeight }]}
      >
        <ChoiceContent choice={choice} dims={dims} />
        {selected ? (
          <Pop style={styles.pickStar}>
            <Sprite name="star" size={size === 'big' ? 32 : 22} />
          </Pop>
        ) : null}
      </QuestPressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  face: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
  },
  emojiWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    columnGap: 2,
  },
  // Inside the card's corner (not overhanging) — Android clips children that
  // draw outside their parent's bounds.
  pickStar: {
    position: 'absolute',
    top: spacing.xs,
    end: spacing.xs,
  },
});
