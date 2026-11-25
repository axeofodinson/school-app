import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { colours, presentations, type ColourRoles, type PresentationId } from './tokens';

export type Scheme = 'light' | 'dark';

export interface Theme {
  scheme: Scheme;
  colours: ColourRoles;
  presentation: PresentationId;
  /** Presentation metrics: touch target, control height, icon size, radius boost… */
  p: (typeof presentations)[PresentationId];
}

const ThemeContext = createContext<Theme | null>(null);

// TODO(61): namespace per signed-in user on shared Chromebooks (like app.motion / app.sound).
const STORAGE_KEY = 'app.scheme';

type SchemeSetting = { scheme: Scheme; setScheme: (s: Scheme) => void };
const SchemeContext = createContext<SchemeSetting>({
  scheme: 'light',
  setScheme: () => undefined,
});

/** The saved light/dark choice (Settings → Theme). Light unless the user picked dark. */
export const useSchemeSetting = () => useContext(SchemeContext);

/**
 * Light/dark + age presentation (DESIGN_SYSTEM.md §2.1, §3). Nestable: a prop left
 * undefined inherits from the parent provider, so a screen (or the gallery) can
 * override just one of them. The root is **light by default and never follows the
 * OS** (Hassan, 2026-11-25, DECISIONS #125): dark only when the user picks it in
 * Settings, saved per device. Presentation comes from the active enrollment (prompt 03).
 */
export function ThemeProvider({
  scheme,
  presentation,
  children,
}: {
  scheme?: Scheme;
  presentation?: PresentationId;
  children: ReactNode;
}) {
  const parent = useContext(ThemeContext);
  const saved = useContext(SchemeContext);
  const resolvedScheme: Scheme = scheme ?? parent?.scheme ?? saved.scheme;
  const resolvedPresentation = presentation ?? parent?.presentation ?? 'student';

  const value = useMemo<Theme>(
    () => ({
      scheme: resolvedScheme,
      colours: colours[resolvedScheme],
      presentation: resolvedPresentation,
      p: presentations[resolvedPresentation],
    }),
    [resolvedScheme, resolvedPresentation],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Root only: loads and saves the Settings light/dark choice. Wrap the root ThemeProvider. */
export function SchemeProvider({ children }: { children: ReactNode }) {
  const [scheme, setState] = useState<Scheme>('light');
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => alive && v === 'dark' && setState('dark'))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  const setScheme = useCallback((s: Scheme) => {
    setState(s);
    AsyncStorage.setItem(STORAGE_KEY, s).catch(() => undefined);
  }, []);
  const value = useMemo(() => ({ scheme, setScheme }), [scheme, setScheme]);
  return <SchemeContext.Provider value={value}>{children}</SchemeContext.Provider>;
}

export function useTheme(): Theme {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
