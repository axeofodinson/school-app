import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';

import { fontAssets } from './src/theme/fonts';
import { loadPersistedLocale } from './src/i18n';
import { LanguageProvider } from './src/i18n/LanguageProvider';
import { AuthProvider } from './src/auth/AuthProvider';
import { NotificationsProvider } from './src/notifications/NotificationsProvider';
import RootNavigator from './src/navigation/RootNavigator';

export default function App() {
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  const [localeLoaded, setLocaleLoaded] = useState(false);

  useEffect(() => {
    // Restore the saved language/direction before the first render, so the app
    // opens in the language the user last chose.
    loadPersistedLocale().finally(() => setLocaleLoaded(true));
  }, []);

  // Keep the native splash up until fonts resolve and the locale is restored.
  const ready = (fontsLoaded || fontError) && localeLoaded;
  if (!ready) return null;

  return (
    <LanguageProvider>
      <AuthProvider>
        <NotificationsProvider>
          <StatusBar style="auto" />
          <RootNavigator />
        </NotificationsProvider>
      </AuthProvider>
    </LanguageProvider>
  );
}
