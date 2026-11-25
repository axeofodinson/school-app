// Pre-made read-aloud clips for pre-reader questions (prompt 16, DESIGN_SYSTEM §3.1).
// Shared by the app (which clip to play) and scripts/audio/generate-prereader-audio.mjs
// (which clips to make). No imports, so that Node script can load this file directly.
//
// body.audio = { en?: "<path>", ur?: "<path>" }: paths in the private `question-audio`
// bucket (db/030). Paths are content-addressed: "{question_id}/{fingerprint}.{locale}.mp3",
// where the fingerprint covers the spoken text + voice + model. Changing the prompt
// changes the path, so a clip is made once per wording and never silently overwritten.
// Legacy body.prompt_audio (db/006) is still read; full https URLs are allowed there.

export const AUDIO_BUCKET = 'question-audio';
export const AUDIO_LOCALES = ['en', 'ur'] as const;
export type AudioLocale = (typeof AUDIO_LOCALES)[number];

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);

/** Stable 64-bit FNV-1a (two 32-bit lanes) as 16 hex chars. Deterministic everywhere. */
export function audioFingerprint(parts: readonly string[]): string {
  const input = parts.join('\u001f');
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x9e3779b9;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x01000193 ^ 0x5bd1e995) >>> 0;
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

export function audioClipPath(
  questionId: string,
  locale: AudioLocale,
  fingerprint: string,
): string {
  return `${questionId}/${fingerprint}.${locale}.mp3`;
}

/**
 * The clip stored for exactly `locale` (no fallback to another language: a missing
 * Urdu clip falls to Urdu device speech before the English clip, see readAloudPlan).
 */
export function exactClip(body: unknown, locale: string): string | null {
  if (!isObj(body)) return null;
  const audio = isObj(body.audio) ? str(body.audio[locale]) : null;
  if (audio) return audio;
  return isObj(body.prompt_audio) ? str(body.prompt_audio[locale]) : null;
}

/** The prompt written for exactly `locale` (a bare string counts as English). */
export function exactPrompt(body: unknown, locale: string): string | null {
  if (!isObj(body)) return null;
  const p = body.prompt ?? body.prompt_text;
  if (typeof p === 'string') return locale === 'en' ? str(p) : null;
  return isObj(p) ? str(p[locale]) : null;
}

export interface ClipJob {
  locale: AudioLocale;
  text: string;
  path: string;
  /** body.audio already points at this exact clip: nothing to make. */
  upToDate: boolean;
}

/** What the generator should make for one question (one entry per written locale). */
export function planClips(
  questionId: string,
  body: unknown,
  voice: { voiceId: string; modelId: string },
): ClipJob[] {
  const jobs: ClipJob[] = [];
  for (const locale of AUDIO_LOCALES) {
    const text = exactPrompt(body, locale);
    if (!text) continue;
    const path = audioClipPath(
      questionId,
      locale,
      audioFingerprint([text.trim(), voice.voiceId, voice.modelId, locale]),
    );
    const current = isObj(body) && isObj(body.audio) ? body.audio[locale] : null;
    jobs.push({ locale, text: text.trim(), path, upToDate: current === path });
  }
  return jobs;
}

/** body with body.audio[locale] set (other keys kept). Pure: returns a new object. */
export function withClip(body: unknown, locale: AudioLocale, path: string): Obj {
  const b = isObj(body) ? body : {};
  const audio = isObj(b.audio) ? b.audio : {};
  return { ...b, audio: { ...audio, [locale]: path } };
}

/**
 * ElevenLabs bills credits per character: 1 per character on the v2/v3 models,
 * 0.5 on Flash/Turbo (their pricing page, 2026). An estimate for the report only.
 */
export function estimateCredits(text: string, modelId: string): number {
  const chars = [...text].length;
  return /flash|turbo/i.test(modelId) ? Math.ceil(chars / 2) : chars;
}
