import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';

import { fontAssets } from './src/theme/fonts';
import { applyLayoutDirection, t } from './src/i18n';
import { ScreenContainer, Text } from './src/components';
import { colors, spacing } from './src/theme/colors';

// Apply the RTL/LTR layout direction as early as possible, before first render.
// (No screens yet — this establishes the direction so every screen we build
// later inherits it. If it reports a needed reload, wire expo-updates here.)
applyLayoutDirection();

// Placeholder shell only — no app features yet. It doubles as a smoke test that
// the themed component base (ScreenContainer + Text) renders in both directions.
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
    <ScreenContainer center>
      <Text variant="title" align="center">
        {t('app.name')}
      </Text>
      <Text variant="subtitle" color={colors.muted} align="center" style={{ marginTop: spacing.sm }}>
        Project scaffold — no screens yet.
      </Text>
      <StatusBar style="auto" />
    </ScreenContainer>
  );
}
