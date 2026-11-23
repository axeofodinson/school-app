import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { useEnterStyle } from './motion';
import { useFocusRing } from './Sticker';
import { Text } from './Text';
import { useTheme } from './theme';
import { radius, space, strokeWidth } from './tokens';

export type Segment<V extends string> = { value: V; label: string };

function SegmentButton<V extends string>({
  seg,
  selected,
  onChange,
}: {
  seg: Segment<V>;
  selected: boolean;
  onChange: (v: V) => void;
}) {
  const { colours, p } = useTheme();
  // selectionChange: the selected fill is its own layer that fades (opacity only).
  const fill = useEnterStyle('selectionChange', selected);
  const { focusProps, ring } = useFocusRing();
  return (
    <Pressable
      {...focusProps}
      onPress={() => onChange(seg.value)}
      accessibilityRole="radio"
      accessibilityLabel={seg.label}
      accessibilityState={{ selected, checked: selected }}
      style={[styles.segment, { minHeight: p.minTarget - 4 }, ring]}
    >
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.fill, { backgroundColor: colours.primary }, fill]}
      />
      <Text
        variant="label"
        tone={selected ? 'onPrimary' : 'text'}
        numberOfLines={2}
        style={styles.label}
      >
        {seg.label}
      </Text>
    </Pressable>
  );
}

/** One choice out of a few (language, theme, motion tier…). Native-feeling, no sliding pill. */
export function SegmentedControl<V extends string>({
  segments,
  value,
  onChange,
  accessibilityLabel,
  style,
}: {
  segments: readonly Segment<V>[];
  value: V;
  onChange: (v: V) => void;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { colours, scheme } = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.group,
        {
          borderColor: scheme === 'dark' ? colours.borderStrong : colours.ink,
          backgroundColor: colours.surface,
        },
        style,
      ]}
    >
      {segments.map((s) => (
        <SegmentButton key={s.value} seg={s} selected={s.value === value} onChange={onChange} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    maxWidth: '100%',
    borderWidth: strokeWidth.control,
    borderRadius: radius.full,
    padding: space.xxs,
    gap: space.xxs,
  },
  segment: {
    flexShrink: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    borderRadius: radius.full,
  },
  fill: { borderRadius: radius.full },
  label: { textAlign: 'center' },
});
