// Messaging rules shared by the compose screen and the inbox (prompt 15): what a
// message may contain and how the inbox is merged and counted. Pure; the server
// (db/010 + db/029 RLS) is still the boundary.

export const MESSAGE_TITLE_MAX = 100;
export const MESSAGE_BODY_MAX = 1000;
/** The inbox keeps this many newest messages on the device. */
export const INBOX_LIMIT = 100;

export type MessageScope = 'school' | 'class' | 'student';

export interface InboxMessage {
  id: string;
  scope: MessageScope;
  target_id: string | null;
  title: string;
  body: string;
  created_at: string;
}

export type ComposeError = 'titleEmpty' | 'titleLong' | 'bodyEmpty' | 'bodyLong' | 'noTarget';

export interface ComposeDraft {
  scope: MessageScope;
  targetId: string | null;
  title: string;
  body: string;
}

/** The first thing wrong with a draft, or null when it can be sent. */
export function validateCompose(d: ComposeDraft): ComposeError | null {
  const title = d.title.trim();
  const body = d.body.trim();
  if (!title) return 'titleEmpty';
  if (title.length > MESSAGE_TITLE_MAX) return 'titleLong';
  if (!body) return 'bodyEmpty';
  if (body.length > MESSAGE_BODY_MAX) return 'bodyLong';
  if (d.scope !== 'school' && !d.targetId) return 'noTarget';
  return null;
}

const byNewest = (a: InboxMessage, b: InboxMessage) =>
  a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : a.id < b.id ? 1 : -1;

/** Add rows (a live arrival, a refresh) to the list: one per id, newest first, capped. */
export function mergeInbox(
  current: readonly InboxMessage[],
  incoming: readonly InboxMessage[],
  limit: number = INBOX_LIMIT,
): InboxMessage[] {
  const byId = new Map<string, InboxMessage>();
  for (const m of current) byId.set(m.id, m);
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort(byNewest).slice(0, limit);
}

/** Ids not yet read, where `read` is what the server and this device both know. */
export function unreadIds(messages: readonly InboxMessage[], read: ReadonlySet<string>): string[] {
  return messages.filter((m) => !read.has(m.id)).map((m) => m.id);
}
