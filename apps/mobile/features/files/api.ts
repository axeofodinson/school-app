// Worksheet files (db/014): the private `assessment-files` bucket. Storage RLS
// is the boundary: a teacher writes only under an assessment of a class they
// teach, a student reads only a published worksheet of their own class, and a
// signed URL can only be minted by someone the policy allows.
import {
  ASSESSMENT_FILES_BUCKET,
  assessmentFilePath,
  SIGNED_URL_TTL_SECONDS,
  uuidv4,
  type FileKind,
  type UploadPlan,
} from '@school/core';

import { supabase } from '../../lib/supabase';
import { fail, notConfigured, ok, type PgError, type Result } from '../../lib/result';
import { readPicked } from './bytes';
import type { PickedWorksheet } from './pick';

export interface StoredFile {
  path: string;
  name: string;
  mime: string;
}

/**
 * Upload to "{assessmentId}/{uuid}.{ext}", then point the assessment at it.
 * A replaced file keeps its old object (nothing is deleted; history stays).
 */
export async function uploadWorksheet(
  assessmentId: string,
  picked: PickedWorksheet,
  plan: UploadPlan,
): Promise<Result<StoredFile>> {
  if (!supabase) return notConfigured;
  const path = assessmentFilePath(assessmentId, uuidv4(), plan.ext);
  let body: ArrayBuffer;
  try {
    body = await readPicked(picked);
  } catch (e) {
    return fail(e as PgError);
  }
  const up = await supabase.storage
    .from(ASSESSMENT_FILES_BUCKET)
    .upload(path, body, { contentType: plan.mime, upsert: false });
  if (up.error) return fail(up.error);
  const { data, error } = await supabase
    .from('assessments')
    .update({ file_path: path, file_name: plan.name, file_mime: plan.mime })
    .eq('id', assessmentId)
    .select('id');
  if (error) return fail(error);
  if (!data?.length) return { ok: false, error: 'forbidden' };
  return ok({ path, name: plan.name, mime: plan.mime });
}

/** A short-lived URL for one file; refused by Storage RLS for anyone outside the class. */
export async function signedFileUrl(path: string): Promise<Result<string>> {
  if (!supabase) return notConfigured;
  const { data, error } = await supabase.storage
    .from(ASSESSMENT_FILES_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) return fail(error ?? { message: 'no url' });
  return ok(data.signedUrl);
}

/** Markdown worksheets are small text: fetch and parse in the app. */
export async function fetchText(url: string): Promise<Result<string>> {
  try {
    const res = await fetch(url);
    if (!res.ok) return { ok: false, error: res.status === 403 ? 'forbidden' : 'unknown' };
    return ok(await res.text());
  } catch (e) {
    return fail(e as PgError);
  }
}

/** A signed URL, plus the text for a markdown worksheet. */
export async function loadWorksheet(
  path: string,
  kind: FileKind,
): Promise<Result<{ url: string; text: string | null }>> {
  const url = await signedFileUrl(path);
  if (!url.ok) return url;
  if (kind !== 'markdown') return ok({ url: url.data, text: null });
  const text = await fetchText(url.data);
  return text.ok ? ok({ url: url.data, text: text.data }) : text;
}
