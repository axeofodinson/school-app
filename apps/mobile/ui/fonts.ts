// Fonts are bundled (no CDN: the school network blocks some). Noto Nastaliq Urdu
// is OFL (assets/fonts/OFL.txt). Baloo 2 + Nunito (DESIGN_SYSTEM.md) arrive in
// session 02. TODO(02): WOFF2 subset for web to cut the ~530 KB TTF download.
export const fontAssets = {
  'NotoNastaliqUrdu-Regular': require('../assets/fonts/NotoNastaliqUrdu-Regular.ttf'),
  'NotoNastaliqUrdu-Bold': require('../assets/fonts/NotoNastaliqUrdu-Bold.ttf'),
} as const;

export const urduFont = {
  regular: 'NotoNastaliqUrdu-Regular',
  bold: 'NotoNastaliqUrdu-Bold',
} as const;
