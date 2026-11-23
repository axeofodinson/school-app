import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { I18nProvider, useI18n } from '../i18n';
import { fontAssets } from '../ui/fonts';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

function Root() {
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  const { ready } = useI18n();
  const done = (fontsLoaded || Boolean(fontError)) && ready;

  useEffect(() => {
    if (done) SplashScreen.hideAsync().catch(() => undefined);
  }, [done]);

  if (!done) return null;
  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <I18nProvider>
          <Root />
        </I18nProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
