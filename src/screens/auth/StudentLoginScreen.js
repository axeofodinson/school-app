// Student sign-in — the school-issued flow, kept separate from staff email/
// password. A child types their ADMISSION NUMBER and their PIN. No email, ever.
// The admission number (student_code) is globally unique and stable across
// years, so there's no class or year to pick — just two fields and one action.
// Designed for young users: big tap targets, minimal text. Bilingual + RTL like
// every screen.
//
// On success the auth listener re-routes and this screen unmounts.
import { useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';

import { ScreenContainer, Text, Button, TextField, LanguageSwitch } from '../../components';
import { useAuth } from '../../auth/AuthProvider';
import { t } from '../../i18n';
import { colors, spacing } from '../../theme/colors';

export default function StudentLoginScreen({ onStaff }) {
  const { studentSignIn } = useAuth();

  const [code, setCode] = useState('');
  const [pin, setPin] = useState('');
  const [errorKey, setErrorKey] = useState(null); // key under `auth.studentErrors`
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async () => {
    setErrorKey(null);
    if (!code.trim()) return setErrorKey('missingCode');
    if (!pin.trim()) return setErrorKey('missingPin');

    setSubmitting(true);
    const err = await studentSignIn(code.trim(), pin.trim());
    setSubmitting(false);
    if (err) setErrorKey(err);
  };

  return (
    <ScreenContainer scroll>
      <LanguageSwitch style={styles.language} />
      <Text variant="title" align="center">{t('auth.student.title')}</Text>
      <Text variant="subtitle" color={colors.muted} align="center" style={styles.subtitle}>
        {t('auth.student.subtitle')}
      </Text>

      {errorKey ? (
        <View style={styles.banner} accessibilityLiveRegion="polite">
          <Text variant="body" color={colors.danger} align="center">
            {t(`auth.studentErrors.${errorKey}`)}
          </Text>
        </View>
      ) : null}

      <TextField
        label={t('auth.student.admissionNumber')}
        value={code}
        onChangeText={setCode}
        placeholder={t('auth.student.admissionNumberPlaceholder')}
        autoCapitalize="characters"
        autoCorrect={false}
        editable={!submitting}
      />
      <TextField
        label={t('auth.student.pin')}
        value={pin}
        onChangeText={setPin}
        placeholder={t('auth.student.pinPlaceholder')}
        keyboardType="number-pad"
        secureTextEntry
        maxLength={8}
        editable={!submitting}
        returnKeyType="go"
        onSubmitEditing={onSubmit}
      />

      <Button
        label={submitting ? t('auth.student.submitting') : t('auth.student.submit')}
        onPress={onSubmit}
        loading={submitting}
        style={styles.submit}
      />

      <View style={styles.staffRow}>
        <Text variant="caption" color={colors.muted} align="center">
          {t('auth.student.staffLink')}
        </Text>
        <Pressable onPress={onStaff} accessibilityRole="button" hitSlop={8}>
          <Text variant="label" color={colors.primary} align="center" style={styles.staffAction}>
            {t('auth.student.staffLinkAction')}
          </Text>
        </Pressable>
      </View>
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
  submit: { marginTop: spacing.sm, minHeight: 56 },
  staffRow: { marginTop: spacing.xl, alignItems: 'center' },
  staffAction: { marginTop: spacing.xs },
});
