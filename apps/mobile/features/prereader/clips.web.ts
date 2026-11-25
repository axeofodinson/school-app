// Web (Chromebook / Windows): pre-made clips kept in the browser's Cache Storage,
// so a paper opened online plays its clips offline later. Falls back to memory
// where Cache Storage is unavailable. See clips.ts for the Android side.
import { AUDIO_BUCKET } from '@school/core';

import { supabase } from '../../lib/supabase';

const CACHE = 'prereader-audio-v1';
const memory = new Map<string, Blob>();
let audio: HTMLAudioElement | null = null;
let objectUrl: string | null = null;

const keyFor = (ref: string) =>
  `${typeof location !== 'undefined' ? location.origin : 'http://localhost'}/__prereader-audio/${encodeURIComponent(ref)}`;

async function fromCache(ref: string): Promise<Blob | null> {
  const m = memory.get(ref);
  if (m) return m;
  try {
    const r = await (await caches.open(CACHE)).match(keyFor(ref));
    if (r) {
      const b = await r.blob();
      memory.set(ref, b);
      return b;
    }
  } catch {
    // no Cache Storage (private window, file://)
  }
  return null;
}

async function fetchClip(ref: string): Promise<Blob | null> {
  try {
    if (/^https:\/\//.test(ref)) {
      const r = await fetch(ref);
      return r.ok ? await r.blob() : null;
    }
    if (!supabase) return null;
    const { data } = await supabase.storage.from(AUDIO_BUCKET).download(ref);
    return data ?? null;
  } catch {
    return null;
  }
}

async function ensure(ref: string): Promise<Blob | null> {
  const hit = await fromCache(ref);
  if (hit) return hit;
  const b = await fetchClip(ref);
  if (!b || b.size === 0) return null;
  memory.set(ref, b);
  try {
    await (
      await caches.open(CACHE)
    ).put(keyFor(ref), new Response(b, { headers: { 'content-type': b.type || 'audio/mpeg' } }));
  } catch {
    // memory copy still serves this session
  }
  return b;
}

export async function prefetchClips(refs: readonly string[]): Promise<void> {
  for (const r of refs) await ensure(r);
}

export function isClipCached(ref: string): boolean {
  return memory.has(ref);
}

export async function playClip(ref: string): Promise<boolean> {
  stopClip();
  const b = await ensure(ref);
  if (!b || typeof Audio === 'undefined') return false;
  objectUrl = URL.createObjectURL(b);
  audio = new Audio(objectUrl);
  try {
    await audio.play();
    return true;
  } catch {
    stopClip(); // autoplay blocked or not decodable: speech takes over
    return false;
  }
}

export function stopClip(): void {
  if (audio) {
    audio.pause();
    audio = null;
  }
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }
}
