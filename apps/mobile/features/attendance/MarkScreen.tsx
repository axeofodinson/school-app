// Daily attendance for teachers and admins (prompt 14). Class → day → the
// roster, everyone present by default: the teacher taps only the exceptions
// and saves once. The save goes into the durable queue (one item per
// class-day), so it works offline and sends exactly once; record_attendance()
// (db/028) re-checks the class, the day and the reason. Past days can be
// fixed; changing a mark that was already saved on a day that is over needs a
// reason, and every change shows its history.
import {
  addDays,
  ATTENDANCE_STATUSES,
  buildAttendancePayload,
  changedFromSaved,
  isoWeekday,
  schoolToday,
  markingDateError,
  needsReason,
  payloadMarks,
  seedMarks,
  tallyStatuses,
  ATTENDANCE_OLD_APP_REASON,
  ATTENDANCE_SAME_DAY_REASON,
  type AttendancePayload,
  type AttendanceStatus,
  type Marks,
} from '@school/core';
import { useRouter } from 'expo-router';
import { memo, useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useI18n, type TKey } from '../../i18n';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Icon,
  SkeletonLines,
  SyncStatusPill,
  Text,
  TextField,
  useTheme,
  useToast,
} from '../../ui';
import { useFocusRing } from '../../ui/Sticker';
import { radius, space, strokeWidth } from '../../ui/tokens';
import { useAuth } from '../auth/AuthProvider';
import { ChipPicker } from '../scope/ChipPicker';
import { LoadState } from '../scope/LoadState';
import type { ScopeClass, Year } from '../scope/api';
import { useResult } from '../scope/useResult';
import {
  loadDay,
  loadEdits,
  loadMarkingScope,
  refusalOf,
  savedStatuses,
  type RosterEntry,
  type SavedMark,
} from './api';
import { useAttendanceSync, useQueuedDay } from './AttendanceSync';
import { monthKey, STATUS_LOOK, weekdayKey } from './status';

const REFUSALS: Record<string, TKey> = {
  reason_required: 'staff.attendance.rpc.reason_required',
  not_authorized: 'staff.attendance.rpc.not_authorized',
  forbidden: 'staff.attendance.rpc.not_authorized',
  date_in_future: 'staff.attendance.rpc.date_in_future',
  enrollment_class_mismatch: 'staff.attendance.rpc.enrollment_class_mismatch',
  enrollment_not_active: 'staff.attendance.rpc.enrollment_not_active',
};

export function useDayLabel() {
  const { t } = useI18n();
  return useCallback(
    (iso: string) =>
      t('staff.attendance.dayLabel', {
        weekday: t(weekdayKey(isoWeekday(iso))),
        day: Number(iso.slice(8, 10)),
        month: t(monthKey(iso)),
        year: iso.slice(0, 4),
      }),
    [t],
  );
}

// ---- One student's status buttons ---------------------------------------------------

function StatusButton({
  status,
  selected,
  onPress,
  name,
}: {
  status: AttendanceStatus;
  selected: boolean;
  onPress: () => void;
  name: string;
}) {
  const { t } = useI18n();
  const { colours, p } = useTheme();
  const { focusProps, ring } = useFocusRing();
  const look = STATUS_LOOK[status];
  const label = t(look.label);
  return (
    <Pressable
      {...focusProps}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityLabel={t('staff.attendance.rowLabel', { name, status: label })}
      accessibilityState={{ selected, checked: selected }}
      style={({ pressed }) => [
        styles.status,
        {
          minHeight: p.minTarget - 8,
          borderColor: selected ? colours[look.fill] : colours.border,
          backgroundColor: selected
            ? colours[look.soft]
            : pressed
              ? colours.surfaceAlt
              : colours.surface,
        },
        ring,
      ]}
    >
      {selected ? <Icon name={look.icon} size={16} tone={look.onSoft} /> : null}
      <Text variant="label" tone={selected ? look.onSoft : 'textMuted'}>
        {label}
      </Text>
    </Pressable>
  );
}

function History({ attendanceId }: { attendanceId: string }) {
  const { t, locale } = useI18n();
  const res = useResult(`ah:${attendanceId}`, () => loadEdits(attendanceId));
  if (!res.state || res.state.status === 'loading') return <SkeletonLines lines={2} />;
  if (res.state.status === 'error') {
    return (
      <View style={styles.inline}>
        <Text tone="onWrongSoft">{t('staff.attendance.historyLoadError')}</Text>
        <Button title={t('staff.retry')} variant="ghost" size="sm" onPress={res.reload} />
      </View>
    );
  }
  if (!res.state.data.length)
    return <Text tone="textMuted">{t('staff.attendance.historyEmpty')}</Text>;
  const word = (s: string) => (s in STATUS_LOOK ? t(STATUS_LOOK[s as AttendanceStatus].label) : s);
  const reason = (r: string) =>
    r === ATTENDANCE_SAME_DAY_REASON
      ? t('staff.attendance.reasons.sameDay')
      : r === ATTENDANCE_OLD_APP_REASON
        ? t('staff.attendance.reasons.oldApp')
        : r;
  return (
    <View accessibilityRole="list" style={styles.history}>
      {res.state.data.map((e) => (
        <Text key={e.id} variant="bodySm" tone="textMuted">
          {[
            new Date(e.editedAt).toLocaleString(locale === 'ur' ? 'ur-PK' : 'en-GB', {
              numberingSystem: 'latn',
              dateStyle: 'medium',
              timeStyle: 'short',
            }),
            t('staff.attendance.historyRow', { from: word(e.prev), to: word(e.next) }),
            reason(e.reason),
          ].join(' · ')}
        </Text>
      ))}
    </View>
  );
}

const Row = memo(function Row({
  entry,
  status,
  saved,
  onSet,
}: {
  entry: RosterEntry;
  status: AttendanceStatus;
  saved: SavedMark | undefined;
  onSet: (enrollmentId: string, s: AttendanceStatus) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const meta = [
    entry.rollNumber != null
      ? t('console.attendance.mark.roll', { roll: entry.rollNumber })
      : t('console.attendance.mark.noRoll'),
    t('console.attendance.mark.code', { code: entry.code }),
  ].join(' · ');
  return (
    <View style={styles.row}>
      <View style={styles.who}>
        <Text variant="label">{entry.name}</Text>
        <View style={styles.inline}>
          <Text variant="caption" tone="textMuted">
            {meta}
          </Text>
          {saved && saved.editCount > 0 ? (
            <Button
              title={
                open
                  ? t('staff.attendance.hideHistory')
                  : t('staff.attendance.edited', { count: saved.editCount })
              }
              variant="ghost"
              size="sm"
              onPress={() => setOpen((o) => !o)}
            />
          ) : null}
        </View>
      </View>
      <View accessibilityRole="radiogroup" accessibilityLabel={entry.name} style={styles.statuses}>
        {ATTENDANCE_STATUSES.map((s) => (
          <StatusButton
            key={s}
            status={s}
            name={entry.name}
            selected={s === status}
            onPress={() => onSet(entry.enrollmentId, s)}
          />
        ))}
      </View>
      {open && saved ? <History attendanceId={saved.id} /> : null}
    </View>
  );
});

// ---- The class-day --------------------------------------------------------------

function ClassDay({ cls, year, date }: { cls: ScopeClass; year: Year; date: string }) {
  const { t } = useI18n();
  const { colours } = useTheme();
  const { userStorage } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const { save, flushNow, syncedTick } = useAttendanceSync();
  const queued = useQueuedDay(cls.id, date);
  const res = useResult(`d:${cls.id}:${date}:${syncedTick}`, () =>
    loadDay(cls.id, year.id, date, userStorage),
  );
  const dayKey = `${cls.id}:${date}`;
  const [edits, setEdits] = useState<{ key: string; marks: Marks }>({ key: dayKey, marks: {} });
  const mine = useMemo(() => (edits.key === dayKey ? edits.marks : {}), [edits, dayKey]);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState(false);
  const [saving, setSaving] = useState(false);

  const day = res.state?.status === 'ready' ? res.state.data : null;
  const ids = useMemo(() => day?.roster.map((r) => r.enrollmentId) ?? [], [day]);
  const saved = useMemo(() => (day ? savedStatuses(day.saved) : {}), [day]);
  // What the screen starts from: the day still waiting on this device, else the server's.
  const base = useMemo(
    () => (queued ? { ...saved, ...payloadMarks(queued.payload as AttendancePayload) } : saved),
    [queued, saved],
  );
  const marks = useMemo(() => seedMarks(ids, { ...base, ...mine }), [ids, base, mine]);
  const counts = useMemo(() => tallyStatuses(Object.values(marks)), [marks]);
  const today = schoolToday();
  // Also when the server refused the waiting day for want of one (the device
  // copy of the roster doesn't know which marks were already saved).
  const reasonNeeded =
    needsReason(date, today, saved, marks) ||
    (queued?.state === 'rejected' && refusalOf(queued) === 'reason_required');
  const dirty = changedFromSaved(base, marks).length > 0;

  const onSet = useCallback(
    (id: string, s: AttendanceStatus) =>
      setEdits((e) => ({
        key: dayKey,
        marks: { ...(e.key === dayKey ? e.marks : {}), [id]: s },
      })),
    [dayKey],
  );

  if (res.state?.status !== 'ready' || !day) {
    return (
      <LoadState
        state={res.state}
        title={t('console.attendance.mark.loadRosterError')}
        onRetry={res.reload}
      />
    );
  }
  if (!day.roster.length) {
    return (
      <EmptyState
        icon="user"
        title={t('console.attendance.mark.empty', { class: cls.name, year: year.label })}
      />
    );
  }

  const onSave = async () => {
    if (reasonNeeded && !reason.trim()) {
      setReasonError(true);
      return;
    }
    setSaving(true);
    const r = await save(buildAttendancePayload(cls.id, date, ids, marks, reason));
    setSaving(false);
    if (r === 'error') {
      toast(t('staff.attendance.storageFull'), 'warn');
      return;
    }
    if (r === 'rejected') {
      toast(t('staff.attendance.rejectedToast'), 'warn');
      return;
    }
    setEdits({ key: dayKey, marks: {} });
    setReason('');
    setReasonError(false);
    if (r === 'sent') {
      toast(t('console.attendance.mark.success', { date }), 'success'); // the sync tick reloads the day
    } else {
      toast(t('staff.attendance.queued'), 'info');
    }
  };

  const takenNote = queued
    ? null
    : Object.keys(day.saved).length
      ? t('staff.attendance.taken')
      : day.fromCache
        ? null
        : t('staff.attendance.notTaken');

  return (
    <View style={styles.wrap}>
      {day.fromCache ? (
        <Card style={{ backgroundColor: colours.accentSoft }}>
          <Text tone="onAccentSoft">{t('staff.attendance.offlineCopy')}</Text>
        </Card>
      ) : null}
      {queued?.state === 'rejected' ? (
        <Card style={{ backgroundColor: colours.wrongSoft }}>
          <View style={styles.gapSm}>
            <Text tone="onWrongSoft">
              {t('staff.attendance.refused', {
                why: t(REFUSALS[refusalOf(queued)] ?? 'staff.attendance.rpc.other'),
              })}
            </Text>
            <View style={styles.inline}>
              {refusalOf(queued) === 'reason_required' ? null : (
                <Button
                  title={t('staff.retry')}
                  variant="secondary"
                  size="sm"
                  onPress={() => flushNow()}
                />
              )}
              <Button
                title={t('staff.attendance.reload')}
                variant="ghost"
                size="sm"
                onPress={res.reload}
              />
            </View>
          </View>
        </Card>
      ) : queued ? (
        <Card style={{ backgroundColor: colours.accentSoft }}>
          <Text tone="onAccentSoft">{t('staff.attendance.waiting')}</Text>
        </Card>
      ) : null}

      <Text tone="textMuted">{t('staff.attendance.hint')}</Text>
      <View style={styles.inline}>
        <Text variant="label" accessibilityLiveRegion="polite">
          {t('console.attendance.mark.summary', {
            present: counts.present,
            absent: counts.absent,
            late: counts.late,
            leave: counts.leave,
          })}
        </Text>
        {dirty ? (
          <Badge label={t('staff.attendance.unsaved')} tone="accent" icon="pencil" />
        ) : takenNote ? (
          <Badge
            label={takenNote}
            tone={Object.keys(day.saved).length ? 'correct' : 'neutral'}
            icon={Object.keys(day.saved).length ? 'check' : 'info'}
          />
        ) : null}
      </View>
      {date < today ? <Text tone="textMuted">{t('staff.attendance.pastDay')}</Text> : null}

      <Card padded={false}>
        {day.roster.map((r, i) => (
          <View
            key={r.enrollmentId}
            style={i > 0 ? [styles.divider, { borderColor: colours.border }] : null}
          >
            <Row
              entry={r}
              status={marks[r.enrollmentId] ?? 'present'}
              saved={day.saved[r.enrollmentId]}
              onSet={onSet}
            />
          </View>
        ))}
      </Card>

      {reasonNeeded ? (
        <TextField
          label={t('staff.attendance.reason')}
          helper={t('staff.attendance.reasonHelp')}
          error={reasonError ? t('staff.attendance.reasonRequired') : undefined}
          value={reason}
          onChangeText={(v) => {
            setReason(v);
            if (v.trim()) setReasonError(false);
          }}
          onSubmitEditing={onSave}
        />
      ) : null}
      <View style={styles.inline}>
        <Button
          title={saving ? t('console.attendance.mark.saving') : t('console.attendance.mark.save')}
          icon="check"
          loading={saving}
          disabled={saving}
          onPress={onSave}
        />
        <Button
          title={t('console.attendance.mark.markAllPresent')}
          variant="ghost"
          disabled={saving}
          onPress={() =>
            setEdits({
              key: dayKey,
              marks: Object.fromEntries(ids.map((id) => [id, 'present' as const])),
            })
          }
        />
        <Button
          title={t('staff.attendanceSummary.title')}
          variant="ghost"
          onPress={() => router.push({ pathname: '/attendance-summary', params: { date } })}
        />
      </View>
    </View>
  );
}

// ---- Class + day pickers ---------------------------------------------------------------

function Marking({
  year,
  classes,
  isStaff,
  initialClassId,
  initialDate,
}: {
  year: Year;
  classes: ScopeClass[];
  isStaff: boolean;
  initialClassId: string | null;
  initialDate: string | null;
}) {
  const { t } = useI18n();
  const dayLabel = useDayLabel();
  const today = schoolToday();
  const [classId, setClassId] = useState<string | null>(
    classes.some((c) => c.id === initialClassId) ? initialClassId : null,
  );
  const [date, setDate] = useState(
    initialDate && !markingDateError(initialDate, today) ? initialDate : today,
  );
  const [typed, setTyped] = useState('');
  const [typedError, setTypedError] = useState<TKey | null>(null);
  const cls = classes.find((c) => c.id === classId) ?? classes[0]!;

  const go = () => {
    const err = markingDateError(typed, today);
    if (err) {
      setTypedError(`console.attendance.errors.${err}`);
      return;
    }
    setTypedError(null);
    setDate(typed.trim());
    setTyped('');
  };

  return (
    <View style={styles.wrap}>
      <Text tone="textMuted">
        {t(isStaff ? 'console.attendance.subtitleAdmin' : 'console.attendance.subtitleTeacher', {
          year: year.label,
        })}
      </Text>
      {classes.length > 1 ? (
        <ChipPicker
          label={t('console.attendance.pickClass')}
          chips={classes.map((c) => ({ value: c.id, label: c.name }))}
          value={cls.id}
          onChange={setClassId}
        />
      ) : (
        <Text variant="heading">{cls.name}</Text>
      )}
      <View style={styles.dayBar}>
        <Button
          title={t('staff.attendance.prevDay')}
          icon="chevronStart"
          variant="secondary"
          size="sm"
          onPress={() => setDate((d) => addDays(d, -1))}
        />
        <View style={styles.dayLabel}>
          <Text variant="heading" accessibilityRole="header" accessibilityLiveRegion="polite">
            {dayLabel(date)}
          </Text>
          {date === today ? (
            <Badge label={t('staff.attendance.todayTag')} tone="primary" />
          ) : (
            <Button
              title={t('console.attendance.mark.today')}
              variant="ghost"
              size="sm"
              onPress={() => setDate(today)}
            />
          )}
        </View>
        <Button
          title={t('staff.attendance.nextDay')}
          icon="chevronEnd"
          variant="secondary"
          size="sm"
          disabled={date >= today}
          onPress={() => setDate((d) => (d < today ? addDays(d, 1) : d))}
        />
      </View>
      <View style={styles.goRow}>
        <TextField
          label={t('staff.attendance.goToDate')}
          helper={t('staff.attendance.goToDateHelp')}
          error={typedError ? t(typedError) : undefined}
          value={typed}
          onChangeText={setTyped}
          onSubmitEditing={go}
          script="latin"
          inputMode="numeric"
          style={styles.flex}
        />
        <Button title={t('staff.attendance.go')} variant="secondary" size="sm" onPress={go} />
      </View>
      <ClassDay key={`${cls.id}:${date}`} cls={cls} year={year} date={date} />
    </View>
  );
}

function MarkingGate({
  initialClassId,
  initialDate,
}: {
  initialClassId: string | null;
  initialDate: string | null;
}) {
  const { t } = useI18n();
  const { session, destination, userStorage } = useAuth();
  const userId = session?.user.id ?? null;
  const isStaff = destination === 'admin';
  const { state, reload } = useResult(userId ? `ms:${userId}:${isStaff}` : null, () =>
    loadMarkingScope(userId!, isStaff, userStorage),
  );
  if (!state || state.status !== 'ready') {
    return <LoadState state={state} title={t('staff.scope.loadError')} onRetry={reload} />;
  }
  const { year, classes } = state.data;
  if (!year) {
    return (
      <EmptyState
        icon="clock"
        title={t('staff.scope.noYear')}
        body={t(isStaff ? 'staff.scope.noYearStaff' : 'staff.scope.noYearTeacher')}
      />
    );
  }
  if (!classes.length) {
    return (
      <EmptyState
        icon="user"
        title={t(isStaff ? 'staff.scope.noClasses' : 'staff.scope.noAssignments')}
        body={t(isStaff ? 'staff.scope.noClassesStaff' : 'staff.scope.noAssignmentsTeacher')}
      />
    );
  }
  return (
    <Marking
      year={year}
      classes={classes}
      isStaff={isStaff}
      initialClassId={initialClassId}
      initialDate={initialDate}
    />
  );
}

export function MarkScreen({ classId, date }: { classId: string | null; date: string | null }) {
  const { t } = useI18n();
  const router = useRouter();
  const { status, pending, flushNow } = useAttendanceSync();
  return (
    <>
      <View style={styles.top}>
        <Button
          title={t('staff.back')}
          icon="back"
          variant="ghost"
          size="sm"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        />
        <SyncStatusPill status={status} pending={pending} onRetry={() => flushNow()} />
      </View>
      <Text variant="title" accessibilityRole="header">
        {t('console.attendance.title')}
      </Text>
      <MarkingGate initialClassId={classId} initialDate={date} />
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  gapSm: { gap: space.sm },
  top: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  inline: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
  dayBar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
  dayLabel: {
    flexGrow: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  goRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
  flex: { flex: 1 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
  },
  who: { flexGrow: 1, flexBasis: 200, gap: space.xxs },
  statuses: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xxs,
    paddingHorizontal: space.sm,
    borderWidth: strokeWidth.control,
    borderRadius: radius.full,
  },
  history: { flexBasis: '100%', gap: space.xxs },
});
