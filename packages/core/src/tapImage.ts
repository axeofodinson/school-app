// tap_image body-shape helpers, ported from the old src/prereader/tapImage.js
// (frozen there; cases pinned by test/tapImage.test.ts, carried over from
// scripts/verify-prereader.mjs). The shape (db/006):
//   { prompt: {en, ur}, prompt_audio?: {en, ur}, choices: [{ id, emoji?, count?, image?, label? }] }
// Legacy: prompt_text (bare string); choices with only { id, image, count } where
// count describes the picture and only multiplies emoji.
// The answer value stored in responses is the tapped choice id.

export const MAX_EMOJI_REPEAT = 10;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A bilingual field (per-locale object or bare string) for `locale`, then en, then any. */
export function localizedText(value: unknown, locale: string): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value || null;
  if (isObj(value)) {
    const exact = value[locale];
    if (typeof exact === 'string' && exact) return exact;
    if (typeof value.en === 'string' && value.en) return value.en;
    for (const v of Object.values(value)) if (typeof v === 'string' && v) return v;
  }
  return null;
}

export function promptText(body: unknown, locale: string): string | null {
  const b = isObj(body) ? body : {};
  return localizedText(b.prompt, locale) ?? localizedText(b.prompt_text, locale);
}

/** Recorded prompt audio (URL or storage path), or null → device speech. */
export function promptAudio(body: unknown, locale: string): string | null {
  return localizedText(isObj(body) ? body.prompt_audio : null, locale);
}

export type TapChoice =
  | { id: string; kind: 'emoji'; emoji: string; count: number; label: string | null }
  | { id: string; kind: 'image'; image: string; label: string | null }
  | { id: string; kind: 'label'; label: string };

function normalizeChoice(raw: unknown, locale: string): TapChoice | null {
  if (!isObj(raw)) return null;
  const id = typeof raw.id === 'string' && raw.id ? raw.id : null;
  if (!id) return null;
  const label = localizedText(raw.label, locale);
  if (typeof raw.emoji === 'string' && raw.emoji) {
    const n = Number(raw.count);
    const count = Number.isInteger(n) && n > 1 ? Math.min(n, MAX_EMOJI_REPEAT) : 1;
    return { id, kind: 'emoji', emoji: raw.emoji, count, label };
  }
  if (typeof raw.image === 'string' && raw.image)
    return { id, kind: 'image', image: raw.image, label };
  if (label) return { id, kind: 'label', label };
  return null;
}

/** Renderable choices, order kept, malformed entries dropped. */
export function tapChoices(body: unknown, locale: string): TapChoice[] {
  const raw = isObj(body) && Array.isArray(body.choices) ? body.choices : [];
  return raw.map((c) => normalizeChoice(c, locale)).filter((c): c is TapChoice => c !== null);
}

export function isTapImageQuestion(
  q: { type?: unknown; body?: unknown } | null | undefined,
): boolean {
  return q?.type === 'tap_image' && tapChoices(q.body, 'en').length >= 2;
}

/** Every question is a well-formed tap_image (content decides, never the class). */
export function isPreReaderSet(questions: unknown): boolean {
  return (
    Array.isArray(questions) &&
    questions.length > 0 &&
    questions.every((q) => isTapImageQuestion(q as { type?: unknown; body?: unknown }))
  );
}
