// How each attendance status looks everywhere (marking rows, calendar cells,
// badges): a colour pair plus an icon and the word, never colour alone.
import type { AttendanceStatus } from '@school/core';

import type { TKey } from '../../i18n';
import type { IconName } from '../../ui';
import type { ColourRoles } from '../../ui/tokens';

export interface StatusLook {
  icon: IconName;
  soft: keyof ColourRoles;
  onSoft: keyof ColourRoles;
  fill: keyof ColourRoles;
  label: TKey;
}

export const STATUS_LOOK: Record<AttendanceStatus, StatusLook> = {
  present: {
    icon: 'check',
    soft: 'correctSoft',
    onSoft: 'onCorrectSoft',
    fill: 'correct',
    label: 'console.attendance.statuses.present',
  },
  absent: {
    icon: 'close',
    soft: 'wrongSoft',
    onSoft: 'onWrongSoft',
    fill: 'wrong',
    label: 'console.attendance.statuses.absent',
  },
  late: {
    icon: 'clock',
    soft: 'weakSoft',
    onSoft: 'onWeakSoft',
    fill: 'weak',
    label: 'console.attendance.statuses.late',
  },
  leave: {
    icon: 'info',
    soft: 'learningSoft',
    onSoft: 'onLearningSoft',
    fill: 'learning',
    label: 'console.attendance.statuses.leave',
  },
};

export const monthKey = (iso: string) => `common.months.m${iso.slice(5, 7)}` as TKey;
export const weekdayKey = (i: number) => `common.weekdaysShort.d${i}` as TKey;
