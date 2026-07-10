// i18n plumbing. All user-facing strings live in locales/en.json + locales/ur.json.
// No hardcoded strings in screens. Every English key must have an Urdu counterpart
// (mark not-yet-translated Urdu with a "// TODO: ur" note in the JSON value).
import { I18n } from 'i18n-js';
import { getLocales } from 'expo-localization';

import en from '../../locales/en.json';
import ur from '../../locales/ur.json';

export const i18n = new I18n({ en, ur });

// Fall back to English for any key missing a translation.
i18n.enableFallback = true;
i18n.defaultLocale = 'en';

// Pick the device language; default to English until the user chooses.
const deviceLang = getLocales()?.[0]?.languageCode ?? 'en';
i18n.locale = ['en', 'ur'].includes(deviceLang) ? deviceLang : 'en';

// Urdu is RTL — screens must use logical (start/end) layout props, not left/right.
export const isRTL = i18n.locale === 'ur';

export const t = (key, opts) => i18n.t(key, opts);
