import { LOCALES, useI18n, type Locale } from '../i18n';
import { SegmentedControl } from './SegmentedControl';

const labelKey = { en: 'common.english', ur: 'common.urdu' } as const satisfies Record<
  Locale,
  string
>;

/** English ⇄ Urdu. Direction flips instantly (no motion: DESIGN_SYSTEM.md §6.1). */
export function LanguageToggle() {
  const { locale, setLocale, t } = useI18n();
  return (
    <SegmentedControl
      accessibilityLabel={t('common.language')}
      segments={LOCALES.map((l) => ({ value: l, label: t(labelKey[l]) }))}
      value={locale}
      onChange={setLocale}
    />
  );
}
