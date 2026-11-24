// Web: a recorded clip when the question has one (body.prompt_audio, a full URL),
// else the browser's speech synthesis. Urdu only with an Urdu voice; otherwise
// the English prompt. See speech.ts for the native side.
import type { SpeakInput } from './speech';

export type { SpeakInput } from './speech';

let clip: HTMLAudioElement | null = null;

function synth(): SpeechSynthesis | null {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
    ? window.speechSynthesis
    : null;
}

export function speechAvailable(): boolean {
  return synth() !== null || typeof Audio !== 'undefined';
}

export function stopSpeaking(): void {
  synth()?.cancel();
  if (clip) {
    clip.pause();
    clip = null;
  }
}

function say(text: string, lang: string, voice?: SpeechSynthesisVoice) {
  const s = synth();
  if (!s || !text) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  if (voice) u.voice = voice;
  s.speak(u);
}

export async function speak({ locale, text, fallbackEn, audio }: SpeakInput): Promise<void> {
  stopSpeaking();
  if (audio && /^https:\/\//.test(audio) && typeof Audio !== 'undefined') {
    try {
      clip = new Audio(audio);
      await clip.play();
      return;
    } catch {
      clip = null; // blocked or offline: fall through to speech
    }
  }
  if (locale === 'ur') {
    const ur = synth()
      ?.getVoices()
      .find((v) => v.lang.toLowerCase().startsWith('ur'));
    if (ur) say(text, 'ur-PK', ur);
    else if (fallbackEn) say(fallbackEn, 'en-US');
  } else {
    say(text, 'en-US');
  }
}
