import { StyleSheet, Text, type TextProps } from 'react-native';

import { useI18n } from '../i18n';
import { urduFont } from './fonts';

type Variant = 'title' | 'body' | 'caption';

const ARABIC_SCRIPT = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;

const size: Record<Variant, number> = { title: 26, body: 16, caption: 13 };

/**
 * Text that follows the active language: Nastaliq for Urdu (about 12 % larger,
 * line-height ≥ 1.9×, DESIGN_SYSTEM.md), system font for English, and
 * start-aligned in reading direction. Placeholder sizes until session 02's tokens.
 */
export function AppText({
  variant = 'body',
  style,
  children,
  ...rest
}: TextProps & { variant?: Variant }) {
  const { isRTL: localeRTL } = useI18n();
  // A string with no Urdu letters (an English fallback, a name, a number) keeps
  // the Latin font and LTR order even in Urdu mode, so punctuation stays put.
  const text = Array.isArray(children)
    ? children.filter((c) => typeof c === 'string' || typeof c === 'number').join('')
    : typeof children === 'string' || typeof children === 'number'
      ? String(children)
      : null;
  const isRTL = localeRTL && (text === null || ARABIC_SCRIPT.test(text));
  const base = size[variant];
  const fontSize = isRTL ? Math.round(base * 1.12) : base;
  return (
    <Text
      {...rest}
      style={[
        {
          fontSize,
          lineHeight: Math.round(fontSize * (isRTL ? 1.9 : 1.35)),
          textAlign: 'auto',
          writingDirection: isRTL ? 'rtl' : 'ltr',
        },
        isRTL
          ? { fontFamily: variant === 'title' ? urduFont.bold : urduFont.regular }
          : variant === 'title' && styles.bold,
        styles.color,
        style,
      ]}
    >
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  bold: { fontWeight: '700' },
  color: { color: '#1b1d2a' },
});
