// Generates the student app's pixel-art sprites (assets/sprites/*.png) from
// hand-drawn pixel maps. Run with: node scripts/generate-sprites.mjs
//
// Why pre-rendered PNGs: React Native has no nearest-neighbour image scaling,
// so a 16px sprite scaled up at runtime goes blurry. We bake the chunky pixels
// in at SCALE× instead — each file is still ~1 KB, and rendering one <Image>
// is the cheapest possible path on low-end Android (no view trees, no SVG).
//
// The maps are 16×16 character grids; each sprite declares its own legend
// (char -> #rrggbb, '.' = transparent). Dependency-free: PNGs are encoded by
// hand (zlib deflate + CRC32) so this never needs an npm install to run.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCALE = 12; // 16px art -> 192px PNG, crisp at any on-screen size <= ~64dp
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'sprites');

// Shared ink outline — every sprite uses the same warm dark brown so the set
// feels like one hand drew it.
const K = '#4a3222';

const SPRITES = {
  // Sword — "My tests" and test-type rows.
  sword: {
    legend: { k: K, w: '#fff9ec', s: '#9fb9ce', g: '#f2a93b', h: '#8a5a32' },
    rows: [
      '................',
      '.......kk.......',
      '......kwsk......',
      '......kwsk......',
      '......kwsk......',
      '......kwsk......',
      '......kwsk......',
      '......kwsk......',
      '......kwsk......',
      '..kkkkkkkkkkkk..',
      '..kggggggggggk..',
      '..kkkkkhhkkkkk..',
      '......khhk......',
      '......khhk......',
      '.....kgggk......',
      '......kkk.......',
    ],
  },
  // Shield — exam rows.
  shield: {
    legend: { k: K, w: '#d7e3ee', b: '#3f6fb5', g: '#f2a93b' },
    rows: [
      '................',
      '..kkkkkkkkkkkk..',
      '.kwwwwwwwwwwwwk.',
      '.kwbbbbbbbbbbwk.',
      '.kwbbbbggbbbbwk.',
      '.kwbbbggggbbbwk.',
      '.kwbbbbggbbbbwk.',
      '.kwbbbbbbbbbbwk.',
      '..kwbbbbbbbbwk..',
      '..kwbbbbbbbbwk..',
      '...kwbbbbbbwk...',
      '....kwbbbbwk....',
      '.....kwbbwk.....',
      '......kwwk......',
      '.......kk.......',
      '................',
    ],
  },
  // Scroll — report card and homework rows.
  scroll: {
    legend: { k: K, p: '#f6e3b4', L: '#a97c50', g: '#f2a93b', G: '#c97f26' },
    rows: [
      '................',
      '..kkkkkkkkkkkk..',
      '..kppppppppppk..',
      '..kpLLLLLLLLpk..',
      '..kppppppppppk..',
      '..kpLLLLLLpppk..',
      '..kppppppppppk..',
      '..kpLLLLLLLLpk..',
      '..kppppppppppk..',
      '..kpLLLLLppppk..',
      '..kpppppppggpk..',
      '..kpppppppGGpk..',
      '..kppppppppppk..',
      '..kkkkkkkkkkkk..',
      '................',
      '................',
    ],
  },
  // Star — "My scores" and score rows.
  star: {
    legend: { k: K, g: '#f2a93b', w: '#fff9ec' },
    rows: [
      '................',
      '.......kk.......',
      '......kwgk......',
      '......kggk......',
      '.....kggggk.....',
      '.kkkkkggggkkkkk.',
      '.kggggggggggggk.',
      '..kggggggggggk..',
      '...kggggggggk...',
      '...kggggggggk...',
      '..kggggkkggggk..',
      '..kgggk..kgggk..',
      '.kggk......kggk.',
      '.kk..........kk.',
      '................',
      '................',
    ],
  },
  // Lightning bolt — quiz rows.
  bolt: {
    legend: { k: K, g: '#f2a93b', w: '#fff9ec' },
    rows: [
      '................',
      '......kkkkk.....',
      '.....kwgggk.....',
      '....kggggk......',
      '...kggggk.......',
      '..kggggkkkkk....',
      '..kggggggggk....',
      '..kkkkkggggk....',
      '......kgggk.....',
      '.....kgggk......',
      '....kgggk.......',
      '...kggk.........',
      '...kgk..........',
      '...kk...........',
      '................',
      '................',
    ],
  },
  // Heart — attendance.
  heart: {
    legend: { k: K, r: '#e5484d', w: '#ffd9d4' },
    rows: [
      '................',
      '...kkk....kkk...',
      '..krrrk..krrrk..',
      '.krwwrrrrrrrrrk.',
      '.krwwrrrrrrrrrk.',
      '.krrrrrrrrrrrrk.',
      '.krrrrrrrrrrrrk.',
      '..krrrrrrrrrrk..',
      '...krrrrrrrrk...',
      '....krrrrrrk....',
      '.....krrrrk.....',
      '......krrk......',
      '.......kk.......',
      '................',
      '................',
      '................',
    ],
  },
  // Treasure chest — submitted-test celebration.
  chest: {
    legend: { k: K, h: '#9c6633', H: '#7a4a22', w: '#c98d54', g: '#f2a93b', G: '#c97f26' },
    rows: [
      '................',
      '................',
      '..kkkkkkkkkkkk..',
      '.khhhhhhhhhhhhk.',
      '.khwhhhhhhhhhhk.',
      '.khhhhhhhhhhhhk.',
      '.khhhhkggkhhhhk.',
      '.kkkkkkggkkkkkk.',
      '.kHHHHkggkHHHHk.',
      '.kHHHHkGGkHHHHk.',
      '.kHHHHHkkHHHHHk.',
      '.kHHHHHHHHHHHHk.',
      '..kkkkkkkkkkkk..',
      '................',
      '................',
      '................',
    ],
  },
  // Trophy — overall score / report headline.
  trophy: {
    legend: { k: K, g: '#f2a93b', G: '#c97f26', w: '#fff9ec' },
    rows: [
      '................',
      '..kkkkkkkkkkkk..',
      '.kkwgggggggggkk.',
      '.k.kwgggggggk.k.',
      '.kkkggggggggkkk.',
      '...kggggggggk...',
      '....kggggggk....',
      '.....kggggk.....',
      '......kggk......',
      '......kGGk......',
      '.....kkGGkk.....',
      '....kGGGGGGk....',
      '...kkkkkkkkkk...',
      '................',
      '................',
      '................',
    ],
  },
  // Speaker — the pre-reader "hear the question" button (box + cone + waves).
  speaker: {
    legend: { k: K, g: '#f2a93b', w: '#fff9ec', s: '#4fa7d9' },
    rows: [
      '................',
      '................',
      '.........kk.....',
      '........kwgk....',
      '.......kwwgk.s..',
      '..kkkkkwwwgk..s.',
      '..kgggkwwwgk.s.s',
      '..kgggkwwwgk.s.s',
      '..kgggkwwwgk.s.s',
      '..kgggkwwwgk.s.s',
      '..kkkkkwwwgk..s.',
      '.......kwwgk.s..',
      '........kwgk....',
      '.........kk.....',
      '................',
      '................',
    ],
  },
  // Check — the pre-reader "lock my answer" tick (reads on green and parchment).
  check: {
    legend: { k: K, w: '#fff9ec' },
    rows: [
      '................',
      '................',
      '............kk..',
      '...........kwwk.',
      '..........kwwk..',
      '.........kwwk...',
      '..kk.....kwwk...',
      '.kwwk...kwwk....',
      '.kwwwk..kwwk....',
      '..kwwwkkwwk.....',
      '...kwwwwwwk.....',
      '....kwwwwk......',
      '.....kwwk.......',
      '......kk........',
      '................',
      '................',
    ],
  },
  // Sprout buddy — the app mascot (login, greetings, empty states).
  sprout: {
    legend: { k: K, l: '#4e9b44', e: '#66b95c', y: '#f7b2a0' },
    rows: [
      '................',
      '......kkk.......',
      '.....klllk......',
      '.......klk......',
      '....kkkkkkkk....',
      '..keeeeeeeeeek..',
      '..keeeeeeeeeek..',
      '.keeekeeeekeeek.',
      '.keeekeeeekeeek.',
      '.keeeeeeeeeeeek.',
      '.keyyekkkkeyyek.',
      '..keeeeeeeeeek..',
      '...kkeeeeeekk...',
      '.....kkkkkk.....',
      '................',
      '................',
    ],
  },
};

// ---- minimal PNG encoder (RGBA, no interlace) ----

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  // raw scanlines, each prefixed with filter byte 0 (None)
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 4);
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

// ---- render ----

mkdirSync(OUT_DIR, { recursive: true });

for (const [name, { legend, rows }] of Object.entries(SPRITES)) {
  if (rows.length !== 16) throw new Error(`${name}: expected 16 rows, got ${rows.length}`);
  rows.forEach((row, i) => {
    if (row.length !== 16) throw new Error(`${name} row ${i}: expected 16 chars, got ${row.length} ("${row}")`);
    for (const ch of row) {
      if (ch !== '.' && !legend[ch]) throw new Error(`${name} row ${i}: no legend for "${ch}"`);
    }
  });

  const size = 16 * SCALE;
  const rgba = Buffer.alloc(size * size * 4); // starts transparent
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const ch = rows[y][x];
      if (ch === '.') continue;
      const [r, g, b] = hexToRgb(legend[ch]);
      for (let dy = 0; dy < SCALE; dy++) {
        for (let dx = 0; dx < SCALE; dx++) {
          const o = ((y * SCALE + dy) * size + x * SCALE + dx) * 4;
          rgba[o] = r;
          rgba[o + 1] = g;
          rgba[o + 2] = b;
          rgba[o + 3] = 255;
        }
      }
    }
  }
  const png = encodePng(size, size, rgba);
  writeFileSync(join(OUT_DIR, `${name}.png`), png);
  console.log(`${name}.png  ${png.length} bytes`);
}
console.log(`\nWrote ${Object.keys(SPRITES).length} sprites to assets/sprites/`);
