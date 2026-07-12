// Student report card — the signed-in student's own results for the current year,
// rolled up into one figure using each assessment's weightage, broken down by
// subject, and with a cognitive-level (recall vs conceptual) view of what their
// tests actually checked. Read-only and RLS-scoped to the student (db/004 +
// db/005): a child can only ever see their own marks, and only for PUBLISHED
// assessments their submission counts against.
//
// ALL the aggregate math lives in src/reporting/aggregate.js — this screen only
// FETCHES the raw rows, hands them to buildReport(), and renders the result.
// Weightage rules change there, never here (and the numbers are pinned by
// `npm run verify:report`), so this file stays about layout + honest states.
//
// Visuals: quest theme — the year's headline is a trophy card, subjects fill
// XP bars, and the recall-vs-thinking split gets gold/green bars. Same math,
// same i18n keys, logical start/end layout throughout.
//
// Honesty (CLAUDE.md rule 3): the headline stands on the MARKED tests only, so a
// pending test never inflates or deflates it; ungraded tests are surfaced as a
// count, not hidden. Build-order prerequisites each get a real empty state, and a
// dropped load falls back to a retry rather than a frozen screen. Bilingual + RTL
// throughout (strings from i18n, logical start/end layout).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet } from 'react-native';

import { Text } from '../../components';
import {
  QuestScreen,
  QuestHeader,
  QuestPanel,
  QuestBadge,
  QuestBar,
  QuestLoading,
  QuestEmpty,
  Sprite,
  Enter,
} from '../../components/quest';
import { supabase } from '../../lib/supabase';
import { buildReport } from '../../reporting/aggregate';
import { t } from '../../i18n';
import { quest, spacing, displayText } from '../../theme/quest';

// Map a Supabase error to an i18n key under student.report.errors.
function classifyError(error) {
  if (!error) return null;
  const msg = (error.message || '').toLowerCase();
  if (/network request failed|failed to fetch|network|timeout|econn/.test(msg)) {
    return 'network';
  }
  return 'unknown';
}

export default function StudentReportCardScreen({ onBack }) {
  const [year, setYear] = useState(null); // { id, label } or null
  const [enrollment, setEnrollment] = useState(null); // { id } or null
  const [assessments, setAssessments] = useState(null); // normalized list or null
  const [errorKey, setErrorKey] = useState(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    setErrorKey(null);
    setLoaded(false);

    const yearRes = await supabase
      .from('academic_years')
      .select('id, label')
      .eq('is_current', true)
      .maybeSingle();
    if (yearRes.error) {
      setErrorKey(classifyError(yearRes.error));
      setLoaded(true);
      return;
    }
    const currentYear = yearRes.data ?? null;
    setYear(currentYear);
    if (!currentYear) {
      setLoaded(true);
      return;
    }

    // The student's own active enrolment for this year (RLS: my_student_id()).
    const enrRes = await supabase
      .from('enrollments')
      .select('id, status')
      .eq('year_id', currentYear.id)
      .maybeSingle();
    if (enrRes.error) {
      setErrorKey(classifyError(enrRes.error));
      setLoaded(true);
      return;
    }
    const enr = enrRes.data && enrRes.data.status === 'active' ? enrRes.data : null;
    setEnrollment(enr);
    if (!enr) {
      setLoaded(true);
      return;
    }

    // My submissions, each with the assessment it belongs to (title, type,
    // weightage, total_marks, subject). The assessment join rides RLS (db/005:
    // only PUBLISHED assessments of my class are readable), so a submission whose
    // assessment is no longer readable arrives with a null join — drop those.
    const subRes = await supabase
      .from('submissions')
      .select(
        'id, score, ' +
          'assessment:assessments(id, title, type, weightage, total_marks, ' +
          'subject:subjects(id, name))'
      )
      .eq('enrollment_id', enr.id);
    if (subRes.error) {
      setErrorKey(classifyError(subRes.error));
      setLoaded(true);
      return;
    }
    const subs = (subRes.data ?? []).filter((s) => s.assessment);
    const assessmentIds = subs.map((s) => s.assessment.id);

    // The cognitive make-up of those tests: every question on them, with its
    // marks and cognitive_level. The join rows are readable exactly when the
    // parent assessment is (db/005 p_aq_student_read); questions are readable to
    // any authed user (setup.sql). We never read questions.answer.
    let questionsByAssessment = new Map();
    if (assessmentIds.length > 0) {
      const aqRes = await supabase
        .from('assessment_questions')
        .select('assessment_id, marks, question:questions(cognitive_level)')
        .in('assessment_id', assessmentIds);
      if (aqRes.error) {
        setErrorKey(classifyError(aqRes.error));
        setLoaded(true);
        return;
      }
      for (const row of aqRes.data ?? []) {
        if (!row.question) continue; // question hidden — skip rather than mis-tag
        const list = questionsByAssessment.get(row.assessment_id) ?? [];
        list.push({ cognitiveLevel: row.question.cognitive_level, marks: row.marks });
        questionsByAssessment.set(row.assessment_id, list);
      }
    }

    // Normalize to the shape buildReport() expects (camelCase, questions merged).
    const normalized = subs.map((s) => ({
      id: s.assessment.id,
      title: s.assessment.title,
      type: s.assessment.type,
      subject: s.assessment.subject
        ? { id: s.assessment.subject.id, name: s.assessment.subject.name }
        : null,
      weightage: s.assessment.weightage,
      totalMarks: s.assessment.total_marks,
      score: s.score,
      questions: questionsByAssessment.get(s.assessment.id) ?? [],
    }));
    setAssessments(normalized);
    setLoaded(true);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // The whole report is derived from the fetched rows by the isolated module.
  const report = useMemo(
    () => (assessments ? buildReport({ assessments }) : null),
    [assessments]
  );

  const header = (
    <QuestHeader
      title={t('student.report.title')}
      subtitle={
        year
          ? t('student.report.subtitle', { year: year.label })
          : t('student.report.subtitleNoYear')
      }
      backLabel={t('student.report.back')}
      onBack={onBack}
    />
  );

  if (!loaded) {
    return (
      <QuestScreen scroll>
        {header}
        <QuestLoading sprite="scroll" />
      </QuestScreen>
    );
  }

  if (errorKey) {
    return (
      <QuestScreen scroll>
        {header}
        <QuestEmpty
          message={t(`student.report.errors.${errorKey}`)}
          tone="danger"
          actionLabel={t('student.report.retry')}
          onAction={load}
        />
      </QuestScreen>
    );
  }

  // Prerequisite empty states — honest, not a blank screen (CLAUDE.md).
  if (!year) {
    return (
      <QuestScreen scroll>
        {header}
        <QuestEmpty message={t('student.report.noYear')} />
      </QuestScreen>
    );
  }
  if (!enrollment) {
    return (
      <QuestScreen scroll>
        {header}
        <QuestEmpty message={t('student.report.noEnrollment')} />
      </QuestScreen>
    );
  }
  if (!assessments || assessments.length === 0) {
    return (
      <QuestScreen scroll>
        {header}
        <QuestEmpty message={t('student.report.empty')} />
      </QuestScreen>
    );
  }

  const { overall, subjects, cognitive } = report;

  return (
    <QuestScreen scroll>
      {header}

      {/* Headline — stands on the marked tests only. */}
      <Enter>
        <QuestPanel
          outline={quest.goldEdge}
          edge={quest.goldEdge}
          style={styles.overallBox}
          faceStyle={styles.overallFace}
        >
          <Sprite name="trophy" size={56} />
          <View style={styles.overallText}>
            <Text variant="label" color={quest.faint}>
              {t('student.report.overall')}
            </Text>
            {overall.percent != null ? (
              <>
                <Text color={quest.ink} style={displayText(32)}>
                  {t('student.report.overallPercent', { percent: overall.percent })}
                </Text>
                <QuestBar value={overall.percent} color={quest.gold} style={styles.overallBar} />
                <Text variant="caption" color={quest.faint} style={styles.note}>
                  {t('student.report.fromMarked', { count: overall.gradedCount })}
                </Text>
                {!overall.weighted ? (
                  <Text variant="caption" color={quest.faint} style={styles.note}>
                    {t('student.report.unweightedNote')}
                  </Text>
                ) : null}
              </>
            ) : (
              <Text variant="body" color={quest.faint} style={styles.note}>
                {t('student.report.noneMarked')}
              </Text>
            )}
            {overall.ungradedCount > 0 ? (
              <Text variant="caption" color={quest.faint} style={styles.note}>
                {t('student.report.waiting', { count: overall.ungradedCount })}
              </Text>
            ) : null}
          </View>
        </QuestPanel>
      </Enter>

      {/* Per-subject roll-up — each subject fills its own XP bar. */}
      <Text color={quest.ink} style={[styles.sectionHeading, displayText(18)]}>
        {t('student.report.bySubject')}
      </Text>
      <Enter delay={80}>
        <QuestPanel>
          {subjects.map((s, i) => (
            <View key={s.id ?? '__none__'} style={[styles.subjectRow, i > 0 && styles.subjectGap]}>
              <View style={styles.subjectHead}>
                <View style={styles.subjectInfo}>
                  <Text variant="label" color={quest.ink}>
                    {s.name ?? '—'}
                  </Text>
                  {s.gradedCount > 0 ? (
                    <Text variant="caption" color={quest.faint} style={styles.rowMeta}>
                      {t('student.report.subjectMarked', { count: s.gradedCount })}
                    </Text>
                  ) : null}
                </View>
                {s.percent != null ? (
                  <Text color={quest.greenEdge} style={displayText(18)}>
                    {t('student.report.subjectPercent', { percent: s.percent })}
                  </Text>
                ) : (
                  <QuestBadge label={t('student.report.subjectWaiting')} tone="faint" />
                )}
              </View>
              {s.percent != null ? (
                <QuestBar value={s.percent} height={10} style={styles.subjectBar} />
              ) : null}
            </View>
          ))}
        </QuestPanel>
      </Enter>

      {/* What was tested — recall vs conceptual, by marks. */}
      {cognitive.totalMarks > 0 ? (
        <Enter delay={140}>
          <Text color={quest.ink} style={[styles.sectionHeading, displayText(18)]}>
            {t('student.report.cognitive.heading')}
          </Text>
          <QuestPanel>
            <Text variant="caption" color={quest.faint} style={styles.cognitiveHint}>
              {t('student.report.cognitive.hint')}
            </Text>

            <View style={styles.splitRow}>
              <View style={styles.splitCol}>
                <Text variant="caption" color={quest.faint}>
                  {t('student.report.cognitive.recall')}
                </Text>
                <Text color={quest.goldEdge} style={displayText(18)}>
                  {t('student.report.cognitive.share', { share: cognitive.recall.share })}
                </Text>
                <QuestBar value={cognitive.recall.share} height={10} color={quest.gold} style={styles.splitBar} />
              </View>
              <View style={[styles.splitCol, styles.splitColEnd]}>
                <Text variant="caption" color={quest.faint}>
                  {t('student.report.cognitive.conceptual')}
                </Text>
                <Text color={quest.greenEdge} style={displayText(18)}>
                  {t('student.report.cognitive.share', {
                    share: cognitive.conceptual.share,
                  })}
                </Text>
                <QuestBar value={cognitive.conceptual.share} height={10} color={quest.green} style={styles.splitBar} />
              </View>
            </View>

            {/* The four levels behind the split, marks + share each. */}
            {cognitive.levels
              .filter((l) => l.marks > 0)
              .map((l) => (
                <View key={l.level} style={styles.levelRow}>
                  <Text variant="caption" color={quest.ink}>
                    {t(`student.report.cognitive.levels.${l.level}`)}
                  </Text>
                  <Text variant="caption" color={quest.faint}>
                    {t('student.report.cognitive.levelDetail', {
                      share: l.share,
                      marks: l.marks,
                    })}
                  </Text>
                </View>
              ))}
          </QuestPanel>
        </Enter>
      ) : null}
    </QuestScreen>
  );
}

const styles = StyleSheet.create({
  overallBox: { marginTop: spacing.lg },
  overallFace: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  overallText: { flex: 1, marginStart: spacing.md },
  overallBar: { marginTop: spacing.sm },
  note: { marginTop: spacing.xs },
  sectionHeading: { marginTop: spacing.lg, marginBottom: spacing.sm },
  subjectRow: {},
  subjectGap: { marginTop: spacing.md },
  subjectHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  subjectInfo: { flex: 1, marginEnd: spacing.md },
  subjectBar: { marginTop: spacing.xs },
  rowMeta: { marginTop: 2 },
  cognitiveHint: { marginBottom: spacing.md },
  splitRow: { flexDirection: 'row' },
  splitCol: { flex: 1 },
  splitColEnd: { marginStart: spacing.md },
  splitBar: { marginTop: spacing.xs },
  levelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
});
