// Follow-ups, gates and the Prepare tab (LMS_AUDIT §3.5, prompt 41).
//
//   prepareModel(followUps, now)        → "Do these first", recently done, exam block
//   gateFor(topic, open, positions)     → is a new topic open or paused, and why
//   subjectMosaics(concepts, bands)     → Home's subject mosaics from concepts
//   roundPreview(answers, cfg)          → what this follow-up round will likely do
//
// The server owns follow-ups (db/019 opens, counts, clears and relieves them;
// db/034 lets a teacher relax or restore one). This file only decides what the
// learner sees. Pure: no React, no I/O.
import { MASTERY_DEFAULTS, type MasteryConfig, type MasteryState } from './mastery';

export type FollowUpKind = 'exam' | 'diagnostic' | 'teacher' | 'revision';
export type FollowUpStatus = 'open' | 'cleared' | 'relieved' | 'cancelled';

export interface FollowUpView {
  id: string;
  conceptId: string;
  subjectId: string;
  /** The concept's topic (null if the concept has gone). */
  topicId: string | null;
  kind: FollowUpKind;
  status: FollowUpStatus;
  rounds: number;
  createdAt: string;
  closedAt: string | null;
  closeReason: string | null;
}

/** Where a topic sits in its subject (chapter order, then topic order). */
export interface TopicPos {
  topicId: string;
  subjectId: string;
  chapterOrder: number;
  topicOrder: number;
}

/** Exam first (it blocks Prepare), then diagnostic (blocks within a subject), then teacher, revision. */
export const FOLLOW_UP_ORDER: Readonly<Record<FollowUpKind, number>> = {
  exam: 0,
  diagnostic: 1,
  teacher: 2,
  revision: 3,
};

/** Kinds that hold new topics back. Teacher-set and revision work never blocks. */
export const BLOCKING_KINDS: readonly FollowUpKind[] = ['exam', 'diagnostic'];

/** Questions in one follow-up round (wireframe 7.2: "6 Qs"). */
export const FOLLOW_UP_SET_SIZE = 6;

/** Rounds after which "Explain it another way" leads (the first way didn't land). */
export const ANOTHER_WAY_AFTER = 2;

/** How long a cleared / relieved follow-up stays on Prepare as "Done". */
export const RECENT_DAYS = 7;

const DAY = 24 * 60 * 60 * 1000;

export interface PrepareModel {
  /** Open follow-ups, exam → diagnostic → teacher → revision, oldest first within a kind. */
  doFirst: FollowUpView[];
  /** Any open exam follow-up: other Prepare work waits (tests don't). */
  examBlocks: boolean;
  /** Closed in the last RECENT_DAYS, newest first: shown dimmed as Done / Unlocked. */
  recent: FollowUpView[];
  /** Some were relieved automatically lately: say "We unlocked this for you". */
  autoUnlocked: number;
  /** Some were relaxed by a teacher lately. */
  teacherUnlocked: number;
}

export function prepareModel(
  followUps: readonly FollowUpView[],
  now: number,
  recentDays = RECENT_DAYS,
): PrepareModel {
  const open = followUps
    .filter((f) => f.status === 'open')
    .sort(
      (a, b) =>
        FOLLOW_UP_ORDER[a.kind] - FOLLOW_UP_ORDER[b.kind] ||
        Date.parse(a.createdAt) - Date.parse(b.createdAt) ||
        (a.id < b.id ? -1 : 1),
    );
  const since = now - recentDays * DAY;
  const recent = followUps
    .filter(
      (f) =>
        (f.status === 'cleared' || f.status === 'relieved') &&
        f.closedAt !== null &&
        Date.parse(f.closedAt) >= since,
    )
    .sort((a, b) => Date.parse(b.closedAt!) - Date.parse(a.closedAt!));
  return {
    doFirst: open,
    examBlocks: open.some((f) => f.kind === 'exam'),
    recent,
    autoUnlocked: recent.filter(
      (f) => f.status === 'relieved' && (f.closeReason ?? '').startsWith('auto_relief'),
    ).length,
    teacherUnlocked: recent.filter(
      (f) => f.status === 'relieved' && (f.closeReason ?? '').startsWith('teacher'),
    ).length,
  };
}

export type Gate =
  { state: 'open' } | { state: 'paused'; by: 'exam' | 'diagnostic'; followUpIds: string[] };

const before = (a: TopicPos, b: TopicPos) =>
  a.chapterOrder < b.chapterOrder ||
  (a.chapterOrder === b.chapterOrder && a.topicOrder < b.topicOrder);

/**
 * The gate (TEST_PLAN F-3), never a trap:
 * - a topic that holds one of the learner's open follow-ups is always open
 *   (its lesson is how you clear it);
 * - an open EXAM follow-up pauses every other new topic in Prepare;
 * - an open DIAGNOSTIC follow-up pauses only later topics of the SAME subject;
 * - teacher-set and revision follow-ups never pause anything.
 * Relief (automatic or a teacher's relax) closes the follow-up, so the gate lifts.
 */
export function gateFor(
  topic: TopicPos,
  open: readonly FollowUpView[],
  positions: ReadonlyMap<string, TopicPos>,
): Gate {
  const live = open.filter((f) => f.status === 'open');
  if (live.some((f) => f.topicId === topic.topicId)) return { state: 'open' };
  const exam = live.filter((f) => f.kind === 'exam');
  if (exam.length) return { state: 'paused', by: 'exam', followUpIds: exam.map((f) => f.id) };
  const diag = live.filter((f) => {
    if (f.kind !== 'diagnostic' || f.subjectId !== topic.subjectId || !f.topicId) return false;
    const at = positions.get(f.topicId);
    // Unknown position (topic not listed): pause nothing rather than everything.
    return at ? before(at, topic) : false;
  });
  if (diag.length) return { state: 'paused', by: 'diagnostic', followUpIds: diag.map((f) => f.id) };
  return { state: 'open' };
}

/** The follow-up flow (prompt 41): re-read → another way after 2 rounds → fresh questions. */
export function followUpSteps(
  f: Pick<FollowUpView, 'rounds'>,
): ('read' | 'another' | 'practise')[] {
  return f.rounds >= ANOTHER_WAY_AFTER ? ['another', 'read', 'practise'] : ['read', 'practise'];
}

export type RoundPreview = 'pass' | 'notYet' | 'tooFew';

/**
 * What the server will most likely do with this round (db/019): ≥ masteredPct
 * right on ≥ roundMin items of the concept clears it. A preview only: the
 * server re-marks and decides.
 */
export function roundPreview(
  answers: readonly { correct: boolean }[],
  cfg: Pick<MasteryConfig, 'roundMin' | 'masteredPct'> = MASTERY_DEFAULTS,
): RoundPreview {
  const n = answers.length;
  if (n < cfg.roundMin) return 'tooFew';
  const right = answers.filter((a) => a.correct).length;
  return right * 100 >= cfg.masteredPct * n ? 'pass' : 'notYet';
}

export type SubjectBand = 'learning' | 'weak' | 'mastered';

export interface SubjectMosaic {
  subjectId: string;
  total: number;
  mastered: number;
  weak: number;
  /** Shown on the card: needs work if any concept is weak, got it when all mastered. */
  band: SubjectBand | null;
}

/**
 * Home's subject mosaics (DECISIONS #33, #94): one tile per active concept,
 * set when mastered. A subject with no concepts yet returns nothing (Home then
 * keeps the tests view for it). No band until something was practised.
 */
export function subjectMosaics(
  concepts: readonly { id: string; subjectId: string }[],
  bands: ReadonlyMap<string, MasteryState>,
): Map<string, SubjectMosaic> {
  const out = new Map<string, SubjectMosaic & { touched: boolean }>();
  for (const c of concepts) {
    const m = out.get(c.subjectId) ?? {
      subjectId: c.subjectId,
      total: 0,
      mastered: 0,
      weak: 0,
      band: null,
      touched: false,
    };
    m.total += 1;
    const b = bands.get(c.id);
    if (b) m.touched = true;
    if (b === 'mastered') m.mastered += 1;
    if (b === 'weak') m.weak += 1;
    out.set(c.subjectId, m);
  }
  const res = new Map<string, SubjectMosaic>();
  for (const [k, m] of out) {
    const band: SubjectBand | null = !m.touched
      ? null
      : m.weak > 0
        ? 'weak'
        : m.mastered === m.total
          ? 'mastered'
          : 'learning';
    res.set(k, {
      subjectId: m.subjectId,
      total: m.total,
      mastered: m.mastered,
      weak: m.weak,
      band,
    });
  }
  return res;
}
