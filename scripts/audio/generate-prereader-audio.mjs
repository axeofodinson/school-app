#!/usr/bin/env node
// Make pre-made read-aloud clips (ElevenLabs) for junior pre-reader questions
// (prompt 16, DESIGN_SYSTEM §3.1). Runs on a developer machine or a cloud session
// with the key as an environment secret. The key never goes in the app or in chat.
//
//   ELEVENLABS_API_KEY=…  SUPABASE_URL=https://<ref>.supabase.co  SUPABASE_SERVICE_ROLE_KEY=…
//   node scripts/audio/generate-prereader-audio.mjs              # dry run (default)
//   node scripts/audio/generate-prereader-audio.mjs --sample     # make clips into scripts/audio/out/ only
//   node scripts/audio/generate-prereader-audio.mjs --write --project <ref>
//
// Options: --limit 10 (questions), --max-grade 5, --subjects math,numeracy,ginti
// (case-insensitive substrings of the subject name; subjects are data, so they are
// a parameter, never hardcoded in the app), --voice <id> (or ELEVENLABS_VOICE_ID),
// --model eleven_v3 (or ELEVENLABS_MODEL), --no-language-code.
//
// One clip per question per written language (en, ur), content-addressed by
// text + voice + model (packages/core/src/prereaderAudio.ts): re-running skips
// clips that are already up to date, and new wording makes a new clip.
// --write uploads to the private `question-audio` bucket (db/030 must be run
// first) and sets questions.body.audio. It refuses unless --project matches the
// URL, so it can't hit the wrong project by accident. Dev first, always.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClient } from '@supabase/supabase-js';

import {
  AUDIO_BUCKET,
  estimateCredits,
  planClips,
  withClip,
} from '../../packages/core/src/prereaderAudio.ts';

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};

const WRITE = flag('write');
const SAMPLE = flag('sample');
const LIMIT = Number(opt('limit', '10'));
const MAX_GRADE = Number(opt('max-grade', '5'));
const SUBJECTS = opt('subjects', 'math,numeracy,ginti,riyazi')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);
// A premade multilingual voice; pick a warmer one after listening (report below).
const VOICE = opt('voice', process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL');
const MODEL = opt('model', process.env.ELEVENLABS_MODEL || 'eleven_v3');
const FORMAT = 'mp3_22050_32'; // ≈ 4 KB per second of speech: a 3 s prompt ≈ 12 KB
const LANGUAGE_CODE = !flag('no-language-code');

function die(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const apiKey = process.env.ELEVENLABS_API_KEY;
if (!url || !serviceKey) die('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (dev project first).');
if ((WRITE || SAMPLE) && !apiKey)
  die('Set ELEVENLABS_API_KEY (environment secret) for --sample/--write.');
const ref = new URL(url).hostname.split('.')[0];
if (WRITE && opt('project') !== ref)
  die(`--write needs --project ${ref} (the URL's project) to confirm the target.`);

const db = createClient(url, serviceKey, { auth: { persistSession: false } });

async function pickQuestions() {
  const { data, error } = await db
    .from('questions')
    .select(
      'id, type, body, chapter:chapters!inner(subject:subjects!inner(name, class:classes!inner(grade_level)))',
    )
    .eq('type', 'tap_image')
    .limit(1000);
  if (error) die(`Reading questions failed: ${error.message}`);
  return (data ?? [])
    .filter((q) => {
      const s = q.chapter?.subject;
      const grade = s?.class?.grade_level;
      const name = String(s?.name ?? '').toLowerCase();
      return (
        typeof grade === 'number' && grade <= MAX_GRADE && SUBJECTS.some((k) => name.includes(k))
      );
    })
    .slice(0, LIMIT);
}

async function tts(text, locale) {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(VOICE)}?output_format=${FORMAT}`,
    {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify({
        text,
        model_id: MODEL,
        ...(LANGUAGE_CODE ? { language_code: locale } : {}),
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    },
  );
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const cost = Number(res.headers.get('character-cost') ?? res.headers.get('x-character-count'));
  return {
    bytes: new Uint8Array(await res.arrayBuffer()),
    billed: Number.isFinite(cost) && cost > 0 ? cost : null,
  };
}

const questions = await pickQuestions();
console.log(
  `${WRITE ? 'WRITE' : SAMPLE ? 'SAMPLE' : 'DRY RUN'} · project ${ref} · ${questions.length} question(s) · grade ≤ ${MAX_GRADE} · subjects ~ ${SUBJECTS.join('/')} · voice ${VOICE} · ${MODEL} · ${FORMAT}`,
);
if (!questions.length)
  console.log('Nothing matched. Check --subjects / --max-grade, or seed the dev project.');

const rows = [];
const outDir = join(here, 'out');
for (const q of questions) {
  let body = q.body;
  for (const job of planClips(q.id, body, { voiceId: VOICE, modelId: MODEL })) {
    const row = {
      question: q.id,
      locale: job.locale,
      text: job.text,
      path: job.path,
      chars: [...job.text].length,
      credits: estimateCredits(job.text, MODEL),
    };
    if (job.upToDate) {
      rows.push({ ...row, status: 'up to date' });
      continue;
    }
    if (!WRITE && !SAMPLE) {
      rows.push({ ...row, status: 'would make' });
      continue;
    }
    try {
      const { bytes, billed } = await tts(job.text, job.locale);
      row.bytes = bytes.length;
      if (billed) row.credits = billed;
      if (SAMPLE) {
        mkdirSync(outDir, { recursive: true });
        writeFileSync(join(outDir, job.path.replace(/\//g, '__')), bytes);
        rows.push({ ...row, status: 'sampled' });
        continue;
      }
      const up = await db.storage.from(AUDIO_BUCKET).upload(job.path, bytes, {
        contentType: 'audio/mpeg',
        upsert: true,
        cacheControl: '31536000',
      });
      if (up.error) throw new Error(`upload: ${up.error.message}`);
      body = withClip(body, job.locale, job.path);
      const { error } = await db.from('questions').update({ body }).eq('id', q.id);
      if (error) throw new Error(`update: ${error.message}`);
      rows.push({ ...row, status: 'made' });
    } catch (e) {
      rows.push({ ...row, status: `FAILED ${e.message}` });
    }
  }
}

for (const r of rows) {
  console.log(
    `${r.status.padEnd(11)} ${r.question.slice(0, 8)} ${r.locale} ${String(r.chars).padStart(3)} chars ${String(r.credits).padStart(3)} cr ${r.bytes ? `${(r.bytes / 1024).toFixed(1)} KB` : ''}  ${r.text}`,
  );
}
const made = rows.filter((r) => r.bytes);
const sum = (k, list = rows) => list.reduce((n, r) => n + (r[k] ?? 0), 0);
console.log(
  `\n${rows.length} clip(s): ${sum('chars')} chars, ≈ ${sum('credits')} credits` +
    (made.length
      ? `; made ${made.length}, avg ${(sum('bytes', made) / made.length / 1024).toFixed(1)} KB, ≈ ${(sum('credits', made) / made.length).toFixed(0)} credits each`
      : ''),
);
if (SAMPLE || WRITE) {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    join(outDir, 'report.json'),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        project: ref,
        voice: VOICE,
        model: MODEL,
        format: FORMAT,
        rows,
      },
      null,
      2,
    ),
  );
  console.log(
    `Report: ${join('scripts/audio/out', 'report.json')} (listen to the Urdu clips before --write).`,
  );
}
if (rows.some((r) => r.status.startsWith('FAILED'))) process.exit(1);
