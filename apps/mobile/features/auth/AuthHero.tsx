// The top of the sign-in screens: the school's mark, the language pill, a big title,
// and a small cluster of mosaic tiles that settle into place as the page opens
// (listEnter cascade; lite fades, off still). The pattern drifts behind (patternDrift).
import { StyleSheet, View } from 'react-native';

import { useI18n } from '../../i18n';
import { HeroBand, HeroLanguageButton, Icon, Reveal, Text, useHeroTone, useTheme } from '../../ui';
import { space, subjectHues, type SubjectHue } from '../../ui/tokens';

const TILES: { hue: SubjectHue; diamond?: boolean }[] = [
  { hue: 'sky' },
  { hue: 'mint', diamond: true },
  { hue: 'coral' },
  { hue: 'sunflower' },
  { hue: 'lilac', diamond: true },
  { hue: 'lagoon' },
];

function Tiles() {
  const { colours, scheme } = useTheme();
  return (
    <View style={styles.tiles} accessible={false} importantForAccessibility="no-hide-descendants">
      {TILES.map((tile, i) => (
        <Reveal key={i} index={i + 2} rise={18}>
          <View
            style={[
              styles.tile,
              {
                backgroundColor: subjectHues[tile.hue][scheme],
                borderColor: colours.ink,
                transform: tile.diamond ? [{ rotate: '45deg' }, { scale: 0.8 }] : undefined,
              },
            ]}
          />
        </Reveal>
      ))}
    </View>
  );
}

function Inner({ title, subtitle }: { title: string; subtitle: string }) {
  const { t } = useI18n();
  const tone = useHeroTone();
  return (
    <>
      <View style={styles.top}>
        <View style={[styles.mark, { borderColor: 'transparent' }]}>
          <Icon name="mosaic" size={28} tone={tone} />
        </View>
        <Text variant="label" tone={tone} style={styles.flex} numberOfLines={2}>
          {t('auth.school')}
        </Text>
        <HeroLanguageButton />
      </View>
      <Tiles />
      <Reveal index={0} rise={10}>
        <Text variant="display" tone={tone} accessibilityRole="header">
          {title}
        </Text>
      </Reveal>
      <Reveal index={1} rise={6}>
        <Text tone={tone}>{subtitle}</Text>
      </Reveal>
    </>
  );
}

export function AuthHero({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <HeroBand brand>
      <Inner title={title} subtitle={subtitle} />
    </HeroBand>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  mark: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  tiles: { flexDirection: 'row', gap: space.sm, marginTop: space.lg, marginBottom: space.sm },
  tile: { width: 26, height: 26, borderRadius: 7, borderWidth: 2 },
});
