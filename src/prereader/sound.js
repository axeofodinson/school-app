// Pre-reader sound engine — the audio half of the tap_image experience.
//
// Two jobs:
//   1. EFFECTS — tiny bundled WAVs (assets/sfx/, synthesized by
//      scripts/generate-sfx.mjs — no CDN, rule-compliant) for game feel:
//      pop (pick a choice), ding (lock it in), tada (finished).
//   2. PROMPTS — the question read aloud. Recorded audio from the question's
//      jsonb (per-language URL/storage path) plays when present; otherwise we
//      fall back to on-device TTS (expo-speech) speaking the human-written
//      prompt text in the active language. TTS is speech synthesis of our own
//      strings — the "never machine-translate Urdu" rule is about writing the
//      strings, which stay human-written in locales/ and in question data.
//
// Every call here is fire-and-forget and failure-silent: a missing Urdu TTS
// voice, a dead audio URL, or a muted device must never block the child from
// answering (offline tolerance — the visuals always carry the question too).
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';

import { supabase } from '../lib/supabase';

const EFFECTS = {
  pop: require('../../assets/sfx/pop.wav'),
  ding: require('../../assets/sfx/ding.wav'),
  tada: require('../../assets/sfx/tada.wav'),
};

// BCP-47 voices for TTS. Availability varies by device; expo-speech quietly
// approximates or no-ops when a voice is missing, which is the behaviour we
// want anyway.
const TTS_LANGUAGE = { en: 'en-US', ur: 'ur-PK' };

let audioModeReady = false;
async function ensureAudioMode() {
  if (audioModeReady) return;
  audioModeReady = true; // set optimistically; retrying every call gains nothing
  try {
    // Kids' phones (well, parents' phones) are often on the silent switch;
    // a tap game that stays mute on iOS silent mode would feel broken.
    await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
  } catch (e) {
    // Audio module unavailable — visuals still carry the experience.
  }
}

// One loaded Sound per effect, reused for the whole session (loading a WAV per
// tap would stutter on low-end Android).
const effectSounds = {};
export async function playEffect(name) {
  const source = EFFECTS[name];
  if (!source) return;
  try {
    await ensureAudioMode();
    if (!effectSounds[name]) {
      const { sound } = await Audio.Sound.createAsync(source);
      effectSounds[name] = sound;
    }
    await effectSounds[name].replayAsync();
  } catch (e) {
    effectSounds[name] = null; // retry the load on the next play
  }
}

// Turn a prompt_audio value into something expo-av can stream: full URLs pass
// through; anything else is treated as a path in the `question-media` storage
// bucket. (Content is data — questions reference media, never bundle it.)
export function resolveAudioUrl(pathOrUrl) {
  if (!pathOrUrl || typeof pathOrUrl !== 'string') return null;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  try {
    const { data } = supabase.storage.from('question-media').getPublicUrl(pathOrUrl);
    return data?.publicUrl ?? null;
  } catch (e) {
    return null;
  }
}

// The single active prompt playback. A monotonically increasing token guards
// against races: rapid replays / question advances just supersede the old
// playback instead of overlapping it.
let promptSound = null;
let promptToken = 0;

export async function stopPrompt() {
  promptToken += 1;
  const sound = promptSound;
  promptSound = null;
  try {
    Speech.stop();
  } catch (e) {
    // TTS not available — nothing to stop.
  }
  if (sound) {
    try {
      await sound.unloadAsync();
    } catch (e) {
      // Already unloaded.
    }
  }
}

// Say the question out loud: recorded audio when the question data has it for
// this locale, else TTS of the prompt text. Safe to call repeatedly (replay
// button) and on every question advance.
export async function speakPrompt({ audio, text, locale }) {
  await stopPrompt();
  const token = promptToken;

  const url = resolveAudioUrl(audio);
  if (url) {
    try {
      await ensureAudioMode();
      const { sound } = await Audio.Sound.createAsync({ uri: url }, { shouldPlay: true });
      if (token !== promptToken) {
        // A newer prompt superseded this one while it was loading.
        await sound.unloadAsync();
        return;
      }
      promptSound = sound;
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.didJustFinish && promptSound === sound) {
          promptSound = null;
          sound.unloadAsync().catch(() => {});
        }
      });
      return; // recorded audio is playing — no TTS on top
    } catch (e) {
      // Dead URL / offline — fall through to TTS of the same prompt.
    }
  }

  if (text && token === promptToken) {
    try {
      Speech.speak(text, {
        language: TTS_LANGUAGE[locale] ?? locale,
        rate: 0.9, // a touch slower for young ears
      });
    } catch (e) {
      // No TTS voice — the on-screen prompt and pictures carry the question.
    }
  }
}
