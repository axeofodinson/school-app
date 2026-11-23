import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { useI18n } from '../i18n';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';
import { useTheme } from './theme';
import { masteryRoles, radius, space, type ColourRoles, type MasteryBand } from './tokens';

export type BadgeTone =
  'neutral' | 'primary' | 'accent' | 'correct' | 'wrong' | 'learning' | 'weak';

const toneRoles: Record<BadgeTone, { bg: keyof ColourRoles; fg: keyof ColourRoles }> = {
  neutral: { bg: 'surfaceAlt', fg: 'textMuted' },
  primary: { bg: 'primarySoft', fg: 'onPrimarySoft' },
  accent: { bg: 'accentSoft', fg: 'onAccentSoft' },
  correct: { bg: 'correctSoft', fg: 'onCorrectSoft' },
  wrong: { bg: 'wrongSoft', fg: 'onWrongSoft' },
  learning: { bg: 'learningSoft', fg: 'onLearningSoft' },
  weak: { bg: 'weakSoft', fg: 'onWeakSoft' },
};

/** A small status chip. Colour is never the only signal: pass a word, and an icon where it helps. */
export function Badge({
  label,
  tone = 'neutral',
  icon,
  style,
}: {
  label: string;
  tone?: BadgeTone;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}) {
  const { colours } = useTheme();
  const r = toneRoles[tone];
  return (
    <View style={[styles.badge, { backgroundColor: colours[r.bg] }, style]}>
      {icon ? <Icon name={icon} size={16} tone={r.fg} /> : null}
      <Text variant="bodySm" tone={r.fg} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/**
 * Mastery band shapes (DESIGN_SYSTEM.md §1.1, §2.4) so colour-blind users can tell
 * them apart: learning = half-filled circle, weak = triangle with a dot,
 * mastered = filled circle with a tick. Not mirrored in RTL.
 */
export function MasteryShape({ band, size = 16 }: { band: MasteryBand; size?: number }) {
  const { colours } = useTheme();
  const c = colours[masteryRoles[band].fill];
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {band === 'learning' ? (
        <>
          <Circle cx={8} cy={8} r={6.5} stroke={c} strokeWidth={1.75} fill="none" />
          <Path d="M1.5 8a6.5 6.5 0 0 0 13 0z" fill={c} />
        </>
      ) : band === 'weak' ? (
        <>
          <Path
            d="M8 1.5 15 14.5H1z"
            stroke={c}
            strokeWidth={1.75}
            strokeLinejoin="round"
            fill="none"
          />
          <Circle cx={8} cy={10.5} r={1.6} fill={c} />
        </>
      ) : (
        <>
          <Circle cx={8} cy={8} r={7.5} fill={c} />
          <Path
            d="M4.5 8.2 7 10.6l4.6-5"
            stroke={colours.surface}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </>
      )}
    </Svg>
  );
}

const bandWord = {
  learning: 'ui.mastery.learning',
  weak: 'ui.mastery.weak',
  mastered: 'ui.mastery.mastered',
} as const;

/** Mastery band: chip + shape + word, always all three (no percentages). */
export function MasteryChip({ band, style }: { band: MasteryBand; style?: StyleProp<ViewStyle> }) {
  const { t } = useI18n();
  const { colours } = useTheme();
  const r = masteryRoles[band];
  return (
    <View style={[styles.badge, { backgroundColor: colours[r.soft] }, style]}>
      <MasteryShape band={band} />
      <Text variant="bodySm" tone={r.onSoft} numberOfLines={1}>
        {t(bandWord[band])}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.full,
  },
});
