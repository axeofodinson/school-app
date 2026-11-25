import { describe, expect, it } from 'vitest';

import {
  buildPush,
  chunk,
  clip,
  readTickets,
  usableTokens,
  type MessageRow,
} from '../../../supabase/functions/send-message-push/logic';

const msg: MessageRow = {
  id: 'm1',
  scope: 'class',
  target_id: 'c1',
  title: 'Hi',
  body: 'Bring notebook',
};

describe('send-message-push logic', () => {
  it('chunks into batches of the given size', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 100)).toEqual([]);
  });

  it('clips long text with an ellipsis and collapses whitespace', () => {
    expect(clip('  a   b ', 10)).toBe('a b');
    const out = clip('x'.repeat(300), 240);
    expect(out).toHaveLength(240);
    expect(out.endsWith('…')).toBe(true);
  });

  it('keeps only real Expo tokens, once each', () => {
    const rows = [
      { token: 'ExponentPushToken[abc]' },
      { token: 'ExponentPushToken[abc]' },
      { token: 'ExpoPushToken[def]' },
      { token: 'fcm-raw-token' },
      { token: null },
    ];
    expect(usableTokens(rows)).toEqual(['ExponentPushToken[abc]', 'ExpoPushToken[def]']);
  });

  it('builds the notification from the database row, with the inbox link data', () => {
    const [m] = buildPush({ ...msg, title: 'T'.repeat(300) }, ['ExponentPushToken[abc]']);
    expect(m!.title).toHaveLength(100);
    expect(m!.data).toEqual({ messageId: 'm1', scope: 'class' });
    expect(m!.channelId).toBe('messages');
  });

  it('counts sent, collects dead tokens, counts other failures', () => {
    const r = readTickets(
      ['a', 'b', 'c', 'd'],
      [
        { status: 'ok' },
        { status: 'error', details: { error: 'DeviceNotRegistered' } },
        { status: 'error', details: { error: 'MessageRateExceeded' } },
        undefined,
      ],
    );
    expect(r).toEqual({ sent: 1, dead: ['b'], failed: 2 });
  });
});
