// Verifies the toast queue's guarantees in plain Node — the acceptance
// criterion "multiple rapid notifications don't overlap or crash" made
// checkable without a device (same pattern as the other verify:* scripts).
//
//   node scripts/verify-toast-queue.mjs   (or: npm run verify:toast-queue)
//
// Proves:
//   1. First arrival shows immediately.
//   2. Only ONE toast is ever current — later arrivals queue, never overlap.
//   3. FIFO promotion on dismiss.
//   4. A flood caps the queue (keeps the newest MAX_PENDING) and never throws.
//   5. Cross-source dedupe: the same message id (push + Realtime) shows once.
//   6. Toasts without a dedupe id are never deduped.
//   7. The seen-ids memory is bounded (MAX_SEEN).
//   8. advance on an empty queue is a safe no-op.
//   9. Inputs are never mutated (pure functions).

import {
  createToastQueue,
  pushToast,
  advanceToast,
  MAX_PENDING,
  MAX_SEEN,
} from '../src/notifications/toastQueue.js';

let failures = 0;
function check(name, cond) {
  if (cond) {
    console.log(`  ok  ${name}`);
  } else {
    failures += 1;
    console.error(`FAIL  ${name}`);
  }
}

const mk = (key, id) => ({ key, id, title: `t${key}` });

// 1–2: first shows immediately; second queues instead of overlapping.
{
  let q = createToastQueue();
  ({ state: q } = pushToast(q, mk(1, 'msg:a')));
  check('first arrival shows immediately', q.current?.key === 1);
  ({ state: q } = pushToast(q, mk(2, 'msg:b')));
  check('second arrival queues, current unchanged (no overlap)', q.current?.key === 1 && q.pending.length === 1);
}

// 3: FIFO promotion.
{
  let q = createToastQueue();
  ({ state: q } = pushToast(q, mk(1, 'msg:a')));
  ({ state: q } = pushToast(q, mk(2, 'msg:b')));
  ({ state: q } = pushToast(q, mk(3, 'msg:c')));
  q = advanceToast(q);
  check('dismiss promotes in FIFO order', q.current?.key === 2 && q.pending[0]?.key === 3);
  q = advanceToast(q);
  q = advanceToast(q);
  check('queue drains to empty', q.current === null && q.pending.length === 0);
}

// 4: flood — 25 rapid arrivals; capped, newest kept, no crash.
{
  let q = createToastQueue();
  for (let i = 1; i <= 25; i += 1) {
    ({ state: q } = pushToast(q, mk(i, `msg:${i}`)));
  }
  check('flood: exactly one current', q.current?.key === 1);
  check(`flood: pending capped at MAX_PENDING (${MAX_PENDING})`, q.pending.length === MAX_PENDING);
  check(
    'flood: cap keeps the NEWEST waiting toasts',
    q.pending[q.pending.length - 1]?.key === 25 &&
      q.pending[0]?.key === 25 - MAX_PENDING + 1
  );
}

// 5: cross-source dedupe (push + Realtime deliver the same message id).
{
  let q = createToastQueue();
  let accepted;
  ({ state: q, accepted } = pushToast(q, mk(1, 'msg:same')));
  check('first delivery accepted', accepted === true);
  ({ state: q, accepted } = pushToast(q, mk(2, 'msg:same')));
  check('duplicate id rejected (one banner per message)', accepted === false);
  check('duplicate did not queue', q.pending.length === 0);
  // Still deduped even after the first one was dismissed.
  q = advanceToast(q);
  ({ state: q, accepted } = pushToast(q, mk(3, 'msg:same')));
  check('duplicate rejected even after dismiss', accepted === false && q.current === null);
}

// 6: no id → no dedupe.
{
  let q = createToastQueue();
  ({ state: q } = pushToast(q, { key: 1, title: 'x' }));
  const { accepted } = pushToast(q, { key: 2, title: 'x' });
  check('id-less toasts are never deduped', accepted === true);
}

// 7: seen memory bounded.
{
  let q = createToastQueue();
  for (let i = 1; i <= MAX_SEEN + 20; i += 1) {
    ({ state: q } = pushToast(q, mk(i, `msg:${i}`)));
    q = advanceToast(q); // keep the screen free so every id lands in seen
  }
  check(`seen ids bounded at MAX_SEEN (${MAX_SEEN})`, q.seen.length === MAX_SEEN);
  check('oldest seen ids age out', !q.seen.includes('msg:1') && q.seen.includes(`msg:${MAX_SEEN + 20}`));
}

// 8: advance on empty is a safe no-op.
{
  const q = advanceToast(createToastQueue());
  check('advance on empty queue is safe', q.current === null && q.pending.length === 0);
}

// 9: purity — inputs unchanged.
{
  const q0 = createToastQueue();
  const frozen = JSON.stringify(q0);
  const { state: q1 } = pushToast(q0, mk(1, 'msg:a'));
  pushToast(q1, mk(2, 'msg:b'));
  advanceToast(q1);
  check('pushToast/advanceToast never mutate their input', JSON.stringify(q0) === frozen);
}

if (failures > 0) {
  console.error(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log('\nAll toast queue checks passed.');
