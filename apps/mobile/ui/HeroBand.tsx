import { createContext, useContext, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useI18n } from '../i18n';
import { useFocusRing } from './Sticker';
import { Text } from './Text';

import { PatternFill, type PatternName } from './Pattern';
import { useLayout } from './layout';
import { useMotion } from './motion';
import { useTheme } from './theme';
import { radius, space, subjectHues, type ColourRoles, type SubjectHue } from './tokens';

/** The text tone children of a hero should use (ink on a hue, onPrimary on brand). */
const HeroToneContext = createContext<keyof ColourRoles>('text');
export const useHeroTone = () => useContext(HeroToneContext);

/**
 * The top band of a student screen (Mosaic wireframe "Student Home"): brand indigo
 * (or a subject hue) with the Lahore tile pattern drifting behind it, rounded at the
 * bottom, full bleed. Content is held to the screen's content width.
 *
 * Exam mode and staff presentation: a quiet flat band, no pattern (DESIGN_SYSTEM §3).
 * The pattern follows `patternDrift` (full loops, lite glides once, off still).
 */
export function HeroBand({
  hue,
  pattern = 'star8',
  trigger,
  compact = false,
  brand = false,
  children,
  style,
}: {
  /** Keep the brand look on a staff screen too (sign-in pages). Exams stay quiet. */
  brand?: boolean;
  /** A subject hue instead of brand indigo (text becomes ink). */
  hue?: SubjectHue;
  pattern?: PatternName;
  /** Replays the lite-tier pattern glide when it changes. */
  trigger?: string | number;
  /** Less padding: inner pages (tests, scores) rather than Home. */
  compact?: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { colours, scheme, presentation } = useTheme();
  const { inExam } = useMotion();
  const { gutter, maxContentWidth } = useLayout();
  const quiet = inExam || (presentation === 'staff' && !brand);
  const bg = quiet ? colours.surfaceAlt : hue ? subjectHues[hue][scheme] : colours.primary;
  const tone: keyof ColourRoles = quiet || hue ? 'text' : 'onPrimary';
  const patternColour = hue ? colours.ink : colours.onPrimary;
  return (
    <HeroToneContext.Provider value={tone}>
      <View
        style={[
          styles.band,
          {
            backgroundColor: bg,
            borderBottomStartRadius: quiet ? 0 : radius.xl + 4,
            borderBottomEndRadius: quiet ? 0 : radius.xl + 4,
            paddingTop: compact ? space.md : space.lg,
            paddingBottom: compact ? space.lg : space.xl,
          },
          quiet ? { borderBottomWidth: 2, borderBottomColor: colours.border } : null,
          style,
        ]}
      >
        {quiet ? null : (
          <PatternFill
            name={pattern}
            colour={patternColour}
            opacity={hue ? undefined : 0.14}
            animated
            trigger={trigger}
          />
        )}
        <View style={[styles.inner, { paddingHorizontal: gutter, maxWidth: maxContentWidth }]}>
          {children}
        </View>
      </View>
    </HeroToneContext.Provider>
  );
}

/** The other language's own name as an outlined pill on a hero: one tap flips the app. */
export function HeroLanguageButton() {
  const { locale, setLocale, t } = useI18n();
  const tone = useHeroTone();
  const { colours } = useTheme();
  const { focusProps, ring } = useFocusRing();
  const next = locale === 'en' ? 'ur' : 'en';
  return (
    <Pressable
      {...focusProps}
      onPress={() => setLocale(next)}
      accessibilityRole="button"
      accessibilityLabel={t(next === 'ur' ? 'ui.language.toUrdu' : 'ui.language.toEnglish')}
      style={[styles.langPill, { borderColor: colours[tone] }, ring]}
    >
      <Text variant="label" tone={tone} script={next === 'ur' ? 'urdu' : 'latin'}>
        {t(next === 'ur' ? 'common.urdu' : 'common.english')}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  langPill: {
    minWidth: 48,
    minHeight: 44,
    paddingHorizontal: space.md,
    borderRadius: radius.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  band: { overflow: 'hidden', width: '100%' },
  inner: { width: '100%', alignSelf: 'center', gap: space.xs },
});
