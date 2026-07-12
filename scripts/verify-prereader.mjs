// Verification for the pre-reader tap_image contract (src/prereader/tapImage.js)
// and for the seeded PG content in db/006_prereader_tap_image_content.sql.
//
// Two halves:
//   1. The pure body-shape helpers: locale resolution + fallbacks, choice
//      normalisation (emoji repeat cap, legacy image shape where `count` is
//      descriptive, malformed entries dropped), and pre-reader-set detection.
//   2. The seed data itself: every jsonb body in db/006 is pulled out of the
//      SQL and pushed through the SAME helpers the app renders with, proving
//      each seeded question has a bilingual prompt, >= 2 renderable choices,
//      and an answer that points at a real choice id.
//
// Run:  npm run verify:prereader     (or: node scripts/verify-prereader.mjs)
// No device, no network, no database. Exit 0 = all pass.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MAX_EMOJI_REPEAT,
  localizedText,
  promptText,
  promptAudio,
  tapChoices,
  isTapImageQuestion,
  isPreReaderSet,
} from '../src/prereader/tapImage.js';

let passed = 0;
let failed = 0;

function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failed += 1;
    console.error(`  FAIL ${label}\n         expected ${e}\n         actual   ${a}`);
  }
}

// ---- 1. localizedText -------------------------------------------------------
console.log('localizedText');
check('bare string passes through', localizedText('hello', 'ur'), 'hello');
check('exact locale wins', localizedText({ en: 'hi', ur: 'سلام' }, 'ur'), 'سلام');
check('falls back to en', localizedText({ en: 'hi' }, 'ur'), 'hi');
check('falls back to any language', localizedText({ ur: 'سلام' }, 'fr'), 'سلام');
check('empty string is null', localizedText('', 'en'), null);
check('null is null', localizedText(null, 'en'), null);

// ---- prompts ----------------------------------------------------------------
console.log('promptText / promptAudio');
const bilingual = {
  prompt: { en: 'Tap the red one', ur: 'لال پر ہاتھ لگاؤ' },
  prompt_audio: { en: 'audio/red-en.mp3' },
  choices: [],
};
check('prompt picks locale', promptText(bilingual, 'ur'), 'لال پر ہاتھ لگاؤ');
check('legacy prompt_text works', promptText({ prompt_text: 'Tap it' }, 'ur'), 'Tap it');
check('missing prompt is null', promptText({}, 'en'), null);
check('audio falls back to en', promptAudio(bilingual, 'ur'), 'audio/red-en.mp3');
check('missing audio is null', promptAudio({}, 'en'), null);

// ---- choices ----------------------------------------------------------------
console.log('tapChoices');
const emojiBody = {
  choices: [
    { id: 'a', emoji: '🍎', count: 2, label: { en: '2 apples', ur: '2 سیب' } },
    { id: 'b', emoji: '🍎', count: 99 },
    { id: 'c', emoji: '⭐' },
  ],
};
check(
  'emoji choice with count',
  tapChoices(emojiBody, 'ur')[0],
  { id: 'a', kind: 'emoji', emoji: '🍎', count: 2, label: '2 سیب' }
);
check('repeat is capped', tapChoices(emojiBody, 'en')[1].count, MAX_EMOJI_REPEAT);
check('no count means one', tapChoices(emojiBody, 'en')[2].count, 1);

// The original setup.sql seed shape: image path + descriptive count.
const legacyBody = {
  prompt_text: 'Tap the box with MORE apples',
  choices: [
    { id: 'left', image: 'img/apples-2.png', count: 2 },
    { id: 'right', image: 'img/apples-5.png', count: 5 },
  ],
};
check(
  'legacy image choice (count stays descriptive, not a repeat)',
  tapChoices(legacyBody, 'en')[0],
  { id: 'left', kind: 'image', image: 'img/apples-2.png', label: null }
);
check(
  'label-only choice renders as text',
  tapChoices({ choices: [{ id: 'x', label: { en: '5' } }] }, 'en')[0],
  { id: 'x', kind: 'label', label: '5' }
);
check(
  'malformed choices are dropped',
  tapChoices({ choices: [{ emoji: '💥' }, null, { id: 'ok', emoji: '🐈' }] }, 'en').length,
  1
);

// ---- set detection ----------------------------------------------------------
console.log('isPreReaderSet');
const tapQ = { type: 'tap_image', body: emojiBody };
const mcqQ = { type: 'mcq', body: { stem: 'x' } };
check('all tap_image -> pre-reader', isPreReaderSet([tapQ, tapQ]), true);
check('mixed set stays reading flow', isPreReaderSet([tapQ, mcqQ]), false);
check('empty set is not pre-reader', isPreReaderSet([]), false);
check('one-choice tap_image is not renderable', isTapImageQuestion({
  type: 'tap_image',
  body: { choices: [{ id: 'a', emoji: '🍎' }] },
}), false);

// ---- 2. the db/006 seed content ---------------------------------------------
console.log('db/006 seed bodies');
const sql = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'db', '006_prereader_tap_image_content.sql'),
  'utf8'
);
// jsonb literals appear strictly as body-then-answer pairs per statement.
const literals = [...sql.matchAll(/'(\{[\s\S]*?\})'::jsonb/g)].map((m) => m[1]);
check('seed has 6 body/answer pairs', literals.length, 12);

for (let i = 0; i + 1 < literals.length; i += 2) {
  let body;
  let answer;
  try {
    body = JSON.parse(literals[i]);
    answer = JSON.parse(literals[i + 1]);
  } catch (e) {
    failed += 1;
    console.error(`  FAIL seed pair ${i / 2} is not valid JSON: ${e.message}`);
    continue;
  }
  const seed = body.seed ?? `pair ${i / 2}`;
  const q = { type: 'tap_image', body };
  check(`${seed}: renderable pre-reader question`, isTapImageQuestion(q), true);
  check(`${seed}: has an English prompt`, typeof promptText(body, 'en'), 'string');
  check(
    `${seed}: has its own Urdu prompt (not the en fallback)`,
    promptText(body, 'ur') !== promptText(body, 'en'),
    true
  );
  const ids = tapChoices(body, 'en').map((c) => c.id);
  check(`${seed}: answer points at a real choice`, ids.includes(answer.correct), true);
  const urduLabels = tapChoices(body, 'ur').map((c) => c.label);
  check(`${seed}: every choice has an Urdu label`, urduLabels.every(Boolean), true);
}

// ---- summary ----------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
