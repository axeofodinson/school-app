// Typed i18n for the new app. Strings live in ./locales/{en,ur}.json (copied from
// the old app's locales/, which stay untouched). Direction comes from this JS
// locale state only; never I18nManager.forceRTL (it sticks across restarts).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Platform } from 'react-native';
import { interpolate, isPluralLeaf } from '@school/core';

import en from './locales/en.json';
import ur from './locales/ur.json';

export type Locale = 'en' | 'ur';
export const LOCALES: readonly Locale[] = ['en', 'ur'];
const RTL: ReadonlySet<Locale> = new Set(['ur']);
const STORAGE_KEY = 'app.locale';
/** Untranslated Urdu values end with this marker; they fall back to English. */
const TODO_MARKER = ' // TODO: ur';

type Plural = { one: string; other: string };
type KeyPaths<T> = {
  [K in keyof T & string]: T[K] extends string | Plural ? K : `${K}.${KeyPaths<T[K]>}`;
}[keyof T & string];

/** Every valid translation key, e.g. 'auth.student.title'. */
export type TKey = KeyPaths<typeof en>;
export type TParams = Record<string, string | number>;

type Tree = { [k: string]: unknown };
const tables: Record<Locale, Tree> = { en, ur };

function lookup(tree: Tree, key: string): unknown {
  let node: unknown = tree;
  for (const part of key.split('.')) {
    if (!node || typeof node !== 'object') return undefined;
    node = (node as Tree)[part];
  }
  return node;
}

function resolve(locale: Locale, key: TKey, params?: TParams): string | undefined {
  let node = lookup(tables[locale], key);
  if (isPluralLeaf(node)) {
    const count = Number(params?.count);
    node = (count === 1 ? node.one : undefined) ?? node.other;
  }
  if (typeof node !== 'string' || node.endsWith(TODO_MARKER)) return undefined;
  return interpolate(node, params);
}

/** Translate without React (falls back to English, then to the key itself). */
export function translate(locale: Locale, key: TKey, params?: TParams): string {
  return resolve(locale, key, params) ?? resolve('en', key, params) ?? key;
}

export const isRTLLocale = (locale: Locale) => RTL.has(locale);

function deviceLocale(): Locale {
  const code = getLocales()[0]?.languageCode;
  return code === 'ur' ? 'ur' : 'en';
}

interface I18nValue {
  locale: Locale;
  isRTL: boolean;
  /** Ready once the saved choice has been read, so the first frame is right. */
  ready: boolean;
  setLocale: (locale: Locale) => void;
  t: (key: TKey, params?: TParams) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(deviceLocale);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (alive && saved && (LOCALES as readonly string[]).includes(saved)) {
          setLocaleState(saved as Locale);
        }
      })
      .catch(() => undefined) // storage can be unavailable (private window): keep device locale
      .finally(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, []);

  const isRTL = isRTLLocale(locale);

  useEffect(() => {
    // On web, let the browser shape and align text for the active language too.
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.documentElement.lang = locale;
      document.documentElement.dir = isRTL ? 'rtl' : 'ltr';
    }
  }, [locale, isRTL]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => undefined);
  }, []);

  const value = useMemo<I18nValue>(
    () => ({
      locale,
      isRTL,
      ready,
      setLocale,
      t: (key, params) => translate(locale, key, params),
    }),
    [locale, isRTL, ready, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
}
