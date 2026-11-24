import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useI18n } from '../i18n';
import { MasteryChip } from './Badge';
import { MosaicTiles } from './MosaicTiles';
import { PatternBand } from './PatternBand';
import { PressableSticker } from './Sticker';
import { Text } from './Text';
import { useTheme } from './theme';
import { hueForSubject, radiusFor, space, type MasteryBand } from './tokens';

export type SubjectSummary = {
  /** subjects.id: the hue comes from colourKey or a stable hash of the id (never a hardcoded map). */
  id: string;
  /** From the database, in the active language. */
  name: string;
  colourKey?: string | null;
  mastered: number;
  total: number;
  band?: MasteryBand;
};

/** A subject on Home: hue + pattern header, its mosaic, and the band. Pressable sticker. */
export function SubjectCard({
  subject,
  onPress,
  justSet,
}: {
  subject: SubjectSummary;
  onPress?: () => void;
  justSet?: number;
}) {
  const { t } = useI18n();
  const { colours, presentation } = useTheme();
  const hue = hueForSubject(subject.id, subject.colourKey);
  const r = radiusFor('lg', presentation);
  // Lite tier: the pattern glides again on press and when a tile is set.
  const [presses, setPresses] = useState(0);
  const label = t('ui.mosaic.label', {
    subject: subject.name,
    count: subject.mastered,
    total: subject.total,
  });
  return (
    <PressableSticker
      onPressIn={() => setPresses((n) => n + 1)}
      onPress={onPress}
      radius={r}
      accessibilityRole="button"
      accessibilityLabel={label}
      faceStyle={(pressed) => [
        styles.face,
        { backgroundColor: pressed ? colours.surfaceAlt : colours.surface },
      ]}
    >
      <PatternBand
        hue={hue}
        minHeight={presentation === 'kid' ? 72 : 56}
        trigger={`${presses}:${justSet ?? ''}`}
      >
        <Text variant="heading" tone="ink" numberOfLines={2}>
          {subject.name}
        </Text>
      </PatternBand>
      <View style={styles.body}>
        <MosaicTiles
          total={subject.total}
          mastered={subject.mastered}
          hue={hue}
          label={label}
          justSet={justSet}
        />
        <View style={styles.row}>
          <Text variant="bodySm" tone="textMuted" style={styles.flex}>
            {t('ui.mosaic.count', { count: subject.mastered, total: subject.total })}
          </Text>
          {subject.band ? <MasteryChip band={subject.band} /> : null}
        </View>
      </View>
    </PressableSticker>
  );
}

const styles = StyleSheet.create({
  face: { overflow: 'hidden' },
  body: { padding: space.lg, gap: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  flex: { flex: 1 },
});
