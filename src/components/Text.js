// Themed Text — the base text primitive for the whole app.
//
// Why not use React Native's <Text> directly: this one respects the current
// locale/direction automatically. It applies the Noto Nastaliq font for Urdu
// (system font for English) and aligns to the start of the reading direction,
// so screens never re-solve RTL/font concerns per string.
//
// It renders text passed as children — it does NOT hold copy. All user-facing
// strings still come from i18n (locales/en.json + ur.json) at the call site.
import { Text as RNText, StyleSheet } from 'react-native';

import { colors } from '../theme/colors';
import { localeFont } from '../theme/fonts';
import { isRTL } from '../i18n';

// Plain type scale for now; visual identity comes later.
const VARIANTS = {
  title: { fontSize: 24, weight: 'bold' },
  subtitle: { fontSize: 16, weight: 'regular' },
  body: { fontSize: 16, weight: 'regular' },
  label: { fontSize: 14, weight: 'bold' },
  caption: { fontSize: 13, weight: 'regular' },
};

export default function Text({
  children,
  variant = 'body',
  color = colors.text,
  align, // optional override: 'start' | 'center' | 'end'
  style,
  ...rest
}) {
  const v = VARIANTS[variant] ?? VARIANTS.body;

  // Default alignment follows the reading direction; callers can override.
  const startEdge = isRTL ? 'right' : 'left';
  const endEdge = isRTL ? 'left' : 'right';
  const textAlign =
    align === 'center' ? 'center' : align === 'end' ? endEdge : startEdge;

  return (
    <RNText
      style={[
        {
          fontSize: v.fontSize,
          color,
          fontFamily: localeFont(v.weight),
          // fontWeight is a no-op for the Nastaliq family (weight is the file),
          // but drives the system font used for English.
          fontWeight: v.weight === 'bold' ? '700' : '400',
          textAlign,
          writingDirection: isRTL ? 'rtl' : 'ltr',
        },
        style,
      ]}
      {...rest}
    >
      {children}
    </RNText>
  );
}
