// State a stage visual shares with the words beside it and the reader's
// controls (DESIGN_SYSTEM.md §7b.2): the scene step (its caption shows under
// the stage), Play/Pause, and whether the predict question was answered.
// One session per lesson part; it resets when the part changes. A visual used
// on its own (the gallery) gets a private session from the same hook.
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

export interface VisualSession {
  step: number;
  setStep: (n: number) => void;
  /** Steps in the current visual (scenes); 0 = not stepped. */
  count: number;
  setCount: (n: number) => void;
  playing: boolean;
  setPlaying: (p: boolean) => void;
  /** Bumped by the reader's Play button / Space; the visual decides what it means. */
  playToken: number;
  requestPlay: () => void;
  predicted: boolean;
  setPredicted: (p: boolean) => void;
}

export function useVisualSessionState(): VisualSession {
  const [step, setStep] = useState(0);
  const [count, setCount] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [playToken, setToken] = useState(0);
  const [predicted, setPredicted] = useState(false);
  return useMemo(
    () => ({
      step,
      setStep,
      count,
      setCount,
      playing,
      setPlaying,
      playToken,
      requestPlay: () => setToken((n) => n + 1),
      predicted,
      setPredicted,
    }),
    [step, count, playing, playToken, predicted],
  );
}

const Ctx = createContext<VisualSession | null>(null);

export function VisualSessionProvider({
  value,
  children,
}: {
  value: VisualSession;
  children: ReactNode;
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The surrounding session, or a private one when the visual stands alone. */
export function useVisualSession(): VisualSession {
  const outer = useContext(Ctx);
  const own = useVisualSessionState();
  return outer ?? own;
}

export function useOuterVisualSession(): VisualSession | null {
  return useContext(Ctx);
}
