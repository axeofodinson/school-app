// i18n plumbing. All user-facing strings live in locales/en.json + locales/ur.json.
// No hardcoded strings in screens. Every English key must have an Urdu counterpart
// (mark not-yet-translated Urdu with a "// TODO: ur" note in the JSON value).
import { I18nManager } from 'react-native';
import { I18n } from 'i18n-js';
import { getLocales } from 'expo-localization';

import en from '../../locales/en.json';
import ur from '../../locales/ur.json';

export const i18n = new I18n({ en, ur });

// Fall back to English for any key missing a translation.
i18n.enableFallback = true;
i18n.defaultLocale = 'en';

export const SUPPORTED_LOCALES = ['en', 'ur'];
const RTL_LOCALES = ['ur'];

// Pick the device language; default to English until the user chooses.
const deviceLang = getLocales()?.[0]?.languageCode ?? 'en';
i18n.locale = SUPPORTED_LOCALES.includes(deviceLang) ? deviceLang : 'en';

// Urdu is RTL — screens must use logical (start/end) layout props, not left/right.
export const isRTL = RTL_LOCALES.includes(i18n.locale);

// Align the native layout direction with the active locale.
//
// I18nManager.forceRTL flips the whole layout (flex, start/end, text align) at
// the native level, but the change only takes full effect after the JS bundle
// reloads. We return whether a reload is needed so the caller (App bootstrap)
// can decide — on first launch the value usually already matches, so no reload.
// Returns true if the direction changed and a reload is required to apply it.
export function applyLayoutDirection(rtl = isRTL) {
  I18nManager.allowRTL(true);
  if (I18nManager.isRTL === rtl) return false;
  I18nManager.forceRTL(rtl);
  return true;
}

export const t = (key, opts) => i18n.t(key, opts);
