// ToastProvider — one global dispatch point for in-app notification banners.
//
// Mounted once at the app root (App.js), directly inside AuthProvider, so the
// SAME provider serves every surface — student app, teacher, and the admin
// console — and any code path (foreground push, Supabase Realtime, or a plain
// in-app event) can raise a banner with useToast().showToast(...).
//
// Queueing/dedupe policy lives in ./toastQueue (pure, verified by
// scripts/verify-toast-queue.mjs); rendering/animation lives in ./Toast.
// This file only glues them to React state.
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useAuth } from '../auth/AuthProvider';
import ToastHost from './Toast';
import { createToastQueue, pushToast, advanceToast } from './toastQueue';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const { role } = useAuth();
  const [queue, setQueue] = useState(createToastQueue);
  // Monotonic key per shown toast — React remount key, distinct from the
  // optional dedupe `id` (which names the underlying event, e.g. a message row).
  const nextKey = useRef(0);

  // showToast({ title, body?, id?, icon?, onPress? })
  //   id      — dedupe id; the same id is shown at most once per session
  //             (covers a message arriving via both push AND Realtime).
  //   onPress — optional tap action (e.g. open the inbox); tap always
  //             dismisses, with or without one.
  const showToast = useCallback((toast) => {
    if (!toast?.title) return; // nothing worth interrupting for
    nextKey.current += 1;
    const entry = { key: nextKey.current, ...toast };
    setQueue((q) => pushToast(q, entry).state);
  }, []);

  // The visible toast finished (auto/swipe/tap) → promote the next in line.
  // Guarded by key so a stale animation callback can't skip a newer toast.
  const handleDone = useCallback((key) => {
    setQueue((q) => (q.current?.key === key ? advanceToast(q) : q));
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastHost
        toast={queue.current}
        isStudent={role === 'student'}
        onDone={handleDone}
      />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
}
