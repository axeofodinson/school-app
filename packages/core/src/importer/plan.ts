// Turn a checked file into the rows the server writes (db/031
// `import_content()`): ids are made here (client UUIDs), so sending a chunk
// twice (a retry after a lost reply, a double click) never makes two copies.
//
// Existing topics/concepts are reused by title (case and spacing ignored), so
// a second file for the same topic adds questions to it instead of making a
// twin topic. Lesson concept KEYS become concept ids here.
import { normaliseText } from './similar';
import type { ParsedFile, ParsedQuestion, ImportReport } from './types';

export interface ExistingTopic {
  id: string;
  title_en: string;
  status: string;
  sort_order: number;
}
export interface ExistingConcept {
  id: string;
  topic_id: string;
  title_en: string;
  status: string;
  sort_order: number;
}
export interface ExistingLesson {
  topic_id: string;
  kind: 'lesson' | 'alternative';
  concept_id: string | null;
  status: string;
}

export interface PlanQuestion {
  id: string;
  concept_id: string;
  type: ParsedQuestion['type'];
  cognitive_level: ParsedQuestion['cognitive_level'];
  difficulty: number;
  default_marks: number;
  body: ParsedQuestion['body'];
  answer: ParsedQuestion['answer'];
  explanation: ParsedQuestion['explanation'];
  source: ParsedQuestion['source'];
  language_complete: boolean;
}

export interface ImportPlan {
  batch: {
    id: string;
    origin: 'human' | 'ai';
    source_note: string | null;
    file_name: string | null;
    chapter_id: string;
    topic_id: string;
    is_test_data: boolean;
  };
  topic: { id: string; title_en: string; title_ur: string | null; sort_order: number } | null;
  concepts: { id: string; title_en: string; title_ur: string | null; sort_order: number }[];
  prereqs: { concept_id: string; requires_concept_id: string }[];
  lessons: {
    id: string;
    kind: 'lesson' | 'alternative';
    concept_id: string | null;
    blocks: unknown[];
  }[];
  math: { key: string; svg: string }[];
  questions: PlanQuestion[];
  /** What the plan reuses, for the confirm step ("adds to existing topic"). */
  reuse: { topic: boolean; concepts: number; lessonsSkipped: number };
}

const same = (a: string, b: string) => normaliseText(a) === normaliseText(b);

export interface PlanInput {
  file: ParsedFile;
  report: ImportReport;
  chapterId: string;
  origin: 'human' | 'ai';
  sourceNote?: string;
  fileName?: string;
  /** Leave out questions flagged "similar" (exact duplicates are always left out). */
  skipSimilar: boolean;
  existing: { topics: ExistingTopic[]; concepts: ExistingConcept[]; lessons: ExistingLesson[] };
  math?: Map<string, string>;
  newId: () => string;
}

export function buildImportPlan(p: PlanInput): ImportPlan {
  const { file, existing, newId } = p;
  const topicMatch = existing.topics.find(
    (t) => t.status === 'active' && same(t.title_en, file.topic.title_en),
  );
  const topicId = topicMatch?.id ?? newId();
  const topic = topicMatch
    ? null
    : {
        id: topicId,
        title_en: file.topic.title_en,
        title_ur: file.topic.title_ur || null,
        sort_order: existing.topics.reduce((m, t) => Math.max(m, t.sort_order + 1), 0),
      };

  const inTopic = existing.concepts.filter((c) => c.topic_id === topicId && c.status === 'active');
  let nextOrder = inTopic.reduce((m, c) => Math.max(m, c.sort_order + 1), 0);
  const conceptIds = new Map<string, string>();
  const concepts: ImportPlan['concepts'] = [];
  let reused = 0;
  for (const c of file.concepts) {
    const hit = inTopic.find((e) => same(e.title_en, c.title_en));
    if (hit) {
      conceptIds.set(c.key, hit.id);
      reused++;
    } else {
      const id = newId();
      conceptIds.set(c.key, id);
      concepts.push({
        id,
        title_en: c.title_en,
        title_ur: c.title_ur || null,
        sort_order: nextOrder++,
      });
    }
  }
  const prereqs: ImportPlan['prereqs'] = [];
  for (const c of file.concepts)
    for (const r of c.requires)
      prereqs.push({ concept_id: conceptIds.get(c.key)!, requires_concept_id: conceptIds.get(r)! });

  const mapBlock = (b: Record<string, unknown>) =>
    typeof b.concept_id === 'string' && conceptIds.has(b.concept_id)
      ? { ...b, concept_id: conceptIds.get(b.concept_id) }
      : b;
  const lessons: ImportPlan['lessons'] = [];
  let lessonsSkipped = 0;
  for (const l of file.lessons) {
    const conceptId = l.concept ? (conceptIds.get(l.concept) ?? null) : null;
    const taken = existing.lessons.some(
      (e) =>
        e.topic_id === topicId &&
        e.kind === l.kind &&
        e.concept_id === conceptId &&
        e.status !== 'retired',
    );
    if (taken) {
      lessonsSkipped++;
      continue;
    }
    lessons.push({
      id: newId(),
      kind: l.kind,
      concept_id: conceptId,
      blocks: l.blocks.map(mapBlock),
    });
  }

  const questions: PlanQuestion[] = [];
  for (const q of file.questions) {
    const status = p.report.rows[q.index]?.status;
    if (status !== 'ok' && !(status === 'similar' && !p.skipSimilar)) continue;
    questions.push({
      id: newId(),
      concept_id: conceptIds.get(q.concept)!,
      type: q.type,
      cognitive_level: q.cognitive_level,
      difficulty: q.difficulty,
      default_marks: q.marks,
      body: q.body,
      answer: q.answer,
      explanation: q.explanation,
      source: q.source,
      language_complete: q.languageComplete,
    });
  }

  return {
    batch: {
      id: newId(),
      origin: p.origin,
      source_note: p.sourceNote?.trim() || null,
      file_name: p.fileName ?? null,
      chapter_id: p.chapterId,
      topic_id: topicId,
      is_test_data: file.testData,
    },
    topic,
    concepts,
    prereqs,
    lessons,
    math: [...(p.math ?? new Map()).entries()].map(([key, svg]) => ({ key, svg })),
    questions,
    reuse: { topic: !!topicMatch, concepts: reused, lessonsSkipped },
  };
}

/** Questions per request: keeps each call well under the API's body limit. */
export const IMPORT_CHUNK = 200;

/**
 * The calls to send, in order. The first carries the batch, topic, concepts,
 * prerequisites, lessons and maths; every call carries up to IMPORT_CHUNK
 * questions; the last one marks the batch done and stores the report summary.
 */
export function planChunks(plan: ImportPlan, chunk = IMPORT_CHUNK) {
  const out: {
    batch: ImportPlan['batch'];
    topic: ImportPlan['topic'];
    concepts: ImportPlan['concepts'];
    prereqs: ImportPlan['prereqs'];
    lessons: ImportPlan['lessons'];
    math: ImportPlan['math'];
    questions: PlanQuestion[];
    final: boolean;
  }[] = [];
  const n = Math.max(1, Math.ceil(plan.questions.length / chunk));
  for (let i = 0; i < n; i++) {
    const first = i === 0;
    out.push({
      batch: plan.batch,
      topic: first ? plan.topic : null,
      concepts: first ? plan.concepts : [],
      prereqs: first ? plan.prereqs : [],
      lessons: first ? plan.lessons : [],
      math: first ? plan.math : [],
      questions: plan.questions.slice(i * chunk, (i + 1) * chunk),
      final: i === n - 1,
    });
  }
  return out;
}

/** What import_batches.report keeps: counts and at most 200 issues (free-tier size). */
export function reportSummary(report: ImportReport, imported: number) {
  return {
    counts: { ...report.counts, imported },
    issues: report.issues.slice(0, 200),
    truncated: report.issues.length > 200,
  };
}
