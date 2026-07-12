// QuestPanel — the pixel-game card: flat colour face, chunky outline, and a
// hard bottom "edge" strip that makes it read as a solid game tile. Built from
// two plain Views (no shadows, no gradients) so it's free on low-end Android.
//
// The edge sits straight below the face — direction-neutral, so RTL needs no
// special casing.
import { View, StyleSheet } from 'react-native';

import { quest, px, spacing } from '../../theme/quest';

export default function QuestPanel({
  children,
  face = quest.surface,
  edge = quest.outline,
  outline = quest.outline,
  raised = true, // false = flat outline card, no 3D edge
  padded = true,
  style, // outer (positioning: margins etc.)
  faceStyle, // inner (layout of children)
}) {
  return (
    <View
      style={[raised ? { backgroundColor: edge, borderRadius: px.radius + 1 } : null, style]}
    >
      <View
        style={[
          styles.face,
          {
            backgroundColor: face,
            borderColor: outline,
            marginBottom: raised ? px.edge : 0,
          },
          padded && styles.padded,
          faceStyle,
        ]}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  face: {
    borderWidth: px.border,
    borderRadius: px.radius,
  },
  padded: {
    padding: spacing.md,
  },
});
