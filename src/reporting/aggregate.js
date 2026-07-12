// Reporting aggregate math — the ONE place a student's assessment scores are
// rolled into a report card. Everything here is PURE: no React, no network, no
// Supabase. It takes plain shapes in and returns plain shapes out, so the exact
// numbers can be pinned by a check that runs on a laptop with no device and no
// database (see scripts/verify-report-aggregate.mjs, wired as `npm run
// verify:report`). A grade is the most consequential thing this app shows a
// child (CLAUDE.md rule 3, "verify math") — it must be trustworthy before anyone
// sees it, and it must be changeable in one file when the rules move.
//
// WHY ISOLATED: weightage rules WILL change (how a term rolls up, whether a
// missing test counts as zero, how categories are weighted). When they do, this
// module is the whole blast radius — the screen and the verification both read
// their numbers from here, so a rule change is one edit plus one re-run of the
// check, never a hunt through UI code.
//
// This module is ESM (matching the rest of src/), made runnable by plain `node`
// via the tiny `package.json` alongside it ({"type":"module"}), so the
// verification script can import it directly with no build step.

// The four cognitive levels a question can carry (questions.cognitive_level in
// db/setup.sql), lowest-to-highest order. "recall" is remembering a fact;
// everything above it needs conceptual work. Kept here as the single source of
// the ordering + the recall/conceptual split the report card reports on.
export const COGNITIVE_LEVELS = ['recall', 'understand', 'apply', 'analyze'];
export const CONCEPTUAL_LEVELS = ['understand', 'apply', 'analyze'];

// Round to a whole number (percentages are shown as integers across the app, e.g.
// StudentResultsScreen). Guards NaN/Infinity so a bad input can never leak a
// junk grade — it becomes null upstream instead.
function roundInt(n) {
  return Number.isFinite(n) ? Math.round(n) : null;
}

// A single assessment's percent: marks earned out of marks available, 0–100, or
// null when there's nothing honest to take a percent of — an ungraded submission
// (score null until a teacher grades it — setup.sql) or a zero-mark test. Kept
// separate so both the per-assessment view and the roll-up agree on one rule.
export function assessmentPercent(score, totalMarks) {
  if (score == null) return null;
  const total = Number(totalMarks);
  if (!Number.isFinite(total) || total <= 0) return null;
  return (Number(score) / total) * 100;
}

// Roll a set of assessment results into ONE weighted percent.
//
// items: [{ score, totalMarks, weightage }] — score null means "not marked yet".
//
// THE RULE (the part that will change): each MARKED assessment contributes its
// own percent, scaled by its weightage (assessments.weightage — its share of the
// annual total). The aggregate is the weight-weighted mean of those percents,
// normalised by the weight actually present:
//
//     aggregate = Σ(weightage_i · percent_i) / Σ(weightage_i)
//
// over the marked assessments only. Normalising by the weight present (not by a
// fixed 100) keeps the number HONEST while marking is in progress or the year is
// mid-way: unmarked and not-yet-created tests neither help nor hurt it, exactly
// like StudentResultsScreen's overall figure. If none of the marked assessments
// carry a weightage yet (a common early state — an admin hasn't set weights), it
// falls back to a plain mean of their percents so a real number still shows, and
// flags that with `weighted:false` so the UI can say so rather than mislead.
//
// Returns a fixed shape:
//   { percent, weighted, gradedCount, totalCount, ungradedCount, countedWeightage }
//   percent          — 0–100 integer, or null when nothing is marked yet
//   weighted         — true if weightage drove it, false if it fell back to a mean
//   gradedCount      — how many items were marked (fed the percent)
//   totalCount       — how many items there were
//   ungradedCount    — marked-yet-to-come (totalCount − gradedCount)
//   countedWeightage — Σ weightage of the marked, weighted items (0 on fallback)
export function weightedAggregate(items) {
  const list = Array.isArray(items) ? items : [];
  let weightedSum = 0; // Σ(w·pct) over weighted, marked items
  let weightUsed = 0; // Σ(w) over the same
  let plainSum = 0; // Σ(pct) over all marked items (fallback numerator)
  let gradedCount = 0;

  for (const it of list) {
    const pct = assessmentPercent(it?.score, it?.totalMarks);
    if (pct == null) continue; // not marked yet, or nothing to take a percent of
    gradedCount += 1;
    plainSum += pct;
    const w = Number(it?.weightage);
    if (Number.isFinite(w) && w > 0) {
      weightedSum += w * pct;
      weightUsed += w;
    }
  }

  let percent = null;
  let weighted = false;
  if (weightUsed > 0) {
    percent = roundInt(weightedSum / weightUsed);
    weighted = true;
  } else if (gradedCount > 0) {
    percent = roundInt(plainSum / gradedCount); // no weights set — honest mean
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

// How much of what was TESTED checked recall versus conceptual thinking — by
// MARKS, not question count, so a 5-mark reasoning question weighs more than a
// 1-mark recall one. This reports on the make-up of the tests a student sat, so a
// teacher/parent can see the balance (all recall? plenty of "apply"?), per
// CLAUDE.md rule 6 (every question is cognitive-tagged, so this is always
// answerable).
//
// questions: [{ cognitiveLevel, marks }] — every question across the assessments
// in the report. Unknown levels and non-positive marks are ignored rather than
// trusted.
//
// Returns:
//   { totalMarks, levels: [{ level, marks, share }], recall, conceptual }
//   levels    — one entry per COGNITIVE_LEVEL, in order, with its marks + %share
//   recall    — { marks, share } for the recall level alone
//   conceptual— { marks, share } for understand+apply+analyze combined
// The recall and conceptual shares are complementary (sum to 100 when anything
// was tested), so the two-way split never reads as 99% or 101% from rounding.
export function cognitiveBreakdown(questions) {
  const list = Array.isArray(questions) ? questions : [];
  const marksByLevel = { recall: 0, understand: 0, apply: 0, analyze: 0 };
  let totalMarks = 0;

  for (const q of list) {
    const level = q?.cognitiveLevel;
    const marks = Number(q?.marks);
    if (!(level in marksByLevel)) continue; // unknown/absent level — skip
    if (!Number.isFinite(marks) || marks <= 0) continue;
    marksByLevel[level] += marks;
    totalMarks += marks;
  }

  const shareOf = (marks) =>
    totalMarks > 0 ? roundInt((marks / totalMarks) * 100) : null;

  const levels = COGNITIVE_LEVELS.map((level) => ({
    level,
    marks: marksByLevel[level],
    share: shareOf(marksByLevel[level]),
  }));

  const recallMarks = marksByLevel.recall;
  const conceptualMarks = CONCEPTUAL_LEVELS.reduce(
    (sum, level) => sum + marksByLevel[level],
    0
  );
  const recallShare = shareOf(recallMarks);

  return {
    totalMarks,
    levels,
    recall: { marks: recallMarks, share: recallShare },
    // Complement of recall so the two-way split always totals 100 (no rounding
    // drift); null when nothing was tested.
    conceptual: {
      marks: conceptualMarks,
      share: recallShare == null ? null : 100 - recallShare,
    },
  };
}

// Assemble a full report card from a student's assessments for a period (a term
// or the whole year — the caller decides which assessments to pass in; the math
// is the same either way). This is the one function the screen and the
// verification both call.
//
// input: { assessments: [{
//   id, title, type,
//   subject: { id, name } | null,
//   weightage, totalMarks, score,          // score null = not marked yet
//   questions: [{ cognitiveLevel, marks }] // the questions on that assessment
// }] }
//
// Returns:
//   { overall, subjects, cognitive }
//   overall   — weightedAggregate over every assessment (the headline number)
//   subjects  — per-subject weightedAggregate, sorted by subject name, each also
//               carrying { id, name }; lets a report show strengths per subject
//   cognitive — cognitiveBreakdown over every question across all assessments
export function buildReport({ assessments } = {}) {
  const list = Array.isArray(assessments) ? assessments : [];

  const toItem = (a) => ({
    score: a?.score,
    totalMarks: a?.totalMarks,
    weightage: a?.weightage,
  });

  const overall = weightedAggregate(list.map(toItem));

  // Group by subject. A missing subject (join hidden by RLS, or unset) folds into
  // one "no subject" bucket keyed on null rather than being dropped, so its marks
  // still count toward the overall figure above and aren't silently lost.
  const bySubject = new Map();
  for (const a of list) {
    const id = a?.subject?.id ?? null;
    if (!bySubject.has(id)) {
      bySubject.set(id, { id, name: a?.subject?.name ?? null, items: [] });
    }
    bySubject.get(id).items.push(toItem(a));
  }
  const subjects = [...bySubject.values()]
    .map((s) => ({ id: s.id, name: s.name, ...weightedAggregate(s.items) }))
    .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));

  const allQuestions = [];
  for (const a of list) {
    for (const q of a?.questions ?? []) allQuestions.push(q);
  }
  const cognitive = cognitiveBreakdown(allQuestions);

  return { overall, subjects, cognitive };
}
