import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useI18n } from '../i18n';
import { Icon, type IconName } from './Icon';
import { IconButton } from './IconButton';
import { ExamMode, MotionOverride } from './MotionProvider';
import { useEnterStyle, useExiting, useMotion, type MotionTier } from './motion';
import { Text } from './Text';
import { useTheme } from './theme';
import { elevation, radius, space, timing, type ColourRoles } from './tokens';

export type ToastTone = 'info' | 'success' | 'warn';
type Entry = { id: number; message: string; tone: ToastTone; inExam: boolean; tier: MotionTier };

const look: Record<ToastTone, { icon: IconName; tone: keyof ColourRoles }> = {
  info: { icon: 'info', tone: 'primary' },
  success: { icon: 'checkCircle', tone: 'correct' },
  warn: { icon: 'warning', tone: 'weak' },
};

const ToastContext = createContext<((e: Omit<Entry, 'id'>) => void) | null>(null);

/**
 * Show a short message: `const toast = useToast(); toast('Saved', 'success')`.
 * One at a time (a new one replaces the old), auto-dismissed after 4 s, announced
 * politely to screen readers. Called from inside an exam, it appears without motion.
 */
export function useToast() {
  const push = useContext(ToastContext);
  // The host sits at the root: carry the caller's tier (staff → lite) and exam rule to it.
  const { inExam, tier } = useMotion();
  if (!push) throw new Error('useToast must be used inside <ToastProvider>');
  return useCallback(
    (message: string, tone: ToastTone = 'info') => push({ message, tone, inExam, tier }),
    [push, inExam, tier],
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [entry, setEntry] = useState<Entry | null>(null);
  const nextId = useRef(1);
  const push = useCallback((e: Omit<Entry, 'id'>) => setEntry({ ...e, id: nextId.current++ }), []);

  useEffect(() => {
    if (!entry) return;
    const timer = setTimeout(() => setEntry(null), timing.toastAutoDismissMs);
    return () => clearTimeout(timer);
  }, [entry]);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <ToastHost entry={entry} onDismiss={() => setEntry(null)} />
    </ToastContext.Provider>
  );
}

function ToastHost({ entry, onDismiss }: { entry: Entry | null; onDismiss: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={[styles.host, { bottom: insets.bottom + space.lg }]}>
      {entry ? (
        <MotionOverride setting={entry.tier}>
          <ExamMode active={entry.inExam}>
            <ToastView key={entry.id} entry={entry} onDismiss={onDismiss} />
          </ExamMode>
        </MotionOverride>
      ) : null}
    </View>
  );
}

function ToastView({ entry, onDismiss }: { entry: Entry; onDismiss: () => void }) {
  const { t, isRTL } = useI18n();
  const { colours, scheme } = useTheme();
  const enter = useEnterStyle('toast', true, { translateY: 16 });
  const exiting = useExiting('toast');
  const l = look[entry.tone];
  return (
    <Animated.View
      exiting={exiting}
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={[
        styles.toast,
        {
          direction: isRTL ? 'rtl' : 'ltr',
          backgroundColor: colours.surface,
          borderColor: scheme === 'dark' ? colours.borderStrong : colours.ink,
          boxShadow: scheme === 'light' ? elevation.overlay.light : undefined,
        },
        enter,
      ]}
    >
      <Icon name={l.icon} tone={l.tone} />
      <Text style={styles.flex}>{entry.message}</Text>
      <IconButton icon="close" label={t('ui.dismiss')} onPress={onDismiss} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', start: space.lg, end: space.lg, alignItems: 'center' },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    width: '100%',
    maxWidth: 480,
    paddingStart: space.lg,
    paddingEnd: space.xs,
    paddingVertical: space.xs,
    borderRadius: radius.lg,
    borderWidth: 2,
  },
  flex: { flex: 1 },
});
