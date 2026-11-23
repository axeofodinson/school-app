import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

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

/**
 * Light/dark + age presentation (DESIGN_SYSTEM.md §2.1, §3). Nestable: a prop left
 * undefined inherits from the parent provider, so a screen (or the gallery) can
 * override just one of them. The root follows the OS scheme until a Settings
 * choice exists; presentation comes from the active enrollment (prompt 03).
 */
export function ThemeProvider({
  scheme,
  presentation,
  children,
}: {
  scheme?: Scheme | 'system';
  presentation?: PresentationId;
  children: ReactNode;
}) {
  const parent = useContext(ThemeContext);
  const os = useColorScheme();
  const resolvedScheme: Scheme =
    scheme === 'light' || scheme === 'dark'
      ? scheme
      : scheme === 'system' || !parent
        ? os === 'dark'
          ? 'dark'
          : 'light'
        : parent.scheme;
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

export function useTheme(): Theme {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
