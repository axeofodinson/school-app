// Copy MathJax's self-contained browser bundle into apps/mobile/public so the
// importer screen (prompt 21) can load it from our own origin: the school
// network blocks some CDNs (CLAUDE.md), and 2 MB has no business inside the
// app bundle that students download. The file is git-ignored and copied by
// `npm run vendor:mathjax` (part of the web scripts).
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const from = resolve(root, 'node_modules/mathjax/es5/tex-svg.js');
const to = resolve(root, 'apps/mobile/public/vendor/mathjax/tex-svg.js');
mkdirSync(dirname(to), { recursive: true });
copyFileSync(from, to);
console.log(`vendored MathJax → ${to}`);
