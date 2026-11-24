import { describe, expect, it } from 'vitest';
import {
  addOption,
  buildQuestion,
  changeType,
  draftFromQuestion,
  emptyDraft,
  MAX_OPTIONS,
  parseNumericAnswer,
  parseQuestionMarks,
  questionLabel,
  removeOption,
  shortTextMatches,
  type QuestionDraft,
} from '../src/questions';

const base = (over: Partial<QuestionDraft>): QuestionDraft => ({
  ...emptyDraft(),
  cognitive: 'recall',
  stem: '2 + 2 = ?',
  ...over,
});

describe('buildQuestion', () => {
  it('mcq: keys from position, answer is the key', () => {
    expect(buildQuestion(base({ options: [' 3', '4 ', '5'], correctIndex: 1 }))).toEqual({
      body: {
        stem: '2 + 2 = ?',
        options: [
          { key: 'A', text: '3' },
          { key: 'B', text: '4' },
          { key: 'C', text: '5' },
        ],
      },
      answer: { correct: 'B' },
      marks: 1,
    });
  });

  it('requires a cognitive level first (rule 6)', () => {
    expect(buildQuestion({ ...base({}), cognitive: null })).toEqual({
      error: 'cognitiveRequired',
    });
  });

  it.each([
    ['blank stem', { stem: '  ' }, 'stemRequired'],
    ['empty option', { options: ['a', ' '], correctIndex: 0 }, 'optionTextRequired'],
    ['no correct', { options: ['a', 'b'] }, 'correctRequired'],
    ['correct out of range', { options: ['a', 'b'], correctIndex: 2 }, 'correctRequired'],
    ['bad marks', { options: ['a', 'b'], correctIndex: 0, marks: '0' }, 'marksInvalid'],
  ] as const)('mcq %s', (_l, over, error) => {
    expect(buildQuestion(base(over as Partial<QuestionDraft>))).toEqual({ error });
  });

  it('numeric: number answer, Urdu digits ok', () => {
    expect(buildQuestion(base({ type: 'numeric', numeric: '۴۲', marks: '2' }))).toEqual({
      body: { stem: '2 + 2 = ?' },
      answer: { correct: 42 },
      marks: 2,
    });
    expect(buildQuestion(base({ type: 'numeric', numeric: '' }))).toEqual({
      error: 'numericRequired',
    });
    expect(buildQuestion(base({ type: 'numeric', numeric: '1/2' }))).toEqual({
      error: 'numericInvalid',
    });
  });

  it('true_false: boolean answer', () => {
    expect(buildQuestion(base({ type: 'true_false', tf: false }))).toMatchObject({
      answer: { correct: false },
    });
    expect(buildQuestion(base({ type: 'true_false' }))).toEqual({ error: 'tfRequired' });
  });

  it('short_text: model answer + deduped alternatives', () => {
    expect(
      buildQuestion(
        base({
          type: 'short_text',
          short: ' Lahore ',
          shortAlso: 'lahore\nLahore City\n\nlahore  city',
        }),
      ),
    ).toEqual({
      body: { stem: '2 + 2 = ?' },
      answer: { correct: 'Lahore', also: ['Lahore City'] },
      marks: 1,
    });
    expect(buildQuestion(base({ type: 'short_text', short: 'x' }))).toMatchObject({
      answer: { correct: 'x' },
    });
    expect(buildQuestion(base({ type: 'short_text' }))).toEqual({ error: 'shortRequired' });
  });
});

describe('draft editing', () => {
  it('changeType clears answers that no longer apply', () => {
    const d = changeType(base({ options: ['a', 'b'], correctIndex: 1, numeric: '3' }), 'numeric');
    expect(d.correctIndex).toBeNull();
    expect(d.numeric).toBe('');
    expect(d.type).toBe('numeric');
  });

  it('add/remove options keeps the correct pointer on the same option', () => {
    let d = base({ options: ['a', 'b', 'c'], correctIndex: 2 });
    d = removeOption(d, 0);
    expect(d.options).toEqual(['b', 'c']);
    expect(d.correctIndex).toBe(1);
    expect(removeOption(d, 1).options).toEqual(['b', 'c']); // min 2
    d = base({ options: ['a', 'b', 'c'], correctIndex: 1 });
    expect(removeOption(d, 1).correctIndex).toBeNull();
    let full = base({});
    for (let i = 0; i < 10; i++) full = addOption(full);
    expect(full.options).toHaveLength(MAX_OPTIONS);
  });
});

describe('draftFromQuestion round trip', () => {
  it.each([
    base({ options: ['x', 'y', 'z'], correctIndex: 2, marks: '3' }),
    base({ type: 'numeric', numeric: '-2.5' }),
    base({ type: 'true_false', tf: true, cognitive: 'apply' }),
    base({ type: 'short_text', short: 'Indus', shortAlso: 'River Indus\nSindhu' }),
  ])('%#', (d) => {
    const built = buildQuestion(d);
    if ('error' in built) throw new Error(built.error);
    const back = draftFromQuestion({
      type: d.type,
      cognitive_level: d.cognitive!,
      body: built.body,
      answer: built.answer,
      default_marks: built.marks,
    });
    expect(back && buildQuestion(back)).toEqual(built);
  });

  it('tap_image is read-only', () => {
    expect(
      draftFromQuestion({
        type: 'tap_image',
        cognitive_level: 'recall',
        body: {},
        answer: {},
        default_marks: 1,
      }),
    ).toBeNull();
  });

  it('a bad stored cognitive level must be picked again', () => {
    const d = draftFromQuestion({
      type: 'true_false',
      cognitive_level: 'remember',
      body: { stem: 's' },
      answer: { correct: true },
      default_marks: null,
    });
    expect(d?.cognitive).toBeNull();
    expect(d?.marks).toBe('');
  });
});

describe('parsers and labels', () => {
  it('parseNumericAnswer', () => {
    expect(parseNumericAnswer('3.14')).toBe(3.14);
    expect(parseNumericAnswer('-2')).toBe(-2);
    expect(parseNumericAnswer('3a')).toBeNull();
    expect(parseNumericAnswer('.5')).toBeNull();
  });
  it('parseQuestionMarks', () => {
    expect(parseQuestionMarks('')).toBe(1);
    expect(parseQuestionMarks('100')).toBe(100);
    expect(parseQuestionMarks('101')).toBeNull();
    expect(parseQuestionMarks('1.5')).toBeNull();
  });
  it('questionLabel reads stems and bilingual tap_image prompts', () => {
    expect(questionLabel({ stem: ' Q ' })).toBe('Q');
    expect(questionLabel({ prompt: { en: 'Tap', ur: 'ٹیپ' } }, 'ur')).toBe('ٹیپ');
    expect(questionLabel({ prompt: { en: 'Tap' } }, 'ur')).toBe('Tap');
    expect(questionLabel(null)).toBe('');
  });
  it('shortTextMatches ignores case and spacing', () => {
    const a = { correct: 'Lahore', also: ['Lahore City'] };
    expect(shortTextMatches('  lahore ', a)).toBe(true);
    expect(shortTextMatches('LAHORE   city', a)).toBe(true);
    expect(shortTextMatches('Karachi', a)).toBe(false);
    expect(shortTextMatches('', a)).toBe(false);
  });
});
