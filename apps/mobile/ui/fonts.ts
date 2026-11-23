// Fonts are bundled (no CDN: the school network blocks some). All OFL:
// Baloo 2 (display), Nunito (body), Noto Nastaliq Urdu (assets/fonts/OFL.txt).
// Only the weights the tokens use are required, so Metro bundles nothing else.
// Keys are the family names in tokens `fontFamily`.
// TODO(perf): WOFF2 subsets for web (~1 MB of Nastaliq TTF today); see TEST_PLAN P-4.
export const fontAssets = {
  'Baloo2-SemiBold': require('@expo-google-fonts/baloo-2/600SemiBold/Baloo2_600SemiBold.ttf'),
  'Baloo2-Bold': require('@expo-google-fonts/baloo-2/700Bold/Baloo2_700Bold.ttf'),
  'Baloo2-ExtraBold': require('@expo-google-fonts/baloo-2/800ExtraBold/Baloo2_800ExtraBold.ttf'),
  'Nunito-Regular': require('@expo-google-fonts/nunito/400Regular/Nunito_400Regular.ttf'),
  'Nunito-SemiBold': require('@expo-google-fonts/nunito/600SemiBold/Nunito_600SemiBold.ttf'),
  'Nunito-Bold': require('@expo-google-fonts/nunito/700Bold/Nunito_700Bold.ttf'),
  'NotoNastaliqUrdu-Regular': require('../assets/fonts/NotoNastaliqUrdu-Regular.ttf'),
  'NotoNastaliqUrdu-Bold': require('../assets/fonts/NotoNastaliqUrdu-Bold.ttf'),
} as const;
