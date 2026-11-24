// node --test scripts/backup/prune.test.mjs   (also run by CI)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isoWeek, parseTag, selectForDeletion } from './prune.mjs';

const tagFor = (date) =>
  `db-${date.toISOString().slice(0, 10).replaceAll('-', '')}-${date.toISOString().slice(11, 16).replace(':', '')}Z`;

/** One nightly backup at 22:37 UTC for `days` days ending on `end`. */
function nightly(end, days) {
  const out = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.parse(`${end}T22:37:00Z`) - i * 86400000);
    out.push(tagFor(d));
  }
  return out;
}

test('parses only well-formed nightly tags', () => {
  assert.equal(parseTag('db-20261124-2237Z').toISOString(), '2026-11-24T22:37:00.000Z');
  for (const bad of [
    'db-20261124',
    'keep-20261124-2237Z',
    'db-20261340-2237Z',
    'db-20261124-2237',
    'x',
  ])
    assert.equal(parseTag(bad), null, bad);
});

test('ISO weeks (incl. year boundary)', () => {
  assert.equal(isoWeek(new Date('2026-11-24T00:00:00Z')), '2026-W48');
  assert.equal(isoWeek(new Date('2026-12-31T00:00:00Z')), '2026-W53');
  assert.equal(isoWeek(new Date('2027-01-03T00:00:00Z')), '2026-W53');
  assert.equal(isoWeek(new Date('2027-01-04T00:00:00Z')), '2027-W01');
});

test('fewer than 14 backups: nothing deleted', () => {
  assert.deepEqual(selectForDeletion(nightly('2026-11-24', 10)), []);
});

test('a year of nightlies keeps 14 daily + weekly up to 8 weeks back', () => {
  const tags = nightly('2026-11-24', 365);
  const doomed = new Set(selectForDeletion(tags));
  const kept = tags.filter((t) => !doomed.has(t));
  // 14 most recent days
  for (const t of tags.slice(0, 14)) assert.ok(!doomed.has(t), t);
  // 8 distinct weeks represented, none older than 8 ISO weeks
  const weeks = new Set(kept.map((t) => isoWeek(parseTag(t))));
  assert.equal(weeks.size, 8);
  // 2026-11-24 is a Tuesday: the 14 days (11–24 Nov) already hold the newest of
  // weeks 48, 47 and 46, so 5 older Sundays (weeks 41–45) are added.
  assert.equal(kept.length, 14 + 5);
  // Weekly copies are each week's last (Sunday) backup
  for (const t of kept.slice(14)) assert.equal(parseTag(t).getUTCDay(), 0, t);
  assert.equal(doomed.size, 365 - kept.length);
});

test('extra manual run on the same day: newest of the day kept, older one pruned once out of the weekly set', () => {
  const tags = [...nightly('2026-11-24', 60), 'db-20261124-0912Z'];
  const doomed = selectForDeletion(tags);
  assert.ok(!doomed.includes('db-20261124-2237Z')); // newest of the day
  assert.ok(doomed.includes('db-20261124-0912Z')); // same day, older
});

test('keep-* and unknown tags are never deleted', () => {
  const tags = [
    ...nightly('2026-11-24', 120),
    'keep-20260101-0000Z-before-legacy',
    'v1',
    'db-latest',
  ];
  const doomed = selectForDeletion(tags);
  for (const t of ['keep-20260101-0000Z-before-legacy', 'v1', 'db-latest'])
    assert.ok(!doomed.includes(t));
});

test('a gap (missed nights) keeps older backups instead of fewer', () => {
  // backups stopped 30 days ago: the 14 newest days that HAVE a backup are kept
  const tags = nightly('2026-10-25', 40);
  const doomed = new Set(selectForDeletion(tags));
  for (const t of tags.slice(0, 14)) assert.ok(!doomed.has(t));
});
