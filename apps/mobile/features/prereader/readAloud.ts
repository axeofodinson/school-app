// Speaker button logic: walk the read-aloud plan (core readAloudPlan,
// DESIGN_SYSTEM §3.1) until one step plays.
import { readAloudPlan } from '@school/core';

import { playClip, stopClip } from './clips';
import { hasUrduVoice, speakText, speechAvailable, stopSpeaking } from './speech';

export { prefetchClips } from './clips';

/** True when a speaker button makes sense (some clip, or device speech for the text). */
export function canReadAloud(body: unknown, locale: 'en' | 'ur'): boolean {
  // The Urdu voice check is async; assume one so the button shows, and let the plan
  // fall back to English (clip or speech) when there isn't one.
  return readAloudPlan(body, locale, { speech: speechAvailable(), urduVoice: true }).length > 0;
}

export async function readAloud(body: unknown, locale: 'en' | 'ur'): Promise<boolean> {
  stopAll();
  const steps = readAloudPlan(body, locale, {
    speech: speechAvailable(),
    urduVoice: locale === 'ur' ? await hasUrduVoice() : false,
  });
  for (const s of steps) {
    if (s.kind === 'clip') {
      if (await playClip(s.ref)) return true;
    } else {
      speakText(s.text, s.lang);
      return true;
    }
  }
  return false;
}

export function stopAll(): void {
  stopClip();
  stopSpeaking();
}
