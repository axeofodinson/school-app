import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';

import { useAuth } from '../features/auth/AuthProvider';
import { useI18n } from '../i18n';
import { useTheme } from '../ui';

// Where Google sends the browser back (web), and where Android may deliver the
// redirect as a deep link (native already finished in googleSignIn(); a used
// code is skipped). Reachable in every auth state, like index.
export default function AuthCallback() {
  const { completeGoogleRedirect, session } = useAuth();
  const { t } = useI18n();
  const { colours } = useTheme();
  const router = useRouter();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (Platform.OS !== 'web' || typeof window === 'undefined' || session) {
      router.replace('/');
      return;
    }
    const url = window.location.href;
    // Take the one-time code out of the address bar and history.
    window.history.replaceState(null, '', '/auth-callback');
    completeGoogleRedirect(url).finally(() => router.replace('/'));
  }, [completeGoogleRedirect, router, session]);

  return (
    <View style={[styles.fill, { backgroundColor: colours.bg }]}>
      <ActivityIndicator color={colours.primary} accessibilityLabel={t('common.loading')} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
