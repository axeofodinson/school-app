import { reviewKeyAction, type ReviewKeyAction } from '@school/core';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

/** Is the user typing in a field (shortcuts pause)? */
function typingNow(): boolean {
  if (typeof document === 'undefined') return false;
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

/**
 * Windows/Chromebook keyboard for the review queue (core `reviewKeyAction`).
 * Web only; Android uses the buttons. Disabled while a sheet is open so Esc and
 * Enter belong to the sheet.
 */
export function useReviewKeys(onAction: (a: ReviewKeyAction) => void, enabled: boolean) {
  const ref = useRef(onAction);
  useEffect(() => {
    ref.current = onAction;
  });
  useEffect(() => {
    if (Platform.OS !== 'web' || !enabled || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat && !['ArrowDown', 'ArrowUp', 'j', 'k', 'J', 'K'].includes(e.key)) return;
      const a = reviewKeyAction(
        {
          key: e.key,
          code: e.code,
          ctrlKey: e.ctrlKey,
          metaKey: e.metaKey,
          altKey: e.altKey,
          shiftKey: e.shiftKey,
        },
        { typing: typingNow() },
      );
      if (!a) return;
      e.preventDefault();
      ref.current(a);
    };
    // Capture phase: react-native-web's pressables stop some keydowns from bubbling.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [enabled]);
}
