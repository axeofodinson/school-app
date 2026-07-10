// Fonts are BUNDLED into the app from assets/fonts/ (vendored .ttf files) —
// never loaded from a CDN, since the target network blocks some CDNs.
//
// Noto Nastaliq Urdu is an Urdu-capable Nastaliq typeface (OFL — see
// assets/fonts/OFL.txt). Urdu text must be rendered with it; the system default
// does not render Nastaliq well.

// Passed to expo-font's useFonts(): family name -> local asset.
export const fontAssets = {
  'NotoNastaliqUrdu-Regular': require('../../assets/fonts/NotoNastaliqUrdu-Regular.ttf'),
  'NotoNastaliqUrdu-Bold': require('../../assets/fonts/NotoNastaliqUrdu-Bold.ttf'),
};

// Semantic names for use in styles, so screens never hardcode the raw family.
export const fonts = {
  urdu: {
    regular: 'NotoNastaliqUrdu-Regular',
    bold: 'NotoNastaliqUrdu-Bold',
  },
};
