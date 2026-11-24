import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { removeSql, seedSql, SQL_DIR } from '../src/emit-sql.ts';

describe('paste-ready SQL files', () => {
  it('are up to date with the generators (run `npm run seed:sql`)', () => {
    expect(readFileSync(join(SQL_DIR, 'seed-dev.sql'), 'utf8')).toBe(seedSql());
    expect(readFileSync(join(SQL_DIR, 'remove-dev.sql'), 'utf8')).toBe(removeSql());
  });
  it('never mention the production project', () => {
    expect(seedSql() + removeSql()).not.toContain('invggaerwfsoslsibwwo');
  });
});
