// Builds the soundtrack and muxes it into the silent videos from render.mjs.
//
//   node mix.mjs            → out/soundtrack.wav, out/teaser-*-sound.mp4 (the silent files are kept)
//   node mix.mjs --no-sfx   music (+ voice) only
//
// Inputs (all optional except the music):
//   audio/music.mp3     ElevenLabs music (30 s, generated for this teaser). Stretched to 38 s
//                       by repeating four bars mid-track, so its fade-out lands on the close card.
//   audio/vo-1..6.mp3   English voice lines (see README); placed at VO cues, music ducks under them.
// Sound effects are synthesised here with ffmpeg (original, nothing downloaded) and placed
// on the same times as the animation in teaser.js.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const A = (p) => resolve(here, "audio", p);
const OUT = resolve(here, "out");
const FFMPEG = existsSync("/usr/bin/ffmpeg") ? "/usr/bin/ffmpeg" : "ffmpeg";
const NO_SFX = process.argv.includes("--no-sfx");
const DUR = 38;
const SR = 48000;

// Music edit: play 0..CUT, then crossfade into the track again from CUT-REPEAT (four bars back).
const CUT = 16.0, REPEAT = 9.6, XF = 1.0;

// Voice cues (seconds): one line per scene, matching the on-screen captions.
const VO = [0.4, 4.6, 11.0, 17.9, 24.7, 32.3];

// Effects: [time, kind, gain]. Times match teaser.js.
const SFX = [
  [2.45, "shimmer", 0.35],                         // star in the logo
  [12.15, "tap", 0.5], [12.3, "wrong", 0.45],      // student taps 49
  [12.6, "right", 0.3],                            // 25 lights up
  [16.2, "chime", 0.5],                            // Mastered
  [18.75, "tap", 0.5], [19.35, "tap", 0.5], [19.95, "tap", 0.55], // Class 9 → Algebra → Start
  [22.4, "right", 0.35],                           // results ready
  [26.6, "down", 0.35], [28.45, "up", 0.35],       // offline → synced
  [29.5, "whoosh", 0.3],                           // A4 worksheet
];

const bell = (f, start, decay, amp) => `${amp}*gte(t,${start})*sin(2*PI*${f}*(t-${start}))*exp(-(t-${start})*${decay})`;
const SYNTH = {
  tap: { d: 0.15, e: `0.6*sin(2*PI*1750*t)*exp(-t*95)+0.35*sin(2*PI*880*t)*exp(-t*55)` },
  wrong: { d: 0.7, e: [bell(311, 0, 11, 0.5), bell(233, 0.15, 9, 0.5)].join("+") },
  right: { d: 0.6, e: [bell(784, 0, 9, 0.4), bell(1175, 0.06, 9, 0.3)].join("+") },
  chime: { d: 1.8, e: [bell(1047, 0, 3.2, 0.32), bell(1319, 0.08, 3.2, 0.28), bell(1568, 0.16, 3.0, 0.28), bell(2093, 0.24, 2.6, 0.18), bell(3136, 0.24, 4, 0.06)].join("+") },
  shimmer: { d: 1.4, e: [bell(1568, 0, 3.5, 0.2), bell(2349, 0.05, 3.5, 0.15), bell(3136, 0.1, 4, 0.1)].join("+") },
  down: { d: 0.5, e: [bell(659, 0, 10, 0.4), bell(440, 0.11, 9, 0.4)].join("+") },
  up: { d: 0.5, e: [bell(440, 0, 10, 0.4), bell(659, 0.11, 9, 0.4)].join("+") },
};

function ff(args) {
  const r = spawnSync(FFMPEG, ["-y", "-hide_banner", "-loglevel", "error", ...args], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr || "ffmpeg failed");
  return r.stderr;
}

if (!existsSync(A("music.mp3"))) { console.error("audio/music.mp3 is missing"); process.exit(1); }
mkdirSync(OUT, { recursive: true });

// ---- 1. music bed, stretched to the timeline --------------------------------------------
const inputs = ["-i", A("music.mp3")];
const parts = [
  `[0:a]aresample=${SR},asplit=2[m1][m2]`,
  `[m1]atrim=0:${CUT}[ma]`,
  `[m2]atrim=${CUT - REPEAT - XF}:30,asetpts=PTS-STARTPTS[mb]`,
  `[ma][mb]acrossfade=d=${XF}:c1=qsin:c2=qsin,apad,atrim=0:${DUR},afade=t=out:st=${DUR - 1.2}:d=1.2[music]`,
];
let idx = 1;
const layers = [];

// ---- 2. voice (optional), with ducking ------------------------------------------------------
const voFiles = VO.map((t, i) => [t, A(`vo-${i + 1}.mp3`)]).filter(([, f]) => existsSync(f));
if (voFiles.length) {
  const labels = [];
  for (const [t, f] of voFiles) {
    inputs.push("-i", f);
    parts.push(`[${idx}:a]aresample=${SR},aformat=channel_layouts=stereo,adelay=${Math.round(t * 1000)}:all=1[v${idx}]`);
    labels.push(`[v${idx}]`); idx++;
  }
  parts.push(`${labels.join("")}amix=inputs=${labels.length}:normalize=0,apad,atrim=0:${DUR},asplit=2[vo][vokey]`);
  // with a voice the bed sits 4 dB lower and ducks to ~12 dB under the voice (measured: voice -18, bed -30 LUFS)
  parts.push(`[music]volume=0.63[mq];[mq][vokey]sidechaincompress=threshold=0.05:ratio=4:attack=30:release=500:makeup=1[bed]`);
  layers.push("[bed]", "[vo]");
} else {
  layers.push("[music]");
}

// ---- 3. synthesised effects ----------------------------------------------------------------
if (!NO_SFX) {
  SFX.forEach(([t, kind, gain], i) => {
    const ms = Math.round(t * 1000);
    if (kind === "whoosh") {
      inputs.push("-f", "lavfi", "-i", `anoisesrc=d=0.8:c=pink:r=${SR}:a=0.5:seed=7`);
      parts.push(`[${idx}:a]highpass=f=400,lowpass=f=4200,afade=t=in:d=0.35:curve=exp,afade=t=out:st=0.35:d=0.45,volume=${gain},aformat=channel_layouts=stereo,adelay=${ms}:all=1[s${i}]`);
    } else {
      const s = SYNTH[kind];
      inputs.push("-f", "lavfi", "-i", `aevalsrc=exprs='${s.e}':d=${s.d}:s=${SR}`);
      parts.push(`[${idx}:a]volume=${gain},aformat=channel_layouts=stereo,aecho=0.6:0.4:60:0.25,adelay=${ms}:all=1[s${i}]`);
    }
    layers.push(`[s${i}]`); idx++;
  });
}

parts.push(`${layers.join("")}amix=inputs=${layers.length}:normalize=0,apad,atrim=0:${DUR}[mix]`);
const raw = resolve(OUT, "soundtrack-raw.wav");
ff([...inputs, "-filter_complex", parts.join(";"), "-map", "[mix]", "-ar", String(SR), "-c:a", "pcm_s16le", raw]);

// ---- 4. loudness: -16 LUFS integrated, -1.5 dBTP (two-pass, linear) ------------------------
const meas = spawnSync(FFMPEG, ["-hide_banner", "-i", raw, "-af", "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"], { encoding: "utf8" }).stderr;
const m = JSON.parse(meas.slice(meas.lastIndexOf("{"), meas.lastIndexOf("}") + 1));
const track = resolve(OUT, "soundtrack.wav");
ff(["-i", raw, "-af", `loudnorm=I=-16:TP=-1.5:LRA=11:linear=true:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset},aresample=${SR}`, "-c:a", "pcm_s16le", track]);

// ---- 5. 1:1 loop audio: same segments as teaser.js LOOP, with the video's fades -------------
const loop = resolve(OUT, "soundtrack-loop.wav");
ff(["-i", track, "-filter_complex",
  `[0:a]asplit=2[a][b];[a]atrim=0:3.7,afade=t=out:st=3.62:d=0.08[a1];[b]atrim=31.8:35.6,asetpts=PTS-STARTPTS,afade=t=in:d=0.08[b1];` +
  `[a1][b1]concat=n=2:v=0:a=1,afade=t=in:d=0.25,afade=t=out:st=7.15:d=0.35[o]`, "-map", "[o]", "-c:a", "pcm_s16le", loop]);

// ---- 6. mux into the silent renders ---------------------------------------------------------
for (const [video, audio] of [["teaser-9x16.mp4", track], ["teaser-16x9.mp4", track], ["teaser-loop-1x1.mp4", loop]]) {
  const v = resolve(OUT, video);
  if (!existsSync(v)) { console.warn(`skip ${video} (render it first)`); continue; }
  const o = v.replace(/\.mp4$/, "-sound.mp4");
  ff(["-i", v, "-i", audio, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-ar", String(SR), "-shortest", "-movflags", "+faststart", o]);
  console.log("wrote", o);
}
console.log(`voice lines: ${voFiles.length}/6 · effects: ${NO_SFX ? "off" : SFX.length} · music input loudness ${m.input_i} LUFS → -16`);
