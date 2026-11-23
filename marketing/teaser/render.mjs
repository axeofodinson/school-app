// Renders the teaser to MP4 by seeking the deterministic timeline frame by frame.
//
//   node render.mjs                       all three formats (9x16, 16x9, 1x1 loop)
//   node render.mjs --format 9x16         one format
//   node render.mjs --urdu draft          use Claude's Urdu drafts (preview only, never final)
//   node render.mjs --music               mux music.mp3 (royalty-free, provided by Hassan) with a fade-out
//   node render.mjs --hash                also write a SHA-256 per frame to out/hashes-<format>.txt
//   node render.mjs --at 9.6,33          full-size PNG stills at those seconds
//   node render.mjs --stills              storyboard frame strip(s) only: out/storyboard-<format>.png
//
// Uses the pre-installed Playwright Chromium and /usr/bin/ffmpeg. Output goes to out/ (git-ignored).
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, "out");
const FFMPEG = existsSync("/usr/bin/ffmpeg") ? "/usr/bin/ffmpeg" : "ffmpeg";

const args = process.argv.slice(2);
const flag = (n) => args.includes("--" + n);
const opt = (n, d) => { const i = args.indexOf("--" + n); return i >= 0 ? args[i + 1] : d; };
const FPS = Number(opt("fps", 30));
const URDU = opt("urdu", "placeholder");
const MUSIC = flag("music") ? resolve(here, opt("music-file", "music.mp3")) : null;

// CSS viewport × deviceScaleFactor 2 = output pixels. Same layout maths as on a phone.
const FORMATS = {
  "9x16": { w: 540, h: 960, file: "teaser-9x16.mp4" },
  "16x9": { w: 960, h: 540, file: "teaser-16x9.mp4" },
  "1x1": { w: 540, h: 540, file: "teaser-loop-1x1.mp4", loop: true },
};
const which = opt("format", "all");
const list = which === "all" ? Object.keys(FORMATS) : which.split(",");

if (MUSIC && !existsSync(MUSIC)) { console.error(`--music: ${MUSIC} not found`); process.exit(1); }
mkdirSync(OUT, { recursive: true });
const pageUrl = pathToFileURL(resolve(here, "dist/teaser.html")).href + `?urdu=${encodeURIComponent(URDU)}`;
if (!existsSync(resolve(here, "dist/teaser.html"))) { console.error("Run `node build.mjs` first (npm run render does both)."); process.exit(1); }

const browser = await chromium.launch();
try {
  for (const key of list) {
    const f = FORMATS[key];
    if (!f) throw new Error("unknown format " + key);
    const page = await browser.newPage({ viewport: { width: f.w, height: f.h }, deviceScaleFactor: 2 });
    await page.goto(pageUrl);
    await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 30000 });
    const err = await page.evaluate(() => window.__error);
    if (err) throw new Error(err);
    await page.evaluate(() => document.fonts.ready);
    const T = await page.evaluate(() => window.TEASER);

    // time list (ms) for this format
    let times = [];
    if (f.loop) {
      for (const [a, b] of T.loop) for (let t = a * 1000; t < b * 1000 - 1e-6; t += 1000 / FPS) times.push(t);
    } else {
      const n = Math.round((T.duration / 1000) * FPS);
      for (let i = 0; i < n; i++) times.push((i * 1000) / FPS);
    }

    if (opt("at")) { // single full-size frame(s): --at 9.6,33
      for (const s of opt("at").split(",")) {
        await page.evaluate((ms) => window.seek(ms), Number(s) * 1000);
        await page.screenshot({ path: resolve(OUT, `still-${key}-${s}s.png`) });
      }
      await page.close();
      continue;
    }
    if (flag("stills")) {
      await storyboard(page, key, f, T);
      await page.close();
      continue;
    }

    const outFile = resolve(OUT, f.file);
    const dur = times.length / FPS;
    const vf = ["format=yuv420p"];
    if (f.loop) vf.unshift(`fade=t=in:st=0:d=0.25:color=0x0b1220,fade=t=out:st=${(dur - 0.35).toFixed(3)}:d=0.35:color=0x0b1220`);
    const ff = [
      "-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-i", "-",
      ...(MUSIC ? ["-i", MUSIC] : []),
      "-vf", vf.join(","),
      "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p", "-profile:v", "high", "-level", "4.1",
      "-r", String(FPS), "-movflags", "+faststart",
      ...(MUSIC ? ["-map", "0:v", "-map", "1:a", "-c:a", "aac", "-b:a", "160k",
        "-af", `afade=t=out:st=${Math.max(0, dur - 2.5).toFixed(2)}:d=2.5`, "-t", dur.toFixed(3)] : ["-an"]),
      outFile,
    ];
    const proc = spawn(FFMPEG, ff, { stdio: ["pipe", "inherit", "inherit"] });
    const done = new Promise((ok, bad) => proc.on("close", (c) => (c === 0 ? ok() : bad(new Error("ffmpeg exit " + c)))));
    const hashes = [];
    const t0 = performance.now();
    for (let i = 0; i < times.length; i++) {
      await page.evaluate((ms) => window.seek(ms), times[i]);
      const buf = await page.screenshot({ type: "png", animations: "disabled", caret: "hide" });
      if (flag("hash")) hashes.push(createHash("sha256").update(buf).digest("hex"));
      if (!proc.stdin.write(buf)) await new Promise((r) => proc.stdin.once("drain", r));
      if (i % 150 === 0) process.stdout.write(`  ${key}: frame ${i}/${times.length}\r`);
    }
    proc.stdin.end();
    await done;
    if (flag("hash")) writeFileSync(resolve(OUT, `hashes-${key}.txt`), hashes.join("\n") + "\n");
    const mb = statSync(outFile).size / 1024 / 1024;
    console.log(`${f.file}: ${times.length} frames, ${dur.toFixed(2)} s, ${mb.toFixed(2)} MB (${((performance.now() - t0) / 1000).toFixed(0)} s)`);
    if (!f.loop && mb > 15) console.warn(`  WARNING: ${f.file} is over the 15 MB budget`);
    await page.close();
  }
} finally {
  await browser.close();
}

// One frame per beat (mid-beat and late-beat) tiled into a strip for storyboard review.
async function storyboard(page, key, f, T) {
  const picks = [1.6, 3.3, 7.6, 9.6, 13.4, 16.6, 19.9, 23.4, 27.4, 30.9, 33.6, 37.0];
  const shots = [];
  for (const s of picks) {
    await page.evaluate((ms) => window.seek(ms), s * 1000);
    shots.push({ s, b64: (await page.screenshot({ type: "jpeg", quality: 85 })).toString("base64") });
  }
  const cols = f.w > f.h ? 3 : 6;
  const tw = f.w > f.h ? 480 : 270, th = Math.round((tw * f.h) / f.w);
  const sheet = await browser.newPage({ viewport: { width: cols * (tw + 12) + 12, height: 100 }, deviceScaleFactor: 1 });
  await sheet.setContent(`<body style="margin:0;background:#05080f;font:600 13px system-ui;color:#a3adc2">
    <div style="display:grid;grid-template-columns:repeat(${cols},${tw}px);gap:12px;padding:12px">
    ${shots.map((x) => `<figure style="margin:0"><img src="data:image/jpeg;base64,${x.b64}" style="width:${tw}px;height:${th}px;display:block;border-radius:6px"><figcaption style="padding:6px 2px">${x.s.toFixed(1)} s</figcaption></figure>`).join("")}
    </div></body>`);
  const out = resolve(OUT, `storyboard-${key}.png`);
  await sheet.screenshot({ path: out, fullPage: true });
  await sheet.close();
  console.log("wrote", out);
}
