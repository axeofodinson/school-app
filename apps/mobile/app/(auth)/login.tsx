import { PIN_MAX, PIN_MIN, normaliseAdmissionNo, type StudentSignInError } from '@school/core';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '../../features/auth/AuthProvider';
import { useI18n } from '../../i18n';
import { isSupabaseConfigured } from '../../lib/supabase';
import { Button, Card, LanguageToggle, PinField, Screen, Text, TextField } from '../../ui';

// Off until the Google provider is set up on the Supabase project
// (docs/environment.md "Google sign-in"); then build with EXPO_PUBLIC_GOOGLE_SIGNIN=1.
const GOOGLE_ENABLED = process.env.EXPO_PUBLIC_GOOGLE_SIGNIN === '1';

// Student sign-in: admission number (typed, or filled by scanning a QR card) + PIN
// (always typed). Same backend calls as the old app (db/004, db/008).
export default function StudentLogin() {
  const { t } = useI18n();
  const router = useRouter();
  const { studentSignIn, lastSignOut, googleSignIn, oauthError, clearOauthError, sharedMode } =
    useAuth();
  const [googleBusy, setGoogleBusy] = useState(false);
  const params = useLocalSearchParams<{ admission?: string }>();
  const [code, setCode] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<StudentSignInError | null>(null);
  const [busy, setBusy] = useState(false);

  // A scanned card fills the admission number only (never a PIN). Adjusted
  // during render when the param changes (no effect, no extra render pass).
  const [seenParam, setSeenParam] = useState<string | undefined>(undefined);
  if (params.admission !== seenParam) {
    setSeenParam(params.admission);
    const scanned = params.admission ? normaliseAdmissionNo(params.admission) : null;
    if (scanned) {
      setCode(scanned);
      setPin('');
      setError(null);
    }
  }

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const err = await studentSignIn(code, pin);
    setBusy(false);
    if (err) {
      setError(err);
      if (err === 'wrongPin' || err === 'badPin') setPin('');
    }
    // On success the root layout's guards move us to the student home.
  };

  // Google = Preparation only (DECISIONS #23). Not offered on shared school
  // devices: those use school logins, and a memory-only session can't survive
  // the web redirect.
  const google = async () => {
    if (googleBusy) return;
    setGoogleBusy(true);
    setError(null);
    await googleSignIn();
    setGoogleBusy(false);
  };

  const codeError = error === 'missingCode' || error === 'notFound';
  const pinError = error === 'missingPin' || error === 'badPin' || error === 'wrongPin';
  const formError = error && !codeError && !pinError;

  return (
    <Screen>
      <LanguageToggle />
      <View style={styles.header}>
        <Text variant="title" accessibilityRole="header">
          {t('auth.student.title')}
        </Text>
        <Text>{t('auth.student.subtitle')}</Text>
      </View>
      {!isSupabaseConfigured ? <Text tone="wrong">{t('auth.errors.notConfigured')}</Text> : null}
      {lastSignOut === 'idle' || lastSignOut === 'switch' ? (
        <Text tone="textMuted" accessibilityLiveRegion="polite">
          {t(lastSignOut === 'idle' ? 'auth.shared.idleSignedOut' : 'auth.shared.switched')}
        </Text>
      ) : null}
      <Card>
        <View style={styles.form}>
          <Button
            title={t('auth.student.scan')}
            icon="eye"
            variant="secondary"
            onPress={() => router.push('/scan')}
          />
          <TextField
            label={t('auth.student.admissionNumber')}
            placeholder={t('auth.student.admissionNumberPlaceholder')}
            value={code}
            onChangeText={setCode}
            script="latin"
            autoCapitalize="characters"
            autoCorrect={false}
            autoComplete="off"
            maxLength={32}
            editable={!busy}
            error={codeError ? t(`auth.studentErrors.${error}`) : undefined}
          />
          <PinField
            label={t('auth.student.pin')}
            value={pin}
            onChange={setPin}
            length={PIN_MAX}
            minLength={PIN_MIN}
            error={pinError ? t(`auth.studentErrors.${error}`) : undefined}
          />
          {formError ? (
            <Text tone="onWrongSoft" accessibilityLiveRegion="polite">
              {t(`auth.studentErrors.${error}`)}
            </Text>
          ) : null}
          <Button
            title={busy ? t('auth.student.submitting') : t('auth.student.submit')}
            size="lg"
            loading={busy}
            disabled={busy || !isSupabaseConfigured}
            onPress={submit}
          />
        </View>
      </Card>
      {sharedMode || !GOOGLE_ENABLED ? null : (
        <Card>
          <View style={styles.form}>
            <Text variant="heading">{t('auth.google.title')}</Text>
            <Text tone="textMuted">{t('auth.google.body')}</Text>
            {oauthError ? (
              <Text tone="onWrongSoft" accessibilityLiveRegion="polite">
                {t(`auth.google.errors.${oauthError}`)}
              </Text>
            ) : null}
            <Button
              title={googleBusy ? t('auth.google.submitting') : t('auth.google.submit')}
              variant="secondary"
              loading={googleBusy}
              disabled={googleBusy || busy || !isSupabaseConfigured}
              onPress={() => {
                clearOauthError();
                google();
              }}
            />
          </View>
        </Card>
      )}
      <View style={styles.staff}>
        <Text tone="textMuted">{t('auth.student.staffLink')}</Text>
        <Link href="/staff" style={styles.link}>
          <Text tone="primary">{t('auth.student.staffLinkAction')}</Text>
        </Link>
        {/* Same rule as app/dev/gallery.tsx: only where the gallery is turned on. */}
        {__DEV__ || process.env.EXPO_PUBLIC_DEV_GALLERY === '1' ? (
          <Link href="/dev/gallery" style={styles.link}>
            <Text tone="textMuted">{t('dev.gallery.title')}</Text>
          </Link>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 4 },
  form: { gap: 16 },
  staff: { alignItems: 'center', gap: 4, paddingVertical: 8 },
  link: { paddingVertical: 8 },
});
