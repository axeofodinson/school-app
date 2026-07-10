import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { useFonts } from 'expo-font';

import { fontAssets, fonts } from './src/theme/fonts';
import { applyLayoutDirection, isRTL, t } from './src/i18n';

// Apply the RTL/LTR layout direction as early as possible, before first render.
// (No screens yet — this establishes the direction so every screen we build
// later inherits it. If it reports a needed reload, wire expo-updates here.)
applyLayoutDirection();

// Placeholder shell only — no app features yet.
// Screens are built in the CLAUDE.md "from-empty build order":
// academic year -> classes -> subjects -> chapters -> students ->
// enrollments -> questions -> assessments -> submissions/attendance.
export default function App() {
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Bundled fonts either finish loading or error; either way, stop blocking.
    if (fontsLoaded || fontError) setReady(true);
  }, [fontsLoaded, fontError]);

  if (!ready) return null; // keep the native splash up until fonts resolve

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('app.name')}</Text>
      <Text style={styles.subtitle}>Project scaffold — no screens yet.</Text>
      {/* Proves the bundled Urdu Nastaliq font renders (no CDN). */}
      <Text style={[styles.urduSample, { writingDirection: isRTL ? 'rtl' : 'ltr' }]}>
        {t('app.name', { locale: 'ur' })}
      </Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: { fontSize: 22, fontWeight: '600' },
  subtitle: { marginTop: 8, color: '#666' },
  urduSample: { marginTop: 16, fontSize: 26, fontFamily: fonts.urdu.regular },
});
