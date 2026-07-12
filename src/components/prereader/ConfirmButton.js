// ConfirmButton — the big round green ✓ that locks an answer in. Tap-to-pick
// alone is too twitchy for small fingers (one graze and the question is gone),
// so picking selects and THIS confirms — the standard forgiving pattern in
// early-years apps. Icon-only (a check needs no reading); pops in with a
// spring when a choice is selected so it also acts as the "you picked one!"
// acknowledgement.
import { ActivityIndicator, Pressable, View, StyleSheet } from 'react-native';

import Sprite from '../quest/Sprite';
import Pop from '../quest/Pop';
import { quest, px } from '../../theme/quest';

export default function ConfirmButton({
  onPress,
  loading = false,
  disabled = false,
  size = 88,
  accessibilityLabel,
  style,
}) {
  const isDisabled = disabled || loading;
  const radius = size / 2 + px.edge;
  return (
    <Pop style={style}>
      <Pressable
        onPress={onPress}
        disabled={isDisabled}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled: isDisabled, busy: loading }}
      >
        {({ pressed }) => {
          const down = pressed && !isDisabled;
          return (
            <View style={{ backgroundColor: down ? 'transparent' : quest.greenEdge, borderRadius: radius }}>
              <View
                style={[
                  styles.face,
                  {
                    width: size,
                    height: size,
                    borderRadius: size / 2,
                    marginBottom: down ? 0 : px.edge,
                    marginTop: down ? px.edge : 0,
                    opacity: isDisabled && !loading ? 0.55 : 1,
                  },
                ]}
              >
                {loading ? (
                  <ActivityIndicator color={quest.cream} />
                ) : (
                  <Sprite name="check" size={Math.round(size * 0.6)} />
                )}
              </View>
            </View>
          );
        }}
      </Pressable>
    </Pop>
  );
}

const styles = StyleSheet.create({
  face: {
    backgroundColor: quest.green,
    borderWidth: px.border,
    borderColor: quest.greenEdge,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
