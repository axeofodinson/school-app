// Shared shapes for the content importer (prompt 21). Every finding is an
// Issue with a stable code; the app turns the code into words through i18n
// (`staff.importer.issues.<code>`), so nothing here is user-facing text.

export type Severity = 'error' | 'warning';

export const ISSUE_CODES = [
  // file
  'notJson',
  'tooLarge',
  'tooManyQuestions',
  'noQuestions',
  // structure (from the schema)
  'required',
  'wrongType',
  'tooLong',
  'badValue',
  'fieldIgnored',
  // topic + concepts
  'conceptKeyDuplicate',
  'conceptTitleDuplicate',
  'requiresUnknown',
  'requiresLoop',
  'conceptUnused',
  // questions
  'typeUnsupported',
  'conceptUnknown',
  'cognitiveMissing',
  'cognitiveInvalid',
  'difficultyRange',
  'stemMissing',
  'optionsCount',
  'optionKeyDuplicate',
  'optionTextMissing',
  'optionsSame',
  'correctMissing',
  'correctNotSingle',
  'answerInvalid',
  'whyWrongUnknown',
  'explanationMissing',
  'enMissing',
  'urMissing',
  'marksRange',
  // duplicates
  'duplicateInFile',
  'similarInFile',
  'duplicateInBank',
  'similarInBank',
  // maths
  'mathUnbalanced',
  'mathError',
  // lesson + visuals
  'blockTypeUnknown',
  'lessonConceptUnknown',
  'textMissing',
  'altMissing',
  'captionMissing',
  'svgMissing',
  'svgUnsafe',
  'svgTooBig',
  'svgTooManyElements',
  'imageOrSvg',
  'sceneLayerMissing',
  'sceneLayerUnknown',
  'sceneSteps',
  'sceneTooManyLayers',
  'stepTooLong',
  'widgetUnknown',
  'exprInvalid',
  'chartKind',
  'chartSeriesLength',
  'hotspotRange',
  'youtubeId',
  'transcriptMissing',
  'lottieUnsupported',
  'notExamSafe',
  'lessonExists',
] as const;
export type IssueCode = (typeof ISSUE_CODES)[number];

export interface Issue {
  severity: Severity;
  code: IssueCode;
  /** Where in the file, e.g. `questions[12].answer.correct`. */
  path: string;
  /** 0-based question index when the issue belongs to one question. */
  q?: number;
  /** Extra detail for the message: a key, a name, a number. Never prose. */
  detail?: string;
}

export interface Bi {
  en: string;
  ur: string;
}

export const IMPORTABLE_TYPES = ['mcq', 'true_false', 'numeric', 'short_text'] as const;
export type ImportableType = (typeof IMPORTABLE_TYPES)[number];

/** A question after parsing: bilingual text normalised to {en, ur}. */
export interface ParsedQuestion {
  index: number;
  concept: string;
  type: ImportableType;
  difficulty: 1 | 2 | 3;
  cognitive_level: 'recall' | 'understand' | 'apply' | 'analyze';
  marks: number;
  body: {
    stem: Bi;
    options?: { key: string; text: Bi }[];
    visual?: Record<string, unknown>;
  };
  answer: { correct: string | number | boolean; also?: string[] };
  explanation: (Bi & { why_wrong?: Record<string, Bi> }) | null;
  source: Record<string, unknown> | null;
  /** Both languages present for stem, options and explanation. */
  languageComplete: boolean;
}

export interface ParsedConcept {
  key: string;
  title_en: string;
  title_ur: string;
  requires: string[];
}

export interface ParsedLesson {
  kind: 'lesson' | 'alternative';
  /** Concept KEY from the file (alternatives), null for the main lesson. */
  concept: string | null;
  blocks: Record<string, unknown>[];
}

export interface ParsedFile {
  curriculum: string;
  className: string;
  subject: string;
  chapter: string;
  topic: { title_en: string; title_ur: string };
  concepts: ParsedConcept[];
  lessons: ParsedLesson[];
  /** Only the questions without errors; failing ones are in the report. */
  questions: ParsedQuestion[];
  testData: boolean;
}

export type QuestionStatus = 'ok' | 'error' | 'duplicate' | 'similar';

export interface QuestionRow {
  index: number;
  status: QuestionStatus;
  type: string;
  concept: string;
  /** First ~120 chars of the English (else Urdu) stem. */
  preview: string;
  /** Duplicate/similar: what it matched ("file:3" or a bank question id) and how close. */
  match?: { where: 'file' | 'bank'; ref: string; similarity: number; preview: string };
}

export interface ImportCounts {
  questions: number;
  ready: number;
  errors: number;
  duplicates: number;
  similar: number;
  warnings: number;
  concepts: number;
  lessonBlocks: number;
  mathExpressions: number;
}

export interface ImportReport {
  /** No errors anywhere outside individual questions (topic, concepts, lesson). */
  fileOk: boolean;
  counts: ImportCounts;
  issues: Issue[];
  rows: QuestionRow[];
  /** The main lesson and each alternative: imported only when `ok`. */
  lessons: {
    kind: 'lesson' | 'alternative';
    concept: string | null;
    blocks: number;
    ok: boolean;
  }[];
}
