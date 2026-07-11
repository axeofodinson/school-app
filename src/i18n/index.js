// i18n plumbing. All user-facing strings live in locales/en.json + locales/ur.json.
// No hardcoded strings in screens. Every English key must have an Urdu counterpart
// (mark not-yet-translated Urdu with a "// TODO: ur" note in the JSON value).
import { I18nManager } from 'react-native';
import { I18n } from 'i18n-js';
import { getLocales } from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';

import en from '../../locales/en.json';
import ur from '../../locales/ur.json';

export const i18n = new I18n({ en, ur });

// Fall back to English for any key missing a translation.
i18n.enableFallback = true;
i18n.defaultLocale = 'en';

export const SUPPORTED_LOCALES = ['en', 'ur'];
const RTL_LOCALES = ['ur'];

// Where the user's chosen locale is remembered across app restarts.
const LOCALE_STORAGE_KEY = 'app.locale';

// Pick the device language; default to English until the user chooses. A saved
// choice (loadPersistedLocale, at boot) overrides this.
const deviceLang = getLocales()?.[0]?.languageCode ?? 'en';
i18n.locale = SUPPORTED_LOCALES.includes(deviceLang) ? deviceLang : 'en';

// Whether a given locale reads right-to-left.
export const localeIsRTL = (locale) => RTL_LOCALES.includes(locale);

// Urdu is RTL — screens must use logical (start/end) layout props, not left/right.
// Mutable: it tracks the active locale so a runtime switch flips layout on the
// next render. Screens read this at render time (via re-render), not once.
export let isRTL = localeIsRTL(i18n.locale);

// Align the native layout direction with the active locale.
//
// I18nManager.forceRTL flips the whole layout (flex, start/end, text align) at
// the native level, but the change only takes full effect after the JS bundle
// reloads. We return whether a reload is needed so the caller can decide. The
// app also mirrors at the JS level (ScreenContainer sets the `direction` style,
// Text sets textAlign/writingDirection off `isRTL`), so the switch is visible
// immediately; forceRTL keeps the native side consistent on the next launch.
// Returns true if the direction changed and a reload is required to apply it.
export function applyLayoutDirection(rtl = isRTL) {
  I18nManager.allowRTL(true);
  if (I18nManager.isRTL === rtl) return false;
  I18nManager.forceRTL(rtl);
  return true;
}

// Point the app at a locale in memory: i18n strings + the RTL flag + native
// layout direction. Does not persist — callers that persist use setLocale.
function activateLocale(locale) {
  i18n.locale = locale;
  isRTL = localeIsRTL(locale);
  applyLayoutDirection(isRTL);
}

// Load the saved locale (if any) and apply it. Call once at boot, before the
// first render, so the app starts in the user's remembered language/direction.
export async function loadPersistedLocale() {
  try {
    const saved = await AsyncStorage.getItem(LOCALE_STORAGE_KEY);
    if (saved && SUPPORTED_LOCALES.includes(saved)) {
      activateLocale(saved);
      return saved;
    }
  } catch (e) {
    // No stored choice / storage unavailable — fall back to the device locale.
  }
  applyLayoutDirection(isRTL);
  return i18n.locale;
}

// Change the active locale at runtime and remember the choice. The React layer
// (LanguageProvider) re-renders after this so the UI flips.
export async function setLocale(locale) {
  if (!SUPPORTED_LOCALES.includes(locale)) return;
  activateLocale(locale);
  try {
    await AsyncStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch (e) {
    // Persisting failed (storage full/unavailable); the in-memory switch still
    // applies for this session.
  }
}

export const getLocale = () => i18n.locale;

export const t = (key, opts) => i18n.t(key, opts);
