// After `expo export -p web`: list the files the offline app shell needs
// (public/sw.js precaches them), so a Chromebook that opened the app online
// once starts it again with no network, including screens it never opened
// (expo-router splits each route into its own chunk). JS, CSS, fonts, images
// and the short sound effects. Writes <dist>/sw-assets.json.
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const dist = resolve(process.argv[2] ?? 'dist');
const KEEP = /\.(js|css|ttf|woff2?|png|webp|svg|wav)$/;
const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (KEEP.test(name)) files.push('/' + relative(dist, p).split('\\').join('/'));
  }
};
for (const sub of ['_expo', 'assets']) {
  try {
    walk(join(dist, sub));
  } catch {
    // not present in this build
  }
}
files.sort();
const bytes = files.reduce((n, f) => n + statSync(join(dist, f)).size, 0);
writeFileSync(join(dist, 'sw-assets.json'), JSON.stringify({ files }));
console.log(`sw-assets.json: ${files.length} files, ${(bytes / 1e6).toFixed(1)} MB`);
