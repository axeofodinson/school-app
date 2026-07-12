// Student results — the signed-in student's own score for each assessment they've
// submitted this year. Read-only: a student can never see another student's
// results, and never their own ungraded raw answers here — RLS (db/004
// p_subs_student_read) scopes submissions to my_student_id(), and this screen
// only reads score + the assessment it belongs to.
//
// A submission carries a score only once a teacher has graded it (setup.sql:
// score is null until a graded pass — rule 3). So each row is one of two honest
// states: MARKED (score / total, with a percent) or NOT MARKED YET (submitted,
// waiting on the teacher). The overall line aggregates only the marked ones, so a
// child sees a real number and isn't misled by tests still being graded.
//
// Visuals: quest theme — the overall score is a trophy card with an XP bar,
// each marked test shows its score in the display face with a star. Same
// queries, same i18n keys, logical start/end layout throughout.
//
// Build-order prerequisites (CLAUDE.md): a current academic year and an active
// enrolment. Each missing step gets a real, honest empty state — never a blank
// page. A dropped load falls back to a clear retry rather than a frozen screen.
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
import { t } from '../../i18n';
import { quest, spacing, displayText } from '../../theme/quest';

// Map a Supabase error to an i18n key under student.results.errors.
function classifyError(error) {
  if (!error) return null;
  const msg = (error.message || '').toLowerCase();
  if (/network request failed|failed to fetch|network|timeout|econn/.test(msg)) {
    return 'network';
  }
  return 'unknown';
}

// A whole-number percent of score out of total, or null when there's nothing to
// take a percent of (an ungraded row, or a zero-mark test). Kept pure so the
// aggregate below can be checked without a device or a network.
export function percentOf(score, total) {
  if (score == null || !total || total <= 0) return null;
  return Math.round((score / total) * 100);
}

// Overall performance across the MARKED submissions only: total marks earned over
// total marks available. Ungraded rows (score null) and zero-mark tests are left
// out of both sums so they neither help nor hurt the figure. Returns the fixed
// shape { count, percent } (percent null when nothing is marked yet).
export function overallResult(submissions) {
  let earned = 0;
  let possible = 0;
  let count = 0;
  for (const s of submissions || []) {
    const total = s.assessment?.total_marks;
    if (s.score == null || !total || total <= 0) continue;
    earned += Number(s.score);
    possible += total;
    count += 1;
  }
  return {
    count,
    percent: possible > 0 ? Math.round((earned / possible) * 100) : null,
  };
}

// One result row: star + the assessment (title, type · subject), and either the
// score in the display face or a "not marked yet" badge while it's being graded.
function ResultRow({ submission, delay }) {
  const a = submission.assessment;
  const graded = submission.score != null;
  const total = a?.total_marks ?? 0;
  const percent = percentOf(submission.score, total);
  return (
    <Enter delay={delay}>
      <QuestPanel style={styles.row} faceStyle={styles.rowFace}>
        <Sprite name="star" size={36} style={!graded && styles.dimmed} />
        <View style={styles.rowInfo}>
          <Text variant="label" color={quest.ink}>
            {a?.title}
          </Text>
          <Text variant="caption" color={quest.faint} style={styles.rowMeta}>
            {t(`student.assessments.types.${a?.type}`)}
            {a?.subject?.name ? ` · ${a.subject.name}` : ''}
          </Text>
        </View>
        {graded ? (
          <View style={styles.scoreBox}>
            <Text color={quest.greenEdge} align="end" style={displayText(18)}>
              {t('student.results.score', { score: submission.score, total })}
            </Text>
            {percent != null ? (
              <QuestBadge
                label={t('student.results.percent', { percent })}
                tone="gold"
                style={styles.percentBadge}
              />
            ) : null}
          </View>
        ) : (
          <QuestBadge label={t('student.results.waiting')} tone="faint" />
        )}
      </QuestPanel>
    </Enter>
  );
}

export default function StudentResultsScreen({ onBack }) {
  const [year, setYear] = useState(null); // { id, label } or null
  const [enrollment, setEnrollment] = useState(null); // { id } or null
  const [submissions, setSubmissions] = useState(null); // null = not loaded
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

    // The student's own enrolment for this year (RLS: my_student_id()). Only an
    // active enrolment counts as being "in a class" this year.
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

    // My submissions, each with the assessment it belongs to. The assessment join
    // rides RLS too (db/005: only PUBLISHED assessments of my class are readable),
    // so a submission whose assessment is no longer readable arrives with a null
    // join — we drop those rather than render a titleless row. Newest first.
    const subRes = await supabase
      .from('submissions')
      .select(
        'id, score, submitted_at, graded_at, ' +
          'assessment:assessments(id, title, type, total_marks, subject:subjects(name))'
      )
      .eq('enrollment_id', enr.id)
      .order('submitted_at', { ascending: false, nullsFirst: false });
    if (subRes.error) {
      setErrorKey(classifyError(subRes.error));
      setLoaded(true);
      return;
    }
    setSubmissions((subRes.data ?? []).filter((s) => s.assessment));
    setLoaded(true);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const overall = useMemo(() => overallResult(submissions), [submissions]);

  const header = (
    <QuestHeader
      title={t('student.results.title')}
      subtitle={t('student.results.subtitle')}
      backLabel={t('student.results.back')}
      onBack={onBack}
    />
  );

  if (!loaded) {
    return (
      <QuestScreen scroll>
        {header}
        <QuestLoading sprite="star" />
      </QuestScreen>
    );
  }

  if (errorKey) {
    return (
      <QuestScreen scroll>
        {header}
        <QuestEmpty
          message={t(`student.results.errors.${errorKey}`)}
          tone="danger"
          actionLabel={t('student.results.retry')}
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
        <QuestEmpty message={t('student.results.noYear')} />
      </QuestScreen>
    );
  }
  if (!enrollment) {
    return (
      <QuestScreen scroll>
        {header}
        <QuestEmpty message={t('student.results.noEnrollment')} />
      </QuestScreen>
    );
  }
  if (!submissions || submissions.length === 0) {
    return (
      <QuestScreen scroll>
        {header}
        <QuestEmpty message={t('student.results.empty')} />
      </QuestScreen>
    );
  }

  return (
    <QuestScreen scroll>
      {header}

      {/* Overall stands on the marked tests only — honest when some are pending. */}
      {overall.percent != null ? (
        <Enter>
          <QuestPanel
            outline={quest.goldEdge}
            edge={quest.goldEdge}
            style={styles.overallBox}
            faceStyle={styles.overallFace}
          >
            <Sprite name="trophy" size={48} />
            <View style={styles.overallText}>
              <Text color={quest.ink} style={displayText(22)}>
                {t('student.results.overall', { percent: overall.percent })}
              </Text>
              <QuestBar value={overall.percent} color={quest.gold} style={styles.overallBar} />
              <Text variant="caption" color={quest.faint} style={styles.overallSub}>
                {t('student.results.markedCount', { count: overall.count })}
              </Text>
            </View>
          </QuestPanel>
        </Enter>
      ) : (
        <Text variant="caption" color={quest.faint} style={styles.noneMarked}>
          {t('student.results.noneMarked')}
        </Text>
      )}

      {submissions.map((s, i) => (
        <ResultRow key={s.id} submission={s} delay={i < 8 ? 60 + i * 50 : 0} />
      ))}
    </QuestScreen>
  );
}

const styles = StyleSheet.create({
  overallBox: { marginTop: spacing.lg, marginBottom: spacing.md },
  overallFace: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  overallText: { flex: 1, marginStart: spacing.md },
  overallBar: { marginTop: spacing.sm },
  overallSub: { marginTop: spacing.xs },
  noneMarked: { marginTop: spacing.lg, marginBottom: spacing.sm },
  row: { marginBottom: spacing.md },
  rowFace: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowInfo: { flex: 1, marginStart: spacing.md, marginEnd: spacing.sm },
  rowMeta: { marginTop: spacing.xs },
  scoreBox: { alignItems: 'flex-end' },
  percentBadge: { marginTop: spacing.xs },
  dimmed: { opacity: 0.35 },
});
