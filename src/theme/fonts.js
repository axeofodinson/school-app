// Fonts are BUNDLED into the app from assets/fonts/ (vendored .ttf files) —
// never loaded from a CDN, since the target network blocks some CDNs.
//
// Noto Nastaliq Urdu is an Urdu-capable Nastaliq typeface (OFL — see
// assets/fonts/OFL.txt). Urdu text must be rendered with it; the system default
// does not render Nastaliq well.
import { isRTL } from '../i18n';

// Passed to expo-font's useFonts(): family name -> local asset.
// Pixelify Sans (OFL — see assets/fonts/OFL-PixelifySans.txt) is the student
// app's display face for English titles/numbers; Urdu display stays Nastaliq.
export const fontAssets = {
  'NotoNastaliqUrdu-Regular': require('../../assets/fonts/NotoNastaliqUrdu-Regular.ttf'),
  'NotoNastaliqUrdu-Bold': require('../../assets/fonts/NotoNastaliqUrdu-Bold.ttf'),
  'PixelifySans-SemiBold': require('../../assets/fonts/PixelifySans-SemiBold.ttf'),
};

// Semantic names for use in styles, so screens never hardcode the raw family.
export const fonts = {
  urdu: {
    regular: 'NotoNastaliqUrdu-Regular',
    bold: 'NotoNastaliqUrdu-Bold',
  },
};

// Resolve the font family for the CURRENT locale/direction.
// Urdu (RTL) must render in Noto Nastaliq; English falls back to the system
// font (returning undefined lets React Native use the platform default).
// Returns a family name string, or undefined for the system font.
export function localeFont(weight = 'regular') {
  if (!isRTL) return undefined;
  return weight === 'bold' ? fonts.urdu.bold : fonts.urdu.regular;
}
