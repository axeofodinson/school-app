// The read-aloud order for a pre-reader prompt (DESIGN_SYSTEM §3.1):
//   1. the pre-made clip for this language (body.audio, ElevenLabs or recorded)
//   2. device speech in this language (Urdu only where the device has an Urdu voice)
//   3. for Urdu without either: the English clip, then English device speech
//      (the human-written English prompt; never a machine translation)
//   4. nothing: the speaker button hides.
// The player tries the steps in order; a clip that won't load (not cached, offline)
// falls through to the next step.
import { exactClip, exactPrompt } from './prereaderAudio';

export type ReadAloudStep =
  | { kind: 'clip'; ref: string; locale: 'en' | 'ur' }
  | { kind: 'speech'; text: string; lang: 'en' | 'ur' };

export interface ReadAloudDevice {
  /** The platform can speak at all (expo-speech / SpeechSynthesis). */
  speech: boolean;
  /** An Urdu voice is installed (the "voice test"). */
  urduVoice: boolean;
}

export function readAloudPlan(
  body: unknown,
  locale: 'en' | 'ur',
  device: ReadAloudDevice,
): ReadAloudStep[] {
  const steps: ReadAloudStep[] = [];
  const clip = exactClip(body, locale);
  if (clip) steps.push({ kind: 'clip', ref: clip, locale });
  if (locale === 'ur') {
    const ur = exactPrompt(body, 'ur');
    if (ur && device.speech && device.urduVoice)
      steps.push({ kind: 'speech', text: ur, lang: 'ur' });
    const enClip = exactClip(body, 'en');
    if (enClip) steps.push({ kind: 'clip', ref: enClip, locale: 'en' });
  }
  const en = exactPrompt(body, 'en');
  if (en && device.speech) steps.push({ kind: 'speech', text: en, lang: 'en' });
  return steps;
}

/** Every clip a paper could play (for caching before going offline). */
export function clipRefs(bodies: readonly unknown[]): string[] {
  const out = new Set<string>();
  for (const b of bodies) {
    for (const l of ['en', 'ur']) {
      const c = exactClip(b, l);
      if (c) out.add(c);
    }
  }
  return [...out];
}
