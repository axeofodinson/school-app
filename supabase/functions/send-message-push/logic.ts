// Pure helpers for send-message-push (no Deno or network APIs), so they are
// unit-tested in Node (packages/core/test/messagePush.test.ts).

export const EXPO_BATCH_SIZE = 100; // Expo accepts up to 100 messages per request
export const MAX_TITLE = 100;
export const MAX_BODY = 240; // the notification shade cuts long text anyway

export type Scope = 'school' | 'class' | 'student';

export interface MessageRow {
  id: string;
  scope: Scope;
  target_id: string | null;
  title: string;
  body: string;
}

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  sound: 'default';
  channelId: 'messages';
  priority: 'high';
  ttl: number;
  data: { messageId: string; scope: Scope };
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function clip(text: string, max: number): string {
  const t = text.trim().replace(/\s+/g, ' ');
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

/** Only real Expo tokens, once each. */
export function usableTokens(rows: readonly { token: unknown }[]): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    if (typeof r.token === 'string' && /^Expo(nent)?PushToken\[.+\]$/.test(r.token))
      set.add(r.token);
  }
  return [...set];
}

export function buildPush(message: MessageRow, tokens: readonly string[]): PushMessage[] {
  return tokens.map((to) => ({
    to,
    title: clip(message.title, MAX_TITLE),
    body: clip(message.body, MAX_BODY),
    sound: 'default',
    channelId: 'messages',
    priority: 'high',
    ttl: 60 * 60 * 24 * 3, // a phone off for the weekend still gets Friday's notice
    data: { messageId: message.id, scope: message.scope },
  }));
}

const DEAD = new Set(['DeviceNotRegistered', 'InvalidCredentials', 'InvalidToken']);

/** Tickets come back in the order sent. Dead tokens never work again. */
export function readTickets(
  batch: readonly string[],
  tickets: readonly unknown[],
): { sent: number; dead: string[]; failed: number } {
  let sent = 0;
  let failed = 0;
  const dead: string[] = [];
  batch.forEach((token, i) => {
    const t = tickets[i] as { status?: string; details?: { error?: string } } | undefined;
    if (t?.status === 'ok') sent += 1;
    else if (t?.status === 'error' && t.details?.error && DEAD.has(t.details.error))
      dead.push(token);
    else failed += 1;
  });
  return { sent, dead, failed };
}
