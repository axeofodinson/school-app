// Runtime language state for the whole app.
//
// The i18n module (./index) holds the active locale, the RTL flag, and native
// layout direction. This provider is the React layer on top: when the locale
// changes it re-renders the tree so strings, direction, and fonts flip live.
// The choice is persisted (see setLocale) so it survives app restarts.
import { createContext, useCallback, useContext, useState } from 'react';

import {
  getLocale,
  setLocale as applyLocale,
  localeIsRTL,
  SUPPORTED_LOCALES,
} from './index';

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  // Seeded from the locale already resolved at boot (loadPersistedLocale).
  const [locale, setLocaleState] = useState(getLocale());

  const setLocale = useCallback(async (next) => {
    if (next === getLocale()) return;
    await applyLocale(next); // updates i18n + RTL flag + native direction + persists
    setLocaleState(next); // re-render the tree so the UI flips
  }, []);

  const toggle = useCallback(() => {
    setLocale(getLocale() === 'ur' ? 'en' : 'ur');
  }, [setLocale]);

  const value = {
    locale,
    isRTL: localeIsRTL(locale),
    locales: SUPPORTED_LOCALES,
    setLocale,
    toggle,
  };

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within a LanguageProvider');
  return ctx;
}
