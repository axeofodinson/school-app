// Offline-tolerant storage for the student assessment attempt flow.
//
// Core student flows must survive patchy mobile data (CLAUDE.md: "Offline
// tolerance for core student flows … cache what you can; sync when the
// connection returns; never freeze on a dropped request"). Taking a test is
// exactly that flow, so this module keeps three things in AsyncStorage:
//
//   1. DRAFT answers        — the in-progress answers for one attempt, saved on
//                             every change so a dropped connection (or the app
//                             being killed) mid-attempt never loses work.
//   2. CACHED question sets — the questions of an assessment the student has
//                             opened, so re-opening it works offline too.
//   3. A PENDING queue      — submissions that couldn't reach the server yet.
//                             Flushed on reconnect (syncPendingSubmissions).
//
// The submission itself lands in the existing `submissions` table with the raw
// `responses` jsonb (not just a score — rule 3): score/grading stay null and are
// filled in later by a teacher/graded pass. RLS (db/005) enforces that a student
// may only insert their own, ungraded attempt against a published assessment.
//
// The pure helpers (buildResponses, queue ops, error classifiers) are exported
// so the response/sync logic can be checked without a device or a network.
import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from './supabase';

// ---- Storage keys -----------------------------------------------------------
const QUEUE_KEY = 'attempt:queue';
const draftKey = (enrollmentId, assessmentId) =>
  `attempt:draft:${enrollmentId}:${assessmentId}`;
const questionsKey = (assessmentId) => `attempt:questions:${assessmentId}`;

// ---- Pure helpers (no I/O — safe to unit-test) ------------------------------

// Whether a raw answer value counts as "answered" for its question type. Used
// both to gate submit affordances and to compute answered_count. Kept strict so
// an empty numeric string or a null mcq pick is treated as unanswered.
export function isAnswered(type, value) {
  if (type === 'true_false') return value === true || value === false;
  if (type === 'numeric') {
    return typeof value === 'string' ? value.trim() !== '' : value != null;
  }
  // mcq (and any string-keyed type)
  return typeof value === 'string' && value.length > 0;
}

// Normalise one raw answer to what gets stored in `responses`. Returns null when
// unanswered so the raw record is explicit about skipped questions.
function normaliseValue(type, value) {
  if (!isAnswered(type, value)) return null;
  if (type === 'numeric') return String(value).trim();
  return value; // mcq key (string) or true_false boolean
}

// Build the `responses` jsonb from the assessment's questions and the student's
// answers map ({ questionId: rawValue }). Preserves question order and keeps the
// raw per-question value so a grade can be recomputed later (rule 3) — this is
// the record, deliberately NOT a score. `questions` items need { id, type }.
export function buildResponses(questions, answers) {
  const list = Array.isArray(questions) ? questions : [];
  const items = list.map((q) => {
    const value = normaliseValue(q.type, answers?.[q.id]);
    return { question_id: q.id, type: q.type, value };
  });
  const answeredCount = items.filter((i) => i.value !== null).length;
  return {
    answers: items,
    answered_count: answeredCount,
    total_questions: items.length,
    version: 1,
  };
}

// A composed submission couldn't reach the server — is it a lost connection
// (retry later) or a real error? Mirrors the network heuristic used across the
// app (AuthProvider.classifyAuthError et al.).
export function isNetworkError(error) {
  if (!error) return false;
  const name = error.name || '';
  const status = error.status;
  const msg = (error.message || '').toLowerCase();
  return (
    name === 'AuthRetryableFetchError' ||
    status === 0 ||
    /network request failed|failed to fetch|network|timeout|econn/.test(msg)
  );
}

// A duplicate submission — the row already exists (unique enrollment+assessment).
// Treated as success: the attempt is already recorded on the server.
export function isConflictError(error) {
  if (!error) return false;
  const code = error.code || '';
  const status = error.status;
  const msg = (error.message || '').toLowerCase();
  return (
    code === '23505' ||
    status === 409 ||
    /duplicate key|already exists|conflict/.test(msg)
  );
}

// Add/replace an item in the pending queue, de-duped on enrollment+assessment so
// re-submitting the same attempt never queues it twice (the latest wins).
export function upsertQueueItem(queue, item) {
  const rest = (queue || []).filter(
    (q) =>
      !(q.enrollmentId === item.enrollmentId && q.assessmentId === item.assessmentId)
  );
  return [...rest, item];
}

// Remove a queue item by its enrollment+assessment identity.
export function removeQueueItem(queue, enrollmentId, assessmentId) {
  return (queue || []).filter(
    (q) => !(q.enrollmentId === enrollmentId && q.assessmentId === assessmentId)
  );
}

// ---- AsyncStorage-backed persistence ----------------------------------------

async function readJSON(key, fallback) {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

async function writeJSON(key, value) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    // Storage full/unavailable — the in-memory flow still works for this session.
  }
}

// Draft answers for one attempt.
export async function loadDraft(enrollmentId, assessmentId) {
  return readJSON(draftKey(enrollmentId, assessmentId), null);
}

export async function saveDraft(enrollmentId, assessmentId, answers) {
  await writeJSON(draftKey(enrollmentId, assessmentId), {
    answers,
    updatedAt: new Date().toISOString(),
  });
}

export async function clearDraft(enrollmentId, assessmentId) {
  try {
    await AsyncStorage.removeItem(draftKey(enrollmentId, assessmentId));
  } catch (e) {
    // Non-fatal.
  }
}

// Cached question set for an assessment, so a re-opened test renders offline.
export async function cacheQuestions(assessmentId, questions) {
  await writeJSON(questionsKey(assessmentId), {
    questions,
    cachedAt: new Date().toISOString(),
  });
}

export async function loadCachedQuestions(assessmentId) {
  const cached = await readJSON(questionsKey(assessmentId), null);
  return cached?.questions ?? null;
}

// Pending submission queue.
export async function getQueue() {
  return readJSON(QUEUE_KEY, []);
}

// The set of "enrollmentId:assessmentId" keys currently awaiting sync, so the
// list screen can badge attempts that are saved but not yet on the server.
export async function getPendingKeys() {
  const queue = await getQueue();
  return new Set(queue.map((q) => `${q.enrollmentId}:${q.assessmentId}`));
}

// ---- Submitting an attempt --------------------------------------------------

// The one place that writes to `submissions`. score/graded_* are omitted so they
// stay null (RLS in db/005 requires that for a student insert). Returns the
// Supabase error (or null) so callers can classify it.
async function insertSubmission({ enrollmentId, assessmentId, responses, submittedAt }) {
  const { error } = await supabase.from('submissions').insert({
    enrollment_id: enrollmentId,
    assessment_id: assessmentId,
    responses,
    submitted_at: submittedAt ?? new Date().toISOString(),
  });
  return error;
}

// Submit an attempt. Tries the server first; on a dropped connection it queues
// the attempt (keeping the draft) so it syncs on reconnect, and on a duplicate
// it's treated as already-submitted. Returns one of:
//   { status: 'submitted' }         — recorded on the server (draft cleared)
//   { status: 'queued' }            — offline; saved locally, will sync later
//   { status: 'error', error }      — a real failure the user should see
export async function submitAttempt({ enrollmentId, assessmentId, responses }) {
  const submittedAt = new Date().toISOString();
  const error = await insertSubmission({
    enrollmentId,
    assessmentId,
    responses,
    submittedAt,
  });

  if (!error || isConflictError(error)) {
    // Landed (or was already there): drop the draft and any queued copy.
    await clearDraft(enrollmentId, assessmentId);
    const queue = await getQueue();
    await writeJSON(QUEUE_KEY, removeQueueItem(queue, enrollmentId, assessmentId));
    return { status: 'submitted' };
  }

  if (isNetworkError(error)) {
    // Offline — hold the attempt (and its draft) for the next reconnect.
    const queue = await getQueue();
    await writeJSON(
      QUEUE_KEY,
      upsertQueueItem(queue, { enrollmentId, assessmentId, responses, submittedAt })
    );
    return { status: 'queued' };
  }

  return { status: 'error', error };
}

// Flush the pending queue — call on reconnect / when the list screen opens. Each
// item is retried; successes (and duplicates) are removed and their drafts
// cleared, network failures stay queued, and any hard error also stays queued
// (surfaced by count) rather than being silently dropped. Returns
// { synced, remaining }.
export async function syncPendingSubmissions() {
  const queue = await getQueue();
  if (queue.length === 0) return { synced: 0, remaining: 0 };

  let remaining = [...queue];
  let synced = 0;

  for (const item of queue) {
    const error = await insertSubmission(item);
    if (!error || isConflictError(error)) {
      remaining = removeQueueItem(remaining, item.enrollmentId, item.assessmentId);
      await clearDraft(item.enrollmentId, item.assessmentId);
      synced += 1;
    } else if (isNetworkError(error)) {
      // Still offline — stop early; nothing else will get through this pass.
      break;
    }
    // Other (non-network) errors: leave the item queued for a later manual retry.
  }

  await writeJSON(QUEUE_KEY, remaining);
  return { synced, remaining: remaining.length };
}
