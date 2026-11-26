// The bundled Urdu font for printed pages (worksheets): @font-face CSS pointing
// at the app's own Noto Nastaliq file (never a CDN). Web: the same-origin asset
// URL. Android: the asset's local file. If it can't be found, print falls back
// to the system's Urdu font.
import { Asset } from 'expo-asset';
import { Platform } from 'react-native';

import { fontAssets } from '../ui/fonts';

export async function urduPrintFontCss(): Promise<string> {
  try {
    const a = Asset.fromModule(fontAssets['NotoNastaliqUrdu-Regular']);
    if (Platform.OS !== 'web') await a.downloadAsync();
    let src = (Platform.OS === 'web' ? a.uri : a.localUri) ?? '';
    if (!src) return '';
    if (Platform.OS === 'web' && src.startsWith('/')) src = window.location.origin + src;
    return `@font-face { font-family: 'WorksheetUrdu'; src: url('${src.replace(/'/g, '%27')}') format('truetype'); }`;
  } catch {
    return '';
  }
}
