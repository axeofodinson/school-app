// Pre-made read-aloud clips on Android (body.audio, db/030 bucket). A clip is
// downloaded once into the app's documents folder and played from there, so it
// keeps working offline. Clips are question content (no personal data), so one
// shared folder serves every student on a shared device (DECISIONS #90).
import { AUDIO_BUCKET } from '@school/core';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { Directory, File, Paths } from 'expo-file-system';

import { supabase } from '../../lib/supabase';

const SIGNED_URL_SECONDS = 600;
let dir: Directory | null = null;
let player: AudioPlayer | null = null;

function folder(): Directory {
  if (!dir) dir = new Directory(Paths.document, 'prereader-audio');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

function fileFor(ref: string): File {
  return new File(folder(), ref.replace(/[^A-Za-z0-9._-]/g, '_'));
}

async function sourceUrl(ref: string): Promise<string | null> {
  if (/^https:\/\//.test(ref)) return ref;
  if (!supabase) return null;
  const { data } = await supabase.storage
    .from(AUDIO_BUCKET)
    .createSignedUrl(ref, SIGNED_URL_SECONDS);
  return data?.signedUrl ?? null;
}

async function ensureFile(ref: string): Promise<File | null> {
  try {
    const f = fileFor(ref);
    if (f.exists && f.size > 0) return f;
    const url = await sourceUrl(ref);
    if (!url) return null;
    return await File.downloadFileAsync(url, f, { idempotent: true });
  } catch {
    return null; // offline or refused: the caller falls back to device speech
  }
}

/** Download every clip of a paper while online (best effort, one at a time). */
export async function prefetchClips(refs: readonly string[]): Promise<void> {
  for (const r of refs) await ensureFile(r);
}

export function isClipCached(ref: string): boolean {
  try {
    const f = fileFor(ref);
    return f.exists && f.size > 0;
  } catch {
    return false;
  }
}

/** Play one clip; false when it isn't available (then speech takes over). */
export async function playClip(ref: string): Promise<boolean> {
  stopClip();
  const f = await ensureFile(ref);
  if (!f) return false;
  try {
    player = createAudioPlayer({ uri: f.uri });
    player.play();
    return true;
  } catch {
    stopClip();
    return false;
  }
}

export function stopClip(): void {
  if (!player) return;
  try {
    player.pause();
    player.remove();
  } catch {
    // already released
  }
  player = null;
}
