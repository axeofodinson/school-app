// Generates the student app's sound effects (assets/sfx/*.wav) by direct PCM
// synthesis. Run with: node scripts/generate-sfx.mjs
//
// Why synthesized WAVs: the pre-reader question experience needs game-feel
// sounds (tap pop, answer ding, finish tada), the target network blocks some
// CDNs (CLAUDE.md: bundle what the app needs), and there is no sound designer
// on this project. Like generate-sprites.mjs, this is dependency-free — plain
// sine partials with soft envelopes, written out as tiny mono 16-bit WAVs that
// expo-av can play from the bundle. Each file is a few KB.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SAMPLE_RATE = 22050;
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'sfx');

// Mix one soft-edged tone into `buf`: a sine at `freq` (plus a quieter octave
// partial so it sounds rounder than a raw beep), with a fast attack and an
// exponential decay — the classic friendly "toy xylophone" envelope. `sweep`
// (optional) glides the pitch by that many Hz over the note.
function addTone(buf, { at, freq, dur, gain = 0.5, sweep = 0 }) {
  const start = Math.floor(at * SAMPLE_RATE);
  const n = Math.floor(dur * SAMPLE_RATE);
  const attack = Math.max(1, Math.floor(0.008 * SAMPLE_RATE));
  let phase1 = 0;
  let phase2 = 0;
  for (let i = 0; i < n && start + i < buf.length; i++) {
    const p = i / n; // 0..1 through the note
    const f = freq + sweep * p;
    phase1 += (2 * Math.PI * f) / SAMPLE_RATE;
    phase2 += (2 * Math.PI * f * 2) / SAMPLE_RATE;
    const env = Math.min(1, i / attack) * Math.exp(-4.5 * p);
    buf[start + i] +=
      env * gain * (Math.sin(phase1) + 0.35 * Math.sin(phase2));
  }
}

// Encode a Float32 buffer as a mono 16-bit PCM WAV, normalised so the loudest
// peak sits at a comfortable (not startling) level for a kid holding a phone.
function encodeWav(samples, peak = 0.55) {
  let max = 0;
  for (const s of samples) max = Math.max(max, Math.abs(s));
  const scale = max > 0 ? peak / max : 0;

  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    data.writeInt16LE(Math.round(samples[i] * scale * 32767), i * 2);
  }

  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28); // byte rate
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

function makeBuffer(seconds) {
  return new Float32Array(Math.ceil(seconds * SAMPLE_RATE));
}

const SOUNDS = {
  // pop — picking a choice: one short upward blip, like a bubble popping.
  pop() {
    const buf = makeBuffer(0.16);
    addTone(buf, { at: 0, freq: 520, dur: 0.13, gain: 0.6, sweep: 240 });
    return buf;
  },
  // ding — locking an answer: a bright, happy fifth (G5 -> D6).
  ding() {
    const buf = makeBuffer(0.45);
    addTone(buf, { at: 0, freq: 784, dur: 0.22, gain: 0.5 });
    addTone(buf, { at: 0.1, freq: 1175, dur: 0.32, gain: 0.45 });
    return buf;
  },
  // tada — finishing the whole test: a rising C-major arpeggio with a held top.
  tada() {
    const buf = makeBuffer(1.0);
    addTone(buf, { at: 0.0, freq: 523, dur: 0.22, gain: 0.4 }); // C5
    addTone(buf, { at: 0.1, freq: 659, dur: 0.22, gain: 0.4 }); // E5
    addTone(buf, { at: 0.2, freq: 784, dur: 0.24, gain: 0.4 }); // G5
    addTone(buf, { at: 0.32, freq: 1047, dur: 0.6, gain: 0.5 }); // C6, held
    addTone(buf, { at: 0.32, freq: 1319, dur: 0.55, gain: 0.25 }); // E6 sparkle
    return buf;
  },
};

mkdirSync(OUT_DIR, { recursive: true });
for (const [name, make] of Object.entries(SOUNDS)) {
  const wav = encodeWav(make());
  writeFileSync(join(OUT_DIR, `${name}.wav`), wav);
  console.log(`${name}.wav  ${wav.length} bytes`);
}
console.log(`\nWrote ${Object.keys(SOUNDS).length} sounds to assets/sfx/`);
