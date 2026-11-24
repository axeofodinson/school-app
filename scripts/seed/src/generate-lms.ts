// LMS part (needs db/017): curriculum tree, question bank, lessons, approvals,
// and three months of simulated learner history (practice attempts, mastery,
// follow-ups, past live exams). Pure: no database access. Learner ids are the
// students' profile ids, which only exist after provisioning, so they come in
// as a map; every other id is derived from stable names.
import type { IdFn } from './uuid.ts';
import { rng, type Rng } from './rng.ts';
import type { CoreData } from './generate-core.ts';
import { CURRICULUM_CODE } from './markers.ts';
import { SPEC } from './spec.ts';

type Json = Record<string, unknown>;
type Row = Record<string, unknown>;

const COG = ['recall', 'understand', 'apply', 'analyze'] as const;
const OPTION_KEYS = ['A', 'B', 'C', 'D'] as const;
const OPTION_UR = ['الف', 'ب', 'ج', 'د'] as const;
const URDU_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ur = (n: number | string): string => String(n).replace(/\d/g, (d) => URDU_DIGITS[Number(d)]!);

const DAY = 86_400_000;
const iso = (ms: number): string => new Date(ms).toISOString();

/** Small, sanitiser-safe inline SVG (no script, no external refs). */
function mathSvg(latex: string): string {
  const safe = latex.replace(/[<>&"]/g, '');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 40" data-latex="${safe}">` +
    `<text x="8" y="26" font-family="serif" font-size="18">${safe}</text></svg>`
  );
}
function diagramSvg(label: string): string {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 120">' +
    '<rect x="10" y="10" width="180" height="100" rx="8" fill="none" stroke="currentColor"/>' +
    '<line x1="20" y1="100" x2="180" y2="30" stroke="currentColor" stroke-width="3"/>' +
    `<text x="20" y="28" font-size="12">${label.replace(/[<>&"]/g, '')}</text></svg>`
  );
}

interface QMeta {
  id: string;
  conceptId: string;
  topicId: string;
  subjectName: string;
  chapterIdx: number;
  type: 'mcq' | 'true_false' | 'numeric';
  difficulty: number;
  correct: string | number;
}

export interface LmsData {
  curriculum: Row;
  chapters: Row[];
  topics: Row[];
  concepts: Row[];
  prerequisites: Row[];
  questions: Row[];
  learningContent: Row[];
  contentVersions: Row[];
  approvals: Row[];
  practiceAttempts: Row[];
  conceptMastery: Row[];
  followUps: Row[];
  assessments: Row[];
  assessmentQuestions: Row[];
  examSessions: Row[];
  examAnswers: Row[];
  examEvents: Row[];
}

export interface LmsOptions {
  /** "now" for the simulated history (ISO). History covers the 90 days before it. */
  anchor: string;
  /** students.id → profiles.id (their login), from provisioning. */
  learnerByStudent: Map<string, string>;
}

export function generateLms(id: IdFn, core: CoreData, opts: LmsOptions): LmsData {
  const L = SPEC.lms;
  const anchorMs = Date.parse(opts.anchor);
  if (Number.isNaN(anchorMs)) throw new Error(`bad anchor ${opts.anchor}`);
  const startMs = anchorMs - L.historyDays * DAY;
  const adminId = core.admin.id;

  const lmsClasses = core.classes.filter((c) => core.classMeta.get(c.id)?.gradeKey === L.gradeKey);
  const homeClass = lmsClasses[0];
  if (!homeClass) throw new Error('LMS pilot class missing');
  const subjectOf = (classId: string, name: string): string => {
    const s = core.subjects.find((x) => x.class_id === classId && x.name === name);
    if (!s) throw new Error(`subject ${name} missing for class ${classId}`);
    return s.id;
  };
  const teacherFor = (classId: string, subjectId: string): string =>
    core.teacherAssignments.find((t) => t.class_id === classId && t.subject_id === subjectId)
      ?.teacher_id ?? adminId;

  const curriculum: Row = {
    id: id('curriculum', CURRICULUM_CODE),
    code: CURRICULUM_CODE,
    board: 'Punjab Textbook Board (TEST)',
    name: 'TEST placeholder curriculum',
    effective_from: '2026-04-01',
    status: 'active',
  };

  const chapters: Row[] = [];
  const topics: Row[] = [];
  const concepts: Row[] = [];
  const prerequisites: Row[] = [];
  const questions: Row[] = [];
  const learningContent: Row[] = [];
  const contentVersions: Row[] = [];
  const approvals: Row[] = [];
  const qBySubject = new Map<string, QMeta[]>();
  const qByConcept = new Map<string, QMeta[]>();
  const topicsBySubject = new Map<string, { id: string; concepts: string[] }[]>();
  /** concept id → home subject id (follow-up gate scope) */
  const conceptSubject = new Map<string, string>();
  const approve = (kind: 'question' | 'content', itemId: string, scope: string): void => {
    approvals.push({
      id: id('approval', kind, itemId, scope),
      item_kind: kind,
      item_id: itemId,
      version: 1,
      scope,
      approved_by: adminId,
      note: 'TEST seed',
    });
  };

  L.subjects.forEach((subjectName, si) => {
    const subjectId = subjectOf(homeClass.id, subjectName);
    const subjectTopics: { id: string; concepts: string[] }[] = [];
    let prevConcept: string | null = null;
    for (let ch = 1; ch <= L.chaptersPerSubject; ch++) {
      const chapterId = id('chapter', subjectName, ch);
      chapters.push({
        id: chapterId,
        subject_id: subjectId,
        title: `TEST ${subjectName} chapter ${ch}`,
        title_ur: `ٹیسٹ باب ${ur(ch)}`,
        textbook_ref: `TEST p.${ch * 10}`,
        curriculum_id: curriculum.id,
        status: 'active',
        sort_order: ch,
      });
      for (let tp = 1; tp <= L.topicsPerChapter; tp++) {
        const topicId = id('topic', subjectName, ch, tp);
        const code = `${ch}.${tp}`;
        topics.push({
          id: topicId,
          chapter_id: chapterId,
          title_en: `TEST topic ${code}`,
          title_ur: `ٹیسٹ موضوع ${ur(code)}`,
          sort_order: tp,
          status: 'active',
          is_test_data: true,
        });
        const conceptIds: string[] = [];
        for (let cn = 1; cn <= L.conceptsPerTopic; cn++) {
          const conceptId = id('concept', subjectName, ch, tp, cn);
          conceptIds.push(conceptId);
          conceptSubject.set(conceptId, subjectId);
          concepts.push({
            id: conceptId,
            topic_id: topicId,
            title_en: `TEST concept ${code}.${cn}`,
            title_ur: `ٹیسٹ تصور ${ur(`${code}.${cn}`)}`,
            summary_en: 'Placeholder summary for testing.',
            summary_ur: 'ٹیسٹ کے لیے خلاصہ۔',
            sort_order: cn,
            status: 'active',
            is_test_data: true,
          });
          if (prevConcept) {
            prerequisites.push({ concept_id: conceptId, requires_concept_id: prevConcept });
          }
          prevConcept = conceptId;
        }
        subjectTopics.push({ id: topicId, concepts: conceptIds });

        // Questions: ~90 per topic, spread over the topic's concepts.
        for (let i = 0; i < L.questionsPerTopic; i++) {
          const qId = id('question', subjectName, ch, tp, i);
          const conceptId = conceptIds[i % conceptIds.length]!;
          const r = rng(`q:${qId}`);
          const slot = i % 20;
          const type: QMeta['type'] = slot < 3 ? 'true_false' : slot < 6 ? 'numeric' : 'mcq';
          const difficulty = 1 + (i % 3);
          const n = i + 1;
          const body: Json = {
            stem: {
              en: `[TEST] ${subjectName} ${code}, question ${n}: placeholder stem.`,
              ur: `[ٹیسٹ] ${subjectName} ${ur(code)}، سوال ${ur(n)}: نمونہ سوال۔`,
            },
          };
          let correct: string | number;
          if (type === 'mcq') {
            correct = r.pick(OPTION_KEYS);
            body.options = OPTION_KEYS.map((k, oi) => ({
              key: k,
              text: { en: `Option ${k}`, ur: `جواب ${OPTION_UR[oi]}` },
            }));
          } else if (type === 'true_false') {
            correct = r.pick(['T', 'F']);
            body.options = [
              { key: 'T', text: { en: 'True', ur: 'درست' } },
              { key: 'F', text: { en: 'False', ur: 'غلط' } },
            ];
          } else {
            correct = r.int(2, 99);
            body.unit = 'm';
          }
          if (i % 10 === 7) {
            body.math_svg = { stem: mathSvg(`x^2 + ${n}x = ${n * 2}`) };
          }
          if (i % 20 === 11) {
            body.figure = {
              type: 'figure',
              alt: { en: 'Placeholder diagram', ur: 'نمونہ خاکہ' },
              svg: diagramSvg(`TEST ${code}`),
            };
          }
          questions.push({
            id: qId,
            chapter_id: chapterId,
            concept_id: conceptId,
            type,
            cognitive_level: COG[Math.floor(i / 4) % COG.length],
            difficulty,
            body,
            answer: { correct },
            explanation: { en: 'Placeholder explanation.', ur: 'نمونہ وضاحت۔' },
            default_marks: 1,
            status: 'approved',
            current_version: 1,
            origin: 'human',
            source: { book: 'TEST', page: ch * 10 + tp },
            language_complete: true,
            created_by: adminId,
            is_test_data: true,
          });
          approve('question', qId, 'practice');
          approve('question', qId, 'exam');
          const meta: QMeta = {
            id: qId,
            conceptId,
            topicId,
            subjectName,
            chapterIdx: ch,
            type,
            difficulty,
            correct,
          };
          qBySubject.set(subjectName, [...(qBySubject.get(subjectName) ?? []), meta]);
          const list = qByConcept.get(conceptId) ?? [];
          list.push(meta);
          qByConcept.set(conceptId, list);
        }

        // One placeholder lesson per topic.
        const contentId = id('lesson', topicId);
        const firstQ = id('question', subjectName, ch, tp, 0);
        const blocks: Json[] = [
          {
            type: 'objectives',
            concept_id: null,
            en: '- TEST objective one\n- TEST objective two',
            ur: '- ٹیسٹ مقصد ایک\n- ٹیسٹ مقصد دو',
          },
          {
            type: 'figure',
            concept_id: conceptIds[0],
            alt: { en: 'Placeholder picture', ur: 'نمونہ تصویر' },
            svg: diagramSvg(`TEST lesson ${code}`),
            hotspots: [{ x: 0.3, y: 0.5, label: { en: 'Here', ur: 'یہاں' } }],
          },
          ...conceptIds.map((cid, k) => ({
            type: 'simple',
            concept_id: cid,
            en: `TEST explanation of concept ${code}.${k + 1}.`,
            ur: `ٹیسٹ تصور ${ur(`${code}.${k + 1}`)} کی وضاحت۔`,
          })),
          { type: 'quick_check', concept_id: conceptIds[0], en: '', ur: '', question_id: firstQ },
          { type: 'summary', concept_id: null, en: 'TEST summary.', ur: 'ٹیسٹ خلاصہ۔' },
        ];
        if (si === 1 && ch === 1 && tp === 1) {
          blocks.splice(2, 0, {
            type: 'video',
            concept_id: conceptIds[0],
            alt: { en: 'Placeholder video', ur: 'نمونہ ویڈیو' },
            youtube_id: 'aqz-KE-bpKQ',
            transcript: { en: 'TEST transcript.', ur: 'ٹیسٹ متن۔' },
            offline_fallback_block: 1,
          });
        }
        learningContent.push({
          id: contentId,
          topic_id: topicId,
          kind: 'lesson',
          current_version: 1,
          status: 'approved',
          origin: 'human',
          created_by: adminId,
          is_test_data: true,
        });
        contentVersions.push({ content_id: contentId, version: 1, blocks, created_by: adminId });
        approve('content', contentId, 'learn');
      }
    }
    topicsBySubject.set(subjectName, subjectTopics);
  });

  // ---------------------------------------------------------------- history
  const practiceAttempts: Row[] = [];
  const conceptMastery: Row[] = [];
  const followUps: Row[] = [];
  const assessments: Row[] = [];
  const assessmentQuestions: Row[] = [];
  const examSessions: Row[] = [];
  const examAnswers: Row[] = [];
  const examEvents: Row[] = [];

  const qById = new Map<string, QMeta>();
  for (const list of qBySubject.values()) for (const q of list) qById.set(q.id, q);

  const wrongAnswer = (q: QMeta, r: Rng): string | number => {
    if (q.type === 'numeric') return (q.correct as number) + r.int(1, 9);
    const keys = q.type === 'mcq' ? OPTION_KEYS : (['T', 'F'] as const);
    return r.pick(keys.filter((k) => k !== q.correct));
  };

  const learners = core.enrollments
    .filter((e) => lmsClasses.some((c) => c.id === e.class_id))
    .map((e) => ({ enrollment: e, learnerId: opts.learnerByStudent.get(e.student_id) }))
    .filter((x): x is { enrollment: (typeof x)['enrollment']; learnerId: string } => !!x.learnerId);

  const ability = new Map<string, number>();
  for (const { learnerId, enrollment } of learners) {
    ability.set(learnerId, 0.45 + rng(`ability:${enrollment.student_id}`).next() * 0.45);
  }

  interface Stat {
    n: number;
    c: number;
    distinct: Set<string>;
    byDiff: Record<string, [number, number]>;
    last: number;
    masteredAt: number | null;
    reviewStage: number;
    nextReview: number | null;
  }
  interface OpenFU {
    id: string;
    row: Row;
  }

  for (const { learnerId, enrollment } of learners) {
    const key = enrollment.student_id;
    const r = rng(`history:${key}`);
    const ab = ability.get(learnerId)!;
    const stats = new Map<string, Stat>();
    const openDiag = new Map<string, OpenFU>(); // concept → open diagnostic follow-up
    const topicIdx: Record<string, number> = {};
    const diagnosed = new Set<string>();
    let fuSeq = 0;

    const stat = (cid: string): Stat => {
      let s = stats.get(cid);
      if (!s) {
        s = {
          n: 0,
          c: 0,
          distinct: new Set(),
          byDiff: {},
          last: 0,
          masteredAt: null,
          reviewStage: 0,
          nextReview: null,
        };
        stats.set(cid, s);
      }
      return s;
    };
    const answer = (q: QMeta, at: number): Json => {
      const s = stat(q.conceptId);
      const p = Math.min(
        0.97,
        Math.max(0.1, ab + Math.min(s.n, 12) * 0.015 - (q.difficulty - 2) * 0.1),
      );
      const ok = r.chance(p);
      s.n++;
      if (ok) s.c++;
      s.distinct.add(q.id);
      const d = `d${q.difficulty}`;
      const bd = s.byDiff[d] ?? [0, 0];
      s.byDiff[d] = [bd[0] + 1, bd[1] + (ok ? 1 : 0)];
      s.last = at;
      if (!s.masteredAt && s.n >= 6 && s.c / s.n >= 0.75) {
        s.masteredAt = at;
        s.reviewStage = 1;
        s.nextReview = at + 7 * DAY;
      }
      return {
        q: q.id,
        v: 1,
        a: ok ? q.correct : wrongAnswer(q, r),
        c: ok,
        ms: r.int(4000, 30000),
      };
    };
    const pickQs = (pool: QMeta[], n: number): QMeta[] => r.shuffle(pool).slice(0, n);

    for (let k = 0; k < L.attemptsPerLearner; k++) {
      const day = (k * L.historyDays) / L.attemptsPerLearner + r.next() * 2;
      const started = Math.min(anchorMs - DAY / 4, startMs + day * DAY + r.int(3, 15) * 3_600_000);
      const subjectName = L.subjects[k % L.subjects.length]!;
      const subjectTopics = topicsBySubject.get(subjectName)!;
      const ti = Math.min(topicIdx[subjectName] ?? 0, subjectTopics.length - 1);
      const topic = subjectTopics[ti]!;
      const attemptId = id('attempt', key, k);
      let kind: string;
      let items: Json[];
      let followUpId: string | null = null;

      const dueReview = [...stats.entries()].find(
        ([, s]) => s.nextReview !== null && s.nextReview <= started && s.reviewStage < 3,
      );
      const openHere = [...openDiag.entries()].find(
        ([cid]) => conceptSubject.get(cid) === subjectOf(homeClass.id, subjectName),
      );

      if (!diagnosed.has(topic.id)) {
        kind = 'diagnostic';
        items = topic.concepts
          .flatMap((cid) => pickQs(qByConcept.get(cid)!, 3))
          .map((q) => answer(q, started));
        diagnosed.add(topic.id);
      } else if (openHere && r.chance(0.7)) {
        kind = 'followup';
        const [cid, fu] = openHere;
        followUpId = fu.id;
        items = pickQs(qByConcept.get(cid)!, 6).map((q) => answer(q, started));
      } else if (dueReview && r.chance(0.5)) {
        kind = 'revision';
        items = pickQs(qByConcept.get(dueReview[0])!, 6).map((q) => answer(q, started));
      } else {
        kind = 'practice';
        items = pickQs(
          topic.concepts.flatMap((cid) => qByConcept.get(cid)!),
          10,
        ).map((q) => answer(q, started));
      }
      const nCorrect = items.filter((it) => it.c).length;
      const finished = started + items.reduce((acc, it) => acc + (it.ms as number), 0);
      practiceAttempts.push({
        id: attemptId,
        learner_id: learnerId,
        kind,
        topic_id: topic.id,
        follow_up_id: followUpId,
        started_at: iso(started),
        finished_at: iso(finished),
        items,
        n_correct: nCorrect,
        n_total: items.length,
        device_id: `test-device-${r.int(1, 40)}`,
        received_at: iso(finished + r.int(1, 120) * 1000),
        is_test_data: true,
      });

      // Consequences of the attempt.
      if (kind === 'diagnostic') {
        for (const cid of topic.concepts) {
          const mine = items.filter((it) => qById.get(it.q as string)?.conceptId === cid);
          const acc = mine.filter((it) => it.c).length / Math.max(1, mine.length);
          if (acc < 0.5 && !openDiag.has(cid)) {
            const fuId = id('follow_up', key, cid, 'diagnostic', fuSeq++);
            const row: Row = {
              id: fuId,
              learner_id: learnerId,
              concept_id: cid,
              subject_id: conceptSubject.get(cid),
              kind: 'diagnostic',
              status: 'open',
              source_attempt_id: attemptId,
              rounds: 0,
              created_at: iso(finished),
              updated_at: iso(finished),
            };
            followUps.push(row);
            openDiag.set(cid, { id: fuId, row });
          }
        }
      } else if (kind === 'followup' && openHere) {
        const [cid, fu] = openHere;
        fu.row.rounds = (fu.row.rounds as number) + 1;
        fu.row.updated_at = iso(finished);
        if (nCorrect / items.length >= 0.67) {
          fu.row.status = 'cleared';
          fu.row.closed_at = iso(finished);
          fu.row.close_reason = 'mastered';
          openDiag.delete(cid);
        }
      } else if (kind === 'revision' && dueReview) {
        const s = dueReview[1];
        if (nCorrect / items.length >= 0.67) {
          s.reviewStage++;
          s.nextReview = s.reviewStage >= 3 ? null : started + 30 * DAY;
        } else {
          s.nextReview = started + 3 * DAY;
        }
      } else if (kind === 'practice') {
        const acc =
          topic.concepts.map((cid) => stat(cid)).reduce((a, s) => a + s.c / Math.max(1, s.n), 0) /
          topic.concepts.length;
        if (acc >= 0.65) topicIdx[subjectName] = ti + 1;
      }
    }

    for (const [cid, s] of stats) {
      const acc = s.c / Math.max(1, s.n);
      const state = s.masteredAt ? 'mastered' : s.n >= 3 && acc < 0.5 ? 'weak' : 'learning';
      conceptMastery.push({
        learner_id: learnerId,
        concept_id: cid,
        state,
        n_attempted: s.n,
        n_correct: s.c,
        n_distinct_q: s.distinct.size,
        evidence: s.byDiff,
        last_attempt_at: iso(s.last),
        mastered_at: s.masteredAt ? iso(s.masteredAt) : null,
        next_review_at: s.nextReview ? iso(s.nextReview) : null,
        review_stage: s.masteredAt ? Math.min(2, s.reviewStage) : 0,
        updated_at: iso(s.last),
      });
    }
  }

  // ------------------------------------------------------------ past exams
  const openExamFU = new Set<string>(); // learner:concept
  for (const cls of lmsClasses) {
    const classLearners = learners.filter((l) => l.enrollment.class_id === cls.id);
    for (let e = 0; e < L.pastExamsPerSection; e++) {
      const subjectName = L.subjects[e % L.subjects.length]!;
      const subjectId = subjectOf(cls.id, subjectName);
      const r = rng(`exam:${cls.id}:${e}`);
      const opens = startMs + (8 + e * 8) * DAY + 4 * 3_600_000; // 09:00 PKT
      const closes = opens + 45 * 60_000;
      const assessmentId = id('assessment', cls.id, 'exam', e);
      const maxChapter = 1 + Math.floor(e / L.subjects.length);
      const pool = qBySubject.get(subjectName)!.filter((q) => q.chapterIdx <= maxChapter);
      const paperQs = r.shuffle(pool).slice(0, L.questionsPerExam);
      assessments.push({
        id: assessmentId,
        year_id: core.year.id,
        class_id: cls.id,
        subject_id: subjectId,
        title: `TEST ${subjectName} quiz ${e + 1}`,
        type: 'test',
        weightage: 0,
        total_marks: paperQs.length,
        scheduled_on: iso(opens).slice(0, 10),
        status: 'closed',
        created_by: teacherFor(cls.id, subjectId),
        mode: 'live_exam',
        duration_seconds: 1800,
        opens_at: iso(opens),
        closes_at: iso(closes),
        settings: { grace_seconds: 30 },
        blueprint: { chapters: maxChapter, count: paperQs.length },
      });
      paperQs.forEach((q, i) =>
        assessmentQuestions.push({
          assessment_id: assessmentId,
          question_id: q.id,
          marks: 1,
          sort_order: i,
          question_version: 1,
        }),
      );
      for (const { learnerId, enrollment } of classLearners) {
        const sr = rng(`session:${assessmentId}:${enrollment.student_id}`);
        if (sr.chance(0.03)) continue; // absent
        const sessionId = id('exam_session', assessmentId, enrollment.student_id);
        const started = opens + sr.int(0, 300) * 1000;
        const deadline = started + 1800 * 1000;
        const auto = sr.chance(0.05);
        const submitted = auto ? deadline : started + sr.int(600, 1750) * 1000;
        const ab = ability.get(learnerId)!;
        const order = sr.shuffle(paperQs);
        let score = 0;
        const wrongByConcept = new Map<string, number>();
        order.forEach((q, i) => {
          const ok = sr.chance(Math.min(0.97, Math.max(0.1, ab + 0.05 - (q.difficulty - 2) * 0.1)));
          if (ok) score++;
          else wrongByConcept.set(q.conceptId, (wrongByConcept.get(q.conceptId) ?? 0) + 1);
          const at = started + ((i + 1) * (submitted - started)) / (order.length + 1);
          examAnswers.push({
            session_id: sessionId,
            question_id: q.id,
            question_version: 1,
            answer: { correct: ok ? q.correct : wrongAnswer(q, sr) },
            is_correct: ok,
            client_answered_at: iso(at),
            received_at: iso(at + 400),
            late: false,
          });
        });
        examSessions.push({
          id: sessionId,
          assessment_id: assessmentId,
          enrollment_id: enrollment.id,
          learner_id: learnerId,
          delivery: 'online',
          status: auto ? 'auto_submitted' : 'submitted',
          paper: order.map((q) => ({ q: q.id, v: 1 })),
          started_at: iso(started),
          deadline_at: iso(deadline),
          submitted_at: iso(submitted),
          score,
          total: order.length,
          last_seen_at: iso(submitted),
          created_at: iso(started),
        });
        if (sr.chance(0.1)) {
          const n = sr.int(1, 3);
          for (let j = 0; j < n; j++) {
            examEvents.push({
              session_id: sessionId,
              kind: sr.pick(['blur', 'hidden', 'reconnect'] as const),
              at: iso(started + sr.int(30, 1500) * 1000),
              detail: { test: true },
            });
          }
        }
        for (const [cid, wrong] of wrongByConcept) {
          const k = `${learnerId}:${cid}`;
          if (wrong >= 2 && !openExamFU.has(k)) {
            openExamFU.add(k);
            followUps.push({
              id: id('follow_up', enrollment.student_id, cid, 'exam'),
              learner_id: learnerId,
              concept_id: cid,
              subject_id: conceptSubject.get(cid),
              kind: 'exam',
              status: 'open',
              source_exam_session_id: sessionId,
              rounds: 0,
              created_at: iso(closes),
              updated_at: iso(closes),
            });
          }
        }
      }
    }
  }

  return {
    curriculum,
    chapters,
    topics,
    concepts,
    prerequisites,
    questions,
    learningContent,
    contentVersions,
    approvals,
    practiceAttempts,
    conceptMastery,
    followUps,
    assessments,
    assessmentQuestions,
    examSessions,
    examAnswers,
    examEvents,
  };
}
