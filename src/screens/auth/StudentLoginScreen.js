// Student sign-in — the school-issued flow, kept separate from staff email/
// password. A child picks their CLASS, types their ROLL NUMBER, and enters
// their PIN. No email, ever. Designed for young users: big tap targets, minimal
// text, one action. Bilingual + RTL like every screen.
//
// The class list comes from the login_classes RPC (data-driven, not hardcoded)
// and is readable before sign-in. On success the auth listener re-routes and
// this screen unmounts.
import { useCallback, useEffect, useState } from 'react';
import { View, Pressable, ActivityIndicator, StyleSheet } from 'react-native';

import { ScreenContainer, Text, Button, TextField, LanguageSwitch } from '../../components';
import { useAuth } from '../../auth/AuthProvider';
import { supabase } from '../../lib/supabase';
import { t } from '../../i18n';
import { colors, spacing } from '../../theme/colors';

export default function StudentLoginScreen({ onStaff }) {
  const { studentSignIn } = useAuth();

  const [classes, setClasses] = useState([]);
  const [classStatus, setClassStatus] = useState('loading'); // loading | ready | error
  const [classId, setClassId] = useState(null);
  const [roll, setRoll] = useState('');
  const [pin, setPin] = useState('');
  const [errorKey, setErrorKey] = useState(null); // key under `auth.studentErrors`
  const [submitting, setSubmitting] = useState(false);

  const loadClasses = useCallback(async () => {
    setClassStatus('loading');
    const { data, error } = await supabase.rpc('login_classes');
    if (error) {
      setClassStatus('error');
      return;
    }
    setClasses(data ?? []);
    setClassStatus('ready');
  }, []);

  useEffect(() => {
    loadClasses();
  }, [loadClasses]);

  const onSubmit = async () => {
    setErrorKey(null);
    if (!classId) return setErrorKey('missingClass');
    const rollNumber = parseInt(roll.trim(), 10);
    if (!roll.trim() || Number.isNaN(rollNumber)) return setErrorKey('missingRoll');
    if (!pin.trim()) return setErrorKey('missingPin');

    setSubmitting(true);
    const err = await studentSignIn(classId, rollNumber, pin.trim());
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

      <Text variant="label" style={styles.fieldLabel}>{t('auth.student.pickClass')}</Text>
      {classStatus === 'loading' ? (
        <View style={styles.classesState}>
          <ActivityIndicator color={colors.primary} />
          <Text variant="caption" color={colors.muted} align="center" style={styles.stateText}>
            {t('auth.student.loadingClasses')}
          </Text>
        </View>
      ) : classStatus === 'error' ? (
        <Pressable onPress={loadClasses} style={styles.classesState} accessibilityRole="button">
          <Text variant="body" color={colors.danger} align="center">
            {t('auth.student.classesError')}
          </Text>
        </Pressable>
      ) : classes.length === 0 ? (
        <View style={styles.classesState}>
          <Text variant="body" color={colors.muted} align="center">
            {t('auth.student.noClasses')}
          </Text>
        </View>
      ) : (
        <View style={styles.classGrid}>
          {classes.map((c) => {
            const active = classId === c.id;
            return (
              <Pressable
                key={c.id}
                onPress={() => setClassId(c.id)}
                disabled={submitting}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                style={[styles.classChip, active && styles.classChipActive]}
              >
                <Text
                  variant="label"
                  align="center"
                  color={active ? colors.primaryText : colors.primary}
                >
                  {c.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <TextField
        label={t('auth.student.rollNumber')}
        value={roll}
        onChangeText={setRoll}
        placeholder={t('auth.student.rollNumberPlaceholder')}
        keyboardType="number-pad"
        editable={!submitting}
        style={styles.field}
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
  fieldLabel: { marginBottom: spacing.sm },
  classesState: {
    minHeight: 56,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  stateText: { marginTop: spacing.sm },
  classGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: spacing.lg,
  },
  classChip: {
    minHeight: 52,
    minWidth: 88,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginEnd: spacing.sm,
    marginBottom: spacing.sm,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.bg,
    justifyContent: 'center',
  },
  classChipActive: { backgroundColor: colors.primary },
  field: { marginTop: spacing.xs },
  submit: { marginTop: spacing.sm, minHeight: 56 },
  staffRow: { marginTop: spacing.xl, alignItems: 'center' },
  staffAction: { marginTop: spacing.xs },
});
