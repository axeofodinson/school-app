// QR rendering helpers (pure). The app turns text into a module matrix with the
// `qrcode` package; these draw it as SVG and lay out the printable A4 card sheet.

export interface QrMatrix {
  size: number;
  /** Row-major, `size * size` entries, true = dark module. */
  isDark(row: number, col: number): boolean;
}

/** One SVG path for all dark modules, in module units (viewBox 0 0 size size). */
export function qrPath(m: QrMatrix): string {
  let d = '';
  for (let r = 0; r < m.size; r++) {
    let c = 0;
    while (c < m.size) {
      if (!m.isDark(r, c)) {
        c++;
        continue;
      }
      const start = c;
      while (c < m.size && m.isDark(r, c)) c++;
      d += `M${start} ${r}h${c - start}v1h${start - c}z`;
    }
  }
  return d;
}

/** Standalone SVG with the required 4-module quiet zone. */
export function qrSvg(m: QrMatrix, sizeMm = 30): string {
  const q = 4;
  const v = m.size + q * 2;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${sizeMm}mm" height="${sizeMm}mm" ` +
    `viewBox="${-q} ${-q} ${v} ${v}" shape-rendering="crispEdges">` +
    `<rect x="${-q}" y="${-q}" width="${v}" height="${v}" fill="#fff"/>` +
    `<path fill="#000" d="${qrPath(m)}"/></svg>`
  );
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** What goes on a card. There is deliberately no PIN field (LMS_AUDIT 5.9). */
export interface QrCard {
  name: string;
  admissionNo: string;
  className?: string;
  /** SVG markup from qrSvg(). */
  qrSvg: string;
}

export interface CardSheetLabels {
  title: string;
  school: string;
  admissionNo: string;
  /** e.g. "Type your PIN after scanning. Never write it on this card." */
  footer: string;
}

/** Cards per A4 page: 2 columns x 5 rows of 85 x 54 mm (ID-1 size). */
export const CARDS_PER_PAGE = 10;

/**
 * A complete HTML document for printing on A4 (browser print or expo-print).
 * All text is escaped; only qrSvg is inserted as markup (we generate it).
 */
export function cardSheetHtml(
  cards: readonly QrCard[],
  labels: CardSheetLabels,
  dir: 'ltr' | 'rtl' = 'ltr',
  fontFamily = 'sans-serif',
): string {
  const e = escapeHtml;
  const card = (c: QrCard) =>
    `<div class="card"><div class="qr">${c.qrSvg}</div><div class="info">` +
    `<div class="school">${e(labels.school)}</div>` +
    `<div class="name">${e(c.name)}</div>` +
    (c.className ? `<div class="cls">${e(c.className)}</div>` : '') +
    `<div class="adm"><span>${e(labels.admissionNo)}</span> <b dir="ltr">${e(c.admissionNo)}</b></div>` +
    `<div class="foot">${e(labels.footer)}</div></div></div>`;
  const pages: string[] = [];
  for (let i = 0; i < cards.length; i += CARDS_PER_PAGE) {
    pages.push(
      `<section class="page">${cards
        .slice(i, i + CARDS_PER_PAGE)
        .map(card)
        .join('')}</section>`,
    );
  }
  return `<!doctype html><html dir="${dir}"><head><meta charset="utf-8"><title>${e(labels.title)}</title>
<style>
@page { size: A4; margin: 10mm; }
* { box-sizing: border-box; }
body { margin: 0; font-family: ${fontFamily}; color: #000; }
.page { display: grid; grid-template-columns: repeat(2, 85mm); grid-auto-rows: 54mm; gap: 4mm 6mm; justify-content: center; page-break-after: always; break-after: page; }
.page:last-child { page-break-after: auto; break-after: auto; }
.card { border: 0.3mm dashed #888; border-radius: 3mm; padding: 3mm; display: flex; gap: 3mm; align-items: center; overflow: hidden; break-inside: avoid; }
.qr svg { display: block; }
.info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1mm; line-height: 1.9; }
.school { font-size: 8pt; color: #444; }
.name { font-size: 12pt; font-weight: 700; overflow-wrap: anywhere; }
.cls { font-size: 9pt; }
.adm { font-size: 10pt; }
.adm b { font-family: monospace; font-size: 12pt; unicode-bidi: isolate; }
.foot { font-size: 7pt; color: #444; }
</style></head><body>${pages.join('')}</body></html>`;
}
