// Motion tier logic (prompt 02 deliverable): pure, so every rule is tested here.
import { describe, expect, it } from 'vitest';
import {
  behaviourProps,
  deviceMemoryGb,
  duration,
  examAllowedMoments,
  liteMovementExceptions,
  loopingMoments,
  mirrorX,
  moments,
  choreography,
  staggerDelay,
  pickMotionTier,
  resolveMoment,
  spring,
  type Behaviour,
  type MomentName,
  type MotionTier,
} from '../src/design';

const tiers: MotionTier[] = ['full', 'lite', 'off'];
const names = Object.keys(moments) as MomentName[];

describe('choreography table', () => {
  it('every moment has all three tiers, and off never animates', () => {
    for (const name of names) {
      for (const tier of tiers) expect(moments[name][tier], `${name}.${tier}`).toBeDefined();
      expect(moments[name].off.kind, name).toBe('none');
    }
  });

  it('only known durations and springs are referenced', () => {
    for (const name of names) {
      for (const tier of ['full', 'lite'] as const) {
        const b = moments[name][tier];
        if (b.kind === 'timing') expect(duration[b.duration], name).toBeDefined();
        if (b.kind === 'spring') expect(spring[b.spring], name).toBeDefined();
      }
    }
  });

  it('lite is fade-only, except the approved pattern glide (DECISIONS #47)', () => {
    for (const name of names) {
      if (liteMovementExceptions.includes(name)) continue;
      const b = moments[name].lite;
      if (b.kind === 'timing') expect(b.props, name).toEqual(['opacity']);
    }
  });

  it('animates transform and opacity only, no exceptions', () => {
    const allowed = new Set(['opacity', 'translateX', 'translateY', 'scale', 'rotate']);
    for (const name of names) {
      for (const tier of tiers) {
        for (const p of behaviourProps(moments[name][tier]))
          expect(allowed.has(p), `${name}: ${p}`).toBe(true);
      }
    }
  });

  it('only the approved decorations loop, full tier only, and they stop in exams and off', () => {
    for (const name of names) {
      for (const tier of tiers) {
        const b: Behaviour = moments[name][tier];
        const loops = b.kind === 'timing' && b.repeat === 'loop';
        expect(loops, `${name}.${tier}`).toBe(loopingMoments.includes(name) && tier === 'full');
      }
    }
    expect(loopingMoments).toEqual(['patternDrift', 'shapeMorph']);
    expect(liteMovementExceptions).toEqual(['patternDrift', 'shapeMorph']);
    for (const name of loopingMoments) {
      for (const tier of tiers)
        expect(resolveMoment(name, tier, { inExam: true }).kind).toBe('none');
      expect(resolveMoment(name, 'off').kind).toBe('none');
    }
  });

  it('tabs never move', () => {
    for (const tier of tiers) expect(resolveMoment('tabSwitch', tier).kind).toBe('none');
  });
});

describe('exam mode', () => {
  it('only the timer and save indicator resolve to anything, in every tier', () => {
    for (const name of names) {
      for (const tier of tiers) {
        const b = resolveMoment(name, tier, { inExam: true });
        if (!examAllowedMoments.includes(name))
          expect(b.kind, `${name} moves in exam (${tier})`).toBe('none');
      }
    }
  });

  it('examSafe flags match the allowed list', () => {
    const flagged = names.filter((k) => (moments[k] as { examSafe?: boolean }).examSafe).sort();
    expect(flagged).toEqual([...examAllowedMoments].sort());
  });

  it('the timer never tweens; the save dot cross-fades unless motion is off', () => {
    for (const tier of tiers)
      expect(resolveMoment('examTimerTick', tier, { inExam: true }).kind).toBe('none');
    expect(resolveMoment('examSaveIndicator', 'full', { inExam: true }).kind).toBe('timing');
    expect(resolveMoment('examSaveIndicator', 'off', { inExam: true }).kind).toBe('none');
  });

  it('outside an exam the same moment animates normally', () => {
    expect(resolveMoment('answerCorrect', 'full').kind).toBe('spring');
    expect(resolveMoment('answerCorrect', 'full', { inExam: false }).kind).toBe('spring');
  });
});

describe('pickMotionTier', () => {
  it('OS reduce motion forces off and beats the user setting', () => {
    expect(pickMotionTier({ osReduceMotion: true, userChoice: 'full' })).toBe('off');
    expect(pickMotionTier({ osReduceMotion: true, userChoice: 'auto', deviceMemoryGb: 16 })).toBe(
      'off',
    );
  });
  it('an explicit user choice beats auto-detect', () => {
    expect(pickMotionTier({ osReduceMotion: false, userChoice: 'full', deviceMemoryGb: 2 })).toBe(
      'full',
    );
    expect(pickMotionTier({ osReduceMotion: false, userChoice: 'off' })).toBe('off');
    expect(pickMotionTier({ osReduceMotion: false, userChoice: 'full', surface: 'staff' })).toBe(
      'full',
    );
  });
  it('auto: ≤ 4 GB or dropping frames → lite; staff → lite; otherwise full', () => {
    expect(pickMotionTier({ osReduceMotion: false, deviceMemoryGb: 4 })).toBe('lite');
    expect(pickMotionTier({ osReduceMotion: false, deviceMemoryGb: 8 })).toBe('full');
    expect(
      pickMotionTier({
        osReduceMotion: false,
        deviceMemoryGb: 8,
        isLowEndGpuOrDroppingFrames: true,
      }),
    ).toBe('lite');
    expect(pickMotionTier({ osReduceMotion: false, surface: 'staff' })).toBe('lite');
    expect(pickMotionTier({ osReduceMotion: false, userChoice: 'auto' })).toBe('full');
  });
});

describe('device memory', () => {
  it('rounds native bytes up to the marketed size', () => {
    expect(deviceMemoryGb({ totalMemoryBytes: 3.7 * 1024 ** 3 })).toBe(4);
    expect(deviceMemoryGb({ totalMemoryBytes: 7.6 * 1024 ** 3 })).toBe(8);
  });
  it('uses navigator.deviceMemory on web, undefined when unknown', () => {
    expect(deviceMemoryGb({ navigatorDeviceMemory: 4 })).toBe(4);
    expect(
      deviceMemoryGb({ totalMemoryBytes: null, navigatorDeviceMemory: undefined }),
    ).toBeUndefined();
    expect(deviceMemoryGb({})).toBeUndefined();
  });
  it('a 4 GB Chromebook lands in lite', () => {
    const gb = deviceMemoryGb({ totalMemoryBytes: 3.8 * 1024 ** 3 });
    expect(pickMotionTier({ osReduceMotion: false, deviceMemoryGb: gb })).toBe('lite');
  });
});

describe('helpers', () => {
  it('mirrors horizontal slides in RTL', () => {
    expect(mirrorX(12, false)).toBe(12);
    expect(mirrorX(12, true)).toBe(-12);
  });
  it('behaviourProps: none moves nothing', () => {
    expect(behaviourProps({ kind: 'none' })).toEqual([]);
  });
});

describe('choreography (UI remake, DECISIONS #94)', () => {
  it('cascades siblings by stepMs, capped, and never delays in off', () => {
    expect(staggerDelay(0, 'full')).toBe(0);
    expect(staggerDelay(1, 'full')).toBe(choreography.stepMs);
    expect(staggerDelay(3, 'lite')).toBe(3 * choreography.stepMs);
    expect(staggerDelay(50, 'full')).toBe(choreography.maxSteps * choreography.stepMs);
    expect(staggerDelay(5, 'off')).toBe(0);
  });
  it('the longest cascade stays under half a second', () => {
    expect(choreography.maxSteps * choreography.stepMs).toBeLessThan(500);
  });
  it('list entrance and score pop stop in exams', () => {
    expect(resolveMoment('listEnter', 'full', { inExam: true }).kind).toBe('none');
    expect(resolveMoment('scoreReveal', 'full', { inExam: true }).kind).toBe('none');
  });
});
