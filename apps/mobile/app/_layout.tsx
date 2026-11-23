import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { I18nProvider, useI18n } from '../i18n';
import { MotionProvider, ThemeProvider, ToastProvider, useMotion, useTheme } from '../ui';
import { fontAssets } from '../ui/fonts';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

function Root() {
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  const { ready } = useI18n();
  const { scheme, colours } = useTheme();
  const { tier } = useMotion();
  const done = (fontsLoaded || Boolean(fontError)) && ready;

  useEffect(() => {
    if (done) SplashScreen.hideAsync().catch(() => undefined);
  }, [done]);

  if (!done) return null;
  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colours.bg },
          // screenPush moment: platform slide in full, fade in lite, nothing in off.
          animation: tier === 'full' ? 'default' : tier === 'lite' ? 'fade' : 'none',
        }}
      />
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <I18nProvider>
          <ThemeProvider scheme="system">
            <MotionProvider>
              <ToastProvider>
                <Root />
              </ToastProvider>
            </MotionProvider>
          </ThemeProvider>
        </I18nProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
