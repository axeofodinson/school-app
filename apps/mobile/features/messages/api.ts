// Messaging reads and writes (prompt 15). RLS (db/010 + db/029) decides who sees
// what: a student gets school-wide, own-class and personal messages only; a
// teacher sends only to classes they teach; messages are never edited or
// deleted from the app. Device copies live in the user's namespace (cache/ keys,
// wiped at sign-out): the inbox opens offline, and "read" marks made offline
// wait there until the next load can send them.
import {
  INBOX_LIMIT,
  mergeInbox,
  type ComposeDraft,
  type InboxMessage,
  type MessageScope,
  type ScopedStore,
} from '@school/core';

import { readCache, writeCache } from '../../lib/cache';
import {
  classifyError,
  fail,
  notConfigured,
  ok,
  type PgError,
  type Result,
} from '../../lib/result';
import { supabase } from '../../lib/supabase';

const INBOX_CACHE = 'cache/messages.inbox';
const MESSAGE_COLUMNS = 'id, scope, target_id, title, body, created_at';

interface InboxCopy {
  messages: InboxMessage[];
  readIds: string[];
  /** Marked read here but not yet confirmed by the server. */
  pendingReads: string[];
}

export interface Inbox {
  messages: InboxMessage[];
  readIds: string[];
  pendingReads: string[];
  /** Shown from the device copy; the server could not be reached. */
  fromCache: boolean;
}

const asInbox = (c: InboxCopy, fromCache: boolean): Inbox => ({ ...c, fromCache });

/** The student's own inbox (RLS-filtered) and read state; the device copy when offline. */
export async function loadInbox(cache: ScopedStore | null): Promise<Result<Inbox>> {
  if (!supabase) return notConfigured;
  const copy = (await readCache<InboxCopy>(cache, INBOX_CACHE)) ?? {
    messages: [],
    readIds: [],
    pendingReads: [],
  };
  try {
    const msgs = await supabase
      .from('messages')
      .select(MESSAGE_COLUMNS)
      .order('created_at', { ascending: false })
      .limit(INBOX_LIMIT)
      .retry(false)
      .overrideTypes<InboxMessage[], { merge: false }>();
    if (msgs.error) throw msgs.error;
    const messages = msgs.data ?? [];

    // Send what was marked read while offline, then read the server's state.
    if (copy.pendingReads.length) {
      const sent = await supabase.rpc('mark_messages_read', { p_ids: copy.pendingReads });
      if (!sent.error) copy.pendingReads = [];
    }
    const reads = await supabase
      .from('message_reads')
      .select('message_id')
      .in(
        'message_id',
        messages.map((m) => m.id),
      )
      .retry(false);
    if (reads.error) throw reads.error;
    const readIds = (reads.data ?? []).map((r) => r.message_id);
    const next: InboxCopy = { messages, readIds, pendingReads: copy.pendingReads };
    await writeCache(cache, INBOX_CACHE, next);
    return ok(asInbox(next, false));
  } catch (e) {
    const kind = classifyError(e as PgError);
    if (kind === 'network' && copy.messages.length) return ok(asInbox(copy, true));
    return fail(e as PgError);
  }
}

/** Mark messages read: the server when reachable, else queued on the device copy. */
export async function markRead(ids: string[], cache: ScopedStore | null): Promise<Result<null>> {
  if (!supabase) return notConfigured;
  if (ids.length === 0) return ok(null);
  const copy = await readCache<InboxCopy>(cache, INBOX_CACHE);
  const remember = async (pending: boolean) => {
    if (!copy) return;
    copy.readIds = [...new Set([...copy.readIds, ...ids])];
    if (pending) copy.pendingReads = [...new Set([...copy.pendingReads, ...ids])];
    await writeCache(cache, INBOX_CACHE, copy);
  };
  try {
    const { error } = await supabase.rpc('mark_messages_read', { p_ids: ids });
    if (error) throw error;
    await remember(false);
    return ok(null);
  } catch (e) {
    const kind = classifyError(e as PgError);
    if (kind === 'network') {
      await remember(true);
      return ok(null); // kept on this device, sent on the next load
    }
    return fail(e as PgError);
  }
}

/** A message that arrived live: add it to the device copy so a restart still has it. */
export async function absorbMessage(row: InboxMessage, cache: ScopedStore | null) {
  const copy = await readCache<InboxCopy>(cache, INBOX_CACHE);
  if (!copy) return;
  copy.messages = mergeInbox(copy.messages, [row]);
  await writeCache(cache, INBOX_CACHE, copy);
}

// ---- Sending (teachers and admins) -------------------------------------------

/**
 * Insert with a client UUID, so pressing Send twice or a retry after a dropped
 * response is one message (a duplicate id counts as sent).
 */
export async function sendMessage(
  id: string,
  senderId: string,
  d: ComposeDraft,
): Promise<Result<null>> {
  if (!supabase) return notConfigured;
  try {
    const { error } = await supabase.from('messages').insert({
      id,
      sender_id: senderId,
      scope: d.scope,
      target_id: d.scope === 'school' ? null : d.targetId,
      title: d.title.trim(),
      body: d.body.trim(),
    });
    if (error && error.code !== '23505') throw error;
    return ok(null);
  } catch (e) {
    return fail(e as PgError);
  }
}

export interface SentMessage extends InboxMessage {
  readCount: number;
}

/** What this user sent (a teacher: own; an admin: everything), with read counts. */
export async function loadSent(): Promise<Result<SentMessage[]>> {
  if (!supabase) return notConfigured;
  try {
    const msgs = await supabase
      .from('messages')
      .select(MESSAGE_COLUMNS)
      .order('created_at', { ascending: false })
      .limit(50)
      .retry(false)
      .overrideTypes<InboxMessage[], { merge: false }>();
    if (msgs.error) throw msgs.error;
    const list = msgs.data ?? [];
    const counts = await supabase.rpc('message_read_counts', { p_ids: list.map((m) => m.id) });
    if (counts.error) throw counts.error;
    const byId = new Map((counts.data ?? []).map((c) => [c.message_id, Number(c.read_count)]));
    return ok(list.map((m) => ({ ...m, readCount: byId.get(m.id) ?? 0 })));
  } catch (e) {
    return fail(e as PgError);
  }
}

/** How many students a message to this audience reaches (active, current year). */
export async function audienceSize(
  scope: MessageScope,
  targetId: string | null,
  yearId: string | null,
): Promise<Result<number>> {
  if (!supabase) return notConfigured;
  try {
    if (scope === 'student') return ok(targetId ? 1 : 0);
    if (!yearId) return ok(0);
    let q = supabase
      .from('enrollments')
      .select('id', { count: 'exact', head: true })
      .eq('year_id', yearId)
      .eq('status', 'active');
    if (scope === 'class') {
      if (!targetId) return ok(0);
      q = q.eq('class_id', targetId);
    }
    const { count, error } = await q.retry(false);
    if (error) throw error;
    return ok(count ?? 0);
  } catch (e) {
    return fail(e as PgError);
  }
}

export interface Pupil {
  studentId: string;
  name: string;
  code: string;
  rollNumber: number | null;
}

/** A class's active students, for sending to one of them. */
export async function loadPupils(classId: string, yearId: string): Promise<Result<Pupil[]>> {
  if (!supabase) return notConfigured;
  try {
    const { data, error } = await supabase
      .from('enrollments')
      .select('roll_number, student:students(id, full_name, student_code)')
      .eq('class_id', classId)
      .eq('year_id', yearId)
      .eq('status', 'active')
      .retry(false)
      .overrideTypes<
        {
          roll_number: number | null;
          student: { id: string; full_name: string; student_code: string } | null;
        }[],
        { merge: false }
      >();
    if (error) throw error;
    const pupils = (data ?? [])
      .filter((r) => r.student)
      .map((r) => ({
        studentId: r.student!.id,
        name: r.student!.full_name,
        code: r.student!.student_code,
        rollNumber: r.roll_number,
      }))
      .sort(
        (a, b) => (a.rollNumber ?? 1e9) - (b.rollNumber ?? 1e9) || a.name.localeCompare(b.name),
      );
    return ok(pupils);
  } catch (e) {
    return fail(e as PgError);
  }
}
