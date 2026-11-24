import { Children } from 'react';
import { Platform, Text as RNText, type TextProps } from 'react-native';

import { useI18n } from '../i18n';
import { useTheme } from './theme';
import {
  isolateLtrRuns,
  urduTextRules,
  scriptOf,
  textMetrics,
  type ColourRoles,
  type Script,
  type TypeStep,
} from './tokens';

export type TextTone = keyof ColourRoles;

export type AppTextProps = TextProps & {
  /** Type step (DESIGN_SYSTEM.md §2.3). */
  variant?: TypeStep;
  /** Colour role. Default `text`. */
  tone?: TextTone;
  /** Force a script (e.g. admission numbers are always Latin). Default: from content. */
  script?: Script;
};

/** Plain text content of children, or null if they include elements. */
function plainText(children: TextProps['children']): string | null {
  let out = '';
  let plain = true;
  Children.forEach(children, (c) => {
    if (typeof c === 'string' || typeof c === 'number') out += String(c);
    else if (c != null && typeof c !== 'boolean') plain = false;
  });
  return plain ? out : null;
}

/**
 * The only text primitive. Picks the script from the content (any Urdu letter →
 * Nastaliq, ~12 % larger, line-height ≥ 1.9×; otherwise Baloo 2 / Nunito), so an
 * English name inside the Urdu UI keeps Latin metrics. Latin and number runs inside
 * Urdu are wrapped in Unicode isolates so "8/10" never reorders. Presentation scales
 * size AND line-height. No fixed heights: text can grow to 200 %.
 */
export function Text({
  variant = 'body',
  tone = 'text',
  script,
  style,
  children,
  ...rest
}: AppTextProps) {
  const { isRTL } = useI18n();
  const { colours, presentation } = useTheme();
  const plain = plainText(children);
  const resolved: Script = script ?? (plain !== null ? scriptOf(plain) : isRTL ? 'urdu' : 'latin');
  const m = textMetrics(variant, resolved, presentation);
  const urdu = resolved === 'urdu';
  const content = urdu && plain !== null ? isolateLtrRuns(plain) : children;

  return (
    <RNText
      {...rest}
      style={[
        {
          color: colours[tone],
          fontFamily: m.fontFamily,
          fontSize: m.fontSize,
          lineHeight: m.lineHeight,
          writingDirection: urdu ? 'rtl' : 'ltr',
          // Align to the start of the UI direction (not the text's own), so an English
          // fallback inside the Urdu UI still lines up on the right. Callers may override.
          // Android already swaps left/right inside an RTL layout (Screen sets direction),
          // so there 'left' means start; web takes the side literally.
          textAlign: Platform.OS === 'android' ? 'left' : isRTL ? 'right' : 'left',
          // Nastaliq: never tracked, italicised or uppercased (urduTextRules).
          ...(urdu
            ? {
                letterSpacing: 0,
                fontStyle: 'normal' as const,
                textTransform: 'none' as const,
                // Room for Nastaliq overhang so tails and marks are not clipped.
                paddingHorizontal: Math.ceil(m.fontSize * urduTextRules.overhangPadding.x),
                paddingVertical: Math.ceil(m.fontSize * urduTextRules.overhangPadding.y),
              }
            : null),
          ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
        },
        style,
      ]}
    >
      {content}
    </RNText>
  );
}
