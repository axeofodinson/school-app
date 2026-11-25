// Age presentation for the student app (DESIGN_SYSTEM §3): PG–Class 5 get "kid"
// (bigger type and targets, keypad PIN, airy spacing, bouncy celebrations), older
// students "student". It comes from the active enrollment's class grade, which the
// home data already loads; it is remembered per signed-in user on this device so a
// reload straight into a test keeps the right size.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { ThemeProvider } from '../../ui';
import { presentationForGrade, type PresentationId } from '../../ui/tokens';
import { useAuth } from '../auth/AuthProvider';

const Ctx = createContext<(p: PresentationId) => void>(() => undefined);
const keyFor = (uid: string) => `app.presentation.${uid}`;

export function StudentPresentationProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const uid = session?.user.id ?? null;
  const [p, setP] = useState<PresentationId>('student');
  useEffect(() => {
    if (!uid) return;
    let live = true;
    AsyncStorage.getItem(keyFor(uid))
      .then((v) => live && (v === 'kid' || v === 'student') && setP(v))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [uid]);
  const set = useMemo(
    () => (next: PresentationId) => {
      setP(next);
      if (uid) AsyncStorage.setItem(keyFor(uid), next).catch(() => undefined);
    },
    [uid],
  );
  return (
    <Ctx.Provider value={set}>
      <ThemeProvider presentation={p}>{children}</ThemeProvider>
    </Ctx.Provider>
  );
}

/** Call with the enrollment's grade once it is known (undefined = not loaded yet). */
export function useGradePresentation(gradeLevel: number | null | undefined) {
  const set = useContext(Ctx);
  useEffect(() => {
    if (gradeLevel === undefined) return;
    set(presentationForGrade(gradeLevel));
  }, [gradeLevel, set]);
}
