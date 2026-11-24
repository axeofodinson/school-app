// Read a tap_image prompt aloud on Android: device speech (expo-speech). The
// recorded-clip path (body.prompt_audio) and the voice quality checks are prompt
// 16; here a clip is skipped and the human-written prompt is spoken instead.
// Urdu is spoken only where the device has an Urdu voice; otherwise the English
// prompt is spoken (never a machine translation).
import * as Speech from 'expo-speech';

export interface SpeakInput {
  locale: 'en' | 'ur';
  text: string;
  /** English prompt, used when there is no voice for `locale`. */
  fallbackEn: string | null;
  audio: string | null;
}

let urduVoice: boolean | null = null;
async function hasUrduVoice(): Promise<boolean> {
  if (urduVoice !== null) return urduVoice;
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    urduVoice = voices.some((v) => v.language.toLowerCase().startsWith('ur'));
  } catch {
    urduVoice = false;
  }
  return urduVoice;
}

/** False when there is nothing to speak with (the speaker button hides). */
export function speechAvailable(): boolean {
  return true;
}

export async function speak({ locale, text, fallbackEn }: SpeakInput): Promise<void> {
  Speech.stop();
  if (locale === 'ur' && (await hasUrduVoice())) {
    Speech.speak(text, { language: 'ur-PK' });
  } else if (locale === 'ur') {
    if (fallbackEn) Speech.speak(fallbackEn, { language: 'en' });
  } else {
    Speech.speak(text, { language: 'en' });
  }
}

export function stopSpeaking(): void {
  Speech.stop();
}
