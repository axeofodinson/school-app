// Student sign-in — the school-issued flow, kept separate from staff email/
// password. A child types their ADMISSION NUMBER and their PIN. No email, ever.
// The admission number (student_code) is globally unique and stable across
// years, so there's no class or year to pick — just two fields and one action.
// Designed for young users: big tap targets, minimal text. Bilingual + RTL like
// every screen.
//
// Visuals: quest theme — the sprout buddy greets the child at the door, the
// fields sit on a parchment card, and "Go" is a big gold push-button. Same
// i18n keys and logic as before.
//
// On success the auth listener re-routes and this screen unmounts.
import { useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';

import { Text } from '../../components';
import {
  QuestScreen,
  QuestPanel,
  QuestButton,
  QuestField,
  QuestLanguageSwitch,
  Sprite,
  Enter,
} from '../../components/quest';
import { useAuth } from '../../auth/AuthProvider';
import { t } from '../../i18n';
import { quest, px, spacing, displayText } from '../../theme/quest';

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
    <QuestScreen scroll>
      <QuestLanguageSwitch style={styles.language} />

      <Enter style={styles.hero}>
        <Sprite name="sprout" size={72} />
        <Text color={quest.ink} align="center" style={[styles.title, displayText(26)]}>
          {t('auth.student.title')}
        </Text>
        <Text variant="subtitle" color={quest.faint} align="center" style={styles.subtitle}>
          {t('auth.student.subtitle')}
        </Text>
      </Enter>

      {errorKey ? (
        <View style={styles.banner} accessibilityLiveRegion="polite">
          <Text variant="body" color={quest.red} align="center">
            {t(`auth.studentErrors.${errorKey}`)}
          </Text>
        </View>
      ) : null}

      <Enter delay={90}>
        <QuestPanel faceStyle={styles.formFace}>
          <QuestField
            label={t('auth.student.admissionNumber')}
            value={code}
            onChangeText={setCode}
            placeholder={t('auth.student.admissionNumberPlaceholder')}
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!submitting}
          />
          <QuestField
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
          <QuestButton
            variant="gold"
            size="lg"
            label={submitting ? t('auth.student.submitting') : t('auth.student.submit')}
            onPress={onSubmit}
            loading={submitting}
            style={styles.submit}
          />
        </QuestPanel>
      </Enter>

      <View style={styles.staffRow}>
        <Text variant="caption" color={quest.faint} align="center">
          {t('auth.student.staffLink')}
        </Text>
        <Pressable onPress={onStaff} accessibilityRole="button" hitSlop={8}>
          <Text variant="label" color={quest.skyEdge} align="center" style={styles.staffAction}>
            {t('auth.student.staffLinkAction')}
          </Text>
        </Pressable>
      </View>
    </QuestScreen>
  );
}

const styles = StyleSheet.create({
  language: { alignSelf: 'center', marginBottom: spacing.lg },
  hero: { alignItems: 'center', marginBottom: spacing.lg },
  title: { marginTop: spacing.sm },
  subtitle: { marginTop: spacing.xs },
  banner: {
    backgroundColor: quest.redTint,
    borderColor: quest.red,
    borderWidth: px.border,
    borderRadius: px.radius,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  formFace: { padding: spacing.lg },
  submit: { marginTop: spacing.sm },
  staffRow: { marginTop: spacing.xl, alignItems: 'center' },
  staffAction: { marginTop: spacing.xs },
});
