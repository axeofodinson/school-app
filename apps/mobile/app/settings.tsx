import type { MotionSetting } from '@school/core/design';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '../features/auth/AuthProvider';
import { useI18n } from '../i18n';
import {
  Button,
  Card,
  LanguageToggle,
  Screen,
  SegmentedControl,
  Text,
  useMotion,
  useSoundSetting,
} from '../ui';

// Settings for any signed-in user: language and motion (full / lite / off / auto,
// DECISIONS #47 needs a way to stop motion). Admins also see the per-device
// shared mode toggle (LMS_AUDIT §3.4).
export default function Settings() {
  const { t } = useI18n();
  const router = useRouter();
  const { setting, setSetting } = useMotion();
  const sound = useSoundSetting();
  const { destination, sharedMode, setSharedMode, signOut } = useAuth();
  const [saving, setSaving] = useState(false);
  const isAdmin = destination === 'admin';

  const motionSegments: { value: MotionSetting; label: string }[] = [
    { value: 'auto', label: t('auth.settings.motionAuto') },
    { value: 'full', label: t('auth.settings.motionFull') },
    { value: 'lite', label: t('auth.settings.motionLite') },
    { value: 'off', label: t('auth.settings.motionOff') },
  ];

  const changeShared = async (v: 'shared' | 'personal') => {
    setSaving(true);
    await setSharedMode(v === 'shared').catch(() => undefined);
    setSaving(false);
  };

  return (
    <Screen>
      <Button
        title={t('auth.settings.back')}
        icon="back"
        variant="ghost"
        size="sm"
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        style={styles.back}
      />
      <Text variant="title" accessibilityRole="header">
        {t('auth.settings.title')}
      </Text>
      <Card>
        <View style={styles.section}>
          <Text variant="label">{t('common.language')}</Text>
          <LanguageToggle />
        </View>
      </Card>
      <Card>
        <View style={styles.section}>
          <Text variant="label">{t('auth.settings.motion')}</Text>
          <SegmentedControl
            segments={motionSegments}
            value={setting}
            onChange={setSetting}
            accessibilityLabel={t('auth.settings.motion')}
          />
          <Text variant="bodySm" tone="textMuted">
            {t('auth.settings.motionHelp')}
          </Text>
        </View>
      </Card>
      <Card>
        <View style={styles.section}>
          <Text variant="label">{t('auth.settings.sound')}</Text>
          <SegmentedControl
            segments={[
              { value: 'on', label: t('auth.settings.soundOn') },
              { value: 'off', label: t('auth.settings.soundOff') },
            ]}
            value={sound.enabled ? 'on' : 'off'}
            onChange={(v) => sound.setEnabled(v === 'on')}
            accessibilityLabel={t('auth.settings.sound')}
          />
          <Text variant="bodySm" tone="textMuted">
            {t('auth.settings.soundHelp')}
          </Text>
        </View>
      </Card>
      <Card>
        <View style={styles.section}>
          <Text variant="label">{t('auth.settings.deviceTitle')}</Text>
          <Text>{t('auth.settings.sharedTitle')}</Text>
          {isAdmin ? (
            <SegmentedControl
              segments={[
                { value: 'personal', label: t('auth.settings.sharedOff') },
                { value: 'shared', label: t('auth.settings.sharedOn') },
              ]}
              value={sharedMode ? 'shared' : 'personal'}
              onChange={saving ? () => undefined : changeShared}
              accessibilityLabel={t('auth.settings.sharedTitle')}
            />
          ) : (
            <Text variant="bodySm" tone="textMuted">
              {(sharedMode ? t('auth.settings.sharedOn') : t('auth.settings.sharedOff')) +
                ' · ' +
                t('auth.settings.adminOnly')}
            </Text>
          )}
          <Text variant="bodySm" tone="textMuted">
            {t('auth.settings.sharedBody')}
          </Text>
        </View>
      </Card>
      <Button title={t('auth.signOut')} variant="secondary" onPress={() => signOut()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { alignSelf: 'flex-start' },
  section: { gap: 12 },
});
