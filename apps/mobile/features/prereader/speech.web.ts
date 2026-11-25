// Web: the browser's speech synthesis (Chromebook / Windows). See speech.ts.
let urduVoice: SpeechSynthesisVoice | null | undefined;

function synth(): SpeechSynthesis | null {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
    ? window.speechSynthesis
    : null;
}

// Chrome fills getVoices() asynchronously; ask early so the first tap finds Urdu.
const s0 = synth();
if (s0) {
  s0.getVoices();
  s0.addEventListener?.('voiceschanged', () => {
    urduVoice = undefined;
  });
}

function findUrdu(): SpeechSynthesisVoice | null {
  if (urduVoice !== undefined && urduVoice !== null) return urduVoice;
  urduVoice =
    synth()
      ?.getVoices()
      .find((v) => v.lang.toLowerCase().startsWith('ur')) ?? null;
  return urduVoice;
}

export async function hasUrduVoice(): Promise<boolean> {
  return findUrdu() !== null;
}

export function speechAvailable(): boolean {
  return synth() !== null;
}

export function speakText(text: string, lang: 'en' | 'ur'): void {
  const s = synth();
  if (!s || !text) return;
  s.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang === 'ur' ? 'ur-PK' : 'en-US';
  u.rate = 0.9;
  const ur = lang === 'ur' ? findUrdu() : null;
  if (ur) u.voice = ur;
  s.speak(u);
}

export function stopSpeaking(): void {
  synth()?.cancel();
}
