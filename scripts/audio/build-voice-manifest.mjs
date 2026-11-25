// Regenerates apps/mobile/assets/voice/manifest.ts from the recorded clips in
// apps/mobile/assets/voice/{en,ur}/<line>.mp3 (docs/audio-scripts.md lists the lines).
// Run from the repo root after adding or replacing clips:
//   node scripts/audio/build-voice-manifest.mjs
import { existsSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'apps', 'mobile', 'assets', 'voice');
const manifestPath = join(dir, 'manifest.ts');
const src = readFileSync(manifestPath, 'utf8');
const lines = [...src.matchAll(/^  '([a-zA-Z]+)',$/gm)].map((m) => m[1]);
if (!lines.length) throw new Error('No voiceLines found in manifest.ts');

const MAX_KB = 60;
const out = { en: [], ur: [] };
for (const lang of ['en', 'ur']) {
  for (const line of lines) {
    const f = join(dir, lang, `${line}.mp3`);
    if (!existsSync(f)) continue;
    const kb = statSync(f).size / 1024;
    if (kb > MAX_KB) console.warn(`! ${lang}/${line}.mp3 is ${kb.toFixed(0)} KB (keep clips under ${MAX_KB} KB)`);
    out[lang].push(`    ${line}: require('./${lang}/${line}.mp3'),`);
  }
}
const block = (lang) => (out[lang].length ? `{\n${out[lang].join('\n')}\n  }` : '{}');
const next = src.replace(
  /export const voiceClips[\s\S]*$/,
  `export const voiceClips: Record<'en' | 'ur', Partial<Record<VoiceLine, number>>> = {\n  en: ${block('en')},\n  ur: ${block('ur')},\n};\n`,
);
writeFileSync(manifestPath, next);
console.log(`en: ${out.en.length}/${lines.length} clips, ur: ${out.ur.length}/${lines.length} clips`);
