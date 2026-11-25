/**
 * Motion tokens and the per-moment choreography table (DESIGN_SYSTEM.md §6,
 * ARCHITECTURE.md §6b). Pure: the app turns a Behaviour into Reanimated calls in
 * apps/mobile/ui/motion.ts; tests live in packages/core/test/design-motion.test.ts.
 */

export type MotionTier = 'full' | 'lite' | 'off';

/** ARCHITECTURE §6b durations. */
export const duration = {
  instant: 0,
  fast: 120,
  base: 220,
  slow: 360,
  /** Lite-tier pattern glide (DECISIONS #47). */
  glide: 2000,
  /** Full-tier pattern loop: one tile of drift per cycle, linear, seamless. */
  drift: 8000,
  /** One step of the tile shape morph (hold + morph), DECISIONS #126. */
  morph: 2600,
} as const;

/**
 * Spring presets in the classic damping/stiffness/mass form, which Reanimated 4 still accepts.
 * (Reanimated 4's duration/dampingRatio form may replace these in session 02 if the SDK ships v4.)
 */
export const spring = {
  gentle: { damping: 22, stiffness: 170, mass: 1 }, // settle, no overshoot
  snappy: { damping: 18, stiffness: 320, mass: 0.9 }, // small overshoot, quick
  bouncy: { damping: 11, stiffness: 260, mass: 0.9 }, // visible bounce: celebration, kid band only
} as const;

/** Non-animation timings from DESIGN_SYSTEM.md §6.1 (how long things stay, not how they move). */
export const timing = {
  toastAutoDismissMs: 4000,
  syncSavedRestMs: 2000,
  syncPulseMaxMs: 10_000,
} as const;

/**
 * Choreography (UI remake, DECISIONS #94): siblings entering together cascade by
 * `stepMs` each, capped at `maxSteps` so a long list never waits. Off = no delay
 * (nothing moves). A celebration burst never runs longer than `burstMs`.
 */
export const choreography = { stepMs: 45, maxSteps: 8, burstMs: 1400 } as const;

/** Stagger delay for the i-th sibling (0-based); 0 when the tier is off. */
export function staggerDelay(index: number, tier: MotionTier): number {
  if (tier === 'off' || index <= 0) return 0;
  return Math.min(index, choreography.maxSteps) * choreography.stepMs;
}

/** Opacity levels used by press feedback, pulses and disabled controls. */
export const opacityLevels = { pressed: 0.85, pulseLow: 0.45, disabled: 0.45 } as const;

/** Easing curves as cubic-bezier control points; build with Easing.bezier(...) in the app. */
export const easing = {
  out: [0.23, 1, 0.32, 1],
  inOut: [0.77, 0, 0.175, 1],
  linear: [0, 0, 1, 1],
} as const;

export type SpringName = keyof typeof spring;
export type DurationName = keyof typeof duration;
export type AnimProp = 'opacity' | 'translateX' | 'translateY' | 'scale' | 'rotate';

/** What one tier does for one moment. `none` = state changes instantly (colour/icon still change). */
export type Behaviour =
  | { kind: 'none' }
  | {
      kind: 'timing';
      duration: DurationName;
      ease: keyof typeof easing;
      props: AnimProp[];
      /** 'loop' repeats forever from the start (seamless only for periodic content). */
      repeat?: 'loop';
    }
  | { kind: 'spring'; spring: SpringName; props: AnimProp[] }
  | { kind: 'lottie'; asset: string; maxMs: number };

export type Moment = {
  purpose: 'feedback' | 'state' | 'hierarchy' | 'progress' | 'sync' | 'explanation' | 'delight';
  frequency: 'often' | 'occasional' | 'rare';
  haptic?: 'selection' | 'light' | 'success' | 'none';
  /** Whether the moment runs inside an exam. Only the two exam moments do. */
  examSafe?: boolean;
  /** Slide moments mirror under RTL (translateX sign flips). */
  rtlFlip?: boolean;
  full: Behaviour;
  lite: Behaviour;
  off: Behaviour;
};

const none: Behaviour = { kind: 'none' };
const fade = (d: DurationName): Behaviour => ({
  kind: 'timing',
  duration: d,
  ease: 'out',
  props: ['opacity'],
});

/**
 * Every motion moment in the app. If a moment is not in this table it does not animate.
 * Table with rationale: DESIGN_SYSTEM.md §6.
 */
export const moments = {
  // Navigation: native stack does the work; we only choose fade vs platform slide.
  screenPush: {
    purpose: 'hierarchy',
    frequency: 'often',
    rtlFlip: true,
    full: { kind: 'timing', duration: 'slow', ease: 'inOut', props: ['translateX', 'opacity'] },
    lite: fade('fast'),
    off: none,
  },
  tabSwitch: { purpose: 'hierarchy', frequency: 'often', full: none, lite: none, off: none }, // tabs are peers: never slide
  sheetPresent: {
    purpose: 'hierarchy',
    frequency: 'occasional',
    full: { kind: 'spring', spring: 'gentle', props: ['translateY', 'opacity'] },
    lite: fade('fast'),
    off: none,
  },
  press: {
    purpose: 'feedback',
    frequency: 'often',
    haptic: 'none',
    full: { kind: 'timing', duration: 'fast', ease: 'out', props: ['translateY'] },
    lite: fade('fast'),
    off: none,
  }, // sticker sinks into its shadow (stickerPressDepth)
  selectionChange: {
    purpose: 'state',
    frequency: 'often',
    haptic: 'selection',
    full: fade('fast'),
    lite: fade('fast'),
    off: none,
  },

  // Screen choreography (DECISIONS #94): cards, rows and tiles rise into place in a short
  // cascade (choreography.stepMs) so the eye reads the screen top to bottom. Never in exams.
  listEnter: {
    purpose: 'hierarchy',
    frequency: 'often',
    full: { kind: 'spring', spring: 'gentle', props: ['translateY', 'opacity'] },
    lite: fade('fast'),
    off: none,
  },
  // A score or count that matters lands with a small pop (results, test banner).
  scoreReveal: {
    purpose: 'progress',
    frequency: 'occasional',
    haptic: 'light',
    full: { kind: 'spring', spring: 'snappy', props: ['scale', 'opacity'] },
    lite: fade('base'),
    off: none,
  },

  // A child's tap on a picture tile: the tile bounces and a few mosaic chips fly out, so a
  // pre-reader knows the tap counted (no right/wrong is shown: rule 9). Kid band only.
  kidPick: {
    purpose: 'feedback',
    frequency: 'often',
    haptic: 'selection',
    full: {
      kind: 'spring',
      spring: 'bouncy',
      props: ['scale', 'opacity', 'translateX', 'translateY', 'rotate'],
    },
    lite: fade('fast'),
    off: none,
  },

  // Answer feedback (practice, diagnostic, follow-up). Not used in exams.
  answerCorrect: {
    purpose: 'feedback',
    frequency: 'often',
    haptic: 'success',
    full: { kind: 'spring', spring: 'snappy', props: ['scale', 'opacity'] },
    lite: fade('fast'),
    off: none,
  },
  answerWrong: {
    purpose: 'feedback',
    frequency: 'often',
    haptic: 'light',
    full: fade('base'),
    lite: fade('fast'),
    off: none,
  }, // no shake: wrong is information, not a penalty
  whyWrongReveal: {
    purpose: 'explanation',
    frequency: 'often',
    full: { kind: 'spring', spring: 'gentle', props: ['translateY', 'opacity'] },
    lite: fade('base'),
    off: none,
  },

  // Progress
  mosaicTileSet: {
    purpose: 'progress',
    frequency: 'occasional',
    haptic: 'light',
    full: { kind: 'spring', spring: 'snappy', props: ['scale', 'opacity'] },
    lite: fade('base'),
    off: none,
  }, // a mastered concept's tile drops into the subject mosaic
  masteryBandUp: {
    purpose: 'progress',
    frequency: 'rare',
    haptic: 'light',
    full: { kind: 'spring', spring: 'snappy', props: ['scale'] },
    lite: fade('base'),
    off: none,
  },
  progressBar: {
    purpose: 'progress',
    frequency: 'often',
    full: { kind: 'timing', duration: 'base', ease: 'out', props: ['translateX'] },
    lite: fade('fast'),
    off: none,
  }, // fill slides inside an overflow-hidden track
  followUpCleared: {
    purpose: 'progress',
    frequency: 'occasional',
    haptic: 'success',
    full: { kind: 'spring', spring: 'snappy', props: ['scale', 'opacity', 'translateX'] },
    lite: fade('base'),
    off: none,
  },
  gateUnlocked: {
    purpose: 'progress',
    frequency: 'rare',
    haptic: 'success',
    full: { kind: 'spring', spring: 'gentle', props: ['scale', 'opacity'] },
    lite: fade('base'),
    off: none,
  },

  // System state
  syncSyncing: {
    purpose: 'sync',
    frequency: 'often',
    full: { kind: 'timing', duration: 'slow', ease: 'linear', props: ['opacity'] },
    lite: none,
    off: none,
  }, // slow pulse, max 10 s, only while syncing
  syncDone: {
    purpose: 'sync',
    frequency: 'often',
    full: fade('fast'),
    lite: fade('fast'),
    off: none,
  },
  bannerEnter: {
    purpose: 'sync',
    frequency: 'occasional',
    rtlFlip: false,
    full: { kind: 'spring', spring: 'gentle', props: ['translateY', 'opacity'] },
    lite: fade('fast'),
    off: none,
  },
  toast: {
    purpose: 'feedback',
    frequency: 'occasional',
    full: { kind: 'spring', spring: 'gentle', props: ['translateY', 'opacity'] },
    lite: fade('fast'),
    off: none,
  },
  emptyState: {
    purpose: 'state',
    frequency: 'occasional',
    full: { kind: 'timing', duration: 'base', ease: 'out', props: ['translateY', 'opacity'] },
    lite: fade('base'),
    off: none,
  },
  skeleton: {
    purpose: 'state',
    frequency: 'often',
    full: { kind: 'timing', duration: 'slow', ease: 'linear', props: ['opacity'] },
    lite: none,
    off: none,
  },

  // Lesson visuals (content motion, §7b.4). Layers move by transform + opacity only; never in exams.
  sceneStep: {
    purpose: 'explanation',
    frequency: 'often',
    full: {
      kind: 'timing',
      duration: 'slow',
      ease: 'inOut',
      props: ['translateX', 'translateY', 'scale', 'rotate', 'opacity'],
    },
    lite: fade('fast'),
    off: none,
  }, // author may set ms ≤ visualBudget.stepMaxMs
  chartReveal: {
    purpose: 'explanation',
    frequency: 'occasional',
    full: { kind: 'timing', duration: 'slow', ease: 'out', props: ['scale', 'opacity'] },
    lite: fade('base'),
    off: none,
  },
  hotspotReveal: {
    purpose: 'explanation',
    frequency: 'often',
    full: { kind: 'spring', spring: 'snappy', props: ['scale', 'opacity'] },
    lite: fade('fast'),
    off: none,
  },
  predictReveal: {
    purpose: 'feedback',
    frequency: 'occasional',
    full: fade('base'),
    lite: fade('fast'),
    off: none,
  },

  // Delight (rare tier only)
  celebrationMastery: {
    purpose: 'delight',
    frequency: 'rare',
    haptic: 'success',
    full: { kind: 'lottie', asset: 'celebrate-burst', maxMs: 1500 },
    lite: { kind: 'spring', spring: 'gentle', props: ['scale', 'opacity'] },
    off: none,
  },
  celebrationKid: {
    purpose: 'delight',
    frequency: 'rare',
    haptic: 'success',
    full: { kind: 'spring', spring: 'bouncy', props: ['scale', 'opacity'] },
    lite: fade('base'),
    off: none,
  },

  // Subject tile patterns (DECISIONS #47, Hassan 2026-11-24): the one approved looping
  // decoration. Full: slow diagonal drift that loops. Lite: one ~2 s glide when the screen
  // opens, a card is pressed or a tile is set. Off and exams: still (exams show no pattern).
  patternDrift: {
    purpose: 'delight',
    frequency: 'often',
    rtlFlip: true,
    full: {
      kind: 'timing',
      duration: 'drift',
      ease: 'linear',
      props: ['translateX', 'translateY'],
      repeat: 'loop',
    },
    lite: { kind: 'timing', duration: 'glide', ease: 'inOut', props: ['translateX', 'translateY'] },
    off: none,
  },

  // Mosaic tile shapes (Hassan 2026-11-25, DECISIONS #126): the sign-in tile row and the
  // mosaic mark turn calmly between square, star, diamond and rosette. Transform only, on
  // the UI thread. `duration` is one step. Full: loops while the screen is visible. Lite:
  // one pass through the shapes when the screen opens, then rests. Off and exams: still.
  shapeMorph: {
    purpose: 'delight',
    frequency: 'occasional',
    rtlFlip: true,
    full: {
      kind: 'timing',
      duration: 'morph',
      ease: 'linear',
      props: ['rotate', 'scale'],
      repeat: 'loop',
    },
    lite: { kind: 'timing', duration: 'morph', ease: 'linear', props: ['rotate', 'scale'] },
    off: none,
  },

  // Exam: identical in every tier. Nothing else moves.
  examTimerTick: {
    purpose: 'state',
    frequency: 'often',
    examSafe: true,
    full: none,
    lite: none,
    off: none,
  }, // digits change; no tween
  examSaveIndicator: {
    purpose: 'sync',
    frequency: 'often',
    examSafe: true,
    full: fade('fast'),
    lite: fade('fast'),
    off: none,
  }, // dot/check cross-fade

  // Teacher live view (web, staff presentation: lite default)
  liveTileStatus: {
    purpose: 'state',
    frequency: 'often',
    full: fade('fast'),
    lite: fade('fast'),
    off: none,
  },
  liveEventRow: {
    purpose: 'state',
    frequency: 'often',
    full: fade('base'),
    lite: fade('fast'),
    off: none,
  },

  // Teacher review queue (prompt 22). The item card glides out toward the list's reading
  // direction as the next one comes in (progress through the queue), and a decision
  // lands as a stamp (feedback). Both are short: a teacher does this hundreds of times.
  reviewAdvance: {
    purpose: 'progress',
    frequency: 'often',
    rtlFlip: true,
    full: { kind: 'timing', duration: 'fast', ease: 'out', props: ['translateX', 'opacity'] },
    lite: fade('fast'),
    off: none,
  },
  reviewVerdict: {
    purpose: 'feedback',
    frequency: 'often',
    full: { kind: 'spring', spring: 'snappy', props: ['scale', 'opacity'] },
    lite: fade('fast'),
    off: none,
  },
} as const satisfies Record<string, Moment>;

export type MomentName = keyof typeof moments;

/**
 * Moments allowed to move (not just fade) in the lite tier: the subject-pattern glide
 * (DECISIONS #47) and one pass of the tile shape morph (DECISIONS #126), both by
 * Hassan's decision; every other lite behaviour is a fade.
 */
export const liteMovementExceptions: ReadonlyArray<MomentName> = ['patternDrift', 'shapeMorph'];

/** The approved looping decorations (full tier only). Nothing else may loop. */
export const loopingMoments: ReadonlyArray<MomentName> = ['patternDrift', 'shapeMorph'];

/** Moments allowed while an exam screen is mounted. Everything else resolves to `none`. */
export const examAllowedMoments: ReadonlyArray<MomentName> = ['examTimerTick', 'examSaveIndicator'];

/**
 * Pick the tier. Pure, so it can be unit-tested in packages/core (session 02).
 * User choice wins over auto-detect, except OS reduce-motion always forces `off`.
 */
export function pickMotionTier(input: {
  osReduceMotion: boolean;
  userChoice?: MotionTier | 'auto';
  deviceMemoryGb?: number; // navigator.deviceMemory on web; native RAM via expo-device
  isLowEndGpuOrDroppingFrames?: boolean; // from a frame-drop sampler
  surface?: 'student' | 'staff';
}): MotionTier {
  if (input.osReduceMotion) return 'off';
  if (input.userChoice && input.userChoice !== 'auto') return input.userChoice;
  if (input.isLowEndGpuOrDroppingFrames) return 'lite';
  if (input.deviceMemoryGb !== undefined && input.deviceMemoryGb <= 4) return 'lite';
  if (input.surface === 'staff') return 'lite';
  return 'full';
}

/** What a component should actually do right now. */
export function resolveMoment(
  name: MomentName,
  tier: MotionTier,
  ctx: { inExam?: boolean } = {},
): Behaviour {
  if (ctx.inExam && !examAllowedMoments.includes(name)) return { kind: 'none' };
  const m: Moment = moments[name];
  return m[tier];
}

/** User-facing tier setting (Settings): a tier, or auto-detect. */
export type MotionSetting = MotionTier | 'auto';
export const motionSettings: ReadonlyArray<MotionSetting> = ['auto', 'full', 'lite', 'off'];

/**
 * Device RAM in GB from what the platform exposes.
 * Native: expo-device `totalMemory` (bytes; a "4 GB" device reports ~3.6–3.8 GB).
 * Web: `navigator.deviceMemory` (Chrome only; rounded down to 0.25/0.5/1/2/4/8, capped at 8).
 * Returns undefined when neither is known, so the picker falls through to other signals.
 */
export function deviceMemoryGb(input: {
  totalMemoryBytes?: number | null;
  navigatorDeviceMemory?: number | null;
}): number | undefined {
  if (input.totalMemoryBytes && input.totalMemoryBytes > 0) {
    // Round up to the marketed size so a 4 GB Chromebook reporting 3.7 GB counts as 4.
    return Math.ceil(input.totalMemoryBytes / 1024 ** 3);
  }
  if (input.navigatorDeviceMemory && input.navigatorDeviceMemory > 0)
    return input.navigatorDeviceMemory;
  return undefined;
}

/** The transform/opacity props a behaviour animates (none → nothing moves). */
export function behaviourProps(b: Behaviour): ReadonlyArray<AnimProp> {
  if (b.kind === 'none') return [];
  if (b.kind === 'lottie') return ['opacity', 'scale'];
  return b.props;
}

/** Slide distances flip sign in RTL for moments marked `rtlFlip` (and any horizontal slide). */
export function mirrorX(dx: number, isRTL: boolean): number {
  return isRTL ? -dx : dx;
}
