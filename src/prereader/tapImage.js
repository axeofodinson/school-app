// tap_image body-shape helpers — the one place that knows what a pre-reader
// question's jsonb looks like. Pure functions, no imports: callers pass the
// active locale in, so this file runs unchanged in plain Node for verification
// (scripts/verify-prereader.mjs).
//
// The shape (questions.body, jsonb — one question table for all ages, rule 5):
//
//   {
//     "prompt":       { "en": "Tap the one with MORE apples", "ur": "…" },
//     "prompt_audio": { "en": "https://…/more-apples-en.mp3", "ur": "…" },   // optional
//     "choices": [
//       { "id": "a", "emoji": "🍎", "count": 2, "label": { "en": "2 apples", "ur": "…" } },
//       { "id": "b", "emoji": "🍎", "count": 5, "label": { "en": "5 apples", "ur": "…" } }
//     ]
//   }
//   answer: { "correct": "b" }   // never fetched by the student flow
//
// Bilingual fields ("prompt", "prompt_audio", choice "label") are either a
// per-locale object or a bare string. Legacy shapes from the original seed are
// also accepted: "prompt_text" (bare string) for the prompt, and choices that
// carry only { id, image, count } — there `count` describes what the image
// shows and is NOT a repeat count, so it only multiplies emoji.
//
// How a choice renders (first match wins):
//   emoji  -> the emoji drawn huge; with count > 1, repeated so the child can
//             count the items themselves (capped — see MAX_EMOJI_REPEAT)
//   image  -> a picture by URL (or a storage path the screen resolves first)
//   label  -> big localized text (e.g. the numeral "5") as a last resort
//
// The child's answer value in `responses` is the tapped choice id (a string),
// which the existing attemptStore.buildResponses records as-is.

// More repeats than this stops being countable by a 5-year-old and starts
// breaking layouts, so emoji repetition is capped.
export const MAX_EMOJI_REPEAT = 10;

// Resolve a bilingual field (per-locale object or bare string) to text for the
// active locale, falling back to English, then to any language present.
export function localizedText(value, locale) {
  if (value == null) return null;
  if (typeof value === 'string') return value || null;
  if (typeof value === 'object') {
    const exact = value[locale];
    if (typeof exact === 'string' && exact) return exact;
    if (typeof value.en === 'string' && value.en) return value.en;
    for (const v of Object.values(value)) {
      if (typeof v === 'string' && v) return v;
    }
  }
  return null;
}

// The prompt the child hears/sees, in the active locale.
// Falls back to the legacy single-language `prompt_text`.
export function promptText(body, locale) {
  return (
    localizedText(body?.prompt, locale) ??
    localizedText(body?.prompt_text, locale)
  );
}

// The recorded prompt audio (URL or storage path) for the active locale, or
// null when the question has none — callers then fall back to on-device TTS.
export function promptAudio(body, locale) {
  return localizedText(body?.prompt_audio, locale);
}

// Normalise one raw choice into how it should render. Returns null for
// entries too malformed to show (no id, or nothing visual at all).
function normalizeChoice(raw, locale) {
  if (!raw || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' && raw.id ? raw.id : null;
  if (!id) return null;

  const label = localizedText(raw.label, locale);

  if (typeof raw.emoji === 'string' && raw.emoji) {
    const n = Number(raw.count);
    const count =
      Number.isInteger(n) && n > 1 ? Math.min(n, MAX_EMOJI_REPEAT) : 1;
    return { id, kind: 'emoji', emoji: raw.emoji, count, label };
  }
  if (typeof raw.image === 'string' && raw.image) {
    return { id, kind: 'image', image: raw.image, label };
  }
  if (label) {
    return { id, kind: 'label', label };
  }
  return null;
}

// The question's choices, normalised for rendering (order preserved).
export function tapChoices(body, locale) {
  const raw = Array.isArray(body?.choices) ? body.choices : [];
  return raw.map((c) => normalizeChoice(c, locale)).filter(Boolean);
}

// Whether one question is renderable by the pre-reader experience.
export function isTapImageQuestion(q) {
  return q?.type === 'tap_image' && tapChoices(q.body, 'en').length >= 2;
}

// Whether a whole question set should use the paged pre-reader experience
// (every question is a well-formed tap_image). Content-driven — no grade or
// class hardcoding: a PG quiz authored as all tap_image gets the pre-reader
// flow, anything mixed stays on the reading flow with tap_image inline.
export function isPreReaderSet(questions) {
  return (
    Array.isArray(questions) &&
    questions.length > 0 &&
    questions.every(isTapImageQuestion)
  );
}
