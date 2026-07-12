// Student attendance — the signed-in student's own attendance record for this
// year. Read-only: a student can only ever see their own days, and can't change
// them. RLS (db/004 p_att_student_read) scopes attendance to my_student_id() via
// the enrolment, so this screen just reads and shows.
//
// Attendance attaches to the enrolment (CLAUDE.md rule 2), so it's implicitly the
// current class + year. The summary mirrors the console history view (present
// rate + a per-status tally) so both surfaces describe the same data the same
// way, then lists each marked day newest-first.
//
// Visuals: quest theme — the present rate is a heart card with an XP bar, and
// each day's status is a coloured badge (present green, absent red, late gold,
// leave sky). Same queries, same i18n keys, logical start/end layout.
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

// Map a Supabase error to an i18n key under student.attendance.errors.
function classifyError(error) {
  if (!error) return null;
  const msg = (error.message || '').toLowerCase();
  if (/network request failed|failed to fetch|network|timeout|econn/.test(msg)) {
    return 'network';
  }
  return 'unknown';
}

// Count each status across a list of records. Returns a fixed shape so the
// summary line and present rate never see an undefined bucket. (Same rule as the
// console AttendanceScreen tally.)
export function tally(records) {
  const counts = { present: 0, absent: 0, late: 0, leave: 0 };
  for (const r of records || []) if (r.status in counts) counts[r.status] += 1;
  return counts;
}

// How each attendance status reads as a badge.
const STATUS_TONES = {
  present: 'greenSolid',
  absent: 'red',
  late: 'gold',
  leave: 'sky',
};

// One day in the record: the date and the status marked that day.
function DayRow({ record }) {
  return (
    <View style={styles.row}>
      <Text variant="label" color={quest.ink}>
        {record.on_date}
      </Text>
      <QuestBadge
        label={t(`student.attendance.statuses.${record.status}`)}
        tone={STATUS_TONES[record.status] ?? 'faint'}
      />
    </View>
  );
}

export default function StudentAttendanceScreen({ onBack }) {
  const [year, setYear] = useState(null); // { id, label } or null
  const [enrollment, setEnrollment] = useState(null); // { id } or null
  const [records, setRecords] = useState(null); // null = not loaded
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

    // My attendance across the year, newest day first (same read the console
    // history uses, scoped to my own enrolment by RLS).
    const attRes = await supabase
      .from('attendance')
      .select('id, on_date, status')
      .eq('enrollment_id', enr.id)
      .order('on_date', { ascending: false });
    if (attRes.error) {
      setErrorKey(classifyError(attRes.error));
      setLoaded(true);
      return;
    }
    setRecords(attRes.data ?? []);
    setLoaded(true);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => tally(records), [records]);
  const total = records?.length ?? 0;
  const presentRate = total > 0 ? Math.round((counts.present / total) * 100) : 0;

  const header = (
    <QuestHeader
      title={t('student.attendance.title')}
      subtitle={t('student.attendance.subtitle')}
      backLabel={t('student.attendance.back')}
      onBack={onBack}
    />
  );

  if (!loaded) {
    return (
      <QuestScreen scroll>
        {header}
        <QuestLoading sprite="heart" />
      </QuestScreen>
    );
  }

  if (errorKey) {
    return (
      <QuestScreen scroll>
        {header}
        <QuestEmpty
          message={t(`student.attendance.errors.${errorKey}`)}
          tone="danger"
          actionLabel={t('student.attendance.retry')}
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
        <QuestEmpty message={t('student.attendance.noYear')} />
      </QuestScreen>
    );
  }
  if (!enrollment) {
    return (
      <QuestScreen scroll>
        {header}
        <QuestEmpty message={t('student.attendance.noEnrollment')} />
      </QuestScreen>
    );
  }
  if (total === 0) {
    return (
      <QuestScreen scroll>
        {header}
        <QuestEmpty message={t('student.attendance.empty')} />
      </QuestScreen>
    );
  }

  return (
    <QuestScreen scroll>
      {header}

      <Enter>
        <QuestPanel
          outline={quest.berryEdge}
          edge={quest.berryEdge}
          style={styles.summaryBox}
          faceStyle={styles.summaryFace}
        >
          <Sprite name="heart" size={48} />
          <View style={styles.summaryText}>
            <Text color={quest.ink} style={displayText(18)}>
              {t('student.attendance.presentRate', { rate: presentRate })}
            </Text>
            <QuestBar value={presentRate} color={quest.berry} style={styles.summaryBar} />
            <Text variant="caption" color={quest.faint} style={styles.summarySub}>
              {t('student.attendance.summary', counts)}
            </Text>
          </View>
        </QuestPanel>
      </Enter>

      <Enter delay={80}>
        <QuestPanel padded={false} faceStyle={styles.daysFace}>
          {records.map((record, i) => (
            <View key={record.id} style={i > 0 && styles.dayDivider}>
              <DayRow record={record} />
            </View>
          ))}
        </QuestPanel>
      </Enter>
    </QuestScreen>
  );
}

const styles = StyleSheet.create({
  summaryBox: { marginTop: spacing.lg, marginBottom: spacing.md },
  summaryFace: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryText: { flex: 1, marginStart: spacing.md },
  summaryBar: { marginTop: spacing.sm },
  summarySub: { marginTop: spacing.xs },
  daysFace: { paddingHorizontal: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
  dayDivider: {
    borderTopWidth: 1,
    borderTopColor: quest.bgDeep,
  },
});
