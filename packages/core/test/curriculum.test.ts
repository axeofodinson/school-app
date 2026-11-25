import { describe, expect, it } from 'vitest';

import {
  buildChapter,
  buildConcept,
  buildEdition,
  buildTopic,
  chapterCounts,
  inOrder,
  localTitle,
  moveItem,
  nextSortOrder,
  parseDiagnosticSize,
  prereqChanges,
  wouldCreateCycle,
} from '../src/curriculum';

describe('buildTopic', () => {
  it('trims and squashes titles, empty Urdu = null, empty size = default', () => {
    expect(
      buildTopic({ titleEn: '  Adding   fractions ', titleUr: ' ', diagnosticSize: '' }),
    ).toEqual({
      ok: true,
      value: { title_en: 'Adding fractions', title_ur: null, diagnostic_size: null },
    });
  });
  it('requires an English title', () => {
    expect(buildTopic({ titleEn: '   ', titleUr: 'کسر', diagnosticSize: '' })).toMatchObject({
      ok: false,
      error: 'titleRequired',
      field: 'titleEn',
    });
  });
  it('limits titles to 200 characters', () => {
    const long = 'x'.repeat(201);
    expect(buildTopic({ titleEn: long, titleUr: '', diagnosticSize: '' })).toMatchObject({
      error: 'titleTooLong',
      field: 'titleEn',
    });
    expect(buildTopic({ titleEn: 'ok', titleUr: long, diagnosticSize: '' })).toMatchObject({
      error: 'titleTooLong',
      field: 'titleUr',
    });
  });
  it('checks the diagnostic size like the database (5–60)', () => {
    expect(buildTopic({ titleEn: 'T', titleUr: '', diagnosticSize: '20' })).toMatchObject({
      value: { diagnostic_size: 20 },
    });
    expect(buildTopic({ titleEn: 'T', titleUr: '', diagnosticSize: '4' })).toMatchObject({
      error: 'diagnosticRange',
    });
    expect(buildTopic({ titleEn: 'T', titleUr: '', diagnosticSize: '61' })).toMatchObject({
      error: 'diagnosticRange',
    });
    expect(buildTopic({ titleEn: 'T', titleUr: '', diagnosticSize: '2.5' })).toMatchObject({
      error: 'diagnosticNotNumber',
    });
  });
});

describe('parseDiagnosticSize', () => {
  it('accepts Urdu and Arabic-Indic digits', () => {
    expect(parseDiagnosticSize('۲۵')).toEqual({ ok: true, value: 25 });
    expect(parseDiagnosticSize('٣٠')).toEqual({ ok: true, value: 30 });
    expect(parseDiagnosticSize(' 5 ')).toEqual({ ok: true, value: 5 });
    expect(parseDiagnosticSize('60')).toEqual({ ok: true, value: 60 });
  });
});

describe('buildConcept', () => {
  it('keeps line breaks inside summaries and nulls empty ones', () => {
    expect(
      buildConcept({ titleEn: 'Union', titleUr: '', summaryEn: ' One.\nTwo. ', summaryUr: '' }),
    ).toEqual({
      ok: true,
      value: { title_en: 'Union', title_ur: null, summary_en: 'One.\nTwo.', summary_ur: null },
    });
  });
  it('limits summaries to 1000 characters', () => {
    expect(
      buildConcept({ titleEn: 'U', titleUr: '', summaryEn: '', summaryUr: 'ب'.repeat(1001) }),
    ).toMatchObject({ error: 'summaryTooLong', field: 'summaryUr' });
  });
});

describe('buildChapter', () => {
  it('maps the English title to chapters.title and keeps the edition', () => {
    expect(
      buildChapter({
        titleEn: 'Sets',
        titleUr: 'سیٹ',
        textbookRef: ' Unit 1 ',
        curriculumId: 'c1',
      }),
    ).toEqual({
      ok: true,
      value: { title: 'Sets', title_ur: 'سیٹ', textbook_ref: 'Unit 1', curriculum_id: 'c1' },
    });
  });
});

describe('buildEdition', () => {
  const base = {
    code: 'ptb-2025',
    board: 'Punjab Textbook Board',
    name: 'PTB 2025',
    effectiveFrom: '',
  };
  it('upper-cases the code and allows no date', () => {
    expect(buildEdition(base)).toEqual({
      ok: true,
      value: {
        code: 'PTB-2025',
        board: 'Punjab Textbook Board',
        name: 'PTB 2025',
        effective_from: null,
      },
    });
  });
  it('requires code, board and name in that order', () => {
    expect(buildEdition({ ...base, code: ' ' })).toMatchObject({ error: 'codeRequired' });
    expect(buildEdition({ ...base, board: '' })).toMatchObject({ error: 'boardRequired' });
    expect(buildEdition({ ...base, name: '' })).toMatchObject({ error: 'nameRequired' });
    expect(buildEdition({ ...base, code: 'x'.repeat(41) })).toMatchObject({ error: 'codeTooLong' });
  });
  it('checks real calendar dates, Urdu digits too', () => {
    expect(buildEdition({ ...base, effectiveFrom: '2025-04-01' })).toMatchObject({
      value: { effective_from: '2025-04-01' },
    });
    expect(buildEdition({ ...base, effectiveFrom: '۲۰۲۵-۰۴-۰۱' })).toMatchObject({
      value: { effective_from: '2025-04-01' },
    });
    expect(buildEdition({ ...base, effectiveFrom: '2025-02-30' })).toMatchObject({
      error: 'dateInvalid',
    });
    expect(buildEdition({ ...base, effectiveFrom: '1/4/2025' })).toMatchObject({
      error: 'dateInvalid',
    });
  });
});

describe('ordering', () => {
  const items = [
    { id: 'a', sort_order: 1 },
    { id: 'b', sort_order: 2 },
    { id: 'c', sort_order: 3 },
  ];
  it('moves down: only the two swapped rows change', () => {
    expect(moveItem(items, 'a', 1)).toEqual([
      { id: 'b', sort_order: 1 },
      { id: 'a', sort_order: 2 },
    ]);
  });
  it('cannot move past either end', () => {
    expect(moveItem(items, 'a', -1)).toEqual([]);
    expect(moveItem(items, 'c', 1)).toEqual([]);
    expect(moveItem(items, 'zz', 1)).toEqual([]);
  });
  it('heals ties and gaps (imported rows all at 0)', () => {
    const tied = [
      { id: 'x', sort_order: 0 },
      { id: 'y', sort_order: 0 },
      { id: 'z', sort_order: 7 },
    ];
    expect(inOrder(tied).map((t) => t.id)).toEqual(['x', 'y', 'z']);
    expect(moveItem(tied, 'z', -1)).toEqual([
      { id: 'x', sort_order: 1 },
      { id: 'z', sort_order: 2 },
      { id: 'y', sort_order: 3 },
    ]);
  });
  it('puts a new item at the end', () => {
    expect(nextSortOrder(items)).toBe(4);
    expect(nextSortOrder([])).toBe(1);
  });
});

describe('prerequisites', () => {
  // c needs b, b needs a
  const edges = [
    { concept_id: 'c', requires_concept_id: 'b' },
    { concept_id: 'b', requires_concept_id: 'a' },
  ];
  it('refuses a loop, direct or through others, and itself', () => {
    expect(wouldCreateCycle(edges, 'a', 'c')).toBe(true);
    expect(wouldCreateCycle(edges, 'b', 'c')).toBe(true);
    expect(wouldCreateCycle(edges, 'a', 'a')).toBe(true);
  });
  it('allows a new branch or a repeat of an existing link', () => {
    expect(wouldCreateCycle(edges, 'c', 'a')).toBe(false);
    expect(wouldCreateCycle(edges, 'd', 'c')).toBe(false);
    expect(wouldCreateCycle(edges, 'c', 'b')).toBe(false);
  });
  it('terminates on a graph that already has a loop', () => {
    const bad = [...edges, { concept_id: 'a', requires_concept_id: 'c' }];
    expect(wouldCreateCycle(bad, 'x', 'a')).toBe(false);
  });
  it('lists adds and removes', () => {
    expect(prereqChanges(['a', 'b'], ['b', 'c'])).toEqual({ add: ['c'], remove: ['a'] });
    expect(prereqChanges([], [])).toEqual({ add: [], remove: [] });
  });
});

describe('chapterCounts + localTitle', () => {
  it('counts only active topics and concepts', () => {
    const m = chapterCounts([
      {
        chapter_id: 'c1',
        status: 'active',
        concepts: [{ status: 'active' }, { status: 'retired' }],
      },
      { chapter_id: 'c1', status: 'active', concepts: null },
      { chapter_id: 'c1', status: 'retired', concepts: [{ status: 'active' }] },
      { chapter_id: 'c2', status: 'active', concepts: [{ status: 'active' }] },
    ]);
    expect(m.get('c1')).toEqual({ topics: 2, concepts: 1 });
    expect(m.get('c2')).toEqual({ topics: 1, concepts: 1 });
    expect(m.get('c3')).toBeUndefined();
  });
  it('picks Urdu when there is one', () => {
    expect(localTitle({ title_en: 'Sets', title_ur: 'سیٹ' }, 'ur')).toBe('سیٹ');
    expect(localTitle({ title_en: 'Sets', title_ur: null }, 'ur')).toBe('Sets');
    expect(localTitle({ title: 'Motion', title_ur: 'حرکت' }, 'en')).toBe('Motion');
  });
});
