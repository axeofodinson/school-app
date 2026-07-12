// Data plumbing for the engagement layer ("My journey"). Every number here is
// derived from rows the signed-in student can already read under RLS — their
// own submissions (tests finished), their own attendance (streak), and the
// offline submission queue in attemptStore. No new tables, no fake numbers:
// if the data can't be read, the number is absent, never invented.
//
// Offline tolerance: the computed summary is cached in AsyncStorage, so the
// home card renders instantly from the last known truth and refreshes in the
// background; a dropped refresh silently keeps the cache. The server recount
// on the next successful load corrects any local drift.
import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from './supabase';
import { getQueue } from './attemptStore';
import { attendanceStreak, crossedMilestone } from '../engagement/engagement';

const CACHE_KEY = 'engagement:summary';

async function readCache() {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

async function writeCache(summary) {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(summary));
  } catch (e) {
    // Storage unavailable — the in-memory summary still serves this session.
  }
}

// The last computed summary, for an instant (possibly offline) first paint.
// Shape: { testsFinished, streak: { current, best }, updatedAt } or null.
export async function getCachedSummary() {
  return readCache();
}

// Compute the live summary from the server: current year -> my active
// enrollment -> my submission count + my attendance days, plus any attempts
// still queued offline (they're finished effort too — they just haven't
// reached the server yet). Returns the fresh summary, or the cached one when
// the network drops, or null when there's nothing to show yet (no year /
// no enrollment / nothing readable).
export async function loadEngagementSummary() {
  try {
    const yearRes = await supabase
      .from('academic_years')
      .select('id')
      .eq('is_current', true)
      .maybeSingle();
    if (yearRes.error) return readCache();
    if (!yearRes.data) return null;

    const enrRes = await supabase
      .from('enrollments')
      .select('id, status')
      .eq('year_id', yearRes.data.id)
      .maybeSingle();
    if (enrRes.error) return readCache();
    const enr = enrRes.data && enrRes.data.status === 'active' ? enrRes.data : null;
    if (!enr) return null;

    const [subRes, attRes, queue] = await Promise.all([
      supabase
        .from('submissions')
        .select('id', { count: 'exact', head: true })
        .eq('enrollment_id', enr.id),
      supabase
        .from('attendance')
        .select('on_date, status')
        .eq('enrollment_id', enr.id),
      getQueue(),
    ]);
    if (subRes.error || attRes.error) return readCache();

    const pending = (queue || []).filter((q) => q.enrollmentId === enr.id).length;
    const summary = {
      testsFinished: (subRes.count ?? 0) + pending,
      streak: attendanceStreak(attRes.data ?? []),
      updatedAt: new Date().toISOString(),
    };
    await writeCache(summary);
    return summary;
  } catch (e) {
    return readCache();
  }
}

// Called right after an attempt lands (submitted or queued): bump the local
// count so the celebration can say "that's test N" and detect a freshly
// crossed medal without a round-trip. Works offline; the next server load
// recounts and corrects. When nothing is cached yet the count is unknown —
// we return nulls and the celebration simply omits the number (honest, not
// invented).
export async function recordFinishedAttempt() {
  const cached = await readCache();
  if (!cached || typeof cached.testsFinished !== 'number') {
    return { testsFinished: null, crossed: null };
  }
  const prev = cached.testsFinished;
  const next = prev + 1;
  await writeCache({ ...cached, testsFinished: next });
  return { testsFinished: next, crossed: crossedMilestone(prev, next) };
}
