// Shared start-up for seed.ts and remove.ts: refuse unsafe targets, connect,
// and refuse databases that look like the real school.
import { connect, type Client } from './db.ts';
import { STUDENT_CODE_LIKE } from './markers.ts';
import { resolveTarget, type TargetEnv } from './target.ts';

/** More real (non-TEST) students than this means "not a dev database". */
export const MAX_REAL_STUDENTS = 50;

export async function openTarget(env: TargetEnv): Promise<{ client: Client; label: string }> {
  const target = resolveTarget(env);
  if (!target.ok) {
    console.error(`✗ ${target.reason}`);
    process.exit(2);
  }
  const client = await connect(target);
  const r = await client.query<{ n: string }>(
    `select count(*)::text as n from public.students where student_code not like $1`,
    [STUDENT_CODE_LIKE],
  );
  const real = Number(r.rows[0]?.n ?? 0);
  if (real > MAX_REAL_STUDENTS) {
    await client.end();
    console.error(
      `✗ refusing: ${target.label} has ${real} non-TEST students. This looks like a real school database.`,
    );
    process.exit(2);
  }
  return { client, label: target.label };
}

export function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

export const seconds = (t0: number): string => `${((Date.now() - t0) / 1000).toFixed(1)} s`;
