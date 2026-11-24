import type { StaffSignInError } from '@school/core';
import { Link } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '../../features/auth/AuthProvider';
import { useI18n } from '../../i18n';
import { isSupabaseConfigured } from '../../lib/supabase';
import { Button, Card, LanguageToggle, Screen, Text, TextField, ThemeProvider } from '../../ui';

// Staff sign-in: email + password (admins and teachers). Students never get an
// email account (CLAUDE.md); they use the admission number + PIN screen.
export default function StaffLogin() {
  const { t } = useI18n();
  const { staffSignIn, lastSignOut } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<StaffSignInError | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const err = await staffSignIn(email, password);
    setBusy(false);
    if (err) setError(err);
  };

  return (
    <ThemeProvider presentation="staff">
      <Screen>
        <LanguageToggle />
        <View style={styles.header}>
          <Text variant="title" accessibilityRole="header">
            {t('auth.login.title')}
          </Text>
          <Text>{t('auth.login.subtitle')}</Text>
        </View>
        {!isSupabaseConfigured ? <Text tone="wrong">{t('auth.errors.notConfigured')}</Text> : null}
        {lastSignOut === 'idle' ? (
          <Text tone="textMuted">{t('auth.shared.idleSignedOut')}</Text>
        ) : null}
        <Card>
          <View style={styles.form}>
            <TextField
              label={t('auth.login.email')}
              placeholder={t('auth.login.emailPlaceholder')}
              value={email}
              onChangeText={setEmail}
              script="latin"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              inputMode="email"
              editable={!busy}
            />
            <TextField
              label={t('auth.login.password')}
              placeholder={t('auth.login.passwordPlaceholder')}
              value={password}
              onChangeText={setPassword}
              script="latin"
              secureTextEntry
              autoCapitalize="none"
              autoComplete="current-password"
              editable={!busy}
              returnKeyType="go"
              onSubmitEditing={submit}
            />
            {error ? (
              <Text tone="onWrongSoft" accessibilityLiveRegion="polite">
                {t(`auth.errors.${error}`)}
              </Text>
            ) : null}
            <Button
              title={busy ? t('auth.login.submitting') : t('auth.login.submit')}
              loading={busy}
              disabled={busy || !isSupabaseConfigured}
              onPress={submit}
            />
          </View>
        </Card>
        <View style={styles.student}>
          <Text tone="textMuted">{t('auth.login.studentNote')}</Text>
          <Link href="/login" style={styles.link}>
            <Text tone="primary">{t('auth.login.studentLink')}</Text>
          </Link>
        </View>
      </Screen>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  header: { gap: 4 },
  form: { gap: 16 },
  student: { alignItems: 'center', gap: 4, paddingVertical: 8 },
  link: { paddingVertical: 8 },
});
