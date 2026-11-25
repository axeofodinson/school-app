// Duplicate detection for imported questions (prompt 21, DATABASE_DESIGN §4):
// an exact match on the normalised text, and trigram similarity like
// Postgres pg_trgm (words padded with two spaces in front and one behind,
// Jaccard over the sets). The server's `import_find_matches()` (db/031) only
// fetches candidates with pg_trgm; the final call is always made here, so the
// app, the tests and the report agree.
import { toAsciiDigits } from '../auth/login';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

// Explicit ranges, not \p{…} escapes: Hermes support for those varies (see
// design/tokens.ts). Combining marks: Latin accents + Arabic-script harakat.
const MARKS = /[\u0300-\u036f\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed]/g;
// Word characters: ASCII letters/digits, Latin letters, Arabic-script letters
// (Urdu). Arabic punctuation (، ؛ ؟ ۔ ٪) counts as a separator.
const NON_WORD =
  /[^0-9a-z\u00c0-\u024f\u0620-\u064a\u066e-\u06d3\u06d5\u06ee-\u06ff\u0750-\u077f]+/g;

/** Same text, typed differently: case, spacing, punctuation, Urdu marks, digit script. */
export function normaliseText(s: string): string {
  return toAsciiDigits(s.normalize('NFKC'))
    .toLowerCase()
    .replace(MARKS, '')
    .replace(NON_WORD, ' ')
    .trim();
}

/** English if there is any, else Urdu; plain strings (older rows) as they are. */
export function primaryText(v: unknown): string {
  if (typeof v === 'string') return v;
  if (isObj(v)) {
    const en = typeof v.en === 'string' ? v.en.trim() : '';
    if (en) return en;
    return typeof v.ur === 'string' ? v.ur : '';
  }
  return '';
}

/**
 * What a question "says": its stem plus its options. Two questions with the
 * same stem and different options ("Which of these is prime?") are different
 * questions, so options are part of the key, in sorted order (shuffled
 * options are still the same question).
 */
export function questionMatchKey(body: unknown): string {
  if (!isObj(body)) return '';
  const stem = normaliseText(
    primaryText(body.stem) || primaryText(body.prompt) || primaryText(body.prompt_text),
  );
  const opts = Array.isArray(body.options)
    ? body.options
        .map((o) => (isObj(o) ? normaliseText(primaryText(o.text)) : ''))
        .filter(Boolean)
        .sort()
    : [];
  return opts.length ? `${stem} | ${opts.join(' | ')}` : stem;
}

/** pg_trgm-style trigram set of normalised text. */
export function trigrams(norm: string): Set<string> {
  const out = new Set<string>();
  for (const w of norm.split(/[\s|]+/)) {
    if (!w) continue;
    const padded = `  ${w} `;
    const chars = Array.from(padded);
    for (let i = 0; i + 3 <= chars.length; i++) out.add(chars.slice(i, i + 3).join(''));
  }
  return out;
}

export function similarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let shared = 0;
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  for (const g of small) if (big.has(g)) shared++;
  return shared / (a.size + b.size - shared);
}

/** At or above this, a question is "similar" (flagged, imported unless left out). */
export const SIMILAR_THRESHOLD = 0.85;
/** The server fetches candidates at this lower bar so nothing close is missed. */
export const CANDIDATE_THRESHOLD = 0.5;

export interface InFileMatch {
  /** Index into the input list. */
  of: number;
  /** Earlier item it repeats. */
  match: number;
  similarity: number;
  exact: boolean;
}

/**
 * Within one file: each item against the ones before it. An inverted trigram
 * index keeps this fast for a few thousand questions (only items sharing a
 * trigram are compared).
 */
export function findInFileMatches(keys: string[], threshold = SIMILAR_THRESHOLD): InFileMatch[] {
  const out: InFileMatch[] = [];
  const seen = new Map<string, number>();
  const sets: Set<string>[] = [];
  const index = new Map<string, number[]>();
  keys.forEach((key, i) => {
    const grams = trigrams(key);
    sets.push(grams);
    const exact = key ? seen.get(key) : undefined;
    if (exact !== undefined) {
      out.push({ of: i, match: exact, similarity: 1, exact: true });
    } else {
      const shared = new Map<number, number>();
      for (const g of grams)
        for (const j of index.get(g) ?? []) shared.set(j, (shared.get(j) ?? 0) + 1);
      let best: InFileMatch | null = null;
      for (const [j, n] of shared) {
        const sim = n / (grams.size + sets[j]!.size - n);
        if (sim >= threshold && (!best || sim > best.similarity))
          best = { of: i, match: j, similarity: sim, exact: false };
      }
      if (best) out.push(best);
      if (key) seen.set(key, i);
    }
    for (const g of grams) {
      const l = index.get(g);
      if (l) l.push(i);
      else index.set(g, [i]);
    }
  });
  return out;
}

export interface BankCandidate {
  /** Index of the imported item the server matched. */
  idx: number;
  question_id: string;
  body: unknown;
  status?: string;
}

export interface BankMatch {
  of: number;
  question_id: string;
  similarity: number;
  exact: boolean;
  body: unknown;
}

/** Decide, for each imported item, its closest bank question (if any). */
export function bestBankMatches(
  keys: string[],
  candidates: BankCandidate[],
  threshold = SIMILAR_THRESHOLD,
): BankMatch[] {
  const best = new Map<number, BankMatch>();
  const gramCache = new Map<number, Set<string>>();
  for (const c of candidates) {
    const key = keys[c.idx];
    if (key === undefined || !key) continue;
    const other = questionMatchKey(c.body);
    const exact = other === key;
    let sim = 1;
    if (!exact) {
      let g = gramCache.get(c.idx);
      if (!g) gramCache.set(c.idx, (g = trigrams(key)));
      sim = similarity(g, trigrams(other));
    }
    if (!exact && sim < threshold) continue;
    const prev = best.get(c.idx);
    if (!prev || (exact && !prev.exact) || (!prev.exact && sim > prev.similarity))
      best.set(c.idx, {
        of: c.idx,
        question_id: c.question_id,
        similarity: sim,
        exact,
        body: c.body,
      });
  }
  return [...best.values()].sort((a, b) => a.of - b.of);
}

/** FNV-1a 32-bit, hex: a short, stable id for a normalised key (stored in reports). */
export function hashKey(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
