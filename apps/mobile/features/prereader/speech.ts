// Device speech on Android (expo-speech): step 2 of the read-aloud order
// (DESIGN_SYSTEM §3.1). Urdu only where the device has an Urdu voice (the voice
// test); readAloud.ts never asks this to speak Urdu text otherwise.
import * as Speech from 'expo-speech';

let urduVoice: boolean | null = null;

/** The voice test: is an Urdu voice installed? Cached for the session. */
export async function hasUrduVoice(): Promise<boolean> {
  if (urduVoice !== null) return urduVoice;
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    urduVoice = voices.some((v) => v.language.toLowerCase().startsWith('ur'));
  } catch {
    urduVoice = false;
  }
  return urduVoice;
}

/** Whether the platform can speak at all. */
export function speechAvailable(): boolean {
  return true;
}

export function speakText(text: string, lang: 'en' | 'ur'): void {
  Speech.stop();
  // Slightly slow for small children; the pitch stays natural.
  Speech.speak(text, { language: lang === 'ur' ? 'ur-PK' : 'en', rate: 0.9 });
}

export function stopSpeaking(): void {
  Speech.stop();
}
