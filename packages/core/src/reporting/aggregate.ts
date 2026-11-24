// Report-card math: a student's assessment scores rolled into one weighted
// percent, per subject, plus the recall-vs-conceptual make-up of what was
// tested. Ported from the old app's src/reporting/aggregate.js (frozen there);
// behaviour is identical, pinned by test/reporting-aggregate.test.ts, which runs
// every case from scripts/verify-report-aggregate.mjs and compares against the
// old module on the same fixtures.
//
// Weightage rules WILL change (DECISIONS). When they do, this file is the whole
// blast radius: screens read their numbers from here, never compute their own.

import { COGNITIVE_LEVELS, type CognitiveLevel } from '../questions';

/** Everything above recall needs conceptual work. */
export const CONCEPTUAL_LEVELS = ['understand', 'apply', 'analyze'] as const;

type Num = number | string | null | undefined;

/** Whole-number percent; NaN/Infinity become null so junk never shows as a grade. */
function roundInt(n: number): number | null {
  return Number.isFinite(n) ? Math.round(n) : null;
}

/**
 * One assessment's percent (0–100, unrounded), or null when there's nothing
 * honest to take a percent of: not marked yet, or a zero/absent total.
 */
export function assessmentPercent(score: Num, totalMarks: Num): number | null {
  if (score == null) return null;
  const total = Number(totalMarks);
  if (!Number.isFinite(total) || total <= 0) return null;
  return (Number(score) / total) * 100;
}

export interface AggregateItem {
  score: Num;
  totalMarks: Num;
  weightage: Num;
}

export interface Aggregate {
  /** 0–100 integer, or null when nothing is marked yet. */
  percent: number | null;
  /** True if weightage drove it; false when it fell back to a plain mean. */
  weighted: boolean;
  gradedCount: number;
  totalCount: number;
  ungradedCount: number;
  /** Σ weightage of the marked, weighted items (0 on fallback). */
  countedWeightage: number;
}

/**
 * aggregate = Σ(wᵢ·pctᵢ) / Σ(wᵢ) over MARKED items with a positive weight.
 * Normalising by the weight present keeps it honest mid-year: unmarked tests
 * neither help nor hurt. With no weights set at all, falls back to the plain
 * mean of the marked percents and says so (`weighted: false`).
 */
export function weightedAggregate(
  items: readonly (AggregateItem | null | undefined)[] | null | undefined,
): Aggregate {
  const list = Array.isArray(items) ? items : [];
  let weightedSum = 0;
  let weightUsed = 0;
  let plainSum = 0;
  let gradedCount = 0;

  for (const it of list) {
    const pct = assessmentPercent(it?.score, it?.totalMarks);
    if (pct == null) continue;
    gradedCount += 1;
    plainSum += pct;
    const w = Number(it?.weightage);
    if (Number.isFinite(w) && w > 0) {
      weightedSum += w * pct;
      weightUsed += w;
    }
  }

  let percent: number | null = null;
  let weighted = false;
  if (weightUsed > 0) {
    percent = roundInt(weightedSum / weightUsed);
    weighted = true;
  } else if (gradedCount > 0) {
    percent = roundInt(plainSum / gradedCount);
  }

  return {
    percent,
    weighted,
    gradedCount,
    totalCount: list.length,
    ungradedCount: list.length - gradedCount,
    countedWeightage: roundInt(weightUsed) ?? 0,
  };
}

export interface CognitiveQuestion {
  cognitiveLevel: string | null | undefined;
  marks: Num;
}

export interface Share {
  marks: number;
  share: number | null;
}

export interface CognitiveBreakdown {
  totalMarks: number;
  levels: ({ level: CognitiveLevel } & Share)[];
  recall: Share;
  /** Complement of recall, so the two-way split always totals 100. */
  conceptual: Share;
}

/**
 * How much of what was tested checked recall vs conceptual thinking, by MARKS.
 * Unknown levels and non-positive marks are ignored.
 */
export function cognitiveBreakdown(
  questions: readonly (CognitiveQuestion | null | undefined)[] | null | undefined,
): CognitiveBreakdown {
  const list = Array.isArray(questions) ? questions : [];
  const marksByLevel: Record<CognitiveLevel, number> = {
    recall: 0,
    understand: 0,
    apply: 0,
    analyze: 0,
  };
  let totalMarks = 0;

  for (const q of list) {
    const level = q?.cognitiveLevel;
    const marks = Number(q?.marks);
    if (typeof level !== 'string' || !Object.prototype.hasOwnProperty.call(marksByLevel, level))
      continue;
    if (!Number.isFinite(marks) || marks <= 0) continue;
    marksByLevel[level as CognitiveLevel] += marks;
    totalMarks += marks;
  }

  const shareOf = (marks: number) => (totalMarks > 0 ? roundInt((marks / totalMarks) * 100) : null);

  const levels = COGNITIVE_LEVELS.map((level) => ({
    level,
    marks: marksByLevel[level],
    share: shareOf(marksByLevel[level]),
  }));
  const recallMarks = marksByLevel.recall;
  const conceptualMarks = CONCEPTUAL_LEVELS.reduce((sum, l) => sum + marksByLevel[l], 0);
  const recallShare = shareOf(recallMarks);

  return {
    totalMarks,
    levels,
    recall: { marks: recallMarks, share: recallShare },
    conceptual: {
      marks: conceptualMarks,
      share: recallShare == null ? null : 100 - recallShare,
    },
  };
}

export interface ReportAssessment {
  id: string;
  title?: string;
  type?: string;
  subject: { id: string; name: string } | null;
  weightage: Num;
  totalMarks: Num;
  /** null = not marked yet. */
  score: Num;
  questions?: readonly CognitiveQuestion[];
}

export interface SubjectAggregate extends Aggregate {
  id: string | null;
  name: string | null;
}

export interface Report {
  overall: Aggregate;
  /** Sorted by subject name; a missing subject folds into one null bucket. */
  subjects: SubjectAggregate[];
  cognitive: CognitiveBreakdown;
}

/** A full report card for whatever period the caller passes in. */
export function buildReport({
  assessments,
}: { assessments?: readonly ReportAssessment[] } = {}): Report {
  const list = Array.isArray(assessments) ? assessments : [];
  const toItem = (a: ReportAssessment): AggregateItem => ({
    score: a?.score,
    totalMarks: a?.totalMarks,
    weightage: a?.weightage,
  });

  const overall = weightedAggregate(list.map(toItem));

  const bySubject = new Map<
    string | null,
    { id: string | null; name: string | null; items: AggregateItem[] }
  >();
  for (const a of list) {
    const id = a?.subject?.id ?? null;
    let bucket = bySubject.get(id);
    if (!bucket) {
      bucket = { id, name: a?.subject?.name ?? null, items: [] };
      bySubject.set(id, bucket);
    }
    bucket.items.push(toItem(a));
  }
  const subjects = [...bySubject.values()]
    .map((s) => ({ id: s.id, name: s.name, ...weightedAggregate(s.items) }))
    .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));

  const allQuestions: CognitiveQuestion[] = [];
  for (const a of list) for (const q of a?.questions ?? []) allQuestions.push(q);

  return { overall, subjects, cognitive: cognitiveBreakdown(allQuestions) };
}
