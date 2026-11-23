import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useI18n } from '../i18n';
import { Icon, type IconName } from './Icon';
import { useEnterStyle, usePulse } from './motion';
import { useFocusRing } from './Sticker';
import { Text } from './Text';
import { useTheme } from './theme';
import { opacityLevels, radius, space, timing, type ColourRoles } from './tokens';

export type SyncStatus = 'idle' | 'syncing' | 'saved' | 'offline' | 'error';

const look: Record<SyncStatus, { icon: IconName; bg: keyof ColourRoles; fg: keyof ColourRoles }> = {
  idle: { icon: 'cloud', bg: 'surfaceAlt', fg: 'textMuted' },
  syncing: { icon: 'syncing', bg: 'learningSoft', fg: 'onLearningSoft' },
  saved: { icon: 'check', bg: 'correctSoft', fg: 'onCorrectSoft' },
  offline: { icon: 'cloudOff', bg: 'accentSoft', fg: 'onAccentSoft' },
  error: { icon: 'warning', bg: 'wrongSoft', fg: 'onWrongSoft' },
};

/**
 * Where the student's work is (CLAUDE.md: show sync status). Driven by the sync queue
 * (packages/core, prompt 61). `saved` rests to `idle` after 2 s; the syncing icon pulses
 * (full tier only) and stops after 10 s. Icon + word, never colour alone.
 */
export function SyncStatusPill({
  status,
  pending = 0,
  onRetry,
}: {
  status: SyncStatus;
  /** Writes still queued on this device. */
  pending?: number;
  onRetry?: () => void;
}) {
  const { t } = useI18n();
  const { colours } = useTheme();
  // `saved` rests to `idle` after 2 s; a new status starts a fresh episode.
  const [prev, setPrev] = useState(status);
  const [rested, setRested] = useState(false);
  if (status !== prev) {
    setPrev(status);
    setRested(false);
  }
  useEffect(() => {
    if (status !== 'saved') return;
    const timer = setTimeout(() => setRested(true), timing.syncSavedRestMs);
    return () => clearTimeout(timer);
  }, [status]);
  const shown: SyncStatus = status === 'saved' && rested ? 'idle' : status;

  const l = look[shown];
  const pulse = usePulse('syncSyncing', shown === 'syncing', timing.syncPulseMaxMs);
  const label = t(`ui.sync.${shown}`);
  const full =
    pending > 0 && shown !== 'saved' && shown !== 'idle'
      ? `${label} · ${t('ui.sync.pending', { count: pending })}`
      : label;
  const retry = shown === 'error' && onRetry;
  const { focusProps, ring } = useFocusRing();

  const body = (
    <View style={[styles.pill, { backgroundColor: colours[l.bg] }]}>
      <Animated.View style={pulse}>
        <Icon name={l.icon} size={16} tone={l.fg} />
      </Animated.View>
      <SyncLabel key={shown} text={full} tone={l.fg} />
    </View>
  );
  return retry ? (
    <Pressable
      {...focusProps}
      onPress={onRetry}
      accessibilityRole="button"
      accessibilityLabel={full}
      accessibilityLiveRegion="polite"
      style={({ pressed }) => [styles.retry, pressed && styles.pressed, ring]}
    >
      {body}
    </Pressable>
  ) : (
    <View accessible accessibilityLabel={full} accessibilityLiveRegion="polite">
      {body}
    </View>
  );
}

function SyncLabel({ text, tone }: { text: string; tone: keyof ColourRoles }) {
  const fade = useEnterStyle('syncDone', true);
  return (
    <Animated.View style={fade}>
      <Text variant="bodySm" tone={tone} numberOfLines={1}>
        {text}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  retry: { alignSelf: 'flex-start', borderRadius: radius.full },
  pressed: { opacity: opacityLevels.pressed },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: space.xxs,
    borderRadius: radius.full,
  },
});
