// Thin Postgres helpers for the seed scripts (node-postgres, one client).
import pg from 'pg';
import type { Target } from './target.ts';

export type Client = pg.Client;

export async function connect(target: Extract<Target, { ok: true }>): Promise<pg.Client> {
  const ssl = target.kind === 'supabase-dev' ? { rejectUnauthorized: false } : undefined;
  const client = new pg.Client({ connectionString: target.connectionString, ssl });
  await client.connect();
  return client;
}

export async function tableExists(c: Client, table: string): Promise<boolean> {
  const r = await c.query<{ t: string | null }>('select to_regclass($1)::text as t', [table]);
  return r.rows[0]?.t != null;
}

export async function columnsOf(c: Client, table: string): Promise<Set<string>> {
  const [schema, name] = table.includes('.') ? table.split('.') : ['public', table];
  const r = await c.query<{ column_name: string }>(
    'select column_name from information_schema.columns where table_schema = $1 and table_name = $2',
    [schema, name],
  );
  return new Set(r.rows.map((x) => x.column_name));
}

const BATCH = 2000;

/**
 * Idempotent bulk insert: rows go in as one jsonb array per batch and are
 * expanded with jsonb_populate_recordset, so column types come from the table.
 * `on conflict do nothing` (no target) skips rows that hit ANY unique key, so a
 * re-run inserts nothing. Columns the table lacks (e.g. is_test_data before
 * 017) are dropped. Returns the number of rows actually inserted.
 */
export async function insertRows<T extends object>(
  c: Client,
  table: string,
  input: readonly T[],
  opts: { onlyIfAbsent?: string } = {},
): Promise<number> {
  let rows = input as readonly Record<string, unknown>[];
  if (rows.length === 0) return 0;
  const have = await columnsOf(c, table);
  const cols = Object.keys(rows[0]!).filter((k) => have.has(k));
  const list = cols.map((k) => `"${k}"`).join(', ');
  // onlyIfAbsent: for tables without a natural key (exam_events), insert a
  // parent's rows only when that parent has none yet.
  if (opts.onlyIfAbsent) {
    const k = opts.onlyIfAbsent;
    const present = await c.query<{ v: string }>(`select distinct "${k}"::text as v from ${table}`);
    const seen = new Set(present.rows.map((x) => x.v));
    rows = rows.filter((row) => !seen.has(String(row[k])));
    if (rows.length === 0) return 0;
  }
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH).map((row) => {
      const o: Record<string, unknown> = {};
      for (const k of cols) o[k] = row[k];
      return o;
    });
    const r = await c.query(
      `insert into ${table} (${list})
       select ${list} from jsonb_populate_recordset(null::${table}, $1::jsonb) x
       on conflict do nothing`,
      [JSON.stringify(chunk)],
    );
    inserted += r.rowCount ?? 0;
  }
  return inserted;
}
