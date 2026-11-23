// Motion for the app (DESIGN_SYSTEM.md §6, ARCHITECTURE.md §6b, CLAUDE.md Motion rules).
// Tokens and the per-moment table are pure data in @school/core (tested there);
// this file turns a resolved Behaviour into Reanimated 4 calls. Components never
// call withTiming/withSpring with their own numbers: they name a moment.
//
// Rules enforced here: transform + opacity only; lite = fades; off = instant;
// exam mode = nothing but the timer and save indicator; horizontal slides mirror in RTL.
import { createContext, useContext, useEffect, useMemo } from 'react';
import {
  cancelAnimation,
  Easing,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useI18n } from '../i18n';
import { useTheme } from './theme';
import {
  behaviourProps,
  duration,
  easing,
  mirrorX,
  opacityLevels,
  pickMotionTier,
  resolveMoment,
  spring,
  type Behaviour,
  type MomentName,
  type MotionSetting,
  type MotionTier,
} from './tokens';

export {
  duration,
  easing,
  examAllowedMoments,
  moments,
  motionSettings,
  opacityLevels,
  pickMotionTier,
  resolveMoment,
  spring,
  stickerPressDepth,
  timing,
  type Behaviour,
  type MomentName,
  type MotionSetting,
  type MotionTier,
} from './tokens';

export const easings = {
  out: Easing.bezier(...easing.out),
  inOut: Easing.bezier(...easing.inOut),
  linear: Easing.linear,
} as const;

/** The Reanimated animation (or plain value, for `none`) that moves a value to `to`. */
export function animateTo(b: Behaviour, to: number) {
  switch (b.kind) {
    case 'timing':
      return withTiming(to, { duration: duration[b.duration], easing: easings[b.ease] });
    case 'spring':
      return withSpring(to, spring[b.spring]);
    case 'lottie':
      // The bundled burst (DECISIONS #37) is not in the app yet; settle gently meanwhile.
      return withSpring(to, spring.gentle);
    default:
      return to;
  }
}

// ───────────────────────────── tier context ─────────────────────────────

export interface MotionInputs {
  osReduceMotion: boolean;
  memoryGb: number | undefined;
  /** The user's saved Settings choice. */
  setting: MotionSetting;
  setSetting: (s: MotionSetting) => void;
  /** A subtree override (gallery, previews). OS reduce-motion still wins. */
  override?: MotionSetting;
  inExam: boolean;
}

export const MotionContext = createContext<MotionInputs | null>(null);

export interface Motion {
  tier: MotionTier;
  inExam: boolean;
  osReduceMotion: boolean;
  memoryGb: number | undefined;
  setting: MotionSetting;
  setSetting: (s: MotionSetting) => void;
}

/**
 * The tier for this part of the tree. Staff presentation defaults to lite, so the tier
 * is computed against the nearest ThemeProvider's presentation.
 */
export function useMotion(): Motion {
  const ctx = useContext(MotionContext);
  if (!ctx) throw new Error('useMotion must be used inside <MotionProvider>');
  const { presentation } = useTheme();
  return useMemo(() => {
    const tier = pickMotionTier({
      osReduceMotion: ctx.osReduceMotion,
      userChoice: ctx.override ?? ctx.setting,
      deviceMemoryGb: ctx.memoryGb,
      // TODO(62): feed a frame-drop sampler here (isLowEndGpuOrDroppingFrames).
      surface: presentation === 'staff' ? 'staff' : 'student',
    });
    return {
      tier,
      inExam: ctx.inExam,
      osReduceMotion: ctx.osReduceMotion,
      memoryGb: ctx.memoryGb,
      setting: ctx.setting,
      setSetting: ctx.setSetting,
    };
  }, [ctx, presentation]);
}

/** What a moment does right now (tier + exam mode applied). */
export function useMoment(name: MomentName): Behaviour {
  const { tier, inExam } = useMotion();
  return resolveMoment(name, tier, { inExam });
}

// ───────────────────────────── hooks components use ─────────────────────────────

export type EnterShape = {
  /** Start offset in px; mirrored in RTL. */
  translateX?: number;
  translateY?: number;
  /** Start scale (never 0: 0.6–0.97). */
  scaleFrom?: number;
};

/**
 * Show/hide (or enter on mount) a view through a named moment. Only the props the
 * resolved behaviour lists move, so lite automatically drops movement and keeps the
 * fade, and off (or exam mode) snaps to the end state.
 */
export function useEnterStyle(name: MomentName, visible = true, shape: EnterShape = {}) {
  const b = useMoment(name);
  const { isRTL } = useI18n();
  const target = visible ? 1 : 0;
  const progress = useSharedValue(b.kind === 'none' ? target : 0);
  const props = behaviourProps(b);
  const fades = props.includes('opacity');
  const dx = props.includes('translateX') ? mirrorX(shape.translateX ?? 0, isRTL) : 0;
  const dy = props.includes('translateY') ? (shape.translateY ?? 0) : 0;
  const s0 = props.includes('scale') ? (shape.scaleFrom ?? 1) : 1;

  useEffect(() => {
    progress.set(animateTo(b, target));
    // b is a table constant (or `none`); its kind + the moment name identify it.
  }, [target, b.kind, name, progress]); // eslint-disable-line react-hooks/exhaustive-deps

  return useAnimatedStyle(() => {
    const p = progress.get();
    const shown = Math.min(1, Math.max(0, p));
    return {
      opacity: fades ? shown : p > 0.001 ? 1 : 0,
      transform: [
        { translateX: (1 - p) * dx },
        { translateY: (1 - p) * dy },
        { scale: s0 + (1 - s0) * p },
      ],
    };
  });
}

/**
 * Press feedback (`press` moment): full = the sticker sinks `depth` px into its shadow;
 * lite = opacity 0.85; off = no movement (callers still change colour on press).
 */
export function usePressMotion(depth: number) {
  const b = useMoment('press');
  const pressed = useSharedValue(0);
  const props = behaviourProps(b);
  const sinks = props.includes('translateY');
  const fades = props.includes('opacity');
  const style = useAnimatedStyle(() => ({
    opacity: fades ? 1 - (1 - opacityLevels.pressed) * pressed.get() : 1,
    transform: [{ translateY: sinks ? depth * pressed.get() : 0 }],
  }));
  return {
    style,
    onPressIn: () => pressed.set(animateTo(b, 1)),
    onPressOut: () => pressed.set(animateTo(b, 0)),
  };
}

/**
 * A slow opacity pulse (`skeleton`, `syncSyncing`): full tier only, transform-free,
 * and stops by itself after `maxMs` (the sync pulse stops after 10 s, §6.1).
 */
export function usePulse(name: 'skeleton' | 'syncSyncing', active: boolean, maxMs?: number) {
  const b = useMoment(name);
  const pulseKey = b.kind === 'timing' ? `${b.duration}:${b.ease}` : b.kind;
  const opacity = useSharedValue(1);
  useEffect(() => {
    if (!active || b.kind !== 'timing') {
      cancelAnimation(opacity);
      opacity.set(1);
      return;
    }
    const step = duration[b.duration];
    // An even repeat count with reverse ends where it started (opacity 1).
    const reps = maxMs ? Math.max(2, Math.floor(maxMs / step / 2) * 2) : -1;
    opacity.set(
      withRepeat(
        withTiming(opacityLevels.pulseLow, { duration: step, easing: easings[b.ease] }),
        reps,
        true,
      ),
    );
    return () => cancelAnimation(opacity);
    // In exam mode resolveMoment returns a fresh `none` object each render: key on its content.
  }, [active, pulseKey, maxMs, opacity]); // eslint-disable-line react-hooks/exhaustive-deps
  return useAnimatedStyle(() => ({ opacity: opacity.get() }));
}

/** Exit animation for a view leaving the tree: a short fade, or nothing when the moment is `none`. */
export function useExiting(name: MomentName) {
  const b = useMoment(name);
  if (b.kind === 'none') return undefined;
  return FadeOut.duration(b.kind === 'timing' ? duration[b.duration] : duration.fast);
}
