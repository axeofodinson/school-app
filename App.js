import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { fontAssets } from './src/theme/fonts';
import { loadPersistedLocale } from './src/i18n';
import { LanguageProvider } from './src/i18n/LanguageProvider';
import { AuthProvider } from './src/auth/AuthProvider';
import { ToastProvider } from './src/notifications/ToastProvider';
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

  // Provider order matters: ToastProvider sits at the ROOT (inside Auth so it
  // can theme by role) and above NotificationsProvider (which dispatches into
  // it) — one toast layer serving student app, teacher, and admin console
  // alike. SafeAreaProvider feeds the toast's inset-based positioning.
  return (
    <SafeAreaProvider>
      <LanguageProvider>
        <AuthProvider>
          <ToastProvider>
            <NotificationsProvider>
              <StatusBar style="auto" />
              <RootNavigator />
            </NotificationsProvider>
          </ToastProvider>
        </AuthProvider>
      </LanguageProvider>
    </SafeAreaProvider>
  );
}
