// toastQueue — the pure state machine behind the in-app toast banner.
//
// Kept free of React/React Native imports on purpose: the "multiple rapid
// notifications must not overlap or crash" guarantee lives here, so it can be
// proven in plain Node (scripts/verify-toast-queue.mjs) without a device.
//
// Shape: { current, pending, seen }
//   current — the one toast on screen (or null). Only ever ONE: a new arrival
//             while something is showing waits in `pending`, so toasts can
//             never stack/overlap/clip each other.
//   pending — FIFO of toasts waiting for the screen, capped at MAX_PENDING.
//             Under a flood we keep the newest few; a toast is a glance, and
//             everything durable is still in the inbox (messages table).
//   seen    — recent dedupe ids. The same school message can arrive twice
//             while the app is open (foreground push AND the Supabase
//             Realtime insert), and the student should see one banner, not two.
//
// All functions are pure: they take a state, return a new state, and never
// mutate their input.

export const MAX_PENDING = 4;
export const MAX_SEEN = 50;

export function createToastQueue() {
  return { current: null, pending: [], seen: [] };
}

// Add a toast. `toast.id` is the optional cross-source dedupe id (e.g.
// `msg:<uuid>`); toasts without one are never deduped. Returns
// { state, accepted } so callers can tell a dedupe-drop from an enqueue.
export function pushToast(state, toast) {
  if (toast?.id != null && state.seen.includes(toast.id)) {
    return { state, accepted: false };
  }

  const seen =
    toast?.id != null
      ? [...state.seen.slice(-(MAX_SEEN - 1)), toast.id]
      : state.seen;

  // Screen free → show immediately.
  if (!state.current) {
    return { state: { current: toast, pending: state.pending, seen }, accepted: true };
  }

  // Screen busy → wait in line. Cap the line by dropping the OLDEST waiting
  // toasts (the newest news wins); the inbox remains the durable record.
  const pending = [...state.pending, toast].slice(-MAX_PENDING);
  return { state: { current: state.current, pending, seen }, accepted: true };
}

// The current toast finished (auto-dismiss, swipe, or tap) → promote the next
// waiting one, FIFO. Safe to call with nothing showing.
export function advanceToast(state) {
  const [next = null, ...rest] = state.pending;
  return { current: next, pending: rest, seen: state.seen };
}
