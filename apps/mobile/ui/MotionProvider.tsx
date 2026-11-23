import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import { useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { MotionContext, type MotionInputs } from './motion';
import { deviceMemoryGb, motionSettings, type MotionSetting } from './tokens';

// TODO(61): namespace per signed-in user on shared Chromebooks.
const STORAGE_KEY = 'app.motion';

function readMemoryGb(): number | undefined {
  const nav =
    Platform.OS === 'web' && typeof navigator !== 'undefined'
      ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory
      : undefined;
  return deviceMemoryGb({ totalMemoryBytes: Device.totalMemory, navigatorDeviceMemory: nav });
}

/**
 * Root motion state: OS reduce-motion (live), device RAM, and the user's saved
 * full / lite / off / auto choice. Components read the tier with useMotion().
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  const initialReduce = useReducedMotion();
  const [osReduceMotion, setOsReduceMotion] = useState(initialReduce);
  const [setting, setSettingState] = useState<MotionSetting>('auto');
  const [memoryGb] = useState(readMemoryGb);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => alive && setOsReduceMotion(v))
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setOsReduceMotion);
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (alive && saved && (motionSettings as readonly string[]).includes(saved)) {
          setSettingState(saved as MotionSetting);
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  const setSetting = useCallback((s: MotionSetting) => {
    setSettingState(s);
    AsyncStorage.setItem(STORAGE_KEY, s).catch(() => undefined);
  }, []);

  const value = useMemo<MotionInputs>(
    () => ({ osReduceMotion, memoryGb, setting, setSetting, inExam: false }),
    [osReduceMotion, memoryGb, setting, setSetting],
  );
  return <MotionContext.Provider value={value}>{children}</MotionContext.Provider>;
}

function useParent(name: string): MotionInputs {
  const ctx = useContext(MotionContext);
  if (!ctx) throw new Error(`<${name}> must be inside <MotionProvider>`);
  return ctx;
}

/** Force a tier for a subtree (gallery, previews). OS reduce-motion still forces off. */
export function MotionOverride({
  setting,
  children,
}: {
  setting: MotionSetting;
  children: ReactNode;
}) {
  const parent = useParent('MotionOverride');
  const value = useMemo(() => ({ ...parent, override: setting }), [parent, setting]);
  return <MotionContext.Provider value={value}>{children}</MotionContext.Provider>;
}

/**
 * Wrap every exam-taking screen in this. Inside it, every moment except the exam
 * timer and save indicator resolves to `none` in every tier (CLAUDE.md: exams, nothing
 * moves), and components drop decoration (patterns, sticker shadows).
 */
export function ExamMode({ active = true, children }: { active?: boolean; children: ReactNode }) {
  const parent = useParent('ExamMode');
  const inExam = parent.inExam || active;
  const value = useMemo(() => ({ ...parent, inExam }), [parent, inExam]);
  return <MotionContext.Provider value={value}>{children}</MotionContext.Provider>;
}
