import { describe, expect, it } from 'vitest';

import {
  approveBlock,
  buildReviewPatch,
  hasUrduGaps,
  leavesTab,
  mathSvgSizeEx,
  questionLabel,
  nextAfterDecision,
  reviewDraft,
  reviewKeyAction,
  reviewProgress,
  reviewView,
  splitMath,
  startingScopes,
  stepId,
  toggleScope,
  urduGaps,
  type ReviewItem,
} from '../src';

const item = (over: Partial<ReviewItem> = {}): ReviewItem => ({
  id: 'q1',
  version: 1,
  status: 'draft',
  origin: 'ai',
  type: 'mcq',
  cognitive_level: 'apply',
  difficulty: 2,
  chapter_id: 'ch',
  concept_id: 'c1',
  topic_id: 't1',
  body: {
    stem: { en: 'Solve $2x = 4$', ur: 'حل کریں' },
    options: [
      { key: 'A', text: { en: 'x = 2', ur: 'x = 2' }, img: 'a.webp' },
      { key: 'B', text: { en: 'x = 4', ur: '' } },
    ],
    audio: { en: 'q1/abc.en.mp3' },
  },
  answer: { correct: 'A' },
  explanation: { en: 'Divide by 2.', ur: '', why_wrong: { B: { en: 'Forgot to divide' } } },
  source: { book: 'PTB Maths 9', page: 41 },
  import_batch_id: 'b1',
  created_at: '2026-11-25T00:00:00Z',
  scopes: [],
  last_decision: null,
  last_notes: null,
  last_translation: null,
  last_reviewed_at: null,
  can_review: true,
  in_use: false,
  ...over,
});

describe('reviewKeyAction', () => {
  const k = (key: string, extra: object = {}) =>
    reviewKeyAction({ key, ...extra }, { typing: false });
  it('maps the wireframe keys', () => {
    expect(k('a')).toEqual({ kind: 'approve' });
    expect(k('E')).toEqual({ kind: 'edit' });
    expect(k('r')).toEqual({ kind: 'reject' });
    expect(k('c')).toEqual({ kind: 'changes' });
    expect(k('j')).toEqual({ kind: 'next' });
    expect(k('k')).toEqual({ kind: 'prev' });
    expect(k('ArrowDown')).toEqual({ kind: 'next' });
    expect(k('ArrowUp')).toEqual({ kind: 'prev' });
    expect(k('1')).toEqual({ kind: 'scope', scope: 'learn' });
    expect(k('4')).toEqual({ kind: 'scope', scope: 'worksheet' });
    expect(k('v')).toEqual({ kind: 'checkAnswer' });
    expect(k('u')).toEqual({ kind: 'checkUrdu' });
    expect(k('x')).toEqual({ kind: 'select' });
    expect(k('?')).toEqual({ kind: 'help' });
    expect(k('5')).toBeNull();
    expect(k('z')).toBeNull();
  });
  it('uses the physical key on an Urdu layout', () => {
    expect(k('ا', { code: 'KeyA' })).toEqual({ kind: 'approve' });
    expect(k('۲', { code: 'Digit2' })).toEqual({ kind: 'scope', scope: 'practice' });
    expect(k('3', { code: 'Numpad3' })).toEqual({ kind: 'scope', scope: 'exam' });
  });
  it('stays out of typing and browser shortcuts', () => {
    expect(reviewKeyAction({ key: 'a' }, { typing: true })).toBeNull();
    expect(k('a', { ctrlKey: true })).toBeNull();
    expect(k('r', { metaKey: true })).toBeNull();
    expect(k('e', { altKey: true })).toBeNull();
  });
});

describe('scopes and the approve gate', () => {
  it('toggles in fixed order without repeats', () => {
    expect(toggleScope(['practice'], 'learn')).toEqual(['learn', 'practice']);
    expect(toggleScope(['learn', 'practice'], 'learn')).toEqual(['practice']);
    expect(toggleScope(['exam', 'exam'], 'worksheet')).toEqual(['exam', 'worksheet']);
  });
  it('starts from live scopes, else learn + practice (never exam by default)', () => {
    expect(startingScopes({ scopes: [] })).toEqual(['learn', 'practice']);
    expect(startingScopes({ scopes: ['worksheet', 'exam'] })).toEqual(['exam', 'worksheet']);
  });
  it('blocks approve in the order a teacher fixes things', () => {
    const ok = { scopes: ['practice'], answerChecked: true };
    expect(approveBlock(item(), ok)).toBeNull();
    expect(approveBlock(item({ status: 'retired' }), ok)).toBe('retired');
    expect(approveBlock(item({ concept_id: null, can_review: false }), ok)).toBe('noConcept');
    expect(approveBlock(item({ can_review: false }), ok)).toBe('cantReview');
    expect(approveBlock(item(), { scopes: [], answerChecked: true })).toBe('noScopes');
    expect(approveBlock(item(), { scopes: ['exam'], answerChecked: false })).toBe(
      'answerUnchecked',
    );
  });
});

describe('cursor after a decision', () => {
  const ids = ['a', 'b', 'c'];
  it('takes the item that slides into place, or the one before at the end', () => {
    expect(nextAfterDecision(ids, 'a', true)).toBe('b');
    expect(nextAfterDecision(ids, 'b', true)).toBe('c');
    expect(nextAfterDecision(ids, 'c', true)).toBe('b');
    expect(nextAfterDecision(['a'], 'a', true)).toBeNull();
  });
  it('moves on when the item stays', () => {
    expect(nextAfterDecision(ids, 'a', false)).toBe('b');
    expect(nextAfterDecision(ids, 'c', false)).toBe('c');
    expect(nextAfterDecision(ids, 'zz', false)).toBe('a');
  });
  it('knows which decisions leave which tab', () => {
    expect(leavesTab('to_review', 'approve')).toBe(true);
    expect(leavesTab('changes', 'request_changes')).toBe(false);
    expect(leavesTab('changes', 'approve')).toBe(true);
    expect(leavesTab('approved', 'approve')).toBe(false);
    expect(leavesTab('approved', 'reject')).toBe(true);
    expect(leavesTab('retired', 'reject')).toBe(false);
  });
  it('steps inside the list', () => {
    expect(stepId(ids, 'a', -1)).toBe('a');
    expect(stepId(ids, 'a', 1)).toBe('b');
    expect(stepId(ids, 'c', 1)).toBe('c');
    expect(stepId(ids, null, 1)).toBe('a');
    expect(stepId([], 'a', 1)).toBeNull();
  });
  it('counts progress against what was waiting', () => {
    expect(reviewProgress(12, 202)).toEqual({ done: 12, total: 214, ratio: 12 / 214 });
    expect(reviewProgress(0, 0).ratio).toBe(1);
  });
});

describe('reviewView', () => {
  it('reads both languages, the key, the source and why-wrong notes', () => {
    const v = reviewView(item());
    expect(v.stem).toEqual({ en: 'Solve $2x = 4$', ur: 'حل کریں' });
    expect(v.options.map((o) => o.key)).toEqual(['A', 'B']);
    expect(v.correct).toBe('A');
    expect(v.source).toEqual({ book: 'PTB Maths 9', page: '41', ref: '' });
    expect(v.whyWrong).toEqual([{ key: 'B', text: { en: 'Forgot to divide', ur: '' } }]);
    expect(v.hasAudio).toBe(true);
  });
  it('reads older plain-string stems, booleans and missing parts', () => {
    const v = reviewView(
      item({
        type: 'true_false',
        body: { stem: 'Old' },
        answer: { correct: false },
        explanation: null,
        source: null,
      }),
    );
    expect(v.stem).toEqual({ en: 'Old', ur: '' });
    expect(v.correct).toBe('false');
    expect(v.source).toBeNull();
    expect(v.options).toEqual([]);
  });
  it('flags missing Urdu', () => {
    const v = reviewView(item());
    expect(urduGaps(v)).toEqual({ stem: false, options: 1, explanation: true });
    expect(hasUrduGaps(v)).toBe(true);
  });
});

describe('buildReviewPatch', () => {
  it('an untouched draft is no change', () => {
    const it0 = item();
    const r = buildReviewPatch(it0, reviewDraft(it0));
    expect(r).toEqual({ ok: true, patch: {}, changed: false });
  });
  it('a changed stem patches the body, keeps option extras and drops the stale clip', () => {
    const it0 = item();
    const d = { ...reviewDraft(it0), stemEn: 'Solve  $2x = 6$ ' };
    const r = buildReviewPatch(it0, d);
    if (!r.ok) throw new Error(r.error);
    expect(r.changed).toBe(true);
    expect(r.patch.body?.stem).toEqual({ en: 'Solve $2x = 6$', ur: 'حل کریں' });
    expect(r.patch.body?.audio).toBeUndefined();
    expect((r.patch.body?.options as { img?: string }[])[0]!.img).toBe('a.webp');
    expect(r.patch.answer).toBeUndefined();
  });
  it('an Urdu-only fix to the explanation keeps why_wrong and the clip', () => {
    const it0 = item();
    const r = buildReviewPatch(it0, { ...reviewDraft(it0), explUr: '2 سے تقسیم کریں۔' });
    if (!r.ok) throw new Error(r.error);
    expect(Object.keys(r.patch)).toEqual(['explanation']);
    expect(r.patch.explanation).toMatchObject({
      ur: '2 سے تقسیم کریں۔',
      why_wrong: { B: { en: 'Forgot to divide' } },
    });
  });
  it('changes key, level, difficulty and concept', () => {
    const it0 = item();
    const r = buildReviewPatch(it0, {
      ...reviewDraft(it0),
      correct: 'B',
      level: 'recall',
      difficulty: 3,
      conceptId: 'c2',
    });
    if (!r.ok) throw new Error(r.error);
    expect(r.patch).toEqual({
      answer: { correct: 'B' },
      cognitive_level: 'recall',
      difficulty: 3,
      concept_id: 'c2',
    });
  });
  it('refuses broken edits', () => {
    const it0 = item();
    const d = reviewDraft(it0);
    expect(buildReviewPatch(it0, { ...d, stemEn: ' ', stemUr: '' })).toEqual({
      ok: false,
      error: 'stemRequired',
    });
    expect(buildReviewPatch(it0, { ...d, correct: 'C' })).toEqual({
      ok: false,
      error: 'correctMissing',
    });
    expect(buildReviewPatch(it0, { ...d, options: d.options.slice(0, 1) })).toEqual({
      ok: false,
      error: 'optionsTooFew',
    });
    expect(
      buildReviewPatch(it0, { ...d, options: [d.options[0]!, { key: 'B', en: '', ur: '' }] }),
    ).toEqual({ ok: false, error: 'optionEmpty' });
    expect(buildReviewPatch(it0, { ...d, conceptId: null })).toEqual({
      ok: false,
      error: 'conceptRequired',
    });
    expect(buildReviewPatch(item({ type: 'tap_image' }), d)).toEqual({
      ok: false,
      error: 'notEditable',
    });
  });
  it('numeric, true/false and short answers', () => {
    const n = item({
      type: 'numeric',
      body: { stem: { en: '5x = 10', ur: '' } },
      answer: { correct: 2 },
      explanation: null,
    });
    expect(buildReviewPatch(n, { ...reviewDraft(n), correct: '1,000' })).toMatchObject({
      ok: true,
      patch: { answer: { correct: 1000 } },
    });
    expect(buildReviewPatch(n, { ...reviewDraft(n), correct: 'two' })).toEqual({
      ok: false,
      error: 'numericInvalid',
    });
    const tf = item({
      type: 'true_false',
      body: { stem: { en: 'Yes?', ur: '' } },
      answer: { correct: true },
      explanation: null,
    });
    expect(reviewDraft(tf).correct).toBe('true');
    expect(buildReviewPatch(tf, { ...reviewDraft(tf), correct: 'false' })).toMatchObject({
      ok: true,
      patch: { answer: { correct: false } },
    });
    const st = item({
      type: 'short_text',
      body: { stem: { en: 'Capital?', ur: '' } },
      answer: { correct: 'Lahore' },
      explanation: null,
    });
    const r = buildReviewPatch(st, {
      ...reviewDraft(st),
      also: 'Lahore\nlahore city\n\nLahore City',
    });
    expect(r).toMatchObject({
      ok: true,
      patch: { answer: { correct: 'Lahore', also: ['lahore city', 'Lahore City'] } },
    });
    expect(buildReviewPatch(st, { ...reviewDraft(st), correct: ' ' })).toEqual({
      ok: false,
      error: 'shortRequired',
    });
  });
});

describe('questionLabel (bilingual stems)', () => {
  it('reads an imported {en, ur} stem in the UI language, else the other', () => {
    expect(questionLabel({ stem: { en: 'Solve', ur: 'حل' } }, 'ur')).toBe('حل');
    expect(questionLabel({ stem: { en: 'Solve', ur: '' } }, 'ur')).toBe('Solve');
    expect(questionLabel({ stem: { en: ' ', ur: ' ' } })).toBe('');
  });
});

describe('splitMath', () => {
  it('cuts text into plain runs and maths with their keys', () => {
    expect(splitMath('Solve $2x = 4$ now')).toEqual([
      { kind: 'text', text: 'Solve ' },
      { kind: 'math', tex: '2x = 4', display: false, key: '2x = 4' },
      { kind: 'text', text: ' now' },
    ]);
    expect(splitMath('$$a^2$$')).toEqual([
      { kind: 'math', tex: 'a^2', display: true, key: 'D:a^2' },
    ]);
  });
  it('keeps escaped dollars and unclosed maths as text', () => {
    expect(splitMath('Costs \\$5')).toEqual([{ kind: 'text', text: 'Costs $5' }]);
    expect(splitMath('Open $x')).toEqual([{ kind: 'text', text: 'Open $x' }]);
    expect(splitMath('')).toEqual([]);
  });
  it('reads a MathJax size', () => {
    expect(
      mathSvgSizeEx('<svg style="vertical-align: -0.566ex" width="5.5ex" height="2.262ex">'),
    ).toEqual({
      width: 5.5,
      height: 2.262,
      valign: -0.566,
    });
    expect(mathSvgSizeEx('<svg>')).toEqual({ width: 4, height: 2, valign: 0 });
  });
});
