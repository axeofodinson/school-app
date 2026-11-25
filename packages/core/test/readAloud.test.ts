// Read-aloud order (DESIGN_SYSTEM §3.1) and the clip generator's planning (prompt 16).
import { describe, expect, it } from 'vitest';

import {
  audioClipPath,
  audioFingerprint,
  clipRefs,
  estimateCredits,
  exactClip,
  exactPrompt,
  planClips,
  readAloudPlan,
  withClip,
} from '../src';

const body = {
  prompt: { en: 'Tap the box with MORE apples', ur: 'جس ڈبے میں زیادہ سیب ہیں اُس پر ہاتھ لگاؤ' },
  audio: { en: 'q1/aaa.en.mp3', ur: 'q1/bbb.ur.mp3' },
  choices: [],
};
const speechNoUrdu = { speech: true, urduVoice: false };
const speechUrdu = { speech: true, urduVoice: true };
const silent = { speech: false, urduVoice: false };

describe('readAloudPlan', () => {
  it('clip first, then device speech in the same language', () => {
    expect(readAloudPlan(body, 'en', speechNoUrdu)).toEqual([
      { kind: 'clip', ref: 'q1/aaa.en.mp3', locale: 'en' },
      { kind: 'speech', text: body.prompt.en, lang: 'en' },
    ]);
  });
  it('Urdu: ur clip, ur voice, en clip, en speech', () => {
    expect(
      readAloudPlan(body, 'ur', speechUrdu).map(
        (s) => s.kind + ':' + ('lang' in s ? s.lang : s.locale),
      ),
    ).toEqual(['clip:ur', 'speech:ur', 'clip:en', 'speech:en']);
  });
  it('Urdu without an Urdu voice never speaks Urdu text with another voice', () => {
    const steps = readAloudPlan({ ...body, audio: {} }, 'ur', speechNoUrdu);
    expect(steps).toEqual([{ kind: 'speech', text: body.prompt.en, lang: 'en' }]);
  });
  it('no clip and no speech: nothing (button hides)', () => {
    expect(readAloudPlan({ prompt: body.prompt }, 'en', silent)).toEqual([]);
    expect(readAloudPlan({}, 'ur', speechUrdu)).toEqual([]);
  });
  it('English locale with only an Urdu prompt does not read Urdu in an English voice', () => {
    expect(readAloudPlan({ prompt: { ur: 'سیب' } }, 'en', speechUrdu)).toEqual([]);
  });
  it('a clip alone works with no device speech (Chromebook without voices)', () => {
    expect(readAloudPlan(body, 'en', silent)).toEqual([
      { kind: 'clip', ref: 'q1/aaa.en.mp3', locale: 'en' },
    ]);
  });
  it('reads the legacy prompt_audio and prompt_text shapes (db/006)', () => {
    const legacy = { prompt_text: 'Tap it', prompt_audio: { en: 'https://x/a.mp3' } };
    expect(readAloudPlan(legacy, 'en', speechNoUrdu)).toEqual([
      { kind: 'clip', ref: 'https://x/a.mp3', locale: 'en' },
      { kind: 'speech', text: 'Tap it', lang: 'en' },
    ]);
    expect(exactClip({ audio: { en: '' }, prompt_audio: { en: 'p.mp3' } }, 'en')).toBe('p.mp3');
  });
});

describe('clipRefs', () => {
  it('collects each clip once', () => {
    expect(clipRefs([body, body, { audio: { ur: 'q2/c.ur.mp3' } }, null])).toEqual([
      'q1/aaa.en.mp3',
      'q1/bbb.ur.mp3',
      'q2/c.ur.mp3',
    ]);
  });
});

describe('clip planning (generator)', () => {
  const voice = { voiceId: 'v1', modelId: 'eleven_v3' };
  it('fingerprint is stable and changes with the words, voice or model', () => {
    const f = audioFingerprint(['a', 'v1', 'm']);
    expect(f).toMatch(/^[0-9a-f]{16}$/);
    expect(audioFingerprint(['a', 'v1', 'm'])).toBe(f);
    expect(audioFingerprint(['b', 'v1', 'm'])).not.toBe(f);
    expect(audioFingerprint(['a', 'v2', 'm'])).not.toBe(f);
    expect(audioFingerprint(['a', 'v1', 'n'])).not.toBe(f);
    expect(audioFingerprint(['ab', 'c'])).not.toBe(audioFingerprint(['a', 'bc']));
  });
  it('one job per written language, path under the question id', () => {
    const jobs = planClips('q1', { prompt: body.prompt }, voice);
    expect(jobs.map((j) => j.locale)).toEqual(['en', 'ur']);
    expect(jobs[0]!.path).toMatch(/^q1\/[0-9a-f]{16}\.en\.mp3$/);
    expect(jobs.every((j) => !j.upToDate)).toBe(true);
    expect(planClips('q1', { prompt_text: 'Tap it' }, voice).map((j) => j.locale)).toEqual(['en']);
    expect(planClips('q1', { prompt: { en: '  ' } }, voice)).toEqual([]);
  });
  it('a made clip is up to date until the wording changes', () => {
    const [en] = planClips('q1', { prompt: { en: 'Tap' } }, voice);
    const done = withClip({ prompt: { en: 'Tap' }, choices: [1] }, 'en', en!.path);
    expect(done.choices).toEqual([1]);
    expect(planClips('q1', done, voice)[0]!.upToDate).toBe(true);
    expect(planClips('q1', { ...done, prompt: { en: 'Tap!' } }, voice)[0]!.upToDate).toBe(false);
  });
  it('helpers', () => {
    expect(audioClipPath('q', 'ur', 'f')).toBe('q/f.ur.mp3');
    expect(exactPrompt({ prompt: 'x' }, 'ur')).toBeNull();
    expect(estimateCredits('سیب ہیں', 'eleven_v3')).toBe(7);
    expect(estimateCredits('abcd', 'eleven_flash_v2_5')).toBe(2);
  });
});
