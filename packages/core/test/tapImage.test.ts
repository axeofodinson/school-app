// Every case from scripts/verify-prereader.mjs, against the core port, plus the
// db/006 seed bodies run through the same helpers the student screen renders with.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  isPreReaderSet,
  isTapImageQuestion,
  localizedText,
  MAX_EMOJI_REPEAT,
  promptAudio,
  promptText,
  tapChoices,
} from '../src';

describe('localizedText', () => {
  it('resolves locale, falls back to en then any', () => {
    expect(localizedText('hello', 'ur')).toBe('hello');
    expect(localizedText({ en: 'hi', ur: 'سلام' }, 'ur')).toBe('سلام');
    expect(localizedText({ en: 'hi' }, 'ur')).toBe('hi');
    expect(localizedText({ ur: 'سلام' }, 'fr')).toBe('سلام');
    expect(localizedText('', 'en')).toBeNull();
    expect(localizedText(null, 'en')).toBeNull();
  });
});

describe('prompts', () => {
  const bilingual = {
    prompt: { en: 'Tap the red one', ur: 'لال پر ہاتھ لگاؤ' },
    prompt_audio: { en: 'audio/red-en.mp3' },
    choices: [],
  };
  it('prompt + audio', () => {
    expect(promptText(bilingual, 'ur')).toBe('لال پر ہاتھ لگاؤ');
    expect(promptText({ prompt_text: 'Tap it' }, 'ur')).toBe('Tap it');
    expect(promptText({}, 'en')).toBeNull();
    expect(promptAudio(bilingual, 'ur')).toBe('audio/red-en.mp3');
    expect(promptAudio({}, 'en')).toBeNull();
  });
});

describe('tapChoices', () => {
  const emojiBody = {
    choices: [
      { id: 'a', emoji: '🍎', count: 2, label: { en: '2 apples', ur: '2 سیب' } },
      { id: 'b', emoji: '🍎', count: 99 },
      { id: 'c', emoji: '⭐' },
    ],
  };
  it('emoji choices, capped repeat', () => {
    expect(tapChoices(emojiBody, 'ur')[0]).toEqual({
      id: 'a',
      kind: 'emoji',
      emoji: '🍎',
      count: 2,
      label: '2 سیب',
    });
    expect(tapChoices(emojiBody, 'en')[1]).toMatchObject({ count: MAX_EMOJI_REPEAT });
    expect(tapChoices(emojiBody, 'en')[2]).toMatchObject({ count: 1 });
  });
  it('legacy image shape: count stays descriptive', () => {
    const legacy = {
      prompt_text: 'Tap the box with MORE apples',
      choices: [
        { id: 'left', image: 'img/apples-2.png', count: 2 },
        { id: 'right', image: 'img/apples-5.png', count: 5 },
      ],
    };
    expect(tapChoices(legacy, 'en')[0]).toEqual({
      id: 'left',
      kind: 'image',
      image: 'img/apples-2.png',
      label: null,
    });
  });
  it('label-only and malformed', () => {
    expect(tapChoices({ choices: [{ id: 'x', label: { en: '5' } }] }, 'en')[0]).toEqual({
      id: 'x',
      kind: 'label',
      label: '5',
    });
    expect(
      tapChoices({ choices: [{ emoji: '💥' }, null, { id: 'ok', emoji: '🐈' }] }, 'en'),
    ).toHaveLength(1);
    expect(tapChoices(null, 'en')).toEqual([]);
  });
  it('set detection', () => {
    const tapQ = { type: 'tap_image', body: emojiBody };
    const mcqQ = { type: 'mcq', body: { stem: 'x' } };
    expect(isPreReaderSet([tapQ, tapQ])).toBe(true);
    expect(isPreReaderSet([tapQ, mcqQ])).toBe(false);
    expect(isPreReaderSet([])).toBe(false);
    expect(
      isTapImageQuestion({ type: 'tap_image', body: { choices: [{ id: 'a', emoji: '🍎' }] } }),
    ).toBe(false);
  });
});

describe('db/006 seed bodies render', () => {
  const sql = readFileSync(
    new URL('../../../db/006_prereader_tap_image_content.sql', import.meta.url),
    'utf8',
  );
  const literals = [...sql.matchAll(/'(\{[\s\S]*?\})'::jsonb/g)].map((m) => m[1]!);
  it('has 6 body/answer pairs', () => expect(literals.length).toBe(12));
  for (let i = 0; i + 1 < literals.length; i += 2) {
    const body = JSON.parse(literals[i]!) as Record<string, unknown>;
    const answer = JSON.parse(literals[i + 1]!) as { correct: string };
    it(`${String(body.seed ?? i / 2)} is a renderable bilingual question`, () => {
      expect(isTapImageQuestion({ type: 'tap_image', body })).toBe(true);
      expect(typeof promptText(body, 'en')).toBe('string');
      expect(promptText(body, 'ur')).not.toBe(promptText(body, 'en'));
      expect(tapChoices(body, 'en').map((c) => c.id)).toContain(answer.correct);
      expect(tapChoices(body, 'ur').every((c) => c.label)).toBe(true);
    });
  }
});
