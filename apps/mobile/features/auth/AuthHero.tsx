// The top of the sign-in screens: the school's mark, the language pill, a big title,
// and a row of mosaic tiles that settle into place as the page opens (listEnter
// cascade), then keep turning calmly between square, star, diamond and rosette in a
// rolling wave (shapeMorph: full loops, lite one pass, off still). The mark morphs too.
// The pattern drifts behind (patternDrift).
import { StyleSheet, View } from 'react-native';

import { useI18n } from '../../i18n';
import {
  HeroBand,
  HeroLanguageButton,
  MorphTile,
  MosaicMark,
  Reveal,
  Text,
  useHeroTone,
  useMorphClock,
  useTheme,
} from '../../ui';
import { morphPhaseStep } from '@school/core/design';
import { space, subjectHues, type SubjectHue } from '../../ui/tokens';

const HUES: SubjectHue[] = ['sky', 'mint', 'coral', 'sunflower', 'lilac', 'lagoon'];

function Tiles() {
  const { colours, scheme } = useTheme();
  const morph = useMorphClock();
  return (
    <View style={styles.tiles} accessible={false} importantForAccessibility="no-hide-descendants">
      {HUES.map((hue, i) => (
        <Reveal key={hue} index={i + 2} rise={18}>
          <MorphTile
            morph={morph}
            phase={i * morphPhaseStep}
            size={26}
            fill={subjectHues[hue][scheme]}
            outline={colours.ink}
          />
        </Reveal>
      ))}
    </View>
  );
}

function Inner({ title, subtitle }: { title: string; subtitle: string }) {
  const { t } = useI18n();
  const tone = useHeroTone();
  const { colours } = useTheme();
  return (
    <>
      <View style={styles.top}>
        <View style={[styles.mark, { borderColor: 'transparent' }]}>
          <MosaicMark size={26} colour={colours[tone]} fill={colours.primary} />
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
});
