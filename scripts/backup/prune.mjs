// Retention for the backup releases (OPS-backup, docs/backup-restore.md).
//
//   node scripts/backup/prune.mjs <owner/repo> [--dry-run]     (needs gh + GH_TOKEN)
//
// Nightly tags look like db-20261124-2237Z (UTC). Keep:
//   - daily:  the newest backup of each of the 14 most recent days that have one
//   - weekly: the newest backup of each of the 8 most recent ISO weeks that have one
// Every other db-* release is deleted (with its tag). Anything not named db-*
// (e.g. keep-20261124-0912Z-before-legacy-removal) is never touched.
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const DAILY = 14;
export const WEEKLY = 8;
const TAG = /^db-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})Z$/;

export function parseTag(tag) {
  const m = TAG.exec(tag);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  const at = new Date(Date.UTC(y, mo - 1, d, h, mi));
  // Reject impossible dates (e.g. db-20261340-...).
  if (at.getUTCMonth() !== mo - 1 || at.getUTCDate() !== d) return null;
  return at;
}

/** ISO-8601 week key, e.g. "2026-W48". */
export function isoWeek(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Pure: which tags to delete. Unknown tags are never returned. */
export function selectForDeletion(tags, { daily = DAILY, weekly = WEEKLY } = {}) {
  const backups = tags
    .map((tag) => ({ tag, at: parseTag(tag) }))
    .filter((b) => b.at)
    .sort((a, b) => b.at - a.at || (a.tag < b.tag ? 1 : -1)); // newest first
  const keep = new Set();
  const newestPer = (keyOf, limit) => {
    const seen = new Set();
    for (const b of backups) {
      const k = keyOf(b.at);
      if (seen.has(k)) continue;
      if (seen.size === limit) break;
      seen.add(k);
      keep.add(b.tag);
    }
  };
  newestPer((at) => at.toISOString().slice(0, 10), daily);
  newestPer(isoWeek, weekly);
  return backups.filter((b) => !keep.has(b.tag)).map((b) => b.tag);
}

function main() {
  const [repo, flag] = process.argv.slice(2);
  if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    console.error('usage: prune.mjs <owner/repo> [--dry-run]');
    process.exit(1);
  }
  const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8' });
  const tags = JSON.parse(
    gh('release', 'list', '--repo', repo, '--limit', '1000', '--json', 'tagName'),
  ).map((r) => r.tagName);
  const doomed = selectForDeletion(tags);
  console.log(`${tags.length} releases; deleting ${doomed.length}`);
  for (const tag of doomed) {
    console.log(`${flag === '--dry-run' ? 'would delete' : 'delete'} ${tag}`);
    if (flag !== '--dry-run')
      gh('release', 'delete', tag, '--repo', repo, '--yes', '--cleanup-tag');
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
