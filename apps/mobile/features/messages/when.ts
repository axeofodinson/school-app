import type { TKey, TParams } from '../../i18n';

/** "25 November, 14:05" in the device's time, month names from i18n. */
export function formatWhen(iso: string, t: (k: TKey, p?: TParams) => string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const month = t(`common.months.m${String(d.getMonth() + 1).padStart(2, '0')}` as TKey);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getDate()} ${month}, ${hh}:${mm}`;
}
