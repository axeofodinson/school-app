import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';

import { fontAssets } from './src/theme/fonts';
import { applyLayoutDirection } from './src/i18n';
import { AuthProvider } from './src/auth/AuthProvider';
import RootNavigator from './src/navigation/RootNavigator';

// Apply the RTL/LTR layout direction as early as possible, before first render.
applyLayoutDirection();

export default function App() {
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Bundled fonts either finish loading or error; either way, stop blocking.
    if (fontsLoaded || fontError) setReady(true);
  }, [fontsLoaded, fontError]);

  if (!ready) return null; // keep the native splash up until fonts resolve

  return (
    <AuthProvider>
      <StatusBar style="auto" />
      <RootNavigator />
    </AuthProvider>
  );
}
