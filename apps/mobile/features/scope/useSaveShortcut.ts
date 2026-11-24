import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

/**
 * Desktop web: Ctrl/⌘ + Enter or Ctrl/⌘ + S saves the form on screen, even from
 * a multi-line field where Enter adds a new line. Single-line fields save on
 * Enter through onSubmitEditing. No-op on Android.
 */
export function useSaveShortcut(onSave: () => void, enabled = true) {
  const ref = useRef(onSave);
  useEffect(() => {
    ref.current = onSave;
  });
  useEffect(() => {
    if (Platform.OS !== 'web' || !enabled || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === 'Enter' || e.key.toLowerCase() === 's') {
        e.preventDefault();
        ref.current();
      }
    };
    // Capture phase: react-native-web's TextInput stops keydown from bubbling.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [enabled]);
}
