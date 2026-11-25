// UI sounds and spoken kid prompts (UI remake, DECISIONS #95). Small bundled files,
// no network. Rules: never in an exam (or a formal test: ExamMode), never on staff
// screens, off when the user turns Sounds off in Settings (saved per device), and
// quiet (60 % volume). Every cue is optional: a missing file simply plays nothing,
// so the app works before Hassan's recordings land in assets/voice/.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { useI18n } from '../i18n';
import { voiceClips, type VoiceLine } from '../assets/voice/manifest';
import { useMotion } from './motion';
import { useTheme } from './theme';

/** Short effects (ElevenLabs takes, trimmed: docs/audio-scripts.md B; replaceable, same names). */
const sfx = {
  pop: require('../assets/sfx/pop.wav'),
  ding: require('../assets/sfx/ding.wav'),
  tada: require('../assets/sfx/tada.wav'),
} as const;
export type SfxName = keyof typeof sfx;

const STORAGE_KEY = 'app.sound';
const VOLUME = 0.6;

type SoundCtx = { enabled: boolean; setEnabled: (v: boolean) => void };
const SoundContext = createContext<SoundCtx>({ enabled: true, setEnabled: () => undefined });

export function SoundProvider({ children }: { children: ReactNode }) {
  const [enabled, setState] = useState(true);
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => v === 'off' && setState(false))
      .catch(() => undefined);
  }, []);
  const setEnabled = useCallback((v: boolean) => {
    setState(v);
    AsyncStorage.setItem(STORAGE_KEY, v ? 'on' : 'off').catch(() => undefined);
    if (!v) stopAllCues();
  }, []);
  const value = useMemo(() => ({ enabled, setEnabled }), [enabled, setEnabled]);
  return <SoundContext.Provider value={value}>{children}</SoundContext.Provider>;
}

export const useSoundSetting = () => useContext(SoundContext);

let current: AudioPlayer | null = null;
const players = new Map<unknown, AudioPlayer>();

function play(source: unknown) {
  try {
    let pl = players.get(source);
    if (!pl) {
      pl = createAudioPlayer(source as number);
      pl.volume = VOLUME;
      players.set(source, pl);
    }
    current = pl;
    pl.seekTo(0).catch(() => undefined);
    pl.play();
  } catch {
    // No audio on this device/browser yet (e.g. before the first tap on web): stay silent.
  }
}

export function stopAllCues() {
  try {
    current?.pause();
  } catch {
    // released
  }
  current = null;
}

/**
 * `cue('pop')` for an effect, `say('wellDone')` for a recorded kid prompt in the
 * current language (falls back to nothing when the clip isn't recorded yet).
 */
export function useCues() {
  const { enabled } = useContext(SoundContext);
  const { inExam } = useMotion();
  const { presentation } = useTheme();
  const { locale } = useI18n();
  const allowed = enabled && !inExam && presentation !== 'staff';
  const cue = useCallback((name: SfxName) => allowed && play(sfx[name]), [allowed]);
  const say = useCallback(
    (line: VoiceLine) => {
      if (!allowed) return false;
      const src = voiceClips[locale]?.[line] ?? null;
      if (src == null) return false;
      play(src);
      return true;
    },
    [allowed, locale],
  );
  return { cue, say, allowed };
}
