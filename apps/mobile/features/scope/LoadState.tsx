import type { TKey } from '../../i18n';
import { useI18n } from '../../i18n';
import type { ApiErrorKind } from '../../lib/result';
import { Button, EmptyState, SkeletonLines } from '../../ui';
import type { Loadable } from './useResult';

export const ERROR_KEYS: Record<ApiErrorKind, TKey> = {
  network: 'staff.errors.network',
  forbidden: 'staff.errors.forbidden',
  notConfigured: 'auth.errors.notConfigured',
  unknown: 'staff.errors.unknown',
};

/** Loading lines or an error with Retry; renders nothing once the data is ready. */
export function LoadState<T>({
  state,
  title,
  onRetry,
  lines = 3,
}: {
  state: Loadable<T> | null;
  title: string;
  onRetry: () => void;
  lines?: number;
}) {
  const { t } = useI18n();
  if (!state || state.status === 'ready') return null;
  if (state.status === 'loading') return <SkeletonLines lines={lines} />;
  return (
    <EmptyState
      icon="cloudOff"
      title={title}
      body={t(ERROR_KEYS[state.error])}
      action={<Button title={t('staff.retry')} variant="secondary" onPress={onRetry} />}
    />
  );
}
