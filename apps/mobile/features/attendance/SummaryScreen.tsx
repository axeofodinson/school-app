// Attendance summaries for the office (and teachers, for their own classes):
//   By day   – every class on one day: taken or not, and its counts (db/028
//              attendance_day_summary; RLS decides which classes show).
//   By class – one class over a month: each student's days and percentage
//              (attendance_student_summary), struck-off students included.
// Both read server rollups, never every raw row. Online only (DECISIONS #84).
import {
  addDays,
  addMonths,
  attendanceRate,
  schoolToday,
  monthOf,
  monthRange,
  type AttendanceCounts,
} from '@school/core';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useI18n } from '../../i18n';
import { Badge, Button, Card, EmptyState, SegmentedControl, Text, useTheme } from '../../ui';
import { space } from '../../ui/tokens';
import { ChipPicker } from '../scope/ChipPicker';
import { LoadState } from '../scope/LoadState';
import { ScopeGate, type ReadyScope } from '../scope/ScopeGate';
import { useResult } from '../scope/useResult';
import { loadClassRange, loadDaySummary, type ClassDay } from './api';
import { useDayLabel } from './MarkScreen';
import { monthKey } from './status';

type Tab = 'day' | 'class';

function countsOf(r: { present: number; absent: number; late: number; leave: number }) {
  return {
    present: r.present,
    absent: r.absent,
    late: r.late,
    leave: r.leave,
  } satisfies AttendanceCounts;
}

function useRateText() {
  const { t } = useI18n();
  return (c: AttendanceCounts) => {
    const r = attendanceRate(c);
    return r === null
      ? t('staff.attendanceSummary.noRate')
      : t('staff.attendanceSummary.rate', { rate: r });
  };
}

function ByDay({ scope, initialDate }: { scope: ReadyScope; initialDate: string | null }) {
  const { t } = useI18n();
  const { colours } = useTheme();
  const router = useRouter();
  const dayLabel = useDayLabel();
  const rate = useRateText();
  const today = schoolToday();
  const [date, setDate] = useState(initialDate && initialDate <= today ? initialDate : today);
  const res = useResult(`ds:${scope.year.id}:${date}`, () => loadDaySummary(scope.year.id, date));
  const rows: ClassDay[] = res.state?.status === 'ready' ? res.state.data : [];
  const taken = rows.filter((r) => r.marked > 0).length;
  const sum = rows.reduce(
    (a, r) => ({
      absent: a.absent + r.absent,
      late: a.late + r.late,
      leave: a.leave + r.leave,
    }),
    { absent: 0, late: 0, leave: 0 },
  );
  return (
    <View style={styles.wrap}>
      <View style={styles.bar}>
        <Button
          title={t('staff.attendance.prevDay')}
          icon="chevronStart"
          variant="secondary"
          size="sm"
          onPress={() => setDate((d) => addDays(d, -1))}
        />
        <Text variant="heading" accessibilityLiveRegion="polite" style={styles.grow}>
          {dayLabel(date)}
        </Text>
        <Button
          title={t('staff.attendance.nextDay')}
          icon="chevronEnd"
          variant="secondary"
          size="sm"
          disabled={date >= today}
          onPress={() => setDate((d) => (d < today ? addDays(d, 1) : d))}
        />
      </View>
      <LoadState
        state={res.state}
        title={t('staff.attendanceSummary.loadError')}
        onRetry={res.reload}
      />
      {res.state?.status === 'ready' && !rows.length ? (
        <EmptyState
          icon="user"
          title={t('staff.attendanceSummary.dayEmpty')}
          body={t('staff.attendanceSummary.dayEmptyBody')}
        />
      ) : null}
      {rows.length ? (
        <>
          <Text variant="label">
            {t('staff.attendanceSummary.schoolTotal', {
              taken,
              classes: rows.length,
              absent: sum.absent,
              late: sum.late,
              leave: sum.leave,
            })}
          </Text>
          <Card padded={false}>
            {rows.map((r, i) => (
              <View
                key={r.classId}
                style={[
                  styles.line,
                  i > 0 ? [styles.divider, { borderColor: colours.border }] : null,
                ]}
              >
                <View style={styles.grow}>
                  <Text variant="label">{r.className}</Text>
                  <Text variant="caption" tone="textMuted">
                    {r.marked
                      ? `${t('console.attendance.mark.summary', countsOf(r))} · ${t(
                          'staff.attendanceSummary.markedOf',
                          { marked: r.marked, enrolled: r.enrolled },
                        )}`
                      : t('console.attendance.mark.count', { count: r.enrolled })}
                  </Text>
                </View>
                {r.marked ? (
                  <Badge label={rate(countsOf(r))} tone="correct" icon="check" />
                ) : (
                  <Badge
                    label={t('staff.attendanceSummary.notTaken')}
                    tone="accent"
                    icon="warning"
                  />
                )}
                {scope.classes.some((c) => c.id === r.classId) ? (
                  <Button
                    title={t('staff.attendanceSummary.markClass')}
                    variant="ghost"
                    size="sm"
                    onPress={() =>
                      router.push({ pathname: '/attendance', params: { class: r.classId, date } })
                    }
                  />
                ) : null}
              </View>
            ))}
          </Card>
          <Text variant="caption" tone="textMuted">
            {t('staff.attendanceSummary.rateNote')}
          </Text>
        </>
      ) : null}
    </View>
  );
}

function ByClass({ scope }: { scope: ReadyScope }) {
  const { t } = useI18n();
  const { colours } = useTheme();
  const rate = useRateText();
  const [classId, setClassId] = useState(scope.classes[0]!.id);
  const thisMonth = monthOf(schoolToday());
  const [month, setMonth] = useState(thisMonth);
  const { from, to } = monthRange(month);
  const res = useResult(`cr:${classId}:${month}`, () =>
    loadClassRange(classId, scope.year.id, from, to),
  );
  const rows = res.state?.status === 'ready' ? res.state.data : [];
  return (
    <View style={styles.wrap}>
      {scope.classes.length > 1 ? (
        <ChipPicker
          label={t('console.attendance.pickClass')}
          chips={scope.classes.map((c) => ({ value: c.id, label: c.name }))}
          value={classId}
          onChange={setClassId}
        />
      ) : null}
      <View style={styles.bar}>
        <Button
          title={t('staff.attendanceSummary.prevMonth')}
          icon="chevronStart"
          variant="secondary"
          size="sm"
          onPress={() => setMonth((m) => addMonths(m, -1))}
        />
        <Text variant="heading" accessibilityLiveRegion="polite" style={styles.grow}>
          {`${t(monthKey(`${month}-01`))} ${month.slice(0, 4)}`}
        </Text>
        <Button
          title={t('staff.attendanceSummary.nextMonth')}
          icon="chevronEnd"
          variant="secondary"
          size="sm"
          disabled={month >= thisMonth}
          onPress={() => setMonth((m) => (m < thisMonth ? addMonths(m, 1) : m))}
        />
      </View>
      <LoadState
        state={res.state}
        title={t('staff.attendanceSummary.loadError')}
        onRetry={res.reload}
      />
      {res.state?.status === 'ready' && !rows.length ? (
        <EmptyState icon="user" title={t('staff.attendanceSummary.rangeEmpty')} />
      ) : null}
      {rows.length ? (
        <>
          <Card padded={false}>
            {rows.map((r, i) => (
              <View
                key={r.enrollmentId}
                style={[
                  styles.line,
                  i > 0 ? [styles.divider, { borderColor: colours.border }] : null,
                ]}
              >
                <View style={styles.grow}>
                  <Text variant="label">{r.name}</Text>
                  <Text variant="caption" tone="textMuted">
                    {[
                      r.rollNumber != null
                        ? t('console.attendance.mark.roll', { roll: r.rollNumber })
                        : t('console.attendance.mark.noRoll'),
                      t('console.attendance.mark.summary', countsOf(r)),
                      r.active ? null : t('staff.attendanceSummary.left'),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
                <Badge
                  label={rate(countsOf(r))}
                  tone={r.absent > r.present ? 'wrong' : 'neutral'}
                />
              </View>
            ))}
          </Card>
          <Text variant="caption" tone="textMuted">
            {t('staff.attendanceSummary.rateNote')}
          </Text>
        </>
      ) : null}
    </View>
  );
}

export function SummaryScreen({ date }: { date: string | null }) {
  const { t } = useI18n();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('day');
  return (
    <>
      <Button
        title={t('staff.back')}
        icon="back"
        variant="ghost"
        size="sm"
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        style={styles.start}
      />
      <Text variant="title" accessibilityRole="header">
        {t('staff.attendanceSummary.title')}
      </Text>
      <ScopeGate>
        {(scope) => (
          <View style={styles.wrap}>
            <SegmentedControl
              accessibilityLabel={t('staff.attendanceSummary.title')}
              segments={[
                { value: 'day', label: t('staff.attendanceSummary.tabDay') },
                { value: 'class', label: t('staff.attendanceSummary.tabClass') },
              ]}
              value={tab}
              onChange={setTab}
            />
            {tab === 'day' ? <ByDay scope={scope} initialDate={date} /> : <ByClass scope={scope} />}
          </View>
        )}
      </ScopeGate>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  start: { alignSelf: 'flex-start' },
  bar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
  grow: { flexGrow: 1, flexShrink: 1, flexBasis: 160, gap: space.xxs },
  line: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
  },
  divider: { borderTopWidth: StyleSheet.hairlineWidth },
});
