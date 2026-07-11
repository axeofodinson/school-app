// Staff sign-in (admin/teacher) — email + password over Supabase Auth.
// On success the auth listener re-routes and this screen unmounts. Students use
// a separate flow (StudentLoginScreen); `onStudent` links back to it.
import { useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';

import { ScreenContainer, Text, Button, TextField, LanguageSwitch } from '../../components';
import { useAuth } from '../../auth/AuthProvider';
import { t } from '../../i18n';
import { colors, spacing } from '../../theme/colors';

export default function LoginScreen({ onStudent }) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorKey, setErrorKey] = useState(null); // key under `auth.errors`
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async () => {
    setErrorKey(null);
    if (!email.trim() || !password) {
      setErrorKey('missingFields');
      return;
    }
    setSubmitting(true);
    const err = await signIn(email, password); // null | 'invalidCredentials' | 'network' | 'unknown'
    setSubmitting(false);
    if (err) setErrorKey(err);
  };

  return (
    <ScreenContainer scroll center>
      <LanguageSwitch style={styles.language} />
      <Text variant="title">{t('auth.login.title')}</Text>
      <Text variant="subtitle" color={colors.muted} style={styles.subtitle}>
        {t('auth.login.subtitle')}
      </Text>

      {errorKey ? (
        <View style={styles.banner} accessibilityLiveRegion="polite">
          <Text variant="body" color={colors.danger}>
            {t(`auth.errors.${errorKey}`)}
          </Text>
        </View>
      ) : null}

      <TextField
        label={t('auth.login.email')}
        value={email}
        onChangeText={setEmail}
        placeholder={t('auth.login.emailPlaceholder')}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        editable={!submitting}
      />
      <TextField
        label={t('auth.login.password')}
        value={password}
        onChangeText={setPassword}
        placeholder={t('auth.login.passwordPlaceholder')}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="current-password"
        textContentType="password"
        editable={!submitting}
        returnKeyType="go"
        onSubmitEditing={onSubmit}
      />

      <Button
        label={submitting ? t('auth.login.submitting') : t('auth.login.submit')}
        onPress={onSubmit}
        loading={submitting}
        style={styles.submit}
      />

      <Pressable
        onPress={onStudent}
        accessibilityRole="button"
        hitSlop={8}
        style={styles.studentLink}
      >
        <Text variant="label" color={colors.primary} align="center">
          {t('auth.login.studentLink')}
        </Text>
      </Pressable>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  language: { alignSelf: 'center', marginBottom: spacing.xl },
  subtitle: { marginTop: spacing.xs, marginBottom: spacing.lg },
  banner: {
    backgroundColor: '#fef2f2',
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: 10,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  submit: { marginTop: spacing.sm },
  studentLink: { marginTop: spacing.xl, alignSelf: 'center' },
});
