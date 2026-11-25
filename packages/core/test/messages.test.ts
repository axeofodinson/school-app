import { describe, expect, it } from 'vitest';

import {
  INBOX_LIMIT,
  mergeInbox,
  unreadIds,
  validateCompose,
  type ComposeDraft,
  type InboxMessage,
} from '../src/messages';

const m = (id: string, at: string): InboxMessage => ({
  id,
  scope: 'school',
  target_id: null,
  title: id,
  body: id,
  created_at: at,
});
const draft: ComposeDraft = { scope: 'class', targetId: 'c1', title: 'Hi', body: 'Hello' };

describe('validateCompose', () => {
  it('accepts a complete draft', () => expect(validateCompose(draft)).toBeNull());
  it('needs a title and a body (spaces do not count)', () => {
    expect(validateCompose({ ...draft, title: '   ' })).toBe('titleEmpty');
    expect(validateCompose({ ...draft, body: '' })).toBe('bodyEmpty');
  });
  it('limits length', () => {
    expect(validateCompose({ ...draft, title: 'x'.repeat(101) })).toBe('titleLong');
    expect(validateCompose({ ...draft, body: 'x'.repeat(1001) })).toBe('bodyLong');
  });
  it('needs a target unless it is school-wide', () => {
    expect(validateCompose({ ...draft, targetId: null })).toBe('noTarget');
    expect(validateCompose({ ...draft, scope: 'student', targetId: null })).toBe('noTarget');
    expect(validateCompose({ ...draft, scope: 'school', targetId: null })).toBeNull();
  });
});

describe('mergeInbox', () => {
  it('dedupes by id (push + realtime for one row), newest first', () => {
    const out = mergeInbox(
      [m('a', '2026-01-01'), m('b', '2026-01-03')],
      [m('b', '2026-01-03'), m('c', '2026-01-02')],
    );
    expect(out.map((x) => x.id)).toEqual(['b', 'c', 'a']);
  });
  it('caps the list at the limit, dropping the oldest', () => {
    const many = Array.from({ length: INBOX_LIMIT + 5 }, (_, i) =>
      m(`m${i}`, `2026-01-01T00:${String(i % 60).padStart(2, '0')}:00${i >= 60 ? 'Z' : '.5Z'}`),
    );
    expect(mergeInbox([], many)).toHaveLength(INBOX_LIMIT);
  });
});

describe('unreadIds', () => {
  it('lists messages not in the read set', () => {
    expect(unreadIds([m('a', '1'), m('b', '2')], new Set(['a']))).toEqual(['b']);
  });
});
