// BatteryOptimizationPrompt — a one-time nudge, shown only on Android OEMs that
// kill backgrounded apps (Xiaomi/Oppo/Vivo/Huawei and their sub-brands), telling
// the student how to keep notifications flowing by exempting the app from
// battery optimization, with a button that jumps straight to the right Settings
// screen.
//
// Shows at most once per install: a flag in AsyncStorage is set the moment it's
// dismissed OR the user opens Settings, so it never nags again. Renders nothing
// on iOS, on non-aggressive brands, or once already seen — so it's safe to mount
// unconditionally on the student home.
import { useEffect, useState } from 'react';
import { Modal, View, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { Text } from '../components';
import { QuestPanel, QuestButton, Sprite } from '../components/quest';
import { t } from '../i18n';
import { quest, spacing, displayText } from '../theme/quest';
import {
  needsBatteryOptimizationHelp,
  openBatterySettings,
} from './batteryOptimization';

const SEEN_KEY = 'batteryOptimizationPrompt.seen';

export default function BatteryOptimizationPrompt() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!needsBatteryOptimizationHelp()) return;
      let seen = null;
      try {
        seen = await AsyncStorage.getItem(SEEN_KEY);
      } catch {
        // If we can't read the flag, err on the side of not nagging.
        seen = 'unknown';
      }
      if (active && !seen) setVisible(true);
    })();
    return () => {
      active = false;
    };
  }, []);

  // Mark seen so the prompt never shows again, then run an optional follow-up
  // (open Settings). Closing the modal first keeps the UI responsive.
  const dismiss = async (after) => {
    setVisible(false);
    try {
      await AsyncStorage.setItem(SEEN_KEY, '1');
    } catch {
      // Non-fatal; worst case it shows once more next launch.
    }
    if (after) await after();
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => dismiss()}
    >
      <View style={styles.backdrop}>
        <QuestPanel style={styles.card} faceStyle={styles.cardFace}>
          <Sprite name="bolt" size={56} />
          <Text color={quest.ink} align="center" style={[styles.title, displayText(20)]}>
            {t('student.battery.title')}
          </Text>
          <Text variant="body" color={quest.faint} align="center" style={styles.body}>
            {t('student.battery.body')}
          </Text>
          <QuestButton
            label={t('student.battery.openSettings')}
            onPress={() => dismiss(openBatterySettings)}
            variant="gold"
            style={styles.action}
          />
          <QuestButton
            label={t('student.battery.later')}
            onPress={() => dismiss()}
            variant="ghost"
            size="sm"
            style={styles.action}
          />
        </QuestPanel>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: { alignSelf: 'stretch' },
  cardFace: { alignItems: 'center', padding: spacing.lg },
  title: { marginTop: spacing.md },
  body: { marginTop: spacing.sm },
  action: { marginTop: spacing.md, alignSelf: 'stretch' },
});
