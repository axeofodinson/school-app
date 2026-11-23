// Inlines CSS, fonts (as data URIs), GSAP, copy.json and teaser.js into one self-contained file:
// dist/teaser.html. That single file is what render.mjs captures and what the Artifact previews.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(resolve(here, p));
const mime = { woff2: "font/woff2", ttf: "font/ttf" };

let css = read("style.css").toString();
css = css.replace(/url\("([^"]+\.(woff2|ttf))"\)/g, (_, p, ext) =>
  `url("data:${mime[ext]};base64,${read(p).toString("base64")}")`);

const copy = JSON.parse(read("copy.json").toString()); // validates JSON
const gsapJs = read("node_modules/gsap/dist/gsap.min.js").toString();
const teaserJs = read("teaser.js").toString();
const safe = (s) => s.replace(/<\/script/gi, "<\\/script");

let html = read("index.html").toString();
html = html.replace('<link rel="stylesheet" href="style.css">', () => `<style>\n${css}\n</style>`);
html = html.replace('<script src="node_modules/gsap/dist/gsap.min.js"></script>', () => `<script>${safe(gsapJs)}</script>`);
html = html.replace('<script>window.__COPY_URL__ = "copy.json";</script>', () => `<script>window.__COPY__ = ${safe(JSON.stringify(copy))};</script>`);
html = html.replace('<script src="teaser.js"></script>', () => `<script>${safe(teaserJs)}</script>`);
if (/(src|href)="(?!data:)[^"#]+"/.test(html)) throw new Error("build: an external reference is left in dist/teaser.html");

mkdirSync(resolve(here, "dist"), { recursive: true });
writeFileSync(resolve(here, "dist/teaser.html"), html);
console.log(`dist/teaser.html  ${(html.length / 1024 / 1024).toFixed(2)} MB`);
