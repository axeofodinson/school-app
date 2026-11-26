import { describe, expect, it } from 'vitest';

import {
  buildIndex,
  entryKeys,
  packHash,
  haveMap,
  lessonKey,
  packMathKey,
  orphanKeys,
  packForTopic,
  packIsStale,
  packTopicQuestions,
  parsePack,
  pickPackLesson,
  planPack,
  questionKey,
} from '../src/packs';

const RAW = {
  chapter: {
    id: 'ch1',
    title: 'Motion',
    title_ur: null,
    subject_id: 's1',
    subject_name: 'Physics',
    class_name: 'Class 9',
  },
  built_at: '2026-11-26T10:00:00Z',
  topics: [
    { id: 't1', title_en: 'Speed', title_ur: 'رفتار', sort_order: 1 },
    { id: 't2', title_en: 'Graphs', title_ur: null, sort_order: 2 },
  ],
  concepts: [
    { id: 'k2', topic_id: 't1', title_en: 'Units', title_ur: null, sort_order: 2 },
    { id: 'k1', topic_id: 't1', title_en: 'Speed', title_ur: null, sort_order: 1 },
    { id: 'k3', topic_id: 't2', title_en: 'Slope', title_ur: null, sort_order: 1 },
  ],
  lessons: [
    {
      id: 'l1',
      topic_id: 't1',
      kind: 'lesson',
      concept_id: null,
      version: 2,
      updated_at: null,
      blocks: [{ type: 'simple', en: 'Hi $v$' }],
    },
    {
      id: 'l2',
      topic_id: 't1',
      kind: 'alternative',
      concept_id: 'k1',
      version: 1,
      updated_at: null,
      blocks: null,
    },
  ],
  questions: [
    {
      id: 'qb',
      version: 1,
      type: 'mcq',
      difficulty: 1,
      concept_id: 'k1',
      body: { stem: 'b' },
      answer: { correct: 'A' },
      explanation: null,
    },
    { id: 'qa', version: 3, type: 'numeric', difficulty: 2, concept_id: 'k2' },
    {
      id: 'qc',
      version: 1,
      type: 'mcq',
      difficulty: 1,
      concept_id: 'k3',
      body: { stem: 'c' },
      answer: { correct: 'B' },
      explanation: null,
    },
  ],
};

describe('packs', () => {
  it('parses the server answer and plans writes, keeping what the device has', () => {
    const p = parsePack(RAW)!;
    expect(p.chapter.subjectName).toBe('Physics');
    expect(parsePack(null)).toBeNull();
    const present = new Set([lessonKey('l2', 1)]);
    const plan = planPack(p, present);
    expect(plan.writes.map((w) => w.key)).toEqual([
      lessonKey('l1', 2),
      questionKey('qb', 1),
      questionKey('qc', 1),
    ]);
    expect(plan.kept).toEqual([lessonKey('l2', 1)]);
    expect(plan.missing).toEqual([questionKey('qa', 3)]);
    expect(JSON.parse(plan.writes[1]!.value)).toEqual({
      body: { stem: 'b' },
      answer: { correct: 'A' },
      explanation: null,
    });
  });

  it('builds an index without content, and asks only for what is missing', () => {
    const ix = buildIndex(parsePack(RAW)!, ['v', 'a'], 1234, '2026-11-26T10:00:01Z');
    expect(ix.lessons[0]).not.toHaveProperty('blocks');
    expect(ix.math).toEqual(['a', 'v']);
    expect(entryKeys(ix)).toContain(packMathKey('v'));
    const present = new Set([lessonKey('l1', 2), questionKey('qb', 1)]);
    expect(haveMap(ix, present)).toEqual({ 'l:l1': 2, 'q:qb': 1 });
    expect(haveMap(null, present)).toEqual({});
  });

  it('finds orphaned entries after a pack is deleted (shared entries stay)', () => {
    const a = buildIndex(parsePack(RAW)!, [], 0, '');
    const b = { ...a, lessons: [], questions: a.questions.slice(0, 1), math: [] };
    const stored = [...entryKeys(a), 'e/q/old/1', 'i/u1/ch1'];
    expect(orphanKeys([b], stored).sort()).toEqual(
      [
        lessonKey('l1', 2),
        lessonKey('l2', 1),
        questionKey('qa', 3),
        questionKey('qc', 1),
        'e/q/old/1',
      ].sort(),
    );
    expect(orphanKeys([a], stored)).toEqual(['e/q/old/1']);
  });

  it('reads lessons and practice items for a topic', () => {
    const ix = buildIndex(parsePack(RAW)!, [], 0, '');
    expect(pickPackLesson(ix, 't1', null)?.id).toBe('l1');
    expect(pickPackLesson(ix, 't1', 'l2')?.id).toBe('l2');
    expect(pickPackLesson(ix, 't2', null)).toBeNull();
    expect(packTopicQuestions(ix, 't1').map((q) => q.id)).toEqual(['qb', 'qa']);
    expect(packForTopic([ix], 't2')?.chapter.id).toBe('ch1');
    expect(packForTopic([ix], 'nope')).toBeNull();
  });

  it('hashes and staleness', () => {
    expect(packHash('v=d/t')).toMatch(/^[0-9a-f]{8}$/);
    expect(packHash('a')).not.toBe(packHash('b'));
    const ix = buildIndex(parsePack(RAW)!, [], 0, '2026-11-25T09:00:00Z');
    expect(packIsStale(ix, Date.parse('2026-11-25T20:00:00Z'))).toBe(false);
    expect(packIsStale(ix, Date.parse('2026-11-26T10:00:00Z'))).toBe(true);
  });
});
