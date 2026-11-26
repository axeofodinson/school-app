import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from '../features/auth/AuthProvider';
import { SignOutGuardProvider } from '../features/sync/SignOutGuard';
import { I18nProvider, useI18n } from '../i18n';
import {
  MotionProvider,
  SoundProvider,
  SchemeProvider,
  ThemeProvider,
  ToastProvider,
  useMotion,
  useTheme,
} from '../ui';
import { registerServiceWorker } from '../lib/serviceWorker';
import { fontAssets } from '../ui/fonts';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

function Root() {
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  const { ready } = useI18n();
  const { scheme, colours } = useTheme();
  const { tier } = useMotion();
  const { destination } = useAuth();
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
      >
        {/* Each surface exists only for the matching destination (features/auth).
            Navigation convenience only: RLS is the security boundary. */}
        <Stack.Screen name="index" />
        {/* Google redirect target (web); reachable in every state. */}
        <Stack.Screen name="auth-callback" />
        <Stack.Protected guard={destination === 'signedOut'}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={destination === 'student'}>
          <Stack.Screen name="(student)" />
        </Stack.Protected>
        <Stack.Protected guard={destination === 'teacher'}>
          <Stack.Screen name="(teacher)" />
        </Stack.Protected>
        <Stack.Protected guard={destination === 'admin'}>
          <Stack.Screen name="(admin)" />
        </Stack.Protected>
        <Stack.Protected guard={destination === 'teacher' || destination === 'admin'}>
          <Stack.Screen name="(staff)" />
        </Stack.Protected>
        <Stack.Protected guard={destination === 'prep'}>
          <Stack.Screen name="(prep)" />
        </Stack.Protected>
        <Stack.Protected guard={destination === 'pending' || destination === 'profileError'}>
          <Stack.Screen name="(account)" />
        </Stack.Protected>
        <Stack.Protected
          guard={
            destination === 'student' ||
            destination === 'teacher' ||
            destination === 'admin' ||
            destination === 'prep'
          }
        >
          <Stack.Screen name="settings" />
        </Stack.Protected>
        <Stack.Protected guard={destination === 'student' || destination === 'prep'}>
          <Stack.Screen name="downloads" />
        </Stack.Protected>
      </Stack>
    </>
  );
}

export default function RootLayout() {
  // Web: the offline app shell (public/sw.js), production builds only.
  useEffect(() => registerServiceWorker(), []);
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <I18nProvider>
          <SchemeProvider>
            <ThemeProvider>
              <MotionProvider>
                <SoundProvider>
                  <ToastProvider>
                    <AuthProvider>
                      <SignOutGuardProvider>
                        <Root />
                      </SignOutGuardProvider>
                    </AuthProvider>
                  </ToastProvider>
                </SoundProvider>
              </MotionProvider>
            </ThemeProvider>
          </SchemeProvider>
        </I18nProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
