import type { ReactNode } from 'react';

import { useI18n } from '../../i18n';
import { EmptyState } from '../../ui';
import type { ScopeClass, Year } from './api';
import { LoadState } from './LoadState';
import { useScope } from './useScope';

export interface ReadyScope {
  year: Year;
  classes: ScopeClass[];
  userId: string;
  isStaff: boolean;
}

/**
 * Loads the user's year + classes and stops at the first missing prerequisite
 * with an empty state that says who can fix it. Renders children once there is
 * a current year and at least one class.
 */
export function ScopeGate({ children }: { children: (s: ReadyScope) => ReactNode }) {
  const { t } = useI18n();
  const { state, reload, userId, isStaff } = useScope();
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
  if (!classes.length || !userId) {
    return (
      <EmptyState
        icon="user"
        title={t(isStaff ? 'staff.scope.noClasses' : 'staff.scope.noAssignments')}
        body={t(isStaff ? 'staff.scope.noClassesStaff' : 'staff.scope.noAssignmentsTeacher')}
      />
    );
  }
  return <>{children({ year, classes, userId, isStaff })}</>;
}
