// Delete every seed row, child-first, in one transaction (prompt 04). Usage:
//   SEED_DATABASE_URL=postgresql://… npm run seed:remove [-- --dry-run]
// Rows are found by inventory.ts (is_test_data, TEST markers, flagged parents).
// Append-only tables (question/lesson versions, gate overrides) have their
// forbid-mutation trigger disabled for the delete only, inside the transaction.
import { hasFlag, openTarget, seconds } from './guard.ts';
import { countSeedRows, prepare } from './inventory.ts';

async function main(): Promise<void> {
  const t0 = Date.now();
  const { client: c, label } = await openTarget(process.env);
  const dry = hasFlag('dry-run');
  console.log(`→ ${dry ? 'dry run: counting' : 'removing'} seed rows on ${label}`);
  const deleted: Record<string, number> = {};
  try {
    await c.query('begin');
    for (const st of await prepare(c)) {
      if (dry) {
        const r = await c.query<{ n: string }>(
          `select count(*)::text as n from ${st.table} where ${st.where}`,
        );
        deleted[st.table] = Number(r.rows[0]!.n);
        continue;
      }
      if (st.immutableTrigger)
        await c.query(`alter table ${st.table} disable trigger ${st.immutableTrigger}`);
      const r = await c.query(`delete from ${st.table} where ${st.where}`);
      if (st.immutableTrigger)
        await c.query(`alter table ${st.table} enable trigger ${st.immutableTrigger}`);
      deleted[st.table] = r.rowCount ?? 0;
    }
    if (!dry) {
      // The seed year was the current one; hand "current" back to the newest remaining year.
      await c.query(`update public.academic_years set is_current = true
                      where id = (select id from public.academic_years
                                   order by starts_on desc nulls last, label desc limit 1)
                        and not exists (select 1 from public.academic_years where is_current)`);
    }
    await c.query(dry ? 'rollback' : 'commit');
  } catch (e) {
    await c.query('rollback');
    await c.end();
    throw e;
  }
  console.table(Object.fromEntries(Object.entries(deleted).filter(([, n]) => n > 0)));
  if (!dry) {
    const left = (await countSeedRows(c)).filter((x) => x.n > 0);
    if (left.length > 0) {
      console.error('✗ seed rows remain:', left);
      await c.end();
      process.exit(1);
    }
    console.log(`✓ removed in ${seconds(t0)}; zero seed rows remain`);
  }
  await c.end();
}

main().catch((e: unknown) => {
  console.error('✗ remove failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
