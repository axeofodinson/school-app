import { useEffect, useState } from 'react';
import { I18nManager } from 'react-native';
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
    // One-time reset: forceRTL used to be called on every locale switch (see
    // src/i18n/index.js) and persists natively across restarts/OTA updates —
    // once flipped true it got stuck, forcing the whole app RTL even with
    // English selected. Direction is now derived purely from JS locale state,
    // so this just clears any leftover flag from a prior build.
    I18nManager.forceRTL(false);
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
