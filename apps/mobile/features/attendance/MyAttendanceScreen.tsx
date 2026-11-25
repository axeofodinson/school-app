// The student's attendance (prompt 14): this month as a calendar, the month's
// and the year's percentage, and the counts. Read-only; RLS (db/004) returns
// only the student's own days. Opens offline from the device copy.
import {
  addMonths,
  attendanceRate,
  schoolToday,
  monthGrid,
  monthOf,
  tallyStatuses,
  type AttendanceStatus,
} from '@school/core';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useI18n } from '../../i18n';
import {
  Button,
  Card,
  EmptyState,
  Icon,
  Reveal,
  Screen,
  SkeletonLines,
  Text,
  useTheme,
} from '../../ui';
import { StudentHeader } from '../attempts/Header';
import { radius, space } from '../../ui/tokens';
import { useAuth } from '../auth/AuthProvider';
import { useResult } from '../scope/useResult';
import { loadMyAttendance } from './api';
import { monthKey, STATUS_LOOK, weekdayKey } from './status';

function Calendar({
  month,
  byDay,
  today,
}: {
  month: string;
  byDay: ReadonlyMap<string, AttendanceStatus>;
  today: string;
}) {
  const { t } = useI18n();
  const { colours } = useTheme();
  const weeks = useMemo(() => monthGrid(month), [month]);
  return (
    <View accessibilityRole="grid" style={styles.grid}>
      <View style={styles.week}>
        {Array.from({ length: 7 }, (_, i) => (
          <Text key={i} variant="caption" tone="textMuted" style={styles.head}>
            {t(weekdayKey(i))}
          </Text>
        ))}
      </View>
      {weeks.map((w, wi) => (
        <View key={wi} style={styles.week}>
          {w.map((d, di) => {
            if (!d) return <View key={di} style={styles.cell} />;
            const s = byDay.get(d);
            const look = s ? STATUS_LOOK[s] : null;
            const label = t('student.attendance.dayLabel', {
              day: Number(d.slice(8, 10)),
              month: t(monthKey(d)),
              status: look ? t(look.label) : t('student.attendance.notMarked'),
            });
            return (
              <View
                key={di}
                accessible
                accessibilityLabel={label}
                style={[
                  styles.cell,
                  styles.day,
                  {
                    backgroundColor: look ? colours[look.soft] : colours.surface,
                    borderColor: d === today ? colours.primary : colours.border,
                    borderWidth: d === today ? 2 : StyleSheet.hairlineWidth,
                  },
                ]}
              >
                <Text variant="label" tone={look ? look.onSoft : 'textMuted'}>
                  {Number(d.slice(8, 10))}
                </Text>
                {look ? <Icon name={look.icon} size={14} tone={look.onSoft} /> : null}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function Legend() {
  const { t } = useI18n();
  const { colours } = useTheme();
  return (
    <View style={styles.legend}>
      {(Object.keys(STATUS_LOOK) as AttendanceStatus[]).map((s) => (
        <View key={s} style={[styles.key, { backgroundColor: colours[STATUS_LOOK[s].soft] }]}>
          <Icon name={STATUS_LOOK[s].icon} size={14} tone={STATUS_LOOK[s].onSoft} />
          <Text variant="caption" tone={STATUS_LOOK[s].onSoft}>
            {t(`student.attendance.statuses.${s}`)}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function MyAttendanceScreen() {
  const { t } = useI18n();
  const { session, userStorage } = useAuth();
  const uid = session?.user.id ?? null;
  const res = useResult(uid ? `my-att:${uid}` : null, () => loadMyAttendance(userStorage));
  const today = schoolToday();
  const thisMonth = monthOf(today);
  const [month, setMonth] = useState(thisMonth);

  const data = res.state?.status === 'ready' ? res.state.data : null;
  const days = useMemo(() => (data?.state === 'ready' ? data.days : []), [data]);
  const byDay = useMemo(() => new Map(days.map((d) => [d.on_date, d.status])), [days]);
  const monthDays = days.filter((d) => d.on_date.startsWith(month));
  const monthCounts = tallyStatuses(monthDays.map((d) => d.status));
  const yearCounts = tallyStatuses(days.map((d) => d.status));
  const monthRate = attendanceRate(monthCounts);
  const yearRate = attendanceRate(yearCounts);
  const earliest = days.length ? monthOf(days[days.length - 1]!.on_date) : thisMonth;

  let body;
  if (!res.state || res.state.status === 'loading') body = <SkeletonLines lines={4} />;
  else if (res.state.status === 'error') {
    body = (
      <EmptyState
        icon="cloudOff"
        title={t(
          res.state.error === 'network'
            ? 'student.attendance.errors.network'
            : 'student.attendance.errors.unknown',
        )}
        action={
          <Button title={t('student.attendance.retry')} variant="secondary" onPress={res.reload} />
        }
      />
    );
  } else if (data?.state === 'noYear') {
    body = <EmptyState icon="clock" title={t('student.attendance.noYear')} />;
  } else if (data?.state === 'noEnrollment') {
    body = <EmptyState icon="user" title={t('student.attendance.noEnrollment')} />;
  } else if (data?.state === 'ready') {
    body = (
      <View style={styles.wrap}>
        <Text tone="textMuted">{[data.className, data.yearLabel].filter(Boolean).join(' · ')}</Text>
        {data.fromCache ? (
          <Card>
            <Text tone="textMuted">{t('student.attendance.offline')}</Text>
          </Card>
        ) : null}
        {!days.length ? (
          <EmptyState icon="clock" title={t('student.attendance.empty')} />
        ) : (
          <>
            <Card>
              <View style={styles.rates}>
                <Text variant="display" accessibilityLiveRegion="polite">
                  {monthRate === null
                    ? t('student.attendance.noRate')
                    : t('student.attendance.monthRate', { rate: monthRate })}
                </Text>
                {yearRate !== null ? (
                  <Text variant="heading">
                    {t('student.attendance.yearRate', { rate: yearRate })}
                  </Text>
                ) : null}
                <Text variant="bodySm" tone="textMuted">
                  {t('student.attendance.rateNote')}
                </Text>
              </View>
            </Card>
            <View style={styles.bar}>
              <Button
                title={t('student.attendance.prevMonth')}
                icon="chevronStart"
                variant="secondary"
                size="sm"
                disabled={month <= earliest}
                onPress={() => setMonth((m) => addMonths(m, -1))}
              />
              <Text variant="heading" style={styles.grow}>
                {`${t(monthKey(`${month}-01`))} ${month.slice(0, 4)}`}
              </Text>
              <Button
                title={t('student.attendance.nextMonth')}
                icon="chevronEnd"
                variant="secondary"
                size="sm"
                disabled={month >= thisMonth}
                onPress={() => setMonth((m) => addMonths(m, 1))}
              />
            </View>
            <Calendar month={month} byDay={byDay} today={today} />
            <Legend />
            <Text>
              {monthDays.length
                ? t('student.attendance.summary', monthCounts)
                : t('student.attendance.monthEmpty')}
            </Text>
          </>
        )}
      </View>
    );
  }

  return (
    <Screen header={<StudentHeader title={t('student.attendance.title')} hue="sky" />}>
      <Reveal index={1}>{body}</Reveal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  start: { alignSelf: 'flex-start' },
  rates: { gap: space.xs },
  bar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
  grow: { flexGrow: 1, textAlign: 'center' },
  grid: { gap: space.xxs },
  week: { flexDirection: 'row', gap: space.xxs },
  head: { flex: 1, textAlign: 'center' },
  cell: { flex: 1, minHeight: 44 },
  day: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    gap: space.xxs,
  },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  key: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xxs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.full,
  },
});
