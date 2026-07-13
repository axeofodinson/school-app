// Toast — the themed in-app notification banner.
//
// This is the surface a notification shows on while the app is OPEN: it slides
// down from the top edge and fades in the moment a message arrives — no tap,
// no tray. The bell/inbox stays as the durable history; this is the live alert.
//
// Positioning: everything hangs off useSafeAreaInsets() — there is no
// hardcoded `top`, so notches, punch-holes and status bars of any height are
// respected on every device. Horizontal placement is symmetric (same inset on
// both sides), which makes it direction-neutral: RTL needs no special casing
// at the container level, and the content inside sets its own direction.
//
// Theming: the student app wears the quest (pixel-game) skin; console/teacher
// screens keep the plain palette. Per the quest theme's scope rule, this file
// picks tokens BY ROLE at render time so a console user never sees parchment.
//
// Interaction: auto-dismisses after a few seconds; swipe up to dismiss early
// (PanResponder — vertical only, so it doesn't fight taps); tap to open the
// destination (the inbox) when the dispatcher provided one.
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { PanResponder, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Text from '../components/Text';
import { colors, spacing } from '../theme/colors';
import { quest, px } from '../theme/quest';
import { isRTL, t } from '../i18n';

const SHOW_MS = 320; // entrance
const HIDE_MS = 220; // exit
const AUTO_DISMISS_MS = 4500;
// How far off-screen the card starts/leaves. Generous enough to clear any
// status bar + card height; the exact value never shows on screen.
const OFFSCREEN = 220;
// Swipe-up thresholds: distance OR flick velocity ends the toast.
const SWIPE_DISTANCE = -32;
const SWIPE_VELOCITY = -0.6;

// Token sets for the two surfaces. Same component, same behavior — only the
// skin changes (CLAUDE.md: quest tokens are student-only).
function toastTheme(isStudent) {
  if (isStudent) {
    return {
      edge: quest.outline, // hard bottom edge → reads as a solid game tile
      face: quest.surface,
      outline: quest.outline,
      title: quest.ink,
      body: quest.faint,
      badgeBg: quest.goldTint,
      badgeBorder: quest.goldEdge,
      radius: px.radius,
      border: px.border,
      lift: px.edge,
    };
  }
  return {
    edge: colors.border,
    face: colors.bg,
    outline: colors.border,
    title: colors.text,
    body: colors.muted,
    badgeBg: colors.surface,
    badgeBorder: colors.border,
    radius: 10,
    border: 1,
    lift: 2, // subtle — the console stays flat/officey
  };
}

// One mounted card per toast (keyed by toast.key in the host below), so each
// runs its own enter → wait → exit lifecycle and timers can't leak across.
function ToastCard({ toast, isStudent, onDone }) {
  const insets = useSafeAreaInsets();
  const theme = toastTheme(isStudent);

  // progress drives BOTH slide and fade: 0 = parked above the screen,
  // 1 = resting position. dragY is the finger's live offset on top of that.
  const progress = useSharedValue(0);
  const dragY = useSharedValue(0);
  // A toast can be asked to leave by three things (timer, swipe, tap); this
  // ref makes sure only the first one runs the exit.
  const leaving = useRef(false);
  const timer = useRef(null);

  const finish = useCallback(() => onDone(toast.key), [onDone, toast.key]);

  const dismiss = useCallback(() => {
    if (leaving.current) return;
    leaving.current = true;
    if (timer.current) clearTimeout(timer.current);
    progress.value = withTiming(
      0,
      { duration: HIDE_MS, easing: Easing.in(Easing.cubic) },
      (done) => {
        if (done) runOnJS(finish)();
      }
    );
  }, [progress, finish]);

  // Enter, then schedule the auto-dismiss.
  useEffect(() => {
    progress.value = withTiming(1, {
      duration: SHOW_MS,
      easing: Easing.out(Easing.cubic),
    });
    timer.current = setTimeout(dismiss, AUTO_DISMISS_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [progress, dismiss]);

  const onPress = useCallback(() => {
    if (leaving.current) return;
    toast.onPress?.();
    dismiss();
  }, [toast, dismiss]);

  // Vertical-only pan: claims the gesture only once the finger has clearly
  // moved up/down, so plain taps still reach the Pressable underneath.
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_evt, g) =>
          Math.abs(g.dy) > 8 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderMove: (_evt, g) => {
          // Free upward; heavy resistance downward (it lives at the top edge).
          dragY.value = g.dy < 0 ? g.dy : g.dy / 8;
        },
        onPanResponderRelease: (_evt, g) => {
          if (g.dy < SWIPE_DISTANCE || g.vy < SWIPE_VELOCITY) {
            dismiss();
          } else {
            dragY.value = withSpring(0, { damping: 18, stiffness: 220 });
          }
        },
        onPanResponderTerminate: () => {
          dragY.value = withSpring(0, { damping: 18, stiffness: 220 });
        },
      }),
    [dragY, dismiss]
  );

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      {
        translateY:
          interpolate(progress.value, [0, 1], [-OFFSCREEN, 0]) + dragY.value,
      },
    ],
  }));

  return (
    <Animated.View
      {...pan.panHandlers}
      style={[
        styles.wrap,
        {
          // Safe-area driven — never a hardcoded top. spacing.sm of breathing
          // room under the status bar / notch, and the side insets cover
          // landscape notches.
          top: insets.top + spacing.sm,
          left: Math.max(insets.left, spacing.md),
          right: Math.max(insets.right, spacing.md),
        },
        animatedStyle,
      ]}
      // Screen readers announce the arrival without stealing focus.
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
    >
      {/* Edge underlay + face: the QuestPanel two-View construction (flat
          colour, no shadows) so it matches the student tiles exactly and is
          free on low-end Android. */}
      <View style={{ backgroundColor: theme.edge, borderRadius: theme.radius + 1 }}>
        <Pressable
          onPress={onPress}
          accessibilityHint={t('common.toast.hint')}
          style={[
            styles.face,
            {
              backgroundColor: theme.face,
              borderColor: theme.outline,
              borderWidth: theme.border,
              borderRadius: theme.radius,
              marginBottom: theme.lift,
              direction: isRTL ? 'rtl' : 'ltr',
            },
          ]}
        >
          <View
            style={[
              styles.badge,
              { backgroundColor: theme.badgeBg, borderColor: theme.badgeBorder },
            ]}
          >
            <Text style={styles.badgeIcon} accessible={false}>
              {toast.icon ?? '🔔'}
            </Text>
          </View>
          <View style={styles.copy}>
            <Text variant="label" color={theme.title} numberOfLines={1}>
              {toast.title}
            </Text>
            {toast.body ? (
              <Text variant="caption" color={theme.body} numberOfLines={2}>
                {toast.body}
              </Text>
            ) : null}
          </View>
        </Pressable>
      </View>
    </Animated.View>
  );
}

// Host — absolutely positioned layer the provider mounts once, above the app.
// box-none so the rest of the screen stays fully interactive around the card.
export default function ToastHost({ toast, isStudent, onDone }) {
  if (!toast) return null;
  return (
    <View style={styles.layer} pointerEvents="box-none">
      <ToastCard
        key={toast.key}
        toast={toast}
        isStudent={isStudent}
        onDone={onDone}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    elevation: 1000, // Android stacking
  },
  wrap: {
    position: 'absolute',
  },
  face: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + spacing.xs,
    paddingVertical: spacing.sm + spacing.xs,
    paddingHorizontal: spacing.md,
  },
  badge: {
    width: 40,
    height: 40,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeIcon: { fontSize: 20 },
  copy: { flex: 1 },
});
